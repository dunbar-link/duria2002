// app/api/me/memberships/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

async function getUserIdFromBearer(admin: ReturnType<typeof getSupabaseAdmin>, req: Request) {
  const authz = req.headers.get("authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function GET(req: Request) {
  const admin = getSupabaseAdmin();
  const userId = await getUserIdFromBearer(admin, req);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data, error } = await admin
    .from("organization_memberships")
    .select("id,user_id,organization_id,role,verified,created_at, organizations:organization_id (id,name,type,country,metadata)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: "DB_ERROR", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId, count: data?.length ?? 0, items: data ?? [] });
}