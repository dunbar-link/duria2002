import type { SupabaseClient } from "@supabase/supabase-js";

type InteractionType = "message" | "call" | "meeting" | "email" | "other";

export async function markContacted(
  supabase: SupabaseClient,
  args: {
    ownerUserId: string;
    contactId: string;
    type?: InteractionType;
    note?: string | null;
    // 기본 7일. 필요하면 14, 30 등으로 변경 가능
    nextDays?: number;
  }
) {
  const now = new Date();
  const nextDays = args.nextDays ?? 7;
  const next = new Date(now.getTime() + nextDays * 24 * 60 * 60 * 1000);

  // 1) interactions 추가
  const { error: insErr } = await supabase.from("interactions").insert({
    owner_user_id: args.ownerUserId,
    contact_id: args.contactId,
    type: args.type ?? "message",
    occurred_at: now.toISOString(),
    note: args.note ?? null,
  });

  if (insErr) throw new Error(insErr.message);

  // 2) 다음 액션 날짜 업데이트
  const { error: updErr } = await supabase
    .from("contacts")
    .update({ next_action_at: next.toISOString() })
    .eq("id", args.contactId);

  if (updErr) throw new Error(updErr.message);
}