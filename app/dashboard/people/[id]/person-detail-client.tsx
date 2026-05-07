"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardPerson } from "../data";
import {
  buildActionDraft,
  buildReasonText,
  getCadenceDays,
  getRelationshipStatus,
  RelationshipStatusItem,
  setRelationshipActionStarted,
  setRelationshipCompleted,
  setRelationshipNote,
  setRelationshipSnoozed,
  subscribeRelationshipStatus,
} from "../relationship-status";
import {
  getAvailableChannels,
  getChannelLabel,
  getRecommendedChannels,
  runPersonContactAction,
} from "../contact-actions";
import { InviteDraft, RemoteInviteDraftLike, usePeopleStore } from "../store";

type Props = {
  person: DashboardPerson;
};

type QuickActionFeedbackTone = "success" | "neutral";

type RemoteInviteRow = {
  token: string;
  invitee_name: string | null;
  invitee_phone: string | null;
  tier: number | null;
  relationship_type: string | null;
  relationship_label: string | null;
  inviter_note: string | null;
  status: string | null;
  accepted_person_id: string | null;
  accepted_person_name: string | null;
  accepted_at: string | null;
};

function normalizeInviteTier(tier: number | null | undefined): InviteDraft["tier"] {
  if (tier === 1) return 1;
  if (tier === 5) return 5;
  if (tier === 15) return 15;
  if (tier === 50) return 50;
  return 150;
}

function normalizeInviteRelationshipType(
  value: string | null | undefined,
): InviteDraft["relationshipType"] {
  if (
    value === "friend" ||
    value === "family" ||
    value === "school" ||
    value === "work" ||
    value === "senior_junior" ||
    value === "business" ||
    value === "other"
  ) {
    return value;
  }

  return "friend";
}

function getEmptyStatus(personId: string): RelationshipStatusItem {
  return {
    personId,
    state: "idle",
    lastActionAt: null,
    lastCompletedAt: null,
    snoozedUntil: null,
    lastChannel: null,
    note: "",
  };
}

function getRemainingSnoozeDays(status: RelationshipStatusItem) {
  if (!status.snoozedUntil) return 0;

  const target = new Date(status.snoozedUntil);
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000));
}

function filledButtonClass(active: boolean) {
  return active
    ? "bg-emerald-600 text-white ring-1 ring-emerald-600"
    : "bg-slate-900 text-white ring-1 ring-slate-900";
}

function outlinedButtonClass(active: boolean) {
  return active
    ? "bg-amber-50 text-amber-700 ring-1 ring-amber-300"
    : "bg-white text-slate-900 ring-1 ring-slate-300";
}

function feedbackClass(tone: QuickActionFeedbackTone) {
  if (tone === "success") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function CompactInfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value || !value.trim()) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function buildCompactSummary(person: DashboardPerson) {
  const parts = [
    person.roleLabel,
    person.relationshipDetail,
    person.affiliationPrimary,
    person.affiliationSecondary,
  ].filter((value): value is string => Boolean(value && value.trim()));

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" · ");
}

function buildCompactContactSummary(person: DashboardPerson) {
  const parts: string[] = [];

  if (person.phone?.trim()) parts.push("전화");
  if (person.kakaoTalkUrl?.trim()) parts.push("카카오");
  if (person.whatsappPhone?.trim()) parts.push("WhatsApp");
  if (person.telegramUsername?.trim()) parts.push("Telegram");
  if (person.lineId?.trim()) parts.push("LINE");
  if (person.instagramUsername?.trim()) parts.push("Instagram");
  if (person.messengerUsername?.trim()) parts.push("Messenger");

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" · ");
}

function getInviteStatusMeta(inviteDraft: InviteDraft | null) {
  if (!inviteDraft) {
    return {
      badge: "초대 전",
      badgeClass: "bg-slate-100 text-slate-600",
      title: "아직 초대 전",
      body: "링크를 만들고 바로 보낼 수 있어요.",
    };
  }

  if (inviteDraft.status === "accepted") {
    return {
      badge: "가입 완료",
      badgeClass: "bg-emerald-100 text-emerald-700",
      title: "가입 완료",
      body: inviteDraft.acceptedPersonName
        ? `${inviteDraft.acceptedPersonName}님 입력 완료`
        : "입력이 완료되었어요.",
    };
  }

  return {
    badge: "대기 중",
    badgeClass: "bg-amber-100 text-amber-700",
    title: "설치 대기 중",
    body: "같은 링크를 다시 보낼 수 있어요.",
  };
}

