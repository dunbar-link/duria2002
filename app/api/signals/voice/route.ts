import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";
import { sendPushToUsers } from "@/lib/push/send-push";

// P4-1B: 2초 음성 신호 전송/삭제.
// - sender 는 client 값을 신뢰하지 않는다 — 세션(getInviteSession)의 legacy/auth id
//   집합과 dl_invites(accepted) 매칭으로 서버가 결정한다.
// - 음성 파일은 private bucket(voice-signals)에만 저장, 공개 URL 금지.
// - 만료: 24시간(expires_at = now + 24h). 자동 cleanup 은 P4-1D.
export const dynamic = "force-dynamic";

const BUCKET = "voice-signals";
const MAX_SIZE_BYTES = 307200; // 300KB
const MAX_DURATION_MS = 2500;
const EXPIRES_MS = 24 * 60 * 60 * 1000; // 24시간 만료 — 대장 최종 결정
const VOICE_EMOJI = "🎙️";

// 실제 브라우저 녹음 산출물만 허용(webm/opus=Android·데스크톱, mp4=iOS Safari).
const ALLOWED_MIME = new Set(["audio/webm", "audio/mp4"]);

function normalizeMime(raw: string): string {
  // "audio/webm;codecs=opus" → "audio/webm"
  return raw.split(";")[0].trim().toLowerCase();
}

function extForMime(mime: string): string {
  return mime === "audio/mp4" ? "m4a" : "webm";
}

// dl_invites .or() 필터에 넣는 id 는 안전한 문자만 허용(필터 인젝션 방지).
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

type AcceptedInviteRow = {
  inviter_user_id: string | null;
  accepted_person_id: string | null;
  inviter_name: string | null;
  accepted_person_name: string | null;
};

// 연결 검증: dl_invites 의 accepted 초대에서 (나=inviter, 상대=accepted) 또는
// (상대=inviter, 나=accepted) 가 존재해야 연결이다. 반환값으로 이 연결에서
// 상대가 나를 아는 sender id(초대에 박힌 내 PID)와 내 표시 이름을 함께 준다 —
// 수신자 신호함의 사람 매핑(people/inviteDrafts)이 초대의 PID 기준이기 때문.
async function findConnection(
  supabase: ReturnType<typeof createAdminClient>,
  myIds: string[],
  receiverId: string,
): Promise<{ senderId: string; senderName: string } | null> {
  const idList = myIds.join(",");
  const { data, error } = await supabase
    .from("dl_invites")
    .select("inviter_user_id, accepted_person_id, inviter_name, accepted_person_name")
    .eq("status", "accepted")
    .or(
      `and(inviter_user_id.in.(${idList}),accepted_person_id.eq.${receiverId}),` +
        `and(inviter_user_id.eq.${receiverId},accepted_person_id.in.(${idList}))`,
    )
    .limit(1);

  if (error) {
    throw new Error(`connection check failed: ${error.message}`);
  }

  const row = (data ?? [])[0] as AcceptedInviteRow | undefined;
  if (!row) return null;

  const mySet = new Set(myIds);
  if (row.inviter_user_id && mySet.has(row.inviter_user_id)) {
    return {
      senderId: row.inviter_user_id,
      senderName: row.inviter_name?.trim() || "친구",
    };
  }
  if (row.accepted_person_id && mySet.has(row.accepted_person_id)) {
    return {
      senderId: row.accepted_person_id,
      senderName: row.accepted_person_name?.trim() || "친구",
    };
  }
  return null;
}

function getMyIds(session: { authUserId: string; legacyIds: string[] }): string[] {
  return Array.from(
    new Set(
      [...session.legacyIds, session.authUserId].filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && isSafeId(id),
      ),
    ),
  );
}

