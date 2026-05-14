import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ ok: false });
    }

    const supabase = createAdminClient();

    // 🔥 invite 찾기
    const { data: invite } = await supabase
      .from("dl_invites")
      .select("*")
      .eq("token", token)
      .single();

    if (!invite) {
      return NextResponse.json({ ok: false });
    }

    const userId = crypto.randomUUID();

    // 🔥 수락 처리
    await supabase
      .from("dl_invites")
      .update({
        status: "accepted",
        accepted_user_id: userId,
      })
      .eq("token", token);

    return NextResponse.json({
      ok: true,
      userId,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false });
  }
}