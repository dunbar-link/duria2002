import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const DL_DEMO_USER_ID = process.env.DL_DEMO_USER_ID ?? "";

function nowIso() {
  return new Date().toISOString();
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const startedAt = nowIso();
  let testerName = "";
  let targetPid = "";
  let cost = 0;
  let maxHops = 5;

  try {
    const body = await req.json();
    testerName = readText(body?.tester_name);
    targetPid = readText(body?.target_pid);
    cost = Number(body?.cost ?? 0);
    maxHops = Number(body?.max_hops ?? 5);

    if (!testerName) return NextResponse.json({ ok: false, error: "tester_name is required" }, { status: 400 });
    if (!targetPid) return NextResponse.json({ ok: false, error: "target_pid is required" }, { status: 400 });
    if (!DL_DEMO_USER_ID) return NextResponse.json({ ok: false, error: "Missing env: DL_DEMO_USER_ID" }, { status: 500 });

    const { data: beforeWallet } = await supabase.from("dl_wallets").select("balance").eq("user_id", DL_DEMO_USER_ID).maybeSingle();
    const balanceBefore = beforeWallet?.balance != null ? Number(beforeWallet.balance) : null;

    const { data, error } = await supabase.rpc("dl_path_probe_paid", {
      p_user_id: DL_DEMO_USER_ID,
      p_target_pid: targetPid,
      p_cost: cost,
      p_max_hops: maxHops,
    });

    const { data: afterWallet } = await supabase.from("dl_wallets").select("balance").eq("user_id", DL_DEMO_USER_ID).maybeSingle();
    const balanceAfter = afterWallet?.balance != null ? Number(afterWallet.balance) : null;

    const payload = {
      status: error ? "error" : "ok",
      http_ok: !error,
      error: error ? error.message : null,
      started_at: startedAt,
      finished_at: nowIso(),
      tester_name: testerName,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      cost,
      max_hops: maxHops,
      target_pid: targetPid,
      found: error ? null : Boolean((data as any)?.found),
      hops: error ? null : Number((data as any)?.hops ?? 0),
      sumTrust: error ? null : Number((data as any)?.sumTrust ?? 0),
      bottleneckTrust: error ? null : Number((data as any)?.bottleneckTrust ?? 0),
    };

    await supabase.from("dl_events").insert({ user_id: DL_DEMO_USER_ID, event_type: "path_reveal_paid_result", payload });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, result: data, balance_before: balanceBefore, balance_after: balanceAfter });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (DL_DEMO_USER_ID) {
      await supabase.from("dl_events").insert({
        user_id: DL_DEMO_USER_ID,
        event_type: "path_reveal_paid_result",
        payload: { status: "error", http_ok: false, error: message, started_at: startedAt, finished_at: nowIso(), tester_name: testerName, target_pid: targetPid, cost, max_hops: maxHops },
      });
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
