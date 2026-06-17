"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { readMeProfileName } from "@/lib/me/profile-name";
import { usePeopleStore } from "@/app/dashboard/people/store";

type Step = "email" | "otp" | "link" | "done";

const SHELL =
  "mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 bg-[#F5F3EE] px-4 pb-24 pt-12 text-[#0F172A]";
const CARD = "rounded-[28px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#D3D1C7]";
const INPUT =
  "mt-2 h-12 w-full rounded-[14px] border border-transparent bg-white px-4 text-[16px] outline-none ring-1 ring-[#D3D1C7] focus:border-[#4B2E83]";
const PRIMARY_BTN =
  "mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50";
const LINK_BTN = "text-[13px] font-semibold text-[#4B2E83] underline";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const people = usePeopleStore((state) => state.people);
  const friendCount = people.length;
  const [meName, setMeName] = useState("");

  // 이미 로그인된 채로 진입(Me 화면의 "이 기기 연결")하면 link 단계부터 시작한다.
  useEffect(() => {
    setMeName(readMeProfileName());
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? "");
        setStep((prev) => (prev === "email" ? "link" : prev));
      }
    });
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

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
        setError("코드를 보내지 못했어요. 잠시 후 다시 시도해 주세요");
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
        setError("코드가 올바르지 않거나 만료됐어요");
        return;
      }
      setStep("link");
    } finally {
      setBusy(false);
    }
  }

  async function linkThisDevice() {
    setBusy(true);
    setError("");
    try {
      const legacyUserId = getCurrentUserId();
      const res = await fetch("/api/account/identity-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legacyUserId }),
      });
      if (res.status === 409) {
        // 이 기기 데이터가 다른 계정에 이미 연결됨 → 자동 로그아웃, 재연결하지 않음.
        const supabase = createClient();
        await supabase.auth.signOut();
        setError("이 기기 데이터는 다른 계정에 이미 연결되어 있어요.");
        setStep("email");
        return;
      }
      if (res.status !== 200 && res.status !== 201) {
        setError("연결에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={SHELL}>
      <h1 className="text-[24px] font-bold tracking-[-0.03em]">이메일로 계정 연결</h1>

      {step === "email" ? (
        <section className={CARD}>
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

      {step === "link" ? (
        <section className={CARD}>
          <h2 className="text-[18px] font-bold">이 기기 데이터를 연결할까요?</h2>
          <p className="mt-2 text-[13px] leading-5 text-[#64748B]">
            이 기기의 기존 정보를 로그인 계정에 연결합니다.
          </p>
          <div className="mt-3 rounded-[16px] bg-white px-4 py-3 ring-1 ring-[#D3D1C7]">
            <p className="text-[13px] text-[#64748B]">
              내 이름:{" "}
              <span className="font-semibold text-[#0F172A]">{meName || "미입력"}</span>
            </p>
            <p className="mt-1 text-[13px] text-[#64748B]">
              로컬 친구 수:{" "}
              <span className="font-semibold text-[#0F172A]">{friendCount}</span>
            </p>
          </div>
          <button type="button" onClick={linkThisDevice} disabled={busy} className={PRIMARY_BTN}>
            이 기기 연결
          </button>
          <button
            type="button"
            onClick={() => setStep("done")}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full border border-[#D3D1C7] bg-white text-sm font-semibold text-[#64748B] active:scale-[0.98]"
          >
            나중에
          </button>
        </section>
      ) : null}

      {step === "done" ? (
        <section className={CARD}>
          <h2 className="text-[18px] font-bold">완료</h2>
          <p className="mt-2 text-[13px] text-[#64748B]">계정이 준비됐어요.</p>
          <a href="/dashboard/me" className={PRIMARY_BTN}>
            내 정보로 이동
          </a>
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
