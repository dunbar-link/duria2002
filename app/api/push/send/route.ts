import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";
import { sendPushToUsers } from "@/lib/push/send-push";

// P4-1C: push 발송 인증 보강.
// - 기존: 완전 무인증 공개 API(누구나 임의 receiverIds/문구로 발송 가능) → 스팸 구멍.
// - 변경: 로그인 세션 필수 + "나와 dl_invites(accepted)로 연결된 상대"에게만 발송.
//   client 가 보낸 receiverIds 는 신뢰하지 않고 서버가 연결 검증으로 거른다.
// - 발송 자체는 lib/push/send-push.ts helper 재사용(404/410 만료 구독 정리 포함).
// - 호출부(이모지 신호 3곳)는 로그인 상태의 same-origin fetch 라 그대로 동작한다.
export const dynamic = "force-dynamic";

type SendPushBody = {
  receiverIds?: string[];
  title?: string;
  body?: string;
  url?: string;
};

const TITLE_MAX = 80;
const BODY_MAX = 200;

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

// dl_invites .or() 필터에 들어가는 id 는 안전한 문자만(필터 인젝션 방지).
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function cleanReceiverIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return Array.from(
    new Set(
      value
        .map((item) => cleanText(item))
        .filter((item) => item && item !== "me" && isSafeId(item)),
    ),
  );
}

// 내부 이동 경로만 허용(외부 URL 로 유도하는 푸시 금지).
function cleanInternalUrl(value: unknown) {
  const url = cleanText(value);
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }
  return "/dashboard/signals";
}

export async function POST(request: Request) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const myIds = Array.from(
      new Set(
        [...session.legacyIds, session.authUserId].filter(
          (id): id is string =>
            typeof id === "string" && id.length > 0 && isSafeId(id),
        ),
      ),
    );
    if (myIds.length === 0) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as SendPushBody | null;
    const requestedIds = cleanReceiverIds(body?.receiverIds).filter(
      (id) => !myIds.includes(id),
    );

    if (requestedIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "receiverIds가 없습니다." },
        { status: 400 },
      );
    }

    // 연결 검증: 세션 사용자와 accepted 초대로 이어진 상대만 발송 허용.
    const supabase = createAdminClient();
    const myList = myIds.join(",");
    const recvList = requestedIds.join(",");
    const { data, error } = await supabase
      .from("dl_invites")
      .select("inviter_user_id, accepted_person_id")
      .eq("status", "accepted")
      .or(
        `and(inviter_user_id.in.(${myList}),accepted_person_id.in.(${recvList})),` +
          `and(inviter_user_id.in.(${recvList}),accepted_person_id.in.(${myList}))`,
      );

    if (error) {
      return NextResponse.json(
        { ok: false, error: "connection_check_failed" },
        { status: 500 },
      );
    }

    const mySet = new Set(myIds);
    const requestedSet = new Set(requestedIds);
    const allowed = new Set<string>();
    for (const row of (data ?? []) as {
      inviter_user_id: string | null;
      accepted_person_id: string | null;
    }[]) {
      const inviter = row.inviter_user_id ?? "";
      const accepted = row.accepted_person_id ?? "";
      if (mySet.has(inviter) && requestedSet.has(accepted)) {
        allowed.add(accepted);
      }
      if (mySet.has(accepted) && requestedSet.has(inviter)) {
        allowed.add(inviter);
      }
    }

    if (allowed.size === 0) {
      return NextResponse.json(
        { ok: false, error: "not_connected" },
        { status: 403 },
      );
    }

    const result = await sendPushToUsers(Array.from(allowed), {
      title: (cleanText(body?.title) || "새 신호가 도착했어요").slice(0, TITLE_MAX),
      body: (cleanText(body?.body) || "던바링크에서 확인해요.").slice(0, BODY_MAX),
      url: cleanInternalUrl(body?.url),
    });

    return NextResponse.json({
      ok: true,
      requested: requestedIds.length,
      allowed: allowed.size,
      subscriptions: result.subscriptions,
      sent: result.sent,
      failed: result.failed,
      cleaned: result.cleaned,
    });
  } catch (error) {
    console.error(
      "push send 실패:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
