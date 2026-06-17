import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Next 16 의 cookies() 는 async(Promise) 다. 과거 sync 캐스팅은 세션 쿠키를 읽지
// 못해 인증 route 가 항상 401 이 된다. @supabase/ssr 0.10 표준(getAll/setAll +
// await cookies())으로 세션 쿠키를 읽고/쓴다. route handler 에서 await createClient().
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 컨텍스트에서는 set 이 불가할 수 있다
            // (세션 갱신 쿠키는 route handler / 미들웨어에서만 기록).
          }
        },
      },
    },
  );
}
