import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? "30")));

    const { data, error } = await supabaseAdmin.rpc("dl_cbt_report", { p_days: days });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, hint: error.hint ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, days, rows: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}