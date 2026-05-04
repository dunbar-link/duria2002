import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userId = body.userId;
    const targetPid = body.targetPid;
    const cost = body.cost ?? 10;
    const maxHops = body.maxHops ?? 6;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    if (!targetPid) {
      return NextResponse.json(
        { ok: false, error: "targetPid is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "dl_path_probe_paid_v2",
      {
        p_user_id: userId,
        p_target_pid: targetPid,
        p_cost: cost,
        p_max_hops: maxHops,
      }
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        result: data,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}