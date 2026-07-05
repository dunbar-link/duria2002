import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

// P4-1C-c: 계정 전체 기준 "받은 미확인 신호 sender 목록".
// 한 계정은 legacy dl-user-id 를 여러 개 가질 수 있어(user_identity_links),
// 상대가 내 어느 id 로 신호를 보냈든(receiver_id) 놓치지 않고 잡아야 Home
// 말풍선 빨간점이 양방향에서 정확하다. client 단일 id(getCurrentUserId)만으로는
// 다른 legacy id 로 온 신호를 놓친다 → 여기서 세션의 모든 id 로 조회한다.
// 읽음 처리/Point/signalDays 는 건드리지 않는다(조회 전용).
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
      return NextResponse.json({ ok: true, senderIds: [] });
    }

    const supabase = createAdminClient();
    // 받은(receiver_id ∈ 내 계정 id) + 미확인(is_read=false) 신호의 sender 목록.
    const { data, error } = await supabase
      .from("signals")
      .select("sender_id")
      .in("receiver_id", myIds)
      .eq("is_read", false)
      .limit(1000);

    if (error) {
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }

    const mySet = new Set(myIds);
    const senderIds = Array.from(
      new Set(
        (data ?? [])
          .map((row) => {
            const value = (row as { sender_id?: unknown }).sender_id;
            return typeof value === "string" ? value.trim() : "";
          })
          .filter((id) => id.length > 0 && !mySet.has(id)),
      ),
    );

    return NextResponse.json({ ok: true, senderIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
