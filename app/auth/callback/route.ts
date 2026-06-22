import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Vercel 프록시 뒤에서도 올바른 외부 origin 을 만든다. open redirect 방지를 위해
// next 는 상대 경로(/...)만 허용하고, redirect 대상 host 는 항상 이 origin 이다.
function resolveOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// "/..." 상대 경로만 허용("//" 프로토콜-상대 차단). 외부 URL 이면 null.
function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveOrigin(request);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next");
  const nextPath = safeNextPath(rawNext);
  const DEFAULT_NEXT = "/login?oauth=kakao";

  // next 가 주어졌는데 외부 URL 이면 차단.
  if (rawNext && !nextPath) {
    return NextResponse.redirect(`${origin}/login?oauth_error=invalid_redirect`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?oauth_error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?oauth_error=kakao_callback`);
  }

  return NextResponse.redirect(`${origin}${nextPath ?? DEFAULT_NEXT}`);
}
