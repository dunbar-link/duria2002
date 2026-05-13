import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

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
