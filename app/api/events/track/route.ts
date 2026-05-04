import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function str(v: any) {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}

/**
 * ✅ CBT/내부테스트 모드:
 * - auth 복구 전이라 user_id를 서버에서 강제한다.
 * - payload.user_id가 오면 그걸 우선 쓰고, 없으면 DL_DEMO_USER_ID 사용.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const event_type = str(body?.event_type).trim();
    const payload = (body?.payload ?? {}) as Record<string, any>;

    if (!event_type) {
      return NextResponse.json({ ok: false, error: "Missing event_type" }, { status: 400 });
    }

    // ✅ 공통 필드 정규화
    payload.tester_name = str(payload.tester_name).trim() || "(unknown)";
    if (payload.status === undefined) payload.status = "ok";
    if (payload.http_ok === undefined) payload.http_ok = true;
    if (payload.error === undefined) payload.error = null;

    // ✅ dl_events.user_id (NOT NULL) 강제 충족
    // 1) payload.user_id가 있으면 우선 사용
    // 2) 없으면 DL_DEMO_USER_ID로 강제
    const user_id = str(payload.user_id).trim() || requireEnv("DL_DEMO_USER_ID");
    payload.user_id = user_id; // 추후 분석/리포트에도 남기기

    const sb = supabaseAdmin();
    const { error } = await sb.from("dl_events").insert({
      user_id,
      event_type,
      payload,
    });

    if (error) {
      console.error("[events/track] supabase insert error:", {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      });

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: (error as any).details ?? null,
          hint: (error as any).hint ?? null,
          code: (error as any).code ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[events/track] runtime error:", e);
    return NextResponse.json({ ok: false, error: str(e?.message ?? e) }, { status: 500 });
  }
}