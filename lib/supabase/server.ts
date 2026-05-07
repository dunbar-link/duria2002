import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieValue = {
  value: string;
};

type SupabaseCookieStore = {
  get(name: string): CookieValue | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
};

export function createClient() {
  const cookieStore = cookies() as unknown as SupabaseCookieStore;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set(name, "", options);
        },
      },
    },
  );
}
