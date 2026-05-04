import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const ownerUserId = searchParams.get("ownerUserId") ?? "fa0d8146-46c1-4fab-b6ba-e1b002c62011";
    const targetPid = searchParams.get("targetPid") ?? searchParams.get("target_pid") ?? "";

    if (!targetPid) return NextResponse.json({ ok: false, error: "targetPid is required" }, { status: 400 });

    const { data, error } = await supabase.rpc("dl_find_path", {
      p_owner_user_id: ownerUserId,
      p_target_pid: targetPid,
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
