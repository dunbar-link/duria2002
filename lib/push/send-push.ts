import webPush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// P4-1B: 서버 내부 push 발송 helper.
// 공개 /api/push/send route 를 서버에서 재호출하지 않기 위해 분리했다
// (그 route 는 무인증 공개 API — 인증 보강은 P4-1C에서 별도 진행, 여기서는 미사용).
// 이 helper 는 서버 route 안에서만 호출한다(수신자 검증은 호출부 책임).

export type ServerPushPayload = {
  title: string;
  body: string;
  url: string;
};

export type ServerPushResult = {
  ok: boolean;
  subscriptions: number;
  sent: number;
  failed: number;
  cleaned: number; // 404/410 로 삭제한 만료 subscription 수
};

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    return false;
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

// receiverIds 의 구독 전체에 발송한다. 실패해도 throw 하지 않는다(호출부에서
// push 실패를 본 작업 실패로 취급하지 않기 위함). 404/410 응답 endpoint 는
// push_subscriptions 에서 삭제한다(만료 구독 정리 — P4-1B 승인 항목).
export async function sendPushToUsers(
  receiverIds: string[],
  payload: ServerPushPayload,
): Promise<ServerPushResult> {
  const result: ServerPushResult = {
    ok: false,
    subscriptions: 0,
    sent: 0,
    failed: 0,
    cleaned: 0,
  };

  const ids = Array.from(
    new Set(receiverIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (ids.length === 0 || !ensureVapid()) {
    return result;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .in("user_id", ids);

  if (error) {
    console.error("push 구독 조회 실패:", error.message);
    return result;
  }

  const rows = (data ?? []) as SubscriptionRow[];
  result.subscriptions = rows.length;
  if (rows.length === 0) {
    result.ok = true; // 구독 없는 수신자는 실패가 아니다.
    return result;
  }

  const body = JSON.stringify(payload);
  const staleEndpoints: string[] = [];

  const settled = await Promise.allSettled(
    rows.map((row) =>
      webPush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
      ),
    ),
  );

  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      result.sent += 1;
      return;
    }
    result.failed += 1;
    const statusCode = (outcome.reason as { statusCode?: number } | null)
      ?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      staleEndpoints.push(rows[index].endpoint);
    }
  });

  if (staleEndpoints.length > 0) {
    const { error: cleanError } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);
    if (cleanError) {
      console.error("만료 push 구독 정리 실패:", cleanError.message);
    } else {
      result.cleaned = staleEndpoints.length;
    }
  }

  result.ok = true;
  return result;
}
