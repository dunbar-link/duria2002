"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AccountState =
  | { phase: "loading" }
  | { phase: "anon" }
  | { phase: "logged_in"; email: string; linked: boolean };

const CARD =
  "mt-2 rounded-[28px] bg-[#FAFAF8] px-3 py-2 shadow-sm ring-1 ring-[#D3D1C7]";
const PRIMARY_BTN =
  "inline-flex h-11 w-auto items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white active:scale-[0.98]";
const SECONDARY_BTN =
  "inline-flex h-11 w-auto items-center justify-center rounded-full border border-[#D3D1C7] bg-white px-5 text-sm font-semibold text-[#64748B] active:scale-[0.98] disabled:opacity-50";

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
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
      setState({ phase: "anon" });
    }
  }

  return (
    <section className={CARD}>
      <h2 className="text-[18px] font-bold">계정</h2>

      {state.phase === "loading" ? (
        <p className="mt-1 text-[12px] font-medium text-[#8D99AE]">불러오는 중…</p>
      ) : state.phase === "anon" ? (
        <div className="mt-2">
          <p className="text-[13px] font-medium text-[#64748B]">이 기기에서만 저장 중</p>
          <a href="/login" className={`mt-2 ${PRIMARY_BTN}`}>
            이메일로 계정 연결
          </a>
        </div>
      ) : (
        <div className="mt-2">
          <p className="truncate text-[14px] font-semibold text-[#0F172A]">
            {state.email}
          </p>
          <p className="mt-1 text-[12px] font-medium text-[#8D99AE]">
            {state.linked ? "이 기기 연결됨" : "계정 로그인됨 · 기기 연결 필요"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!state.linked ? (
              <a href="/login" className={PRIMARY_BTN}>
                이 기기 연결
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className={SECONDARY_BTN}
            >
              로그아웃
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
