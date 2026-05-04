"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/client";
import { usePeopleStore } from "../../dashboard/people/store";

type InviteRow = {
  token: string;
  invite_path?: string | null;
  invitee_name: string | null;
  invitee_phone: string | null;
  tier: number;
  relationship_type: string | null;
  relationship_label: string | null;
  inviter_note: string | null;
  status: string;
  accepted_person_id: string | null;
  accepted_person_name: string | null;
  accepted_at: string | null;
};

type FormState = { name: string; phone: string };

const initialFormState: FormState = { name: "", phone: "" };
const PENDING_INVITE_STORAGE_KEY = "dunbar-link-pending-invite-token";
const LEGACY_PENDING_INVITE_STORAGE_KEY = "dl_invite_token";
const PENDING_INVITE_META_STORAGE_KEY = "dunbar-link-pending-invite-meta";

function getTierLabel(tier: number) {
  if (tier <= 1) return "가족";
  if (tier <= 5) return "핵심";
  if (tier <= 15) return "신뢰";
  if (tier <= 50) return "친밀";
  return "친근";
}

function feedbackClass(tone: "success" | "error" | "neutral") {
  if (tone === "success") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (tone === "error") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

export default function InviteEntryPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";

  const hasHydrated = usePeopleStore((state) => state.hasHydrated);
  const getInviteDraftByToken = usePeopleStore((state) => state.getInviteDraftByToken);
  const acceptInvite = usePeopleStore((state) => state.acceptInvite);

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error" | "neutral">("neutral");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedInviteToken, setSavedInviteToken] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadInvite() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data } = await supabase
        .from("dl_invites")
        .select("token, invite_path, invitee_name, invitee_phone, tier, relationship_type, relationship_label, inviter_note, status, accepted_person_id, accepted_person_name, accepted_at")
        .eq("token", token)
        .maybeSingle();

      if (!isMounted) return;

      setInvite((data as InviteRow | null) ?? null);
      if (data) setForm({ name: "", phone: data.invitee_phone ?? "" });
      setIsLoading(false);
    }

    void loadInvite();
    return () => { isMounted = false; };
  }, [token]);

  useEffect(() => {
    if (!token || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(PENDING_INVITE_STORAGE_KEY, token);
      window.localStorage.setItem(LEGACY_PENDING_INVITE_STORAGE_KEY, token);
      window.localStorage.setItem(
        PENDING_INVITE_META_STORAGE_KEY,
        JSON.stringify({ token, savedAt: new Date().toISOString() }),
      );
      setSavedInviteToken(true);
    } catch {
      setSavedInviteToken(false);
    }
  }, [token]);

  const localInviteExists = useMemo(() => {
    if (!token) return false;
    return Boolean(getInviteDraftByToken(token));
  }, [getInviteDraftByToken, token]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function copyCurrentUrl() {
    if (typeof window === "undefined") return;

    try {
      await navigator.clipboard.writeText(window.location.href);
      setFeedbackTone("success");
      setFeedback("초대 링크를 복사했어요.");
    } catch {
      setFeedbackTone("error");
      setFeedback("링크 복사에 실패했어요.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !invite) return;

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFeedbackTone("error");
      setFeedback("이름을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const acceptedPersonId = getCurrentUserId();
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("dl_invites")
        .update({
          status: "accepted",
          accepted_person_id: acceptedPersonId,
          accepted_person_name: trimmedName,
          accepted_at: now,
        })
        .eq("token", token);

      if (error) {
        setFeedbackTone("error");
        setFeedback("입력 저장에 실패했어요.");
        return;
      }

      if (localInviteExists) {
        acceptInvite({
          token,
          name: trimmedName,
          relationshipDetail: "",
          affiliationPrimary: "",
          affiliationSecondary: "",
          phone: form.phone.trim(),
          kakaoTalkUrl: "",
          whatsappPhone: "",
          telegramUsername: "",
          lineId: "",
          instagramUsername: "",
          messengerUsername: "",
          note: "",
        });
      }

      setInvite((prev) => prev ? {
        ...prev,
        status: "accepted",
        accepted_person_id: acceptedPersonId,
        accepted_person_name: trimmedName,
        accepted_at: now,
      } : prev);

      setFeedbackTone("success");
      setFeedback("입력이 완료되었습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!hasHydrated && isLoading) {
    return <LoadingScreen />;
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!invite) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-md px-4 pt-10">
          <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-500">초대 링크</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">유효한 초대를 찾지 못했어요</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">링크가 없거나 만료되었을 수 있어요.</p>
            <div className="mt-5">
              <Link href="/dashboard/people/invite" className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white">
                초대 만들기 화면으로
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (invite.status === "accepted") {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-md px-4 pt-10">
          <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-500">초대 링크</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">입력이 완료되었습니다</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {invite.accepted_person_name ?? "상대"}님이 등록을 마쳤어요.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <Link href="/dashboard" className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white">
                앱 홈으로 가기
              </Link>
              <Link href="/dashboard/people" className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                People로 가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <div className="mx-auto max-w-md px-4 pt-8">
        <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">INSTALL INVITE</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">던바링크 초대가 도착했어요</h1>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Invite</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">초대 대상: {invite.invitee_name || "이름 없음"}</p>
            <p className="mt-1 text-sm text-slate-600">관계 레이어: {getTierLabel(invite.tier)}</p>
            <p className="mt-1 text-sm text-slate-600">관계명: {invite.relationship_label || "친구"}</p>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-sm font-semibold">지금 이 화면에서 하는 일</p>
            <div className="mt-2 space-y-1 text-sm leading-6 text-slate-200">
              <p>• 초대 토큰을 이 기기에 저장</p>
              <p>• 이후 앱 설치/열기 후 추천인 연결 기반으로 사용</p>
              <p>• 현재 MVP에서는 테스트용 웹 입력도 같이 제공</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
            <p className="text-sm font-semibold text-emerald-700">
              {savedInviteToken ? "추천인 연결용 토큰을 이 기기에 저장했어요." : "토큰 저장은 시도했지만 브라우저 제한이 있을 수 있어요."}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <Link href="/dashboard" className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white">앱 열기</Link>
            <button type="button" onClick={copyCurrentUrl} className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">링크 복사</button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h2 className="text-lg font-bold text-slate-900">테스트용 웹 입력 계속하기</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">최종 목표는 설치 후 온보딩 연결이지만, 지금은 MVP 테스트를 위해 바로 입력도 열어둔다.</p>

            {feedback ? <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${feedbackClass(feedbackTone)}`}>{feedback}</div> : null}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-800">이름</label>
                <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="이름을 입력해 주세요" className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">전화번호 (선택)</label>
                <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="예: 010-1234-5678" inputMode="tel" className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300" />
              </div>
              <button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-2xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-60">
                {isSubmitting ? "저장 중..." : "테스트용 입력 완료"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 pt-10">
        <p className="text-sm font-semibold text-slate-500">불러오는 중...</p>
      </div>
    </main>
  );
}
