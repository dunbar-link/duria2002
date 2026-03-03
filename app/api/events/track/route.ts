import { NextResponse } from "next/server";

type Body = {
  eventType?: string;
  payload?: Record<string, any>;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const { eventType, payload } = (await req.json()) as Body;
    if (!eventType) {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }

    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    // 내부 테스트는 일단 고정 user_id로 기록 (실계정 연동은 베타 이후)
    const userId = "00000000-0000-0000-0000-000000000000";

    const resp = await fetch(`${supabaseUrl}/rest/v1/dl_events`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        event_type: eventType,
        payload: payload ?? {},
      }),
    });

    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}