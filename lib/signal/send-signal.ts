import { supabase } from "@/lib/supabase-client";

export async function sendSignal(
  senderId: string,
  receiverIds: string[],
  emoji: string,
) {
  if (!senderId) {
    console.error("신호 전송 실패: senderId 없음");
    return false;
  }

  if (receiverIds.length === 0) {
    console.error("신호 전송 실패: receiverIds 없음");
    return false;
  }

  if (!emoji) {
    console.error("신호 전송 실패: emoji 없음");
    return false;
  }

  const cleanSenderId = senderId.trim();
  const cleanReceiverIds = Array.from(
    new Set(
      receiverIds
        .map((receiverId) => receiverId.trim())
        .filter((receiverId) => receiverId.length > 0 && receiverId !== "me"),
    ),
  );

  if (!cleanSenderId || cleanSenderId === "me") {
    console.error("신호 전송 실패: 실제 senderId 없음");
    return false;
  }

  if (cleanReceiverIds.length === 0) {
    console.error("신호 전송 실패: 실제 receiverIds 없음");
    return false;
  }

  const rows = cleanReceiverIds.map((receiverId) => ({
    sender_id: cleanSenderId,
    receiver_id: receiverId,
    emoji,
    is_read: false,
  }));

  const { error } = await supabase.from("signals").insert(rows);

  if (error) {
    console.error("신호 전송 실패 message:", error.message);
    console.error("신호 전송 실패 details:", error.details);
    console.error("신호 전송 실패 hint:", error.hint);
    console.error("신호 전송 실패 code:", error.code);
    return false;
  }

  return true;
}
