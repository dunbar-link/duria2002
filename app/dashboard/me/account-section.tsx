"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AccountState =
  | { phase: "loading" }
  | { phase: "anon" }
  | { phase: "logged_in"; email: string; linked: boolean };

// 프로필 카드 안 이름 아래에 들어가는 compact account row. 별도 카드 wrapper 없음.
const PILL =
  "inline-flex h-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold active:scale-[0.98] disabled:opacity-50";
const STATUS =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

export function AccountSection() {
  const [state, setState] = useState<AccountState>({ phase: "loading" });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      setState({ phase: "anon" });
      return;
    }

    let linked = false;
    try {
      const res = await fetch("/api/account/identity-link", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { linked?: boolean };
        linked = Boolean(json?.linked);
      }
    } catch {
      // 연결 상태 확인 실패 시 미연결로 표시(자동 연결하지 않음).
    }
    setState({ phase: "logged_in", email: user.email ?? "", linked });
  }

  useEffect(() => {
    void refresh();
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    setBusy(true);
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } finally {
      // 로그아웃 후 보호 경로 재접근(뒤로가기 포함)을 차단하기 위해 로그인 화면으로 이동.
      window.location.replace("/login?reason=signed_out");
    }
  }

  if (state.phase === "loading") {
    return <p className="mt-1 text-[12px] font-medium text-[#8D99AE]">불러오는 중…</p>;
  }

  if (state.phase === "anon") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-[#8D99AE]">계정 연결 안 됨</span>
        <a href="/login" className={`${PILL} bg-slate-900 text-white`}>
          로그인
        </a>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[13px] font-medium text-[#0F172A] [overflow-wrap:anywhere]">
        {state.email}
      </span>
      <span
        className={`${STATUS} ${
          state.linked ? "bg-[#E6F4EC] text-[#079863]" : "bg-[#F2F0E9] text-[#8D99AE]"
        }`}
      >
        {state.linked ? "연결됨" : "기기 연결 필요"}
      </span>
      {!state.linked ? (
        <a href="/login" className={`${PILL} bg-slate-900 text-white`}>
          이 기기 연결
        </a>
      ) : null}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        className={`${PILL} border border-[#D3D1C7] bg-white text-[#64748B]`}
      >
        로그아웃
      </button>
    </div>
  );
}
