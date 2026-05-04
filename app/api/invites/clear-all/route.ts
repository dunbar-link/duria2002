import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase 환경 변수가 없습니다.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST() {
  try {
    const supabase = getSupabaseAdminClient();

    const { count, error } = await supabase
      .from("dl_invites")
      .delete({ count: "exact" })
      .neq("token", "");

    if (error) {
      return NextResponse.json({ ok: false, deleted: 0, message: error.message });
    }

    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server error";
    return NextResponse.json({ ok: false, deleted: 0, message }, { status: 500 });
  }
}
