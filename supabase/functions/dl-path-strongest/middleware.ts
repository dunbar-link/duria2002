// ./middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { verifyDlJwt } from "@/lib/auth/jwt";

const STRONGEST_PREFIXES = ["/strongest"];
const STRONGEST_API_PREFIXES = ["/api/strongest"];

function isStrongestPath(pathname: string) {
  return (
    STRONGEST_PREFIXES.some((p) => pathname.startsWith(p)) ||
    STRONGEST_API_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // strongest 아닌 라우트는 통과
  if (!isStrongestPath(pathname)) return NextResponse.next();

  // strongest는 JWT 필수
  const token = req.cookies.get("dl_jwt")?.value;
  if (!token) return redirectToPaywall(req);

  try {
    const payload = await verifyDlJwt(token);
    if (payload.plan !== "strongest") return redirectToPaywall(req);

    // 통과
    return NextResponse.next();
  } catch {
    return redirectToPaywall(req);
  }
}

function redirectToPaywall(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/paywall/strongest";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};