import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function toInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tester_name = String(body?.tester_name ?? "").trim() || "(unknown)";
    const target_pid = String(body?.target_pid ?? "").trim();
    const cost = toInt(body?.cost, 10);
    const max_hops = toInt(body?.max_hops, 5);

    if (!target_pid) {
      return NextResponse.json({ ok: false, error: "Missing target_pid" }, { status: 400 });
    }
    if (cost < 0) {
      return NextResponse.json({ ok: false, error: "Invalid cost" }, { status: 400 });
    }
    if (max_hops < 1 || max_hops > 10) {
      return NextResponse.json({ ok: false, error: "Invalid max_hops" }, { status: 400 });
    }

    const demoUserId = requireEnv("DL_DEMO_USER_ID"); // uuid string
    const sb = supabaseAdmin;

    // ✅ balance_before
    const beforeRes = await sb
      .from("dl_wallets")
      .select("balance")
      .eq("user_id", demoUserId)
      .maybeSingle();

    let balance_before: number | null = null;

    if (beforeRes.error) {
      return NextResponse.json({ ok: false, error: beforeRes.error.message }, { status: 500 });
    }

    if (!beforeRes.data) {
      // wallet row 없으면 만들어둠(0부터)
      const ins = await sb.from("dl_wallets").insert({ user_id: demoUserId, balance: 0 });
      if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
      balance_before = 0;
    } else {
      balance_before = Number(beforeRes.data.balance);
    }

    // ✅ RPC: dl_path_probe_paid 호출
    const { data, error } = await sb.rpc("dl_path_probe_paid", {
      p_user_id: demoUserId,
      p_target_pid: target_pid,
      p_cost: cost,
      p_max_hops: max_hops,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, balance_before }, { status: 500 });
    }

    // ✅ balance_after
    const afterRes = await sb
      .from("dl_wallets")
      .select("balance")
      .eq("user_id", demoUserId)
      .maybeSingle();

    if (afterRes.error) {
      return NextResponse.json({ ok: false, error: afterRes.error.message, balance_before }, { status: 500 });
    }

    const balance_after = afterRes.data ? Number(afterRes.data.balance) : null;

    // RPC가 jsonb 리턴이므로 그대로 펼쳐서 + before/after 붙임
    const payload =
      data && typeof data === "object"
        ? { ...data, balance_before, balance_after }
        : { result: data, balance_before, balance_after };

    // (참고) tester_name은 프론트에서 events/track로 따로 기록하므로
    // 여기서는 응답에만 참고용으로 포함
    return NextResponse.json({ ...payload, tester_name });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}