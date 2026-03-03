import { NextResponse, type NextRequest } from "next/server";

/**
 * INTERNAL TEST BUILD
 * - strongest/jwt 의존 제거 (빌드 통과 목적)
 * - /path 와 /api/path/* 는 허용
 * - 나머지는 모두 /path 로 보내서 내부테스트 화면만 노출
 *
 * ✅ 보안 강화는 베타 이후(Strongest JWT 복구 시)
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 항상 허용: 내부 테스트 핵심 데모
  if (
    pathname === "/path" ||
    pathname.startsWith("/api/path/") ||
    pathname.startsWith("/api/wallet/") ||
    pathname.startsWith("/api/events/")
  ) {
    return NextResponse.next();
  }

  // 정적/Next 내부 경로 허용
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap")
  ) {
    return NextResponse.next();
  }

  // 그 외는 데모 페이지로 유도
  const url = req.nextUrl.clone();
  url.pathname = "/path";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};