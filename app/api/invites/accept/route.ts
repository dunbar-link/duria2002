import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

export async function POST(req: Request) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await req.json()) as {
      token?: string;
      acceptedPersonId?: string;
      acceptedPersonName?: string;
      acceptedPersonPhotoUrl?: string;
      acceptedAt?: string;
    };

    const { token, acceptedPersonId, acceptedPersonName, acceptedAt } = body;
    // 수락 snapshot: accepter 의 현재 Me 프로필 사진 public URL(빈 값=null). 선택 필드.
    const acceptedPersonPhotoUrl =
      typeof body.acceptedPersonPhotoUrl === "string"
        ? body.acceptedPersonPhotoUrl.trim() || null
        : null;

    if (!token || !acceptedPersonId || !acceptedPersonName || !acceptedAt) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // 수락자 owner 는 client 값이 아니라 세션 legacy 집합으로 강제한다(타인 대신 수락 차단).
    const legacyIds = session.legacyIds;
    if (legacyIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "ACCOUNT_LINK_REQUIRED" },
        { status: 403 },
      );
    }
    // client 가 보낸 acceptedPersonId 가 내 legacy 집합에 없으면 위조로 보고 차단.
    if (!legacyIds.includes(acceptedPersonId)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    const accepterLegacyId = acceptedPersonId;

    const supabase = createAdminClient();

    const { data: invite } = await supabase
      .from("dl_invites")
      .select("token, status")
      .eq("token", token)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const baseUpdate = {
      status: "accepted",
      accepted_person_id: accepterLegacyId,
      accepted_person_name: acceptedPersonName,
      accepted_at: acceptedAt,
    };

    // 사진 컬럼 포함으로 먼저 update, 실패 시 기본 update 로 폴백한다.
    // 사진 때문에 수락 자체가 실패하면 안 된다(이름/수락 안정성 우선).
    let { error: updateError } = await supabase
      .from("dl_invites")
      .update({
        ...baseUpdate,
        accepted_person_photo_url: acceptedPersonPhotoUrl,
      })
      .eq("token", token)
      .eq("status", "pending");

    if (updateError) {
      ({ error: updateError } = await supabase
        .from("dl_invites")
        .update(baseUpdate)
        .eq("token", token)
        .eq("status", "pending"));
    }

    if (updateError) {
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
