import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
) {
  // 이름은 우선 email 앞부분을 기본값으로
  const fallbackName = (user.email ?? "").split("@")[0] || "User";

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      name: fallbackName,
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(error.message);
}