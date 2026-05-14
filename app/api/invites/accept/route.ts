import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string;
      acceptedPersonId?: string;
      acceptedPersonName?: string;
      acceptedAt?: string;
    };

    const { token, acceptedPersonId, acceptedPersonName, acceptedAt } = body;

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

    const { error: updateError } = await supabase
      .from("dl_invites")
      .update({
        status: "accepted",
        accepted_person_id: acceptedPersonId,
        accepted_person_name: acceptedPersonName,
        accepted_at: acceptedAt,
      })
      .eq("token", token)
      .eq("status", "pending");

    if (updateError) {
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
