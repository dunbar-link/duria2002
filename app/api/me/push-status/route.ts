import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

// P4-1C-d: 로그인 사용자가 "알림 ON" 표시를 실제 push_subscriptions 저장 성공
// 여부로 검증할 수 있도록 하는 진단 전용 route. endpoint/키 값은 절대 내려주지
// 않는다(count 와 최신 updated_at 만). 계정 전체 legacy id 집합 기준으로 조회한다.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const myIds = Array.from(
      new Set(
        [...session.legacyIds, session.authUserId].filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    );

    if (myIds.length === 0) {
      return NextResponse.json({
        ok: true,
        myIds: [],
        subscriptionCount: 0,
        updatedAt: null,
      });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("updated_at")
      .in("user_id", myIds)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }

    const rows = data ?? [];

    return NextResponse.json({
      ok: true,
      myIds,
      subscriptionCount: rows.length,
      updatedAt: (rows[0] as { updated_at?: string } | undefined)?.updated_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
