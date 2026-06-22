import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;
const MAX_NAME_LENGTH = 60;

type RefreshBody = {
  userId?: string;
  name?: string;
};

/**
 * me 프로필 이름이 바뀐 직후 dl_invites의 박제된 snapshot 이름을
 * 현재 me 이름으로 재동기화한다.
 *
 * WHERE 절은 inviter_user_id = me / accepted_person_id = me 로만 제한.
 * 절대 다른 사람의 행을 건드리지 않는다.
 */
export async function POST(req: Request) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as RefreshBody | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!userId || !SAFE_USER_ID.test(userId)) {
      return NextResponse.json(
        { ok: false, message: "invalid userId" },
        { status: 400 },
      );
    }

    // owner 는 client userId 가 아니라 세션에 연결된 legacy 집합으로 강제한다.
    const legacyIds = session.legacyIds;
    if (legacyIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "ACCOUNT_LINK_REQUIRED" },
        { status: 403 },
      );
    }
    // client 가 보낸 userId 가 내 legacy 집합에 없으면 위조로 보고 차단.
    if (!legacyIds.includes(userId)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { ok: false, message: "invalid name" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const inviterUpdate = await supabase
      .from("dl_invites")
      .update({ inviter_name: name })
      .eq("inviter_user_id", userId)
      .neq("inviter_name", name);

    const acceptedUpdate = await supabase
      .from("dl_invites")
      .update({ accepted_person_name: name })
      .eq("accepted_person_id", userId)
      .neq("accepted_person_name", name);

    if (inviterUpdate.error || acceptedUpdate.error) {
      console.error(
        "[refresh-name] update 실패:",
        inviterUpdate.error?.message ?? "",
        acceptedUpdate.error?.message ?? "",
      );
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[refresh-name] 예외:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
