function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export type PushSubscriptionStatus = {
  myIds: string[];
  subscriptionCount: number;
  updatedAt: string | null;
};

// P4-1C-d: "알림 ON" 표시를 브라우저 권한만이 아니라 서버 저장 성공까지 검증하기
// 위한 조회. 실패(비로그인 등)하면 null — 호출부는 "확인 불가"로 취급한다.
export async function getPushSubscriptionStatus(): Promise<PushSubscriptionStatus | null> {
  try {
    const response = await fetch("/api/me/push-status", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          myIds?: string[];
          subscriptionCount?: number;
          updatedAt?: string | null;
        }
      | null;
    if (!payload?.ok) {
      return null;
    }
    return {
      myIds: Array.isArray(payload.myIds) ? payload.myIds : [],
      subscriptionCount:
        typeof payload.subscriptionCount === "number" ? payload.subscriptionCount : 0,
      updatedAt: payload.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

export async function subscribePushForUser(userId: string) {
  const cleanUserId = userId.trim();

  if (!cleanUserId || cleanUserId === "me") {
    console.error("푸시 구독 실패: 실제 사용자 ID가 없습니다.");
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  if (!("Notification" in window)) {
    console.error("이 브라우저는 Notification을 지원하지 않습니다.");
    return false;
  }

  if (!("serviceWorker" in navigator)) {
    console.error("이 브라우저는 Service Worker를 지원하지 않습니다.");
    return false;
  }

  if (!("PushManager" in window)) {
    console.error("이 브라우저는 PushManager를 지원하지 않습니다.");
    return false;
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    console.error("푸시 구독 실패: 알림 권한이 허용되지 않았습니다.", permission);
    return false;
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existingSubscription =
    await registration.pushManager.getSubscription();

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey) {
    console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY가 없습니다.");
    return false;
  }

  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: cleanUserId,
      subscription,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("푸시 구독 API 실패:", text);
    return false;
  }

  console.log("푸시 구독 완료:", cleanUserId);
  return true;
}
