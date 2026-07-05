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

// P4-1C-c: 한 계정은 legacy dl-user-id 를 여러 개 가질 수 있다(기기/세션마다 생성 →
// user_identity_links 로 같은 auth 계정에 묶임). 신호 receiver_id 와 push 구독
// user_id 가 같은 계정의 서로 다른 legacy id 로 어긋나면 "구독은 있는데 못 찾는"
// 상태가 된다. 그래서 receiverIds 를 각자의 계정 전체 legacy id 집합으로 확장한다.
// (같은 계정 내 확장이라 타인에게 새는 위험 없음 — 그 사람의 모든 기기에 알림.)
export async function expandToAccountIds(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<string[]> {
  const union = new Set(ids);
  try {
    // 1) receiver legacy id → 소속 auth 계정.
    const { data: links } = await supabase
      .from("user_identity_links")
      .select("auth_user_id, legacy_user_id")
      .eq("status", "active")
      .in("legacy_user_id", ids);
    const authIds = Array.from(
      new Set(
        (links ?? [])
          .map((r) => (r as { auth_user_id?: string }).auth_user_id ?? "")
          .filter(Boolean),
      ),
    );
    if (authIds.length > 0) {
      // 2) 그 auth 계정들의 모든 legacy id.
      const { data: siblings } = await supabase
        .from("user_identity_links")
        .select("legacy_user_id")
        .eq("status", "active")
        .in("auth_user_id", authIds);
      for (const row of siblings ?? []) {
        const legacy = (row as { legacy_user_id?: string }).legacy_user_id;
        if (legacy) union.add(legacy);
      }
    }
  } catch (err) {
    // 확장 실패해도 원본 ids 로는 계속 발송한다(안전 강하).
    console.warn(
      "push receiver 확장 실패(원본 ids 로 진행):",
      err instanceof Error ? err.message : err,
    );
  }
  return Array.from(union);
}

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
  // 같은 계정의 모든 legacy id 로 확장해 어느 기기에 구독돼 있든 찾는다(P4-1C-c).
  const lookupIds = await expandToAccountIds(supabase, ids);
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .in("user_id", lookupIds);

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
