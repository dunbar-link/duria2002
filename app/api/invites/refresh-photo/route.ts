import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;
const MAX_PHOTO_URL_LENGTH = 1000;

type RefreshPhotoBody = {
  userId?: string;
  photoUrl?: string;
};

/**
 * me 프로필 사진(public URL)이 바뀐 직후 dl_invites 의 사진 컬럼을
 * 현재 me 사진으로 재동기화한다. refresh-name 과 동일한 패턴.
 *
 * WHERE 절은 inviter_user_id = me / accepted_person_id = me 로만 제한.
 * 절대 다른 사람의 행을 건드리지 않는다.
 *
 * photoUrl 이 빈 문자열이면 null 로 클리어한다(사진 초기화가 상대에게 전파됨).
 * 컬럼 미존재 등으로 실패해도 이름 동기화에는 영향 없다(별도 route).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as RefreshPhotoBody | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const rawPhotoUrl =
      typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";

    if (!userId || !SAFE_USER_ID.test(userId)) {
      return NextResponse.json(
        { ok: false, message: "invalid userId" },
        { status: 400 },
      );
    }

    if (rawPhotoUrl.length > MAX_PHOTO_URL_LENGTH) {
      return NextResponse.json(
        { ok: false, message: "invalid photoUrl" },
        { status: 400 },
      );
    }

    // 빈 값이면 null 로 저장 → "사진 없음"이 상대에게 전파된다.
    const photoValue = rawPhotoUrl || null;

    const supabase = createAdminClient();

    const inviterUpdate = await supabase
      .from("dl_invites")
      .update({ inviter_photo_url: photoValue })
      .eq("inviter_user_id", userId);

    const acceptedUpdate = await supabase
      .from("dl_invites")
      .update({ accepted_person_photo_url: photoValue })
      .eq("accepted_person_id", userId);

    if (inviterUpdate.error || acceptedUpdate.error) {
      console.error(
        "[refresh-photo] update 실패:",
        inviterUpdate.error?.message ?? "",
        acceptedUpdate.error?.message ?? "",
      );
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[refresh-photo] 예외:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