function mapRemoteInviteRow(
  row: RemoteInviteRow,
  sourcePersonId: string | null,
): RemoteInviteDraftLike {
  return {
    token: row.token,
    createdAt: row.accepted_at ?? new Date().toISOString(),
    invitePath: `/invite/${row.token}`,
    inviteeName: row.invitee_name ?? "",
    sourcePersonId,
    tier: normalizeInviteTier(row.tier),
    relationshipType: normalizeInviteRelationshipType(row.relationship_type),
    relationshipLabel: row.relationship_label ?? "",
    inviterNote: row.inviter_note ?? "",
    status: row.status === "accepted" ? "accepted" : "pending",
    acceptedAt: row.accepted_at,
    acceptedPersonId: row.accepted_person_id,
    acceptedPersonName: row.accepted_person_name,
  };
}

export default function PersonDetailClient({ person }: Props) {
  const router = useRouter();
  const markContacted = usePeopleStore((state) => state.markContacted);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const createInviteDraft = usePeopleStore((state) => state.createInviteDraft);
  const syncInviteDraftsFromRemote = usePeopleStore(
    (state) => state.syncInviteDraftsFromRemote,
  );

  const [note, setNote] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [savedMessageTone, setSavedMessageTone] =
    useState<QuickActionFeedbackTone>("success");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);

    const current = getRelationshipStatus(person.id);
    setNote(current.note ?? "");

    return subscribeRelationshipStatus(() => {
      const next = getRelationshipStatus(person.id);
      setNote(next.note ?? "");
      setRefreshKey((value) => value + 1);
    });
  }, [person.id]);

  useEffect(() => {
    if (!savedMessage) return;

    const timer = window.setTimeout(() => {
      setSavedMessage("");
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  const status = useMemo(() => {
    if (!isHydrated) {
      return getEmptyStatus(person.id);
    }

    return getRelationshipStatus(person.id);
  }, [person.id, refreshKey, isHydrated]);

  const reason = useMemo(() => {
    if (!isHydrated) {
      return {
        title: "불러오는 중",
        body: `${person.name}님의 현재 유지 상태를 확인하고 있어요.`,
        urgencyLabel: "여유" as const,
        cadenceDays: getCadenceDays(person),
        daysSinceLastTouch: 0,
      };
    }

    return buildReasonText(person, status);
  }, [person, status, isHydrated]);

  const draft = useMemo(() => {
    if (!isHydrated) {
      return `안녕하세요 ${person.name}님, 오랜만이에요. 문득 생각나서 안부 남겨요.`;
    }

    return buildActionDraft(person, reason.body);
  }, [person, reason.body, isHydrated]);

  const relativeStatusText = useMemo(() => {
    if (!isHydrated) {
      return "불러오는 중";
    }

    if (status.snoozedUntil) {
      const remain = getRemainingSnoozeDays(status);
      if (remain > 0) {
        return `보류 중 · ${remain}일`;
      }
    }

    if (status.lastCompletedAt) {
      return "연락 완료";
    }

    if (status.lastActionAt) {
      return "액션 시작됨";
    }

    return "아직 기록 없음";
  }, [status, isHydrated]);

  const remainingSnoozeDays = useMemo(() => {
    if (!isHydrated) return 0;
    return getRemainingSnoozeDays(status);
  }, [status, isHydrated]);

  const isCompletedActive = status.state === "completed";
  const isSnooze3Active =
    status.state === "snoozed" && remainingSnoozeDays > 0 && remainingSnoozeDays <= 3;
  const isSnooze7Active =
    status.state === "snoozed" && remainingSnoozeDays >= 4 && remainingSnoozeDays <= 7;

  const rankedChannels = useMemo(() => {
    return getRecommendedChannels(person, 4);
  }, [person]);

  const availableChannels = useMemo(() => {
    return getAvailableChannels(person);
  }, [person]);

  const compactSummary = useMemo(() => {
    return buildCompactSummary(person);
  }, [person]);

  const compactContactSummary = useMemo(() => {
    return buildCompactContactSummary(person);
  }, [person]);

  const latestInviteDraft = useMemo(() => {
    const matched = inviteDrafts
      .filter((item) => item.sourcePersonId === person.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return matched[0] ?? null;
  }, [inviteDrafts, person.id]);

  const inviteStatusMeta = useMemo(() => {
    return getInviteStatusMeta(latestInviteDraft);
  }, [latestInviteDraft]);

  async function syncInviteDraftToRemote(inviteDraft: InviteDraft) {
    const supabase = createClient();

    const { data: existing, error: readError } = await supabase
      .from("dl_invites")
      .select(
        "token, invitee_name, invitee_phone, tier, relationship_type, relationship_label, inviter_note, status, accepted_person_id, accepted_person_name, accepted_at",
      )
      .eq("token", inviteDraft.token)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    if (existing) {
      syncInviteDraftsFromRemote([
        mapRemoteInviteRow(existing as RemoteInviteRow, inviteDraft.sourcePersonId),
      ]);
      return;
    }

    const { error: insertError } = await supabase.from("dl_invites").insert({
      token: inviteDraft.token,
      invitee_name: inviteDraft.inviteeName,
      invitee_phone: person.phone ?? "",
      tier: inviteDraft.tier,
      relationship_type: inviteDraft.relationshipType,
      relationship_label: inviteDraft.relationshipLabel,
      inviter_note: inviteDraft.inviterNote,
      status: "pending",
      accepted_person_id: null,
      accepted_person_name: null,
      accepted_at: null,
    });

    if (insertError) {
      throw insertError;
    }
  }

  async function handleQuickAction(channel: string) {
    const result = await runPersonContactAction(
      person,
      channel as Parameters<typeof runPersonContactAction>[1],
      draft,
    );

    if (result.ok) {
      setRelationshipActionStarted(person.id, result.relationshipChannel);
      markContacted(person.id);
      setSavedMessageTone("success");
      setSavedMessage(result.message);
      setRefreshKey((value) => value + 1);
      return;
    }

    setSavedMessageTone("neutral");
    setSavedMessage(result.message);
  }

  function handleDone() {
    setRelationshipCompleted(person.id);
    markContacted(person.id);
    setSavedMessageTone("success");
    setSavedMessage("연락 완료로 저장했어요.");
    setRefreshKey((value) => value + 1);
  }

  function handleSnooze(days: number) {
    setRelationshipSnoozed(person.id, days);
    setSavedMessageTone("success");
    setSavedMessage(`${days}일 뒤로 미뤘어요.`);
    setRefreshKey((value) => value + 1);
  }

  function handleSaveNote() {
    setRelationshipNote(person.id, note);
    setSavedMessageTone("success");
    setSavedMessage("노트를 저장했어요.");
    setRefreshKey((value) => value + 1);
  }

  function ensureInviteDraft() {
    return (
      latestInviteDraft ??
      createInviteDraft({
        sourcePersonId: person.id,
        inviteeName: person.name,
        tier: normalizeInviteTier(person.tier),
        relationshipType: normalizeInviteRelationshipType(person.relationshipType),
        relationshipLabel: person.roleLabel,
      })
    );
  }

  function buildInviteSharePayload() {
    const inviteDraft = ensureInviteDraft();
    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${inviteDraft.invitePath}`
        : inviteDraft.invitePath;
    const shareTitle = "던바링크 초대";
    const shareText = `${person.name}님, 던바링크에 들어와서 자기 정보를 입력해줘.\n${inviteUrl}`;

    return {
      inviteDraft,
      inviteUrl,
      shareTitle,
      shareText,
    };
  }

  async function handleSendInvite() {
  const { inviteDraft, inviteUrl, shareTitle, shareText } =
    buildInviteSharePayload();

  try {
    await syncInviteDraftToRemote(inviteDraft);

    // ✅ 카카오 / 문자 선택 UX
    const fullText = `${shareTitle}\n${shareText}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: inviteUrl,
      });
      setSavedMessageTone("success");
      setSavedMessage("공유 창을 열었어요.");
      return;
    }

    // fallback: 복사
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(fullText);
      setSavedMessageTone("success");
      setSavedMessage("링크를 복사했어요. 카톡에 붙여넣어 보내세요.");
      return;
    }

    setSavedMessageTone("neutral");
    setSavedMessage("공유를 지원하지 않는 환경이에요.");
  } catch {
    setSavedMessageTone("neutral");
    setSavedMessage("초대에 실패했어요.");
  }
}

  async function handleCopyInviteLink() {
    const { inviteDraft, inviteUrl } = buildInviteSharePayload();

    try {
      await syncInviteDraftToRemote(inviteDraft);

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(inviteUrl);
        setSavedMessageTone("success");
        setSavedMessage("링크를 복사했어요.");
        return;
      }

      setSavedMessageTone("neutral");
      setSavedMessage("복사를 지원하지 않는 환경이에요.");
    } catch {
      setSavedMessageTone("neutral");
      setSavedMessage("복사에 실패했어요.");
    }
  }

  async function handleCheckInviteStatus() {
    if (!latestInviteDraft) {
      setSavedMessageTone("neutral");
      setSavedMessage("아직 초대를 보내지 않았어요.");
      return;
    }

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("dl_invites")
        .select(
          "token, invitee_name, invitee_phone, tier, relationship_type, relationship_label, inviter_note, status, accepted_person_id, accepted_person_name, accepted_at",
        )
        .eq("token", latestInviteDraft.token)
        .maybeSingle();

      if (error || !data) {
        setSavedMessageTone("neutral");
        setSavedMessage("아직 가입 전이에요.");
        return;
      }

      const remoteDraft = mapRemoteInviteRow(
        data as RemoteInviteRow,
        latestInviteDraft.sourcePersonId,
      );

      syncInviteDraftsFromRemote([remoteDraft]);

      if (remoteDraft.status === "accepted") {
        setSavedMessageTone("success");
        setSavedMessage("가입 완료 상태예요.");
        return;
      }

      setSavedMessageTone("neutral");
      setSavedMessage("아직 가입 전이에요.");
    } catch {
      setSavedMessageTone("neutral");
      setSavedMessage("상태 확인에 실패했어요.");
    }
  }

  return (
    <main className="hide-scrollbar flex h-full min-h-0 flex-col overflow-y-auto bg-slate-50 pb-[108px] [overscroll-behavior-y:contain] [scrollbar-width:none]">
      <div className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/92 px-5 pb-4 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            뒤로
          </button>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-slate-500"
            >
              홈
            </Link>

            <Link
              href="/dashboard/people"
              className="text-sm font-semibold text-slate-700"
            >
              People
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-500">관계 상세</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900">
            {person.name}
          </h1>
        </div>

        {savedMessage ? (
          <div
            className={`mt-3 rounded-2xl px-4 py-3 text-sm font-semibold ${feedbackClass(
              savedMessageTone,
            )}`}
          >
            {savedMessage}
          </div>
        ) : null}
      </div>

      <section className="px-4 pt-4">
        <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-slate-900">
                  초대 / 가입 상태
                </h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${inviteStatusMeta.badgeClass}`}
                >
                  {inviteStatusMeta.badge}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-800">
                {inviteStatusMeta.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {inviteStatusMeta.body}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                void handleSendInvite();
              }}
              className="h-11 rounded-2xl bg-slate-900 px-3 text-sm font-semibold text-white"
            >
              초대
            </button>

            <button
              type="button"
              onClick={() => {
                void handleCheckInviteStatus();
              }}
              className="h-11 rounded-2xl bg-white px-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-300"
            >
              상태
            </button>

            <button
              type="button"
              onClick={() => {
                void handleCopyInviteLink();
              }}
              className="h-11 rounded-2xl bg-white px-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-300"
            >
              링크
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 px-4">
        <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-slate-900">
                  지금 행동
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {reason.urgencyLabel}
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-slate-800">
                {relativeStatusText}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {reason.body}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {rankedChannels.slice(0, 4).map((channel) => (
              <button
                key={channel.channel}
                type="button"
                onClick={() => handleQuickAction(channel.channel)}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
              >
                {getChannelLabel(channel.channel)}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleDone}
              className={`h-11 rounded-2xl text-sm font-semibold ${filledButtonClass(
                isCompletedActive,
              )}`}
            >
              완료
            </button>

            <button
              type="button"
              onClick={() => handleSnooze(3)}
              className={`h-11 rounded-2xl text-sm font-semibold ${outlinedButtonClass(
                isSnooze3Active,
              )}`}
            >
              3일
            </button>

            <button
              type="button"
              onClick={() => handleSnooze(7)}
              className={`h-11 rounded-2xl text-sm font-semibold ${outlinedButtonClass(
                isSnooze7Active,
              )}`}
            >
              7일
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 px-4">
        <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-[17px] font-semibold text-slate-900">핵심 정보</h2>

          <div className="mt-4 grid gap-2">
            <CompactInfoRow label="요약" value={compactSummary} />
            <CompactInfoRow label="연락 채널" value={compactContactSummary} />
            <CompactInfoRow label="전화번호" value={person.phone} />
          </div>
        </div>
      </section>

      <section className="mt-4 px-4">
        <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-[17px] font-semibold text-slate-900">노트 / 문구</h2>

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="기억할 점을 짧게 남겨둘 수 있어요."
            className="mt-4 min-h-[110px] w-full rounded-2xl border-0 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400"
          />

          <button
            type="button"
            onClick={handleSaveNote}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            노트 저장
          </button>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Draft
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {draft}
            </p>
          </div>

          {availableChannels.length > 0 ? (
            <p className="mt-3 text-[13px] leading-5 text-slate-500">
              사용 가능:{" "}
              {availableChannels.map((item) => getChannelLabel(item.channel)).join(" · ")}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}