import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  user_id?: string;
  amount?: number;
  pin?: string;
  tester_name?: string;
};

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

function createSupabaseClient() {
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = readRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    const adminPin = readRequiredEnv("DL_DEMO_ADMIN_PIN");
    const supabase = createSupabaseClient();
    const body = (await req.json()) as Body;

    const user_id = String(body?.user_id ?? "").trim();
    const amount = Number(body?.amount ?? 0);
    const pin = String(body?.pin ?? "").trim();

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "user_id is required" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "invalid amount" },
        { status: 400 },
      );
    }

    if (!pin) {
      return NextResponse.json(
        { ok: false, error: "pin is required" },
        { status: 400 },
      );
    }

    if (pin !== adminPin) {
      return NextResponse.json(
        { ok: false, error: "invalid pin" },
        { status: 403 },
      );
    }

    const { data: walletRow, error: walletError } = await supabase
      .from("dl_wallets")
      .select("balance")
      .eq("user_id", user_id)
      .maybeSingle();

    if (walletError) {
      return NextResponse.json(
        { ok: false, error: walletError.message },
        { status: 500 },
      );
    }

    const currentBalance = Number(walletRow?.balance ?? 0);
    const nextBalance = currentBalance + amount;

    const { error: upsertError } = await supabase
      .from("dl_wallets")
      .upsert({ user_id, balance: nextBalance }, { onConflict: "user_id" });

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message },
        { status: 500 },
      );
    }

    const { error: ledgerError } = await supabase.from("dl_coin_ledger").insert({
      user_id,
      delta: amount,
      reason: "topup_pin",
    });

    if (ledgerError) {
      return NextResponse.json(
        {
          ok: false,
          error: ledgerError.message,
          hint: "wallet updated but ledger insert failed",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, balance: nextBalance });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
