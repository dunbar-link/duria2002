import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const demoUserId = String(body?.user_id ?? body?.userId ?? requireEnv("DL_DEMO_USER_ID"));
    const targetPid = String(body?.target_pid ?? body?.targetPid ?? "").trim();
    const cost = Number(body?.cost ?? 0);

    if (!targetPid) return NextResponse.json({ ok: false, error: "target_pid is required" }, { status: 400 });

    const beforeRes = await supabase.from("dl_wallets").select("balance").eq("user_id", demoUserId).maybeSingle();
    const balanceBefore = beforeRes.data?.balance != null ? Number(beforeRes.data.balance) : null;

    const { data, error } = await supabase.rpc("dl_path_probe_paid", {
      p_user_id: demoUserId,
      p_target_pid: targetPid,
      p_cost: cost,
      p_max_hops: Number(body?.max_hops ?? 5),
    });

    const afterRes = await supabase.from("dl_wallets").select("balance").eq("user_id", demoUserId).maybeSingle();
    const balanceAfter = afterRes.data?.balance != null ? Number(afterRes.data.balance) : null;

    if (error) return NextResponse.json({ ok: false, error: error.message, balanceBefore, balanceAfter }, { status: 500 });
    return NextResponse.json({ ok: true, result: data, balanceBefore, balanceAfter });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
