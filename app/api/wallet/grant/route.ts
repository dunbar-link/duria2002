import { NextResponse } from "next/server";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };

  const adminPin = requireEnv("DL_DEMO_ADMIN_PIN");
  if (!pin || pin !== adminPin) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const userId = "00000000-0000-0000-0000-000000000000";

  const resp = await fetch(`${supabaseUrl}/rest/v1/dl_wallets?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ balance: 100 }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return NextResponse.json({ error: text }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance: 100 });
}