import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { user_id, event_type, payload = {} } = body;

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 },
      );
    }

    const enrichedPayload = {
      ...payload,
      user_id,
    };

    const sb = getSupabaseAdmin();

    const { error } = await sb.from("dl_events").insert({
      user_id,
      event_type,
      payload: enrichedPayload,
    });

    if (error) {
      console.error("event insert error:", error);

      return NextResponse.json(
        { error: "insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("event api error:", err);

    return NextResponse.json(
      { error: "unexpected error" },
      { status: 500 },
    );
  }
}
