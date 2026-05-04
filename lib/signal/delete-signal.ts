import { supabase } from "@/lib/supabase-client";

export async function deleteSignal(signalId: string) {
  if (!signalId) {
    console.error("신호 삭제 실패: signalId 없음");
    return false;
  }

  const { error } = await supabase.from("signals").delete().eq("id", signalId);

  if (error) {
    console.error("신호 삭제 실패 message:", error.message);
    console.error("신호 삭제 실패 details:", error.details);
    console.error("신호 삭제 실패 hint:", error.hint);
    console.error("신호 삭제 실패 code:", error.code);
    return false;
  }

  return true;
}