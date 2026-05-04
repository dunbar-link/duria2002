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
