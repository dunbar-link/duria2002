import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

// 안전한 내부 next 경로만 허용. 외부 URL / protocol-relative(//) / javascript: 차단.
function safeNextPath(raw: string | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/dashboard";
}

// 서버에서 세션을 먼저 확인해, 로그인 상태로 /login 에 직접 접근하면
// 로그인 UI 를 렌더하지 않고 즉시 redirect 한다(client flash 차단).
// 단 카카오 콜백 복귀(?oauth=kakao)는 client(LoginForm)에서 자동 기기 연결을
// 마저 처리해야 하므로 그대로 렌더한다.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const oauth = typeof params.oauth === "string" ? params.oauth : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !oauth) {
    const nextRaw = typeof params.next === "string" ? params.next : undefined;
    redirect(safeNextPath(nextRaw));
  }

  return <LoginForm />;
}
