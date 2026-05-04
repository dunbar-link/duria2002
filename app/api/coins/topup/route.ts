import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ADMIN_PIN = process.env.DL_DEMO_ADMIN_PIN!;

function requireEnv(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
const key = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
requireEnv("DL_DEMO_ADMIN_PIN", ADMIN_PIN);

const supabase = createClient(url, key, { auth: { persistSession: false } });

type Body = {
  user_id?: string;
  amount?: number;
  pin?: string;
  tester_name?: string;
};

// ✅ 라우트 존재 확인용 (브라우저로 바로 확인 가능)
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/coins/topup" });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const user_id = String(body?.user_id ?? "").trim();
    const amount = Number(body?.amount ?? 0);
    const pin = String(body?.pin ?? "").trim();

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "invalid amount" }, { status: 400 });
    }
    if (!pin) {
      return NextResponse.json({ ok: false, error: "pin is required" }, { status: 400 });
    }
    if (pin !== ADMIN_PIN) {
      return NextResponse.json({ ok: false, error: "invalid pin" }, { status: 403 });
    }

    // 1) 현재 지갑 조회
    const { data: walletRow, error: wErr } = await supabase
      .from("dl_wallets")
      .select("balance")
      .eq("user_id", user_id)
      .maybeSingle();

    if (wErr) {
      return NextResponse.json({ ok: false, error: wErr.message }, { status: 500 });
    }

    const current = Number(walletRow?.balance ?? 0);
    const nextBalance = current + amount;

    // 2) 지갑 upsert
    const { error: upErr } = await supabase
      .from("dl_wallets")
      .upsert({ user_id, balance: nextBalance }, { onConflict: "user_id" });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // 3) ledger 기록
    const { error: lErr } = await supabase.from("dl_coin_ledger").insert({
      user_id,
      delta: amount,
      reason: "topup_pin",
    });

    if (lErr) {
      return NextResponse.json(
        { ok: false, error: lErr.message, hint: "wallet updated but ledger insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, balance: nextBalance });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ? String(e.message) : "unknown error" },
      { status: 500 }
    );
  }
}