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
