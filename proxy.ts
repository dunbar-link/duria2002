import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// /dashboard 전체를 로그인 세션으로 보호한다. 세션 판단은 서버 auth.getUser 로만
// 하고(localStorage userId 불신), @supabase/ssr 로 요청/응답 쿠키를 refresh 한다.
// service_role 미사용. 공개 경로(/login, /auth/callback, 정적, 초대 landing 등)는
// matcher 밖이라 이 함수가 호출되지 않는다(redirect loop 없음).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/app-dashboard" ||
    pathname.startsWith("/app-dashboard/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/");

  if (!isProtected) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // 비로그인 → /login?next=<원래 내부 경로>. next 는 항상 내부 pathname 만.
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/app-dashboard/:path*", "/invite/:path*"],
};
