import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function POST(req: Request) {
  // 인증·소유권 검증이 없어 client userId 로 타인 지갑을 증액할 수 있는 실험용
  // route. 진짜 인증(OTP) 도입 전까지 production 에서 차단한다. (개발 환경 유지)
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "disabled in production" }, { status: 403 });
  }
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id ?? body?.userId ?? requireEnv("DL_DEMO_USER_ID"));
    const amount = Number(body?.amount ?? 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "amount must be positive" }, { status: 400 });
    }

    const { data: current } = await supabase.from("dl_wallets").select("balance").eq("user_id", userId).maybeSingle();
    const before = Number(current?.balance ?? 0);
    const after = before + amount;

    const { data, error } = await supabase
      .from("dl_wallets")
      .upsert({ user_id: userId, balance: after, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, before, after, wallet: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
