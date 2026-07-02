import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";
import { toKstDateKey } from "@/lib/signal/read-signals";

// P3-2B-2: 계정(연결된 모든 legacy sender id) 기준으로 "신호 보낸 고유 날짜 수"를
// 서버에서 계산한다. client getCurrentUserId(기기별 dl-user-id)로 세면 PC/모바일이
// 갈리므로, auth 세션 → user_identity_links 의 legacyIds 전체를 sender 후보로 묶어
// signals 를 read-only 로 집계한다. 같은 계정이면 어느 기기든 같은 값.
export const dynamic = "force-dynamic";

const SIGNAL_DAY_POINTS = 5;
const SIGNAL_ROW_LIMIT = 1000;

// GET /api/me/signal-days
// - 미로그인: 401
// - 로그인: 200 { ok, signalDayCount, signalPoints, senderIdsCount, truncated }
//
// 인증은 getInviteSession(auth.getUser + user_identity_links→legacyIds)으로만 하고,
// service_role 은 signals 를 "조회"하는 도구로만 쓴다(sender_id IN 내 legacy 집합으로
// 강하게 제한 → 본인 계정 밖 신호는 못 셈). created_at 만 select, 숫자만 반환.
export async function GET() {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    // 내 계정의 sender 후보: 연결된 legacy id 전체 + auth user id(중복 제거).
    const senderIds = Array.from(
      new Set(
        [...session.legacyIds, session.authUserId].filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    );

    if (senderIds.length === 0) {
      // 기기 연결 전이면 셀 신호가 없다(graceful, 0).
      return NextResponse.json({
        ok: true,
        signalDayCount: 0,
        signalPoints: 0,
        senderIdsCount: 0,
        truncated: false,
      });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("signals")
      .select("created_at")
      .in("sender_id", senderIds)
      .order("created_at", { ascending: false })
      .limit(SIGNAL_ROW_LIMIT);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as { created_at?: unknown }[];
    const truncated = rows.length >= SIGNAL_ROW_LIMIT;

    const days = new Set<string>();
    for (const row of rows) {
      const ts = typeof row.created_at === "string" ? row.created_at : "";
      if (!ts) continue;
      const key = toKstDateKey(ts);
      if (key) days.add(key);
    }

    const signalDayCount = days.size;
    return NextResponse.json({
      ok: true,
      signalDayCount,
      signalPoints: signalDayCount * SIGNAL_DAY_POINTS,
      senderIdsCount: senderIds.length,
      truncated,
      ...(truncated ? { warning: "row_limit_reached" } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
