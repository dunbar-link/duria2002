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
    const amount = toInt(body?.amount, 0);
    const reason = String(body?.reason ?? "PIN_TOPUP").trim() || "PIN_TOPUP";

    if (amount <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }

    const demoUserId = requireEnv("DL_DEMO_USER_ID"); // uuid string (wallets.user_id는 text라 문자열로 저장)
    const sb = supabaseAdmin;

    // ✅ balance_before (없으면 생성)
    const beforeRes = await sb
      .from("dl_wallets")
      .select("balance")
      .eq("user_id", demoUserId)
      .maybeSingle();

    if (beforeRes.error) {
      return NextResponse.json({ ok: false, error: beforeRes.error.message }, { status: 500 });
    }

    let balance_before = 0;

    if (!beforeRes.data) {
      const ins = await sb.from("dl_wallets").insert({ user_id: demoUserId, balance: 0 });
      if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
      balance_before = 0;
    } else {
      balance_before = Number(beforeRes.data.balance);
    }

    const balance_after = balance_before + amount;

    // ✅ wallet update
    const upd = await sb
      .from("dl_wallets")
      .update({ balance: balance_after })
      .eq("user_id", demoUserId);

    if (upd.error) {
      return NextResponse.json({ ok: false, error: upd.error.message, balance_before }, { status: 500 });
    }

    // ✅ ledger insert
    const led = await sb.from("dl_coin_ledger").insert({
      user_id: demoUserId,
      delta: amount,
      reason,
    });

    if (led.error) {
      return NextResponse.json(
        { ok: false, error: led.error.message, balance_before, balance_after },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tester_name,
      amount,
      reason,
      balance_before,
      balance_after,
      balance: balance_after,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}