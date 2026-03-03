export const runtime = "nodejs";

import { NextResponse } from "next/server";

type Json = Record<string, any>;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const { targetPid } = (await req.json()) as { targetPid?: string };

    if (!targetPid || !targetPid.trim()) {
      return NextResponse.json({ error: "targetPid is required" }, { status: 400 });
    }

    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const pUserId = "00000000-0000-0000-0000-000000000000";
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/dl_path_probe_paid`;

    const body = JSON.stringify({
      p_user_id: pUserId,
      p_target_pid: targetPid,
      p_cost: 10,
      p_max_hops: 6,
    } satisfies Json);

    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
      },
      body,
    });

    const text = await resp.text();

    return new NextResponse(text, {
      status: resp.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}