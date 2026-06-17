import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function GET(req: Request) {
  // 인증·소유권 검증이 없어 client userId 로 타인 지갑을 조회할 수 있는 실험용
  // route. 진짜 인증(OTP) 도입 전까지 production 에서 차단한다. (개발 환경 유지)
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "disabled in production" }, { status: 403 });
  }
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") ?? searchParams.get("user_id") ?? requireEnv("DL_DEMO_USER_ID");

    const { data, error } = await supabase.from("dl_wallets").select("*").eq("user_id", userId).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, wallet: data ?? { user_id: userId, balance: 0 } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
