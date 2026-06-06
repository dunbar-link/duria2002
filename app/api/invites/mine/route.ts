import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 연결된 상대의 최신 이름(inviter_name / accepted_person_name)을 항상 최신으로
// 내려야 하므로 절대 캐시하지 않는다.
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["pending", "accepted"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = (searchParams.get("userId") ?? "").trim();
    const statusParam = (searchParams.get("status") ?? "").trim();
    const limitParam = (searchParams.get("limit") ?? "").trim();

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "userId required" },
        { status: 400 },
      );
    }

    if (!SAFE_USER_ID.test(userId)) {
      return NextResponse.json(
        { ok: false, message: "invalid userId" },
        { status: 400 },
      );
    }

    if (statusParam && !ALLOWED_STATUS.has(statusParam)) {
      return NextResponse.json(
        { ok: false, message: "invalid status" },
        { status: 400 },
      );
    }

    let limit = DEFAULT_LIMIT;
    if (limitParam) {
      const parsed = Number(limitParam);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json(
          { ok: false, message: "invalid limit" },
          { status: 400 },
        );
      }
      limit = Math.min(Math.floor(parsed), MAX_LIMIT);
    }

    const supabase = createAdminClient();

    let query = supabase
      .from("dl_invites")
      .select(
        "token, invite_path, invitee_name, invitee_phone, source_person_id, tier, relationship_type, relationship_label, inviter_note, inviter_user_id, inviter_name, status, accepted_person_id, accepted_person_name, accepted_at, created_at",
      )
      .or(`inviter_user_id.eq.${userId},accepted_person_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusParam) {
      query = query.eq("status", statusParam);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, invites: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
