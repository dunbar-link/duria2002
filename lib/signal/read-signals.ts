import { supabase } from "@/lib/supabase-client";

export type SignalRecord = {
  id: string;
  sender_id: string;
  receiver_id: string;
  emoji: string;
  created_at: string;
  is_read: boolean;
};

function cleanUserId(userId: string) {
  return userId.trim();
}

export async function readSignalsForUser(userId: string) {
  const cleanId = cleanUserId(userId);

  if (!cleanId || cleanId === "me") {
    console.error("신호 불러오기 실패: 실제 사용자 ID가 없습니다.");
    return [] as SignalRecord[];
  }

  const { data, error } = await supabase
    .from("signals")
    .select("id, sender_id, receiver_id, emoji, created_at, is_read")
    .or(`sender_id.eq.${cleanId},receiver_id.eq.${cleanId}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("신호 불러오기 실패:", error);
    return [] as SignalRecord[];
  }

  return (data ?? []) as SignalRecord[];
}

/**
 * KST(UTC+9) 날짜 키(YYYY-MM-DD). 기기 로컬 타임존과 무관하게 동일 결과가 나오도록
 * created_at 을 +9h 시프트 후 UTC 파트로 뽑는다(deterministic).
 */
export function toKstDateKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 현재 사용자가 "신호를 보낸 고유 날짜 수"(KST) 를 read-only 로 센다.
 * - sender_id in userIds, created_at 만 select (내용/수신자 미조회).
 * - 같은 날 여러 번 보내도 그날은 1로 계산(Set). all-time.
 * - is_read/table 변경 없음. 순수 조회.
 * - 주의: sender_id 는 기기 로컬 id(getCurrentUserId)일 수 있어, 계정의 모든
 *   sender id 후보를 userIds 로 넘기지 않으면 기기별로 달라질 수 있다(호출부 책임).
 * - limit 1000: 초과 시 아주 오래된 날짜가 누락될 수 있음(경고 로그).
 */
export async function countSignalSendDaysKST(userIds: string[]): Promise<number> {
  const ids = Array.from(
    new Set(
      userIds
        .map((u) => (typeof u === "string" ? u.trim() : ""))
        .filter((u) => u.length > 0 && u !== "me"),
    ),
  );
  if (ids.length === 0) return 0;

  const { data, error } = await supabase
    .from("signals")
    .select("created_at")
    .in("sender_id", ids)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.warn("신호 발송일 조회 실패:", error.message);
    return 0;
  }

  const rows = (data ?? []) as { created_at?: unknown }[];
  if (rows.length >= 1000) {
    // TODO(P3-2B): 1000행 상한 도달 — 아주 오래된 발송일이 누락될 수 있음.
    console.warn("신호 발송일 조회 상한(1000행) 도달: 일부 오래된 날짜 누락 가능");
  }

  const days = new Set<string>();
  for (const row of rows) {
    const ts = typeof row.created_at === "string" ? row.created_at : "";
    if (!ts) continue;
    const key = toKstDateKey(ts);
    if (key) days.add(key);
  }
  return days.size;
}

export async function readUnreadSignalCount(userId: string) {
  const cleanId = cleanUserId(userId);

  if (!cleanId || cleanId === "me") {
    console.error("신호 개수 실패: 실제 사용자 ID가 없습니다.");
    return 0;
  }

  const { count, error } = await supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .eq("receiver_id", cleanId)
    .eq("is_read", false);

  if (error) {
    console.error("신호 개수 실패:", error);
    return 0;
  }

  return count ?? 0;
}

export async function markSignalsReadFromSender(
  receiverId: string,
  senderId: string,
) {
  const cleanReceiverId = cleanUserId(receiverId);
  const cleanSenderId = cleanUserId(senderId);

  if (!cleanReceiverId || cleanReceiverId === "me") {
    console.error("신호 읽음 처리 실패: 실제 receiverId가 없습니다.");
    return false;
  }

  if (!cleanSenderId || cleanSenderId === "me") {
    console.error("신호 읽음 처리 실패: 실제 senderId가 없습니다.");
    return false;
  }

  const { error } = await supabase
    .from("signals")
    .update({ is_read: true })
    .eq("receiver_id", cleanReceiverId)
    .eq("sender_id", cleanSenderId)
    .eq("is_read", false);

  if (error) {
    console.error("신호 읽음 처리 실패:", error);
    return false;
  }

  return true;
}

/**
 * 현재 사용자가 받은(받는사람=me) 미확인(is_read=false) 신호들의 sender_id 목록을
 * 반환한다. Home mount-time 파란점 backfill 전용(앱이 닫힌 사이 받은 신호 복원).
 * - 빈 값/자기 자신(sender==me) 제거 + unique 처리.
 * - 조회 실패 시 [] 반환(앱을 깨지 않고, 호출부는 기존 blue state 를 유지).
 */
export async function readUnreadReceivedSenderIds(userId: string) {
  const cleanId = cleanUserId(userId);

  if (!cleanId || cleanId === "me") {
    return [] as string[];
  }

  const { data, error } = await supabase
    .from("signals")
    .select("sender_id")
    .eq("receiver_id", cleanId)
    .eq("is_read", false);

  if (error) {
    console.warn("받은 미확인 신호 sender 조회 실패:", error.message);
    return [] as string[];
  }

  const senderIds = (data ?? [])
    .map((row) => {
      const value = (row as { sender_id?: unknown }).sender_id;
      return typeof value === "string" ? value.trim() : "";
    })
    .filter((value) => value.length > 0 && value !== cleanId);

  return Array.from(new Set(senderIds));
}

/**
 * 두 사용자(나 ↔ 상대) 사이의 최근 신호만 서버에서 직접 조회한다(사람 상세
 * "최근 신호" 전용). 전체 신호를 받아 클라이언트에서 거르지 않고, sender/receiver
 * 쌍으로 서버 필터하므로 신호가 아무리 많아도 해당 상대의 최신 N건이 누락되지
 * 않는다. user id 기반(이름 매칭 아님). is_read 는 변경하지 않는다(조회 전용).
 * 두 id 가 비었거나 같으면 서버 요청 없이 빈 배열을 반환한다.
 */
export async function readSignalsBetweenUsers(
  meUserId: string,
  otherUserId: string,
  limit = 5,
) {
  const cleanMe = cleanUserId(meUserId);
  const cleanOther = cleanUserId(otherUserId);

  if (
    !cleanMe ||
    cleanMe === "me" ||
    !cleanOther ||
    cleanOther === "me" ||
    cleanMe === cleanOther
  ) {
    return [] as SignalRecord[];
  }

  const { data, error } = await supabase
    .from("signals")
    .select("id, sender_id, receiver_id, emoji, created_at, is_read")
    .or(
      `and(sender_id.eq.${cleanMe},receiver_id.eq.${cleanOther}),and(sender_id.eq.${cleanOther},receiver_id.eq.${cleanMe})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("사람별 신호 조회 실패:", error.message);
    return [] as SignalRecord[];
  }

  return (data ?? []) as SignalRecord[];
}
