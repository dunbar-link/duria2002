import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function getUserIdFromBearer(admin: any, req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data?.user) return null;

  return data.user.id;
}

export async function GET(req: Request) {
  try {
    const admin = getSupabaseAdmin();

    const userId = await getUserIdFromBearer(admin, req);

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const { data, error } = await admin
      .from("dl_memberships")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}