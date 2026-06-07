import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
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
      accepted_person_id: acceptedPersonId,
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
