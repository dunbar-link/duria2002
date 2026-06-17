import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeLegacyUserId } from "@/lib/auth/legacy-user-id";

export const runtime = "nodejs";

// 현재 로그인 사용자의 기기 연결 상태를 반환한다.
// - 인증은 서버 세션(auth.getUser)에서만 얻는다. client 가 보낸 userId 는 신뢰하지 않는다.
// - RLS 로 본인(auth.uid()) 행만 조회된다(service_role 미사용).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_identity_links")
    .select("legacy_user_id,status,created_at")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const links = data ?? [];
  return NextResponse.json({
    ok: true,
    email: user.email ?? null,
    linked: links.length > 0,
    links,
  });
}

// 현재 기기의 legacy dl-user-id 를 로그인 계정에 1회 연결한다.
// - auth_user_id 는 반드시 서버 세션 user.id 만 사용한다(body 값 무시).
// - 같은 계정에 같은 legacy 면 idempotent(200). 다른 계정에 연결돼 있으면 409.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const legacyUserId = normalizeLegacyUserId(
    (body as { legacyUserId?: unknown })?.legacyUserId,
  );
  if (!legacyUserId) {
    return NextResponse.json({ ok: false, error: "INVALID_LEGACY_ID" }, { status: 400 });
  }

  const { error: insertError } = await supabase
    .from("user_identity_links")
    .insert({ auth_user_id: user.id, legacy_user_id: legacyUserId });

  if (!insertError) {
    return NextResponse.json({ ok: true, status: "linked" }, { status: 201 });
  }

  // UNIQUE 위반(23505): 내 계정 것이면 idempotent 200, 그 외(다른 계정)면 409.
  if (insertError.code === "23505") {
    const { data: mine } = await supabase
      .from("user_identity_links")
      .select("legacy_user_id")
      .eq("legacy_user_id", legacyUserId)
      .maybeSingle();

    if (mine) {
      return NextResponse.json({ ok: true, status: "already_linked" }, { status: 200 });
    }
    return NextResponse.json(
      { ok: false, error: "LINKED_TO_OTHER_ACCOUNT" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
}
