import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

// 연결된 상대의 최신 이름(inviter_name / accepted_person_name)을 항상 최신으로
// 내려야 하므로 절대 캐시하지 않는다.
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["pending", "accepted"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;

export async function GET(req: Request) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

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

    // 권한 기준은 client 가 보낸 userId 가 아니라 세션에 연결된 legacy 집합이다.
    const legacyIds = session.legacyIds;
    if (legacyIds.length === 0) {
      // 기기 연결 전(직행 등)이면 조회 가능한 초대가 없다(graceful, 403 아님).
      return NextResponse.json({ ok: true, invites: [] });
    }
    // client 가 보낸 userId 가 내 legacy 집합에 없으면 위조로 보고 차단.
    if (!legacyIds.includes(userId)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
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

    // 이름 동기화에 필요한 기본 컬럼. 절대 깨지면 안 된다.
    const BASE_COLUMNS =
      "token, invite_path, invitee_name, invitee_phone, source_person_id, tier, relationship_type, relationship_label, inviter_note, inviter_user_id, inviter_name, status, accepted_person_id, accepted_person_name, accepted_at, created_at";
    // 프로필 사진 cross-device sync용 추가 컬럼(마이그레이션 후 존재).
    const PHOTO_COLUMNS = "inviter_photo_url, accepted_person_photo_url";

    const runQuery = (columns: string) => {
      let query = supabase
        .from("dl_invites")
        .select(columns)
        .or(`inviter_user_id.eq.${userId},accepted_person_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (statusParam) {
        query = query.eq("status", statusParam);
      }

      return query;
    };

    // 사진 컬럼 포함으로 먼저 시도하고, (마이그레이션 미적용 등으로) 실패하면
    // 기본 컬럼만으로 폴백한다. 이렇게 해야 사진 컬럼이 아직 없어도 기존
    // 이름 동기화가 절대 깨지지 않는다.
    let { data, error } = await runQuery(`${BASE_COLUMNS}, ${PHOTO_COLUMNS}`);

    if (error) {
      ({ data, error } = await runQuery(BASE_COLUMNS));
    }

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
