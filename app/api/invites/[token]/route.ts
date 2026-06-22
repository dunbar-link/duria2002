import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteSession } from "@/lib/auth/invite-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // 초대 조회도 로그인 후에만 허용한다(페이지 proxy 만으로 보호 간주하지 않음).
  const session = await getInviteSession();
  if (!session.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("dl_invites")
    .select(
      "token, invite_path, invitee_name, invitee_phone, tier, relationship_type, relationship_label, inviter_note, inviter_user_id, inviter_name, status, accepted_person_id, accepted_person_name, accepted_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
