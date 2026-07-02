import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

// P4-1B: 음성 신호 재생용 signed URL 발급.
// - sender/receiver 본인만 발급 가능(세션 id 집합 포함 여부로만 판정).
// - private bucket 이므로 signed URL 외 재생 경로 없음(공개 URL 금지).
// - 24시간 만료(expires_at) 지난 신호는 410 — 발급 자체를 차단한다.
// - audio_path 는 응답에 노출하지 않는다(짧은 TTL signed URL 만 반환).
export const dynamic = "force-dynamic";

const BUCKET = "voice-signals";
const SIGNED_URL_TTL_SECONDS = 120;

function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const myIds = new Set(
      [...session.legacyIds, session.authUserId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );
    if (myIds.size === 0) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const signalId = request.nextUrl.searchParams.get("signalId")?.trim() ?? "";
    if (!signalId || !isSafeId(signalId)) {
      return NextResponse.json({ ok: false, error: "invalid_signal" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("signals")
      .select("id, sender_id, receiver_id, type, audio_path, expires_at")
      .eq("id", signalId)
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
    }

    const row = (data ?? [])[0] as
      | {
          id: string;
          sender_id: string;
          receiver_id: string;
          type?: string | null;
          audio_path?: string | null;
          expires_at?: string | null;
        }
      | undefined;

    if (!row || row.type !== "voice" || !row.audio_path) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (!myIds.has(row.sender_id) && !myIds.has(row.receiver_id)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      // 만료(24시간 경과) — signed URL 발급 금지.
      return NextResponse.json({ ok: false, error: "expired" }, { status: 410 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.audio_path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error("signed URL 발급 실패:", signError?.message);
      return NextResponse.json(
        { ok: false, error: "signed_url_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      url: signed.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    console.error("음성 URL 발급 실패:", message);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
