// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Service Role(Admin) Supabase Client
 * - 절대 브라우저(클라이언트)로 노출 금지
 * - API Route / Server Only 에서만 사용
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}