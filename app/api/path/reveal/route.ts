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
  let target_pid = "";
  let cost = 0;
  let max_hops = 5;

  try {
    const body = await req.json();

    tester_name = String(body?.tester_name ?? "").trim();
    target_pid = String(body?.target_pid ?? "").trim();
    cost = Number(body?.cost ?? 0);
    max_hops = Number(body?.max_hops ?? 5);

    if (!tester_name) {
      return NextResponse.json({ ok: false, error: "tester_name is required" }, { status: 400 });
    }
    if (!target_pid) {
      return NextResponse.json({ ok: false, error: "target_pid is required" }, { status: 400 });
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

    // ✅ supabaseAdmin는 "함수"가 아니라 "클라이언트 객체"라서 호출하면 안 됨
    const { data, error } = await supabaseAdmin.rpc("dl_path_probe_paid", {
      p_user_id: DL_DEMO_USER_ID,
      p_target_pid: target_pid,
      p_cost: cost,
      p_max_hops: max_hops,
    });

    const http_ok = !error;

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
    const payload = {
      status: http_ok ? "ok" : "error",
      http_ok,
      error: http_ok ? null : error?.message ?? "rpc_failed",
      started_at: startedAt,
      finished_at: nowIso(),

      tester_name,

      balance_before,
      balance_after,

      cost,
      max_hops,
      target_pid,

      found: http_ok ? Boolean((data as any)?.found) : null,
      hops: http_ok ? Number((data as any)?.hops ?? 0) : null,
      sumTrust: http_ok ? Number((data as any)?.sumTrust ?? 0) : null,
      bottleneckTrust: http_ok ? Number((data as any)?.bottleneckTrust ?? 0) : null,
    };

    await supabaseAdmin.from("dl_events").insert({
      user_id: DL_DEMO_USER_ID,
      event_type: "path_reveal_paid_result",
      payload,
    });

    if (!http_ok) {
      return NextResponse.json({ ok: false, error: error?.message ?? "rpc_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data, balance_before, balance_after }, { status: 200 });
  } catch (e: any) {
    try {
      if (DL_DEMO_USER_ID) {
        await supabaseAdmin.from("dl_events").insert({
          user_id: DL_DEMO_USER_ID,
          event_type: "path_reveal_paid_result",
          payload: {
            status: "error",
            http_ok: false,
            error: e?.message ?? String(e),
            started_at: startedAt,
            finished_at: nowIso(),
            tester_name,
            target_pid,
            cost,
            max_hops,
          },
        });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}