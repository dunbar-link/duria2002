import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const DL_DEMO_USER_ID = process.env.DL_DEMO_USER_ID ?? "";

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  const startedAt = nowIso();

  let tester_name = "";
  let amount = 0;

  try {
    const body = await req.json();
    tester_name = String(body?.tester_name ?? "").trim();
    amount = Number(body?.amount ?? 0);

    if (!tester_name) {
      return NextResponse.json({ ok: false, error: "tester_name is required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400 });
    }
    if (!DL_DEMO_USER_ID) {
      return NextResponse.json({ ok: false, error: "Missing env: DL_DEMO_USER_ID" }, { status: 500 });
    }

    // balance_before
    let balance_before: number | null = null;
    {
      const { data } = await supabaseAdmin
        .from("dl_wallets")
        .select("balance")
        .eq("user_id", DL_DEMO_USER_ID)
        .maybeSingle();

      if (data?.balance != null) balance_before = Number(data.balance);
    }

    // upsert/update wallets
    const { data: existing } = await supabaseAdmin
      .from("dl_wallets")
      .select("user_id,balance")
      .eq("user_id", DL_DEMO_USER_ID)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from("dl_wallets").insert({ user_id: DL_DEMO_USER_ID, balance: amount });
    } else {
      await supabaseAdmin
        .from("dl_wallets")
        .update({ balance: Number(existing.balance) + amount })
        .eq("user_id", DL_DEMO_USER_ID);
    }

    // ledger insert
    await supabaseAdmin.from("dl_coin_ledger").insert({
      user_id: DL_DEMO_USER_ID,
      delta: amount,
      reason: "cbt_topup",
    });

    // balance_after
    let balance_after: number | null = null;
    {
      const { data } = await supabaseAdmin
        .from("dl_wallets")
        .select("balance")
        .eq("user_id", DL_DEMO_USER_ID)
        .maybeSingle();

      if (data?.balance != null) balance_after = Number(data.balance);
    }

    // 이벤트 기록(스키마 고정)
    await supabaseAdmin.from("dl_events").insert({
      user_id: DL_DEMO_USER_ID,
      event_type: "coin_topup_result",
      payload: {
        status: "ok",
        http_ok: true,
        error: null,
        started_at: startedAt,
        finished_at: nowIso(),
        tester_name,
        balance_before,
        balance_after,
        amount,
      },
    });

    return NextResponse.json({ ok: true, balance_before, balance_after, amount }, { status: 200 });
  } catch (e: any) {
    try {
      if (DL_DEMO_USER_ID) {
        await supabaseAdmin.from("dl_events").insert({
          user_id: DL_DEMO_USER_ID,
          event_type: "coin_topup_result",
          payload: {
            status: "error",
            http_ok: false,
            error: e?.message ?? String(e),
            started_at: startedAt,
            finished_at: nowIso(),
            tester_name,
            amount,
          },
        });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}