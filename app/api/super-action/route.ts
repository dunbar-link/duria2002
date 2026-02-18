import { NextResponse } from "next/server";

export const runtime = "nodejs";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const SUPABASE_FUNCTION_URL = process.env.SUPABASE_FUNCTION_URL;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// CORS preflight 대응 (다른 도메인에서 호출할 때 필요)
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  try {
    if (!INTERNAL_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing env: INTERNAL_API_KEY" }, { status: 500 });
    }
    if (!SUPABASE_FUNCTION_URL) {
      return NextResponse.json({ ok: false, error: "Missing env: SUPABASE_FUNCTION_URL" }, { status: 500 });
    }

    const origin = req.headers.get("origin");
    const body = await req.json();

    // ✅ 여기서만(서버에서만) INTERNAL_API_KEY를 붙여서 Supabase로 전달
    const upstream = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text; // upstream이 JSON이 아닌 문자열로 올 때 대비
    }

    // upstream이 실패하면 status를 그대로 전달 (디버깅이 쉬움)
    return NextResponse.json(
      {
        ok: upstream.ok,
        upstreamStatus: upstream.status,
        data,
      },
      { status: upstream.status, headers: corsHeaders(origin) }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
