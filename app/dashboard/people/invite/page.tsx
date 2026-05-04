"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AddDashboardPersonInput } from "../data";
import { usePeopleStore } from "../store";
import { createClient } from "@/lib/supabase/client";

const tierOptions: Array<{
  value: AddDashboardPersonInput["tier"];
  label: string;
}> = [
  { value: 1, label: "가족" },
  { value: 5, label: "핵심" },
  { value: 15, label: "신뢰" },
  { value: 50, label: "친밀" },
  { value: 150, label: "친근" },
];

type FormState = {
  inviteeName: string;
  inviteePhone: string;
  tier: AddDashboardPersonInput["tier"];
};

const initialForm: FormState = {
  inviteeName: "",
  inviteePhone: "",
  tier: 5,
};

type RemoteInviteStatus = {
  status: "pending" | "accepted";
  acceptedPersonName: string | null;
  acceptedAt: string | null;
};

export default function CreateInvitePage() {
  const searchParams = useSearchParams();
  const createInviteDraft = usePeopleStore((state) => state.createInviteDraft);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);

  const [form, setForm] = useState<FormState>(initialForm);
  const [siteOrigin, setSiteOrigin] = useState("");
  const [feedback, setFeedback] = useState("");
  const [latestToken, setLatestToken] = useState<string | null>(null);
  const [latestInviteeName, setLatestInviteeName] = useState("");
  const [latestInviteePhone, setLatestInviteePhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<RemoteInviteStatus | null>(null);
  const [hasAppliedPrefill, setHasAppliedPrefill] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (hasAppliedPrefill) {
      return;
    }

    const prefillName = searchParams.get("prefillName")?.trim() ?? "";
    const prefillTierRaw = Number(searchParams.get("prefillTier") ?? "");
    const prefillTier = [1, 5, 15, 50, 150].includes(prefillTierRaw)
      ? (prefillTierRaw as FormState["tier"])
      : null;

    if (!prefillName && !prefillTier) {
      setHasAppliedPrefill(true);
      return;
    }

    setForm((prev) => ({
      inviteeName: prefillName || prev.inviteeName,
      inviteePhone: prev.inviteePhone,
      tier: prefillTier ?? prev.tier,
    }));
    setHasAppliedPrefill(true);
  }, [hasAppliedPrefill, searchParams]);

  useEffect(() => {
    if (!latestToken) {
      setRemoteStatus(null);
      return;
    }

    let isMounted = true;

    async function loadInviteStatus() {
      const supabase = createClient();

      const { data } = await supabase
        .from("dl_invites")
        .select("status, accepted_person_name, accepted_at")
        .eq("token", latestToken)
        .maybeSingle();

      if (!isMounted || !data) {
        return;
      }

      setRemoteStatus({
        status: data.status === "accepted" ? "accepted" : "pending",
        acceptedPersonName: data.accepted_person_name ?? null,
        acceptedAt: data.accepted_at ?? null,
      });
    }

    void loadInviteStatus();

    return () => {
      isMounted = false;
    };
  }, [latestToken]);

  const latestInvite = useMemo(() => {
    if (!latestToken) {
      return null;
    }

    return inviteDrafts.find((item) => item.token === latestToken) ?? null;
  }, [inviteDrafts, latestToken]);

  const latestInviteUrl = latestInvite
    ? `${siteOrigin}${latestInvite.invitePath}`
    : "";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function showFeedback(message: string) {
    setFeedback(message);

    window.setTimeout(() => {
      setFeedback("");
    }, 2200);
  }

  function normalizePhone(value: string) {
    return value.replace(/[^0-9+]/g, "");
  }

  function buildShareText() {
    if (!latestInviteUrl) {
      return "";
    }

    const name = latestInviteeName.trim();

    return `${name ? `${name}님,` : "안녕하세요,"}

던바링크 초대 링크를 보내요.
아래 링크에서 본인 정보를 직접 입력해 주세요.

${latestInviteUrl}`;
  }

  async function copyText(text: string, successMessage: string) {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showFeedback(successMessage);
    } catch {
      showFeedback("복사에 실패했어요.");
    }
  }

  function buildSmsHref() {
    const body = encodeURIComponent(buildShareText());
    const phone = normalizePhone(latestInviteePhone);

    if (!body) {
      return "";
    }

    if (!phone) {
      return `sms:?&body=${body}`;
    }

    return `sms:${phone}?&body=${body}`;
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmedName = form.inviteeName.trim();
    const trimmedPhone = form.inviteePhone.trim();

    if (!trimmedName) {
      showFeedback("이름을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const relationshipType =
        searchParams.get("prefillRelationshipType") === "family"
          ? "family"
          : "friend";

      const created = createInviteDraft({
        inviteeName: trimmedName,
        tier: form.tier,
        relationshipType,
        relationshipLabel: "",
        inviterNote: "",
      });

      const supabase = createClient();

      const { error } = await supabase.from("dl_invites").insert({
        token: created.token,
        inviter_user_id: null,
        invitee_name: trimmedName,
        invitee_phone: trimmedPhone || null,
        tier: form.tier,
        relationship_type: relationshipType,
        relationship_label: created.relationshipLabel || "친구",
        inviter_note: null,
        status: "pending",
      });

      setLatestToken(created.token);
      setLatestInviteeName(trimmedName);
      setLatestInviteePhone(trimmedPhone);

      if (error) {
        showFeedback("링크는 만들었지만 서버 저장은 실패했어요.");
        return;
      }

      setRemoteStatus({
        status: "pending",
        acceptedPersonName: null,
        acceptedAt: null,
      });
      showFeedback("초대 링크를 만들었어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-full bg-slate-50 pb-6">
      <div className="mx-auto w-full max-w-md px-4 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/people"
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            뒤로
          </Link>

          <Link
            href="/dashboard/people/add"
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            직접 등록
          </Link>
        </div>

        <section className="mt-4 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">
            INSTALL INVITE
          </p>

          <h1 className="mt-2 text-[26px] font-bold tracking-tight text-slate-900">
            이름 넣고 초대 보내기
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            홈 슬롯에서 넘어온 이름을 그대로 써도 되고,
            <br />
            <span className="font-semibold text-slate-900">이름과 관계 레이어만 먼저</span>
            잡아서 초대를 보낼 수도 있어요.
          </p>

          {feedback ? (
            <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
              {feedback}
            </div>
          ) : null}

          <form onSubmit={handleCreateInvite} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-800">이름</label>
              <input
                value={form.inviteeName}
                onChange={(event) => updateField("inviteeName", event.target.value)}
                placeholder="예: 신희철"
                className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">
                전화번호
              </label>
              <input
                value={form.inviteePhone}
                onChange={(event) => updateField("inviteePhone", event.target.value)}
                placeholder="예: 010-1234-5678"
                inputMode="tel"
                className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">관계 레이어</label>
              <select
                value={form.tier}
                onChange={(event) =>
                  updateField("tier", Number(event.target.value) as FormState["tier"])
                }
                className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-300"
              >
                {tierOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSubmitting ? "생성 중..." : "설치형 초대 링크 생성"}
            </button>
          </form>

          {latestInvite ? (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">
                    RESULT
                  </p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                    설치형 초대 준비 완료
                  </h2>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    remoteStatus?.status === "accepted"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {remoteStatus?.status === "accepted" ? "입력 완료" : "대기 중"}
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Install Invite URL
                </p>
                <p className="mt-2 break-all text-sm leading-6 text-slate-700">
                  {latestInviteUrl || latestInvite.invitePath}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => copyText(latestInviteUrl, "링크를 복사했어요.")}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white"
                >
                  링크 복사
                </button>

                <a
                  href={buildSmsHref()}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  문자 보내기
                </a>

                <Link
                  href={latestInvite.invitePath}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  받은 사람 화면 보기
                </Link>
              </div>

              {remoteStatus?.status === "accepted" ? (
                <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <p className="text-sm font-semibold text-emerald-700">
                    {remoteStatus.acceptedPersonName ?? "상대"}님이 입력을 완료했어요.
                  </p>

                  <p className="mt-1 text-sm text-emerald-700/90">
                    다른 기기 입력도 이제 서버에 저장된다.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}