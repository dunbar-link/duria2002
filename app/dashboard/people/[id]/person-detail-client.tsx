"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { sendSignal } from "@/lib/signal/send-signal";
import {
  readSignalsBetweenUsers,
  type SignalRecord,
} from "@/lib/signal/read-signals";
import {
  isIncompleteMeName,
  ME_NAME_REQUIRED_MESSAGE,
  readMeProfileImageUrl,
  readMeProfileName,
} from "@/lib/me/profile-name";
import SignalBottomSheet, {
  type SignalRecipient,
} from "../../_components/home/signal-bottom-sheet";
import TwoSecondRoom from "../../_components/people/two-second-room";
import { type VoiceSendPayload } from "../../_components/home/voice-signal-preview";
import {
  DashboardPerson,
  getDashboardTierLabel,
  getPersonDisplayName,
  getPersonDisplayPhoto,
} from "../data";
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

// P2-5c: tier 색상(People getSimpleTierStyle 과 동일 매핑). 가족 보라 / 핵심 빨강
// / 신뢰 파랑 / 친밀 주황 / 친근 초록. live tier 로 칩·아바타 색을 렌더한다.
function getDetailTierColor(tier: number | null | undefined) {
  const t = typeof tier === "number" ? tier : 150;
  if (t <= 1) return { bg: "#EFE7FA", text: "#4B2E83", border: "#CDB7EE" };
  if (t <= 5) return { bg: "#FAE0D8", text: "#A74726", border: "#F2A892" };
  if (t <= 15) return { bg: "#E0EFFD", text: "#1467B3", border: "#9FCCF7" };
  if (t <= 50) return { bg: "#FCE8C9", text: "#936018", border: "#F7B95C" };
  return { bg: "#DDF7EE", text: "#0B7A5D", border: "#8EE5CA" };
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
    <div className="rounded-[14px] bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm leading-5 text-slate-700">{value}</p>
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
  const updatePersonAlias = usePeopleStore((state) => state.updatePersonAlias);
  // P2-5b: 상세 표시는 route prop(과거 snapshot)이 아니라 live people store 를
  // 우선한다. tier 변경(드래그/이동)이 상세에도 즉시 반영되도록 한다.
  const storePeople = usePeopleStore((state) => state.people);
  const livePerson = useMemo(
    () => storePeople.find((p) => p.id === person.id) ?? null,
    [storePeople, person.id],
  );
  // 표시용 person: prop 위에 live store 필드를 덮어 최신 tier/이름/사진을 쓴다
  // (prop-only 필드는 보존). 식별/초대 로직은 기존 person 을 그대로 쓴다.
  const displayPerson = useMemo<DashboardPerson>(
    () => (livePerson ? { ...person, ...livePerson } : person),
    [livePerson, person],
  );
  // tier 칩은 People 과 동일하게 live tier 숫자에서 라벨을 도출한다(stale roleLabel
  // 대신). PID 기준 연결 판정은 신호 후보에 사용.
  const effectiveTier =
    typeof displayPerson.tier === "number" ? displayPerson.tier : person.tier;
  const tierColor = getDetailTierColor(effectiveTier);
  const connectedSignalPool = useMemo<SignalRecipient[]>(() => {
    const pick = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : "";
    const out: SignalRecipient[] = [];
    const seen = new Set<string>();
    for (const p of storePeople) {
      const rec = p as Record<string, unknown>;
      const receiverId =
        pick(rec.userId) || pick(rec.dlUserId) || pick(rec.acceptedPersonId);
      if (!receiverId || receiverId === "me" || seen.has(receiverId)) continue;
      seen.add(receiverId);
      out.push({ receiverId, personId: p.id, name: getPersonDisplayName(p) });
    }
    return out;
  }, [storePeople]);

  const [note, setNote] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [savedMessageTone, setSavedMessageTone] =
    useState<QuickActionFeedbackTone>("success");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  // 사람 상세 "최근 신호"(읽기 전용): 나 ↔ 이 상대의 최신 5건.
  // null = 아직 조회 전(불러오는 중), [] = 조회됐고 기록 없음, [...] = 기록.
  const [currentUserId, setCurrentUserId] = useState("");
  const [recentSignals, setRecentSignals] = useState<SignalRecord[] | null>(null);
  // 친구 표시 이름(별명) 편집 입력값. person.localAlias 와 동기화한다.
  const [aliasDraft, setAliasDraft] = useState(person.localAlias ?? "");

  useEffect(() => {
    setAliasDraft(person.localAlias ?? "");
  }, [person.id, person.localAlias]);

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

  const receiverUserId = useMemo(() => {
    const personRecord = person as DashboardPerson & Record<string, unknown>;

    return (
      (typeof personRecord.userId === "string" ? personRecord.userId : "") ||
      (typeof personRecord.dlUserId === "string" ? personRecord.dlUserId : "") ||
      (typeof personRecord.acceptedPersonId === "string"
        ? personRecord.acceptedPersonId
        : "") ||
      latestInviteDraft?.acceptedPersonId ||
      ""
    );
  }, [person, latestInviteDraft]);

  // P2-5b: 상세 신호 기본 받는 사람 = 이 사람 1명(연결됐을 때). + 사람 추가 후보는
  // 연결 풀에서, 이미 선택된 사람은 시트가 자동 제외.
  const detailSignalRecipients = useMemo<SignalRecipient[]>(
    () =>
      receiverUserId
        ? [
            {
              receiverId: receiverUserId,
              personId: person.id,
              name: getPersonDisplayName(displayPerson),
            },
          ]
        : [],
    [receiverUserId, person.id, displayPerson],
  );

  const detailPersonIdByReceiver = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of connectedSignalPool) map.set(r.receiverId, r.personId);
    if (receiverUserId) map.set(receiverUserId, person.id);
    return map;
  }, [connectedSignalPool, receiverUserId, person.id]);

  // 진입/상대 변경 시 나 ↔ 이 상대의 최근 신호 5건을 pair query 로 1회 조회한다.
  // 상대 user id 가 없으면(연결 전/생성 상태) 서버 요청하지 않고 빈 기록으로 둔다.
  // 전체 신호를 받아 클라에서 거르지 않는다(많아도 누락 없음).
  useEffect(() => {
    const me = getCurrentUserId();
    setCurrentUserId(me);

    if (!me || me === "me" || !receiverUserId) {
      setRecentSignals([]);
      return;
    }

    let cancelled = false;
    setRecentSignals(null);

    void readSignalsBetweenUsers(me, receiverUserId, 5).then((rows) => {
      if (cancelled) return;
      setRecentSignals(rows);
    });

    return () => {
      cancelled = true;
    };
  }, [receiverUserId]);

  const isJoined = useMemo(() => {
    const personRecord = person as DashboardPerson & Record<string, unknown>;

    return (
      personRecord.isJoined === true ||
      personRecord.joined === true ||
      personRecord.status === "joined" ||
      personRecord.connectionStatus === "joined" ||
      Boolean(receiverUserId) ||
      latestInviteDraft?.status === "accepted"
    );
  }, [person, receiverUserId, latestInviteDraft]);

  async function syncInviteDraftToRemote(inviteDraft: InviteDraft) {
    const existingRes = await fetch(`/api/invites/${encodeURIComponent(inviteDraft.token)}`);

    if (!existingRes.ok && existingRes.status !== 404) {
      throw new Error(`invite fetch error: ${existingRes.status}`);
    }

    if (existingRes.ok) {
      const existing = (await existingRes.json()) as RemoteInviteRow;
      syncInviteDraftsFromRemote([
        mapRemoteInviteRow(existing, inviteDraft.sourcePersonId),
      ]);
      return;
    }

    const upsertRes = await fetch("/api/invites/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: inviteDraft.token,
        invitePath: inviteDraft.invitePath,
        inviteeName: inviteDraft.inviteeName,
        inviteePhone: person.phone || null,
        sourcePersonId: inviteDraft.sourcePersonId,
        tier: inviteDraft.tier,
        relationshipType: inviteDraft.relationshipType,
        relationshipLabel: inviteDraft.relationshipLabel,
        inviterNote: inviteDraft.inviterNote,
        inviterUserId: inviteDraft.inviterUserId,
        inviterName: inviteDraft.inviterName,
        // 초대 생성 snapshot: 현재 내(inviter) Me 프로필 사진 URL.
        inviterPhotoUrl: readMeProfileImageUrl(),
        status: "pending",
        createdAt: inviteDraft.createdAt,
      }),
    });

    const upsertData = (await upsertRes
      .json()
      .catch(() => null)) as
      | {
          ok?: boolean;
          message?: string;
        }
      | null;

    if (!upsertRes.ok || upsertData?.ok !== true) {
      throw new Error(upsertData?.message ?? "invite upsert error");
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

  // 친구 표시 이름(별명)을 저장한다. 비우면 상대 프로필 이름으로 되돌아간다.
  // person 은 store 에서 파생되므로 저장 즉시 헤더/People/Home/Signals 에 반영된다.
  function handleSaveAlias() {
    updatePersonAlias(person.id, aliasDraft);
    setSavedMessageTone("success");
    setSavedMessage(
      aliasDraft.trim()
        ? "표시 이름을 저장했어요."
        : "표시 이름을 원래대로 되돌렸어요.",
    );
  }

  // P4-PIVOT: 2초 신호방 — 이 사람 1명에게 음성 신호 전송(P4-1B route 재사용).
  // receiverId 는 상세 대상 고정. 서버가 세션 인증/연결 검증을 다시 한다.
  async function handleSendVoiceSignal(
    payload: VoiceSendPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isJoined || !receiverUserId) {
      return { ok: false, error: "연결된 친구에게만 보낼 수 있어요." };
    }
    if (isIncompleteMeName(readMeProfileName())) {
      return { ok: false, error: ME_NAME_REQUIRED_MESSAGE };
    }

    const form = new FormData();
    form.append(
      "audio",
      new File([payload.blob], "voice-signal", { type: payload.mime }),
    );
    form.append("receiverId", receiverUserId);
    form.append("durationMs", String(payload.durationMs));

    try {
      const res = await fetch("/api/signals/voice", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.ok) {
        if (res.status === 401) {
          return { ok: false, error: "로그인 후 보낼 수 있어요." };
        }
        if (res.status === 403) {
          return { ok: false, error: "연결된 친구에게만 보낼 수 있어요." };
        }
        return { ok: false, error: "전송에 실패했어요. 잠시 후 다시 시도해줘요." };
      }

      markContacted(person.id);
      setRelationshipCompleted(person.id);
      setSavedMessageTone("success");
      setSavedMessage("2초 음성 신호를 보냈어요.");
      setRefreshKey((value) => value + 1);
      // 방금 보낸 음성을 신호방 기록에 즉시 반영.
      void readSignalsBetweenUsers(getCurrentUserId(), receiverUserId, 5).then(
        (rows) => setRecentSignals(rows),
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "네트워크 문제로 전송하지 못했어요." };
    }
  }

  // 이모지 신호(보조): 기존 시트/전송 흐름 그대로, 진입 게이트만 공유.
  function handleOpenEmojiSheet() {
    if (!isJoined || !receiverUserId) {
      setSavedMessageTone("neutral");
      setSavedMessage("가입 완료 후 신호를 보낼 수 있어요.");
      return;
    }
    if (isIncompleteMeName(readMeProfileName())) {
      setSavedMessageTone("neutral");
      setSavedMessage(ME_NAME_REQUIRED_MESSAGE);
      return;
    }
    setSignalOpen(true);
  }

  // 🎥 2초 영상: P4-2 전까지 준비중 안내만(실구현 금지).
  function handleVideoNotice() {
    setSavedMessageTone("neutral");
    setSavedMessage("2초 영상 신호는 다음 단계에서 열려요.");
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
    // me 이름이 미완성("나"/빈 값)이면 초대 draft 생성·원격 저장·공유를 막는다.
    if (isIncompleteMeName(readMeProfileName())) {
      setSavedMessageTone("neutral");
      setSavedMessage(ME_NAME_REQUIRED_MESSAGE);
      return;
    }

    const { inviteDraft, inviteUrl, shareTitle, shareText } =
      buildInviteSharePayload();
    const fullText = `${shareTitle}\n${shareText}`;

    // 모바일 Web Share 는 user-gesture tick 안에서 호출돼야 한다(특히 iOS Safari).
    // 원격 저장(syncInviteDraftToRemote)을 await 로 먼저 기다리면 gesture 가
    // 소실되어 navigator.share 가 막히고 clipboard fallback 만 탔다.
    // 해결: 저장은 await 없이 "시작"만 하고, navigator.share 를 첫 await 이전에
    // 호출해 gesture 를 보존한다. 저장 결과(reject 포함)는 share 이후 회수한다.
    // app/dashboard/page.tsx 의 handleSendInviteForPerson 과 동일 원칙.
    const saveResult = syncInviteDraftToRemote(inviteDraft).then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, err }),
    );

    const canShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function";

    let shareOutcome: "shared" | "aborted" | "none" = "none";

    if (canShare) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
        });
        shareOutcome = "shared";
      } catch (err) {
        const name = (err as { name?: string } | undefined)?.name;
        if (name === "AbortError") {
          // 사용자가 공유창을 닫음 → 복사 완료로 오인시키지 않는다.
          shareOutcome = "aborted";
        } else {
          console.warn("[invite] navigator.share 실패, 링크 복사로 대체:", err);
          shareOutcome = "none";
        }
      }
    }

    const saved = await saveResult;

    if (!saved.ok) {
      setSavedMessageTone("neutral");
      setSavedMessage("초대에 실패했어요.");
      return;
    }

    if (shareOutcome === "shared") {
      setSavedMessageTone("success");
      setSavedMessage("공유 창을 열었어요.");
      return;
    }

    if (shareOutcome === "aborted") {
      setSavedMessageTone("neutral");
      setSavedMessage("공유를 취소했어요.");
      return;
    }

    // Web Share 미지원/비-secure context → 링크 복사 fallback.
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(fullText);
        setSavedMessageTone("success");
        setSavedMessage("링크를 복사했어요. 카톡에 붙여넣어 보내세요.");
        return;
      } catch {
        // clipboard 도 실패하면 아래 안내로 떨어진다.
      }
    }

    setSavedMessageTone("neutral");
    setSavedMessage("공유를 지원하지 않는 환경이에요.");
  }

  async function handleCopyInviteLink() {
    // me 이름이 미완성이면 초대 draft 생성·원격 저장·링크 복사를 막는다.
    if (isIncompleteMeName(readMeProfileName())) {
      setSavedMessageTone("neutral");
      setSavedMessage(ME_NAME_REQUIRED_MESSAGE);
      return;
    }

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
      const res = await fetch(`/api/invites/${encodeURIComponent(latestInviteDraft.token)}`);

      if (!res.ok) {
        setSavedMessageTone("neutral");
        setSavedMessage("아직 가입 전이에요.");
        return;
      }

      const data = (await res.json()) as RemoteInviteRow;
      const remoteDraft = mapRemoteInviteRow(
        data,
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
    <>
      <main className="hide-scrollbar flex h-full min-h-0 flex-col overflow-y-auto bg-[#F5F3EE] pb-[112px] text-[#0F172A] [overscroll-behavior-y:contain] [scrollbar-width:none]">
        <div className="sticky top-0 z-20 border-b border-[#D3D1C7] bg-[#FAFAF8] px-5 pb-3 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[#334155] ring-1 ring-[#D3D1C7] active:scale-95"
            >
              뒤로
            </button>

            <Link href="/dashboard" className="text-sm font-semibold text-[#334155]">
              홈
            </Link>
          </div>

          <div className="mt-3.5 flex items-center gap-3">
            <div
              className="relative flex h-[50px] w-[50px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] border-[2.5px] text-[18px] font-bold"
              style={{
                borderColor: tierColor.border,
                background: tierColor.bg,
                color: tierColor.text,
              }}
            >
              {getPersonDisplayName(displayPerson).slice(0, 2) || "?"}
              {getPersonDisplayPhoto(displayPerson) ? (
                <img
                  src={getPersonDisplayPhoto(displayPerson)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {/* 헤더 큰 이름 = 표시 이름(localAlias > remoteProfileName > name) */}
                <h1 className="truncate text-[23px] font-bold tracking-[-0.04em]">
                  {getPersonDisplayName(displayPerson)}
                </h1>
                {isJoined ? <span className="h-2 w-2 rounded-full bg-[#079863]" /> : null}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                  style={{ background: tierColor.bg, color: tierColor.text }}
                >
                  {getDashboardTierLabel(effectiveTier) || person.roleLabel || inviteStatusMeta.badge}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${inviteStatusMeta.badgeClass}`}>
                  {isJoined ? "가입 완료" : inviteStatusMeta.badge}
                </span>
              </div>
            </div>
          </div>

          {savedMessage ? (
            <div className={`mt-3 rounded-2xl px-4 py-3 text-sm font-semibold ${feedbackClass(savedMessageTone)}`}>
              {savedMessage}
            </div>
          ) : null}
        </div>

        {/* P2-6B-2: 가입 안내는 헤더의 가입 칩과 중복이라 한 줄 스트립으로 압축
            (상태 + 신호 가능 여부를 한 문장으로). 정보는 유지, 카드 높이만 축소. */}
        {/* P4-PIVOT: 상세페이지 = 2초 신호방. 짧은 정체성 한 줄 + 신호방이 메인. */}
        <section className="px-4 pt-3">
          <p className="rounded-[16px] bg-[#FAFAF8] px-4 py-2.5 text-[13px] leading-5 shadow-sm ring-1 ring-[#D3D1C7]">
            <span className="font-semibold text-[#079863]">
              2초 신호를 보내는 사람
            </span>
            <span className="text-[#64748B]">
              {" · "}
              {isJoined
                ? "길게 말하지 않아도 관계는 이어져요."
                : "가입 완료 후 2초 신호가 열려요."}
            </span>
          </p>
        </section>

        <section className="mt-2.5 px-4">
          <TwoSecondRoom
            connected={isJoined && Boolean(receiverUserId)}
            currentUserId={currentUserId}
            signals={recentSignals}
            onSendVoice={handleSendVoiceSignal}
            onOpenEmoji={handleOpenEmojiSheet}
            onVideoNotice={handleVideoNotice}
          />
        </section>

        {/* 보류는 보조 액션으로 축소(신호방 아래 슬림 버튼). */}
        <section className="mt-2.5 px-4">
          <button
            type="button"
            onClick={() => handleSnooze(3)}
            className="flex h-[44px] w-full items-center justify-center rounded-[16px] bg-white text-[14px] font-semibold text-[#334155] ring-1 ring-[#D3D1C7] active:scale-95"
          >
            3일 보류하기
          </button>
          {remainingSnoozeDays > 0 ? (
            <p className="mt-2 text-center text-[12px] font-semibold text-[#936018]">
              현재 {remainingSnoozeDays}일 보류 중
            </p>
          ) : null}
        </section>

        <section className="mt-2.5 px-4">
          <div className="rounded-[22px] bg-[#FAFAF8] px-4 py-3.5 shadow-sm ring-1 ring-[#D3D1C7]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold">표시 이름</h2>
              {person.remoteProfileName &&
              person.remoteProfileName.trim() &&
              person.remoteProfileName.trim() !== getPersonDisplayName(person) ? (
                <span className="shrink-0 text-[12px] font-medium text-[#8D99AE]">
                  상대 프로필: {person.remoteProfileName.trim()}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-[#64748B]">
              내 화면에서만 보이는 이름이에요. 비우면 상대가 입력한 이름으로 표시돼요.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                value={aliasDraft}
                onChange={(event) => setAliasDraft(event.target.value)}
                placeholder={person.remoteProfileName?.trim() || person.name || "이름"}
                className="h-[44px] min-w-0 flex-1 rounded-[14px] border border-transparent bg-white px-3 text-[14px] text-[#0F172A] outline-none ring-1 ring-[#D3D1C7] placeholder:text-[#A9A59A] focus:border-[#4B2E83]"
              />
              <button
                type="button"
                onClick={handleSaveAlias}
                className="h-[44px] shrink-0 rounded-[14px] bg-[#079863] px-4 text-[14px] font-bold text-white active:scale-95"
              >
                저장
              </button>
            </div>
          </div>
        </section>

        <section className="mt-2.5 px-4">
          <div className="rounded-[22px] bg-[#FAFAF8] px-4 py-3.5 shadow-sm ring-1 ring-[#D3D1C7]">
            <h2 className="text-[15px] font-bold">기본 정보</h2>
            <div className="mt-2.5 grid gap-1.5">
              {/* 기본정보 이름 = 상대 실제 프로필 이름(remoteProfileName) 우선.
                  내 별명(localAlias)은 여기에 절대 들어가지 않는다. */}
              <CompactInfoRow
                label="이름"
                value={person.remoteProfileName?.trim() || person.name}
              />
              <CompactInfoRow label="관계" value={compactSummary || person.roleLabel} />
              <CompactInfoRow label="연락" value={compactContactSummary} />
              <CompactInfoRow label="전화번호" value={person.phone} />
            </div>
          </div>
        </section>

        <section className="mt-2.5 px-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard/people")}
            className="flex h-[46px] w-full items-center justify-center rounded-[16px] bg-white text-[14px] font-bold text-[#334155] ring-1 ring-[#D3D1C7] active:scale-95"
          >
            친구 목록으로
          </button>
        </section>
      </main>

      <SignalBottomSheet
        open={signalOpen}
        onClose={() => setSignalOpen(false)}
        recipients={detailSignalRecipients}
        candidates={connectedSignalPool}
        onSendSignal={async (emoji, receiverIds) => {
          if (receiverIds.length === 0) {
            setSavedMessageTone("neutral");
            setSavedMessage("받는 사람을 1명 이상 선택해 주세요.");
            return;
          }

          const success = await sendSignal(getCurrentUserId(), receiverIds, emoji);

          if (!success) {
            setSavedMessageTone("neutral");
            setSavedMessage("신호 전송에 실패했어요.");
            return;
          }

          for (const receiverId of receiverIds) {
            const targetPersonId = detailPersonIdByReceiver.get(receiverId);
            if (!targetPersonId) continue;
            markContacted(targetPersonId);
            setRelationshipCompleted(targetPersonId);
          }
          setSavedMessageTone("success");
          setSavedMessage(`신호를 보냈어요. (${receiverIds.length}명)`);
          setSignalOpen(false);
          setRefreshKey((value) => value + 1);

          // 방금 보낸 신호를 "최근 신호"에 즉시 반영(이 상대와의 pair query 재사용).
          if (receiverUserId) {
            void readSignalsBetweenUsers(getCurrentUserId(), receiverUserId, 5).then(
              (rows) => setRecentSignals(rows),
            );
          }

          void fetch("/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              receiverIds,
              title: "새 신호가 도착했어요",
              body: `${emoji} 신호가 왔어요.`,
              url: "/dashboard/signals",
            }),
          });
        }}
      />
    </>
  );
}