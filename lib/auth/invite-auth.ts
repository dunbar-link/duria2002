import { createClient } from "@/lib/supabase/server";

export type InviteSession =
  | { ok: true; authUserId: string; legacyIds: string[] }
  | { ok: false; status: 401 };

// 초대 API 공통 인증. 서버 세션(auth.getUser)으로 로그인 여부를 확인하고,
// user_identity_links 로 이 계정에 연결된 legacy dl-user-id 들을 조회한다.
//
// 한 auth 계정에는 여러 기기(legacy)가 연결될 수 있다(스키마상 legacy 는 단위
// unique 지만 auth 당 다중 허용). 그래서 단일이 아니라 legacy 집합을 돌려준다.
// 각 route 는 client 가 보낸 userId 가 이 집합에 포함되는지로만 권한을 판정한다
// (client 가 보낸 userId 자체는 신뢰하지 않는다 — 세션 집합 포함 여부만 신뢰).
// service_role 은 RLS 를 우회하므로 여기서는 anon+세션 client(@supabase/ssr)로만 조회한다.
export async function getInviteSession(): Promise<InviteSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401 };
  }
  const { data: links } = await supabase
    .from("user_identity_links")
    .select("legacy_user_id")
    .eq("auth_user_id", user.id)
    .eq("status", "active");
  const legacyIds = (links ?? [])
    .map((row) => row.legacy_user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return {
    ok: true,
    authUserId: user.id,
    legacyIds,
  };
}
