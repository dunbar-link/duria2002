"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// P4-PIVOT Part B: Me 하단 "계정 · 간편로그인" 아코디언(기본 접힘).
// 목적: (1) 현재 로그인 방식 표시, (2) 테스트용 두 번째 계정 경로 안내.
// 실제 OAuth 버튼 추가는 하지 않는다 — Google/Naver 는 provider/설정이 준비되지
// 않아 "준비중" 표기만 한다(활성 버튼으로 오해되지 않게 chip 형태).
// 카카오/이메일 OTP 로그인은 /login 에 이미 있으므로 여기서 중복 구현하지 않는다.

type LoginState =
  | { phase: "loading" }
  | { phase: "anon" }
  | { phase: "logged_in"; email: string; provider: string };

function providerLabel(provider: string): string {
  if (provider === "kakao") return "카카오";
  if (provider === "email") return "이메일 OTP";
  if (provider === "google") return "Google";
  return provider || "알 수 없음";
}

export default function AccountLoginCard() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoginState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user;
      if (!user) {
        setState({ phase: "anon" });
        return;
      }
      const provider =
        typeof user.app_metadata?.provider === "string"
          ? user.app_metadata.provider
          : "";
      setState({
        phase: "logged_in",
        email: user.email ?? "",
        provider,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-2 rounded-[24px] bg-[#FAFAF8] p-3 shadow-sm ring-1 ring-[#E2E0D8]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-[16px] font-bold text-[#334155]">
          계정 · 간편로그인
        </span>
        <span
          aria-hidden
          className={`text-[16px] leading-none text-[#8D99AE] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>

      {open ? (
        <div className="mt-3">
          <div className="rounded-[16px] bg-white px-3 py-2.5 ring-1 ring-[#E7E4DA]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A9A59A]">
              현재 로그인
            </p>
            {state.phase === "loading" ? (
              <p className="mt-1 text-[13px] text-[#8D99AE]">불러오는 중...</p>
            ) : state.phase === "anon" ? (
              <p className="mt-1 text-[13px] text-[#64748B]">로그인 안 됨</p>
            ) : (
              <p className="mt-1 text-[13px] font-semibold text-[#0F172A] [overflow-wrap:anywhere]">
                {providerLabel(state.provider)}
                {state.email ? (
                  <span className="ml-1.5 font-medium text-[#64748B]">
                    {state.email}
                  </span>
                ) : null}
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#FEE500]/60 px-2.5 py-1 text-[11px] font-semibold text-[#3C1E1E]">
              카카오 · 사용 가능
            </span>
            <span className="rounded-full bg-[#E0EFFD] px-2.5 py-1 text-[11px] font-semibold text-[#1467B3]">
              이메일 OTP · 사용 가능
            </span>
            <span className="rounded-full bg-[#F2F0E9] px-2.5 py-1 text-[11px] font-semibold text-[#A9A59A]">
              Google · 준비중
            </span>
            <span className="rounded-full bg-[#F2F0E9] px-2.5 py-1 text-[11px] font-semibold text-[#A9A59A]">
              네이버 · 준비중
            </span>
          </div>

          <p className="mt-2 text-[12px] leading-5 text-[#64748B]">
            테스트용 두 번째 계정이 필요하면{" "}
            <span className="font-semibold text-[#334155]">
              PC 브라우저에서 다른 이메일로 OTP 로그인
            </span>
            하세요. 폰=계정A, PC=계정B로 서로 신호를 주고받을 수 있어요.
          </p>
        </div>
      ) : null}
    </section>
  );
}
