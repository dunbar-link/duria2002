import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * ✅ 내부 테스트/CBT용 라우트는 항상 허용
 * - /path (데모 메인)
 * - /cbt (체크리스트)
 * - /api (백엔드)
 * - next static
 */
function isAllowed(pathname: string) {
  if (pathname === "/path") return true;
  if (pathname === "/cbt") return true;
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ 허용된 경로면 그대로 통과
  if (isAllowed(pathname)) return NextResponse.next();

  // ✅ 그 외는 데모 메인(/path)으로 강제 이동 (기존 정책 유지)
  const url = req.nextUrl.clone();
  url.pathname = "/path";
  return NextResponse.redirect(url);
}