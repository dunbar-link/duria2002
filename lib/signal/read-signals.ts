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
