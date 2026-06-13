import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 정확한 invite token 기준으로만 dl_invites 를 삭제한다. 이름(invitee_name/
// accepted_person_name)·local person.id 로는 절대 삭제하지 않는다(이름이 같은
// 다른 사람의 초대까지 지워지던 P1 데이터 무결성 위험 차단). token 이 없으면
// 400 으로 거부하는 fail-closed 구조다.
type DeleteInviteRequestBody = {
  tokens?: unknown;
  ownerUserId?: unknown;
};

const MAX_TOKENS = 50;
// PostgREST .or() 필터 인젝션 방지용. owner 식별자는 영문/숫자/`-`/`_` 만 허용.
const SAFE_OWNER_ID = /^[A-Za-z0-9_-]+$/;

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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as DeleteInviteRequestBody;

    const rawTokens = Array.isArray(body.tokens) ? body.tokens : [];
    const tokens = Array.from(
      new Set(
        rawTokens
          .map((token) => (typeof token === "string" ? token.trim() : ""))
          .filter(Boolean),
      ),
    );

    // fail-closed: 정확한 token 이 없으면 어떤 삭제도 하지 않는다.
    if (tokens.length === 0) {
      return NextResponse.json(
        { ok: false, deleted: 0, message: "정확한 초대 토큰이 필요합니다." },
        { status: 400 },
      );
    }

    if (tokens.length > MAX_TOKENS) {
      return NextResponse.json(
        {
          ok: false,
          deleted: 0,
          message: `한 번에 최대 ${MAX_TOKENS}개의 토큰만 삭제할 수 있습니다.`,
        },
        { status: 400 },
      );
    }

    const ownerUserIdRaw =
      typeof body.ownerUserId === "string" ? body.ownerUserId.trim() : "";
    const ownerUserId = SAFE_OWNER_ID.test(ownerUserIdRaw) ? ownerUserIdRaw : "";

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from("dl_invites")
      .delete({ count: "exact" })
      .in("token", tokens);

    // 가능하면 호출자(초대자/수락자) 소유권으로도 한정한다(방어적). 형식이
    // 안전하지 않으면 owner 스코프는 건너뛰되, token exact match 는 유지한다.
    if (ownerUserId) {
      query = query.or(
        `inviter_user_id.eq.${ownerUserId},accepted_person_id.eq.${ownerUserId}`,
      );
    }

    const { count, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, deleted: 0, message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server error";
    return NextResponse.json({ ok: false, deleted: 0, message }, { status: 500 });
  }
}
