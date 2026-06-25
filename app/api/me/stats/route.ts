import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

// 계정(연결된 모든 기기=legacyIds) 기준 Me 통계를 서버에서 계산한다.
// localStorage inviteDrafts 가 기기마다 달라 PC/모바일 "초대 성공"/Point 가
// 어긋나던 문제를, 서버 dl_invites 기준 count 로 통일하기 위한 read-only 통계.
export const dynamic = "force-dynamic";

// GET /api/me/stats
// - 미로그인: 401
// - 로그인: 200 { ok:true, acceptedInvitesCount }
//
// 인증은 getInviteSession(세션 auth.getUser + user_identity_links→legacyIds)으로만
// 하고, service_role 은 dl_invites 를 "조회"하는 도구로만 쓴다(인증 대체 아님).
// inviter_user_id IN legacyIds 로 범위를 강하게 제한해 본인 계정 밖은 못 센다.
export async function GET() {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const legacyIds = session.legacyIds;
    // 기기 연결 전(직행 등)이면 셀 초대가 없다(graceful, 0).
    if (legacyIds.length === 0) {
      return NextResponse.json({ ok: true, acceptedInvitesCount: 0 });
    }

    const supabase = createAdminClient();
    // "초대 성공" = 내 legacy 집합 중 하나가 보낸 초대(inviter_user_id)가 수락됨.
    // head:true 라 행 데이터는 가져오지 않고 count 만 받는다(데이터 노출 없음).
    const { count, error } = await supabase
      .from("dl_invites")
      .select("token", { count: "exact", head: true })
      .in("inviter_user_id", legacyIds)
      .eq("status", "accepted");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      acceptedInvitesCount: count ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
