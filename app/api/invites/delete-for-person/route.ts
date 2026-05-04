import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DeleteInviteRequestBody = {
  tokens?: string[];
  personId?: string;
  personName?: string;
};

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase 환경 변수가 없습니다.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as DeleteInviteRequestBody;
    const tokens = Array.from(
      new Set((body.tokens ?? []).map((token) => token.trim()).filter(Boolean)),
    );
    const personId = normalizeText(body.personId);
    const personName = normalizeText(body.personName);

    const supabase = getSupabaseAdminClient();
    let deletedCount = 0;
    const messages: string[] = [];

    if (tokens.length > 0) {
      const { count, error } = await supabase
        .from("dl_invites")
        .delete({ count: "exact" })
        .in("token", tokens);

      if (error) messages.push(error.message);
      else deletedCount += count ?? 0;
    }

    if (personId) {
      const { count, error } = await supabase
        .from("dl_invites")
        .delete({ count: "exact" })
        .eq("accepted_person_id", personId);

      if (error) messages.push(error.message);
      else deletedCount += count ?? 0;
    }

    if (personName) {
      const { count: inviteeNameCount, error: inviteeNameError } = await supabase
        .from("dl_invites")
        .delete({ count: "exact" })
        .eq("invitee_name", personName);

      if (inviteeNameError) messages.push(inviteeNameError.message);
      else deletedCount += inviteeNameCount ?? 0;

      const { count: acceptedNameCount, error: acceptedNameError } = await supabase
        .from("dl_invites")
        .delete({ count: "exact" })
        .eq("accepted_person_name", personName);

      if (acceptedNameError) messages.push(acceptedNameError.message);
      else deletedCount += acceptedNameCount ?? 0;
    }

    if (messages.length > 0 && deletedCount === 0) {
      return NextResponse.json({ ok: false, deleted: deletedCount, message: messages[0] });
    }

    return NextResponse.json({ ok: true, deleted: deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server error";
    return NextResponse.json({ ok: false, deleted: 0, message }, { status: 500 });
  }
}
