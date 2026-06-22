"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/auth/current-user";
import {
  writeMeProfileNameIfEmpty,
  writeMeProfileImageUrlIfEmpty,
} from "@/lib/me/profile-name";
import { extractKakaoProfile } from "@/lib/auth/kakao-profile";

type Step = "email" | "otp" | "linking";

const SHELL =
  "mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 bg-[#F5F3EE] px-4 pb-24 pt-12 text-[#0F172A]";
const CARD = "rounded-[28px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#D3D1C7]";
const INPUT =
  "mt-2 h-12 w-full rounded-[14px] border border-transparent bg-white px-4 text-[16px] outline-none ring-1 ring-[#D3D1C7] focus:border-[#4B2E83]";
const PRIMARY_BTN =
  "mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50";
const KAKAO_BTN =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] px-5 text-sm font-semibold text-[#191919] active:scale-[0.98] disabled:opacity-50";
const LINK_BTN = "text-[13px] font-semibold text-[#4B2E83] underline";

type AuthErrInfo = { status: number | null; message: string; name: string; code: string };

// Supabase auth error 에서 안전한 필드만 추출한다(원문 전체를 화면에 노출하지 않는다).
function readAuthError(err: unknown): AuthErrInfo {
  const e = (err ?? {}) as Record<string, unknown>;
  return {
    status: typeof e.status === "number" ? e.status : null,
    message: typeof e.message === "string" ? e.message : "",
    name: typeof e.name === "string" ? e.name : "",
    code: typeof e.code === "string" ? e.code : "",
  };
}

// OTP 발송 실패를 status 기준으로 안전 분기한다(사용자에 Supabase 원문 비노출).
function otpRequestErrorMessage(info: AuthErrInfo): string {
  const msg = info.message.toLowerCase();
  if (info.status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return "요청이 많아요. 잠시 후 다시 시도하거나 카카오로 로그인해 주세요.";
  }
  if (info.status !== null && info.status >= 400 && info.status < 500) {
    return "이메일 주소를 확인해 주세요.";
  }
  // 500 이상 또는 status 불명 → 발송 불안정 안내(기존 일반 문구를 대체하는 fallback).
  return "지금 코드 발송이 불안정해요. 카카오로 계속하기를 권장해요.";
}

// development 에서만 상세를 남긴다. 이메일/코드/토큰/세션/쿠키 등 민감정보는 남기지 않는다.
function logAuthErrorDev(scope: string, info: AuthErrInfo): void {
  if (process.env.NODE_ENV === "development") {
    console.error(
      `[auth:${scope}] status=${info.status} name=${info.name} code=${info.code} message=${info.message}`,
    );
  }
}

export function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);

  // 로그인 성공 공통 처리: 카카오 프로필 빈칸 자동 반영 → 자동 기기 연결 → Me 이동.
  // 추가 확인 화면 없이 한 번에 진행한다.
  async function finishLogin() {
    setStep("linking");
    setError("");
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      setStep("email");
      return;
    }

    // 카카오 프로필: 빈 칸에만 반영(기존 이름·사진 보호). 실패해도 연결은 진행.
    try {
      const profile = extractKakaoProfile(user.user_metadata);
      if (profile.nickname) writeMeProfileNameIfEmpty(profile.nickname);
      if (profile.photoUrl) writeMeProfileImageUrlIfEmpty(profile.photoUrl);
    } catch {
      // 프로필 반영 실패는 무시.
    }

    // 자동 기기 연결(기존 identity-link 재사용). auth_user_id 는 서버 세션만 사용.
    // 응답 status 계약에 맞게 분리한다: 200/201 만 Me 이동, 그 외는 이동 금지.
    try {
      const legacyUserId = getCurrentUserId();
      const res = await fetch("/api/account/identity-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legacyUserId }),
      });

      if (res.status === 200 || res.status === 201) {
        // 200 기존 연결(idempotent) / 201 신규 연결 → 안전한 next 또는 /dashboard.
        const nextParam = new URLSearchParams(window.location.search).get("next");
        const target =
          nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
            ? nextParam
            : "/dashboard";
        window.location.href = target;
        return;
      }
      if (res.status === 409) {
        // 다른 계정에 이미 연결된 기기 데이터 → 자동 로그아웃, 이전하지 않음.
        await supabase.auth.signOut();
        setError(
          "이 기기 데이터는 다른 계정에 연결되어 있어요. 기존에 연결한 계정으로 로그인해 주세요.",
        );
        setStep("email");
        return;
      }
      if (res.status === 401) {
        // 세션 만료/무효 → 재로그인 유도.
        await supabase.auth.signOut();
        setError("로그인 정보가 만료됐어요. 다시 로그인해 주세요.");
        setStep("email");
        return;
      }
      if (res.status === 400) {
        // legacy ID/요청 형식 오류 → Me 이동하지 않음.
        setError("이 기기 정보를 연결하지 못했어요.");
        setStep("email");
        return;
      }
      // 500 및 그 외 non-2xx → Me 이동하지 않음.
      setError("계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setStep("email");
      return;
    } catch {
      // fetch/network 예외 → Me 이동하지 않음.
      setError("계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setStep("email");
      return;
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_error")) {
      setError("카카오 로그인을 완료하지 못했어요. 다시 시도해 주세요.");
      window.history.replaceState({}, "", "/login");
    }
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      // 카카오 콜백 복귀 또는 이미 로그인된 채 진입 → 자동 연결 후 Me 이동.
      if (data.user) void finishLogin();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function startKakao() {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      // 원래 가려던 내부 경로(next)를 카카오 왕복 동안 보존한다(예: /invite/<token>).
      const currentNext = new URLSearchParams(window.location.search).get("next");
      const safeCurrentNext =
        currentNext && currentNext.startsWith("/") && !currentNext.startsWith("//")
          ? currentNext
          : "";
      const loginReturn = safeCurrentNext
        ? `/login?oauth=kakao&next=${encodeURIComponent(safeCurrentNext)}`
        : "/login?oauth=kakao";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        loginReturn,
      )}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo },
      });
      if (oauthError) {
        setError("카카오 로그인을 시작하지 못했어요. 다시 시도해 주세요.");
        setBusy(false);
      }
      // 성공 시 카카오로 redirect 됨(페이지 이탈) — busy 유지.
    } catch {
      setError("카카오 로그인을 시작하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  async function requestCode() {
    const target = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
      setError("올바른 이메일을 입력해 주세요");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: target,
        options: { shouldCreateUser: true },
      });
      if (otpError) {
        const info = readAuthError(otpError);
        logAuthErrorDev("otp-request", info);
        setError(otpRequestErrorMessage(info));
        return;
      }
      setStep("otp");
      setResendIn(30);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    const token = code.trim();
    if (!/^\d{8}$/.test(token)) {
      setError("8자리 코드를 확인해 주세요");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });
      if (verifyError) {
        logAuthErrorDev("otp-verify", readAuthError(verifyError));
        setError("코드가 올바르지 않거나 만료됐어요. 다시 확인해 주세요.");
        return;
      }
      // 인증 성공 → 자동 연결 + Me 이동(중간 화면 없음).
      await finishLogin();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={SHELL}>
      <h1 className="text-[24px] font-bold tracking-[-0.03em]">로그인</h1>

      {step === "email" ? (
        <section className={CARD}>
          <button
            type="button"
            onClick={startKakao}
            disabled={busy}
            aria-label="카카오로 계속하기"
            className={KAKAO_BTN}
          >
            <span aria-hidden="true">💬</span>
            카카오로 계속하기
          </button>
          <div className="my-3 flex items-center gap-3 text-[12px] text-[#A9A59A]">
            <span className="h-px flex-1 bg-[#E5E3DB]" />
            또는
            <span className="h-px flex-1 bg-[#E5E3DB]" />
          </div>
          <label className="text-[13px] font-semibold text-[#64748B]">이메일</label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={INPUT}
          />
          <p className="mt-2 text-[12px] leading-5 text-[#8D99AE]">
            이메일로 받은 8자리 코드를 입력해요.
          </p>
          <button type="button" onClick={requestCode} disabled={busy} className={PRIMARY_BTN}>
            로그인 코드 받기
          </button>
        </section>
      ) : null}

      {step === "otp" ? (
        <section className={CARD}>
          <p className="text-[13px] font-medium text-[#64748B]">
            <span className="font-semibold text-[#0F172A]">{email}</span> 으로 보낸 코드
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="8자리 코드"
            className={`${INPUT} tracking-[0.4em]`}
          />
          <button
            type="button"
            onClick={verifyCode}
            disabled={busy || code.trim().length !== 8}
            className={PRIMARY_BTN}
          >
            확인하고 로그인
          </button>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              className={LINK_BTN}
            >
              이메일 다시 입력
            </button>
            <button
              type="button"
              disabled={busy || resendIn > 0}
              onClick={requestCode}
              className={`${LINK_BTN} disabled:no-underline disabled:opacity-50`}
            >
              {resendIn > 0 ? `재전송 ${resendIn}s` : "코드 재전송"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "linking" ? (
        <section className={CARD}>
          <p className="text-[14px] font-medium text-[#0F172A]">계정을 연결하고 있어요.</p>
          <p className="mt-1 text-[12px] text-[#8D99AE]">잠시만 기다려 주세요.</p>
        </section>
      ) : null}

      {error ? (
        <p className="text-center text-[13px] font-medium text-[#D94848]">{error}</p>
      ) : null}

      <div className="mt-2 text-center">
        <a href="/dashboard/me" className={LINK_BTN}>
          앱으로 돌아가기
        </a>
        <p className="mt-2 text-[12px] text-[#A9A59A]">
          로그인하지 않아도 기존 앱을 계속 사용할 수 있어요.
        </p>
      </div>
    </main>
  );
}
