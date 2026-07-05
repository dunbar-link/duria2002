import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

// P4-1C-b: push 구독 저장 인증 보강.
// - 기존: 완전 무인증. client 가 보낸 userId 를 그대로 신뢰해 upsert →
//   타인 user_id 로 자기 endpoint 를 등록/덮어써 그 사람 몫의 푸시를 가로챌 수 있었다.
// - 변경: 로그인 세션 필수(401) + 저장하려는 userId 가 "내 세션의 legacy/auth id
//   집합"에 포함될 때만 허용(403). client userId 자체는 신뢰하지 않고 집합 포함
//   여부만 신뢰한다(voice/send route 와 동일 원칙).
// - 저장되는 user_id 값은 legacy dl-user-id 그대로 유지한다(send route 가
//   push_subscriptions.user_id IN receiverIds 로 조회하므로 좌표계를 바꾸면 안 됨).
export const dynamic = "force-dynamic";

type PushSubscriptionBody = {
  userId?: string;
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export async function POST(request: Request) {
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

    const body = (await request.json().catch(() => null)) as PushSubscriptionBody | null;

    const userId = cleanText(body?.userId);
    const endpoint = cleanText(body?.subscription?.endpoint);
    const p256dh = cleanText(body?.subscription?.keys?.p256dh);
    const auth = cleanText(body?.subscription?.keys?.auth);

    if (!userId || userId === "me" || !isSafeId(userId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_user" },
        { status: 400 },
      );
    }
    // client 가 보낸 userId 는 반드시 내 세션 집합에 속해야 한다(타인 id 등록 차단).
    if (!myIds.has(userId)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { ok: false, error: "invalid_subscription" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "endpoint",
      },
    );

    if (error) {
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "push subscribe 실패:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