// POST /api/signals/voice — FormData(audio, receiverId, durationMs)
export async function POST(request: NextRequest) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const myIds = getMyIds(session);
    if (myIds.length === 0) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
    }

    const receiverId =
      typeof form.get("receiverId") === "string"
        ? (form.get("receiverId") as string).trim()
        : "";
    const durationMs = Number.parseInt(String(form.get("durationMs") ?? ""), 10);
    const audio = form.get("audio");

    if (!receiverId || !isSafeId(receiverId)) {
      return NextResponse.json({ ok: false, error: "invalid_receiver" }, { status: 400 });
    }
    if (myIds.includes(receiverId)) {
      // 나 자신에게 전송 금지.
      return NextResponse.json({ ok: false, error: "self_receiver" }, { status: 400 });
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_audio" }, { status: 400 });
    }
    if (durationMs > MAX_DURATION_MS) {
      return NextResponse.json({ ok: false, error: "too_long" }, { status: 400 });
    }
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ ok: false, error: "invalid_audio" }, { status: 400 });
    }
    if (audio.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 400 });
    }
    const mime = normalizeMime(audio.type || "");
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ ok: false, error: "unsupported_mime" }, { status: 400 });
    }
    // 한계 기록: 서버에서 실제 오디오 길이 검증(디코딩)은 하지 않는다(ffprobe 등
    // 외부 의존 금지). durationMs 는 client 제출값이고, size 상한(300KB)이 실효
    // 방어선이다 — docs/p4-1b-voice-signal-send-plan.md §8 참고.

    const supabase = createAdminClient();

    const connection = await findConnection(supabase, myIds, receiverId);
    if (!connection) {
      return NextResponse.json({ ok: false, error: "not_connected" }, { status: 403 });
    }

    const signalId = randomUUID();
    const audioPath = `${receiverId}/${signalId}.${extForMime(mime)}`;
    const buffer = Buffer.from(await audio.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(audioPath, buffer, { contentType: mime, upsert: false });
    if (uploadError) {
      console.error("음성 업로드 실패:", uploadError.message);
      return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
    }

    const expiresAt = new Date(Date.now() + EXPIRES_MS).toISOString();
    const { error: insertError } = await supabase.from("signals").insert({
      id: signalId,
      sender_id: connection.senderId,
      receiver_id: receiverId,
      emoji: VOICE_EMOJI, // 기존 UI 호환용 placeholder
      is_read: false,
      type: "voice",
      audio_path: audioPath,
      audio_mime: mime,
      audio_duration_ms: durationMs,
      audio_size_bytes: audio.size,
      expires_at: expiresAt,
    });

    if (insertError) {
      // orphan 방지: row 생성 실패 시 업로드한 object 를 되돌린다.
      console.error("음성 신호 insert 실패:", insertError.message);
      await supabase.storage
        .from(BUCKET)
        .remove([audioPath])
        .catch(() => {});
      return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
    }

    // push 실패는 전송 실패로 취급하지 않는다(저장은 이미 성공). 결과만 반환.
    const push = await sendPushToUsers([receiverId], {
      title: "새 2초 음성 신호",
      body: `${connection.senderName}님이 짧은 목소리 신호를 보냈어요`,
      url: "/dashboard/signals",
    });

    return NextResponse.json({
      ok: true,
      signalId,
      expiresAt,
      push: { sent: push.sent, failed: push.failed, cleaned: push.cleaned },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    console.error("음성 신호 전송 실패:", message);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

// DELETE /api/signals/voice?signalId=... — sender/receiver 본인만.
// storage object 를 먼저 지우고 row 를 지운다(object 삭제 실패 시에도 row 는
// 지우고 orphan 은 P4-1D cleanup 대상 — 로그만 남긴다).
export async function DELETE(request: NextRequest) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const myIds = getMyIds(session);
    if (myIds.length === 0) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const signalId = request.nextUrl.searchParams.get("signalId")?.trim() ?? "";
    if (!signalId || !isSafeId(signalId)) {
      return NextResponse.json({ ok: false, error: "invalid_signal" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("signals")
      .select("id, sender_id, receiver_id, type, audio_path")
      .eq("id", signalId)
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
    }

    const row = (data ?? [])[0] as
      | { id: string; sender_id: string; receiver_id: string; type?: string | null; audio_path?: string | null }
      | undefined;

    if (!row) {
      // 이미 삭제/만료 정리된 경우 — 멱등 처리.
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    const mySet = new Set(myIds);
    if (!mySet.has(row.sender_id) && !mySet.has(row.receiver_id)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    if (row.type === "voice" && row.audio_path) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([row.audio_path]);
      if (removeError) {
        console.error("음성 object 삭제 실패(orphan → P4-1D):", removeError.message);
      }
    }

    const { error: deleteError } = await supabase
      .from("signals")
      .delete()
      .eq("id", signalId);
    if (deleteError) {
      return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    console.error("음성 신호 삭제 실패:", message);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
