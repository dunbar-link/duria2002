import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function requireEnv(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
const key = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

type Body = {
  user_id?: string;
  target_pid?: string;   // ✅ 표준화
  cost?: number;
  max_hops?: number;
  tester_name?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const user_id = String(body?.user_id ?? "").trim();
    const target_pid = String(body?.target_pid ?? "").trim();
    const cost = Number(body?.cost ?? 0);
    const max_hops = Number(body?.max_hops ?? 5);

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
    }

    if (!target_pid) {
      return NextResponse.json({ ok: false, error: "target_pid is required" }, { status: 400 });
    }

    if (!cost || cost <= 0) {
      return NextResponse.json({ ok: false, error: "invalid cost" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("dl_path_probe_paid", {
      p_user_id: user_id,
      p_target_pid: target_pid,
      p_cost: cost,
      p_max_hops: max_hops,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? { ok: false });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}