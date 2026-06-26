"use client";

import { useRouter } from "next/navigation";
import { KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import type { ContactChannel, DashboardPerson } from "./data";
import {
  getDashboardTierLabel,
  getPersonDisplayName,
  getPersonDisplayPhoto,
} from "./data";
import { usePeopleStore } from "./store";
import { getCurrentUserId } from "@/lib/auth/current-user";
import {
  buildActionDraft,
  buildReasonText,
  clearRelationshipSnooze,
  formatRelativeStatus,
  getPrimaryRecommendationForPerson,
  getRelationshipStatusFromMap,
  isRelationshipSnoozed,
  readRelationshipStatusMap,
  RelationshipStatusMap,
  resetRelationshipToIdle,
  setRelationshipActionStarted,
  subscribeRelationshipStatus,
} from "./relationship-status";
import {
  getChannelLabel,
  getRecommendedChannels,
  runPersonContactAction,
} from "./contact-actions";

type TierFilter =
  | "all"
  | "family"
  | "tier5"
  | "tier15"
  | "tier50"
  | "tier150";

type NeedFilter = "all" | "need" | "ok" | "later" | "done";

type EnrichedPerson = {
  raw: DashboardPerson & Record<string, unknown>;
  id: string;
  name: string;
  tierValue: number;
  tierLabel: string;
  needBucket: NeedFilter;
  needLabel: string;
  needBadgeClass: string;
  statusText: string;
  reasonText: string;
  metaText: string;
  score: number;
  draft: string;
  ctaLabel: string;
  ctaKind: "contact" | "reactivate" | "reopen";
};

type ActionFeedbackTone = "success" | "neutral";

type RemoteInviteRow = {
  token: string;
  invitee_name: string | null;
  invitee_phone: string | null;
  tier: number;
  relationship_label: string | null;
  status: string;
  source_person_id: string | null;
  accepted_person_id: string | null;
  accepted_person_name: string | null;
  accepted_at: string | null;
  created_at: string | null;
};

function getPersonId(person: DashboardPerson & Record<string, unknown>) {
  const raw = person.id ?? person.pid ?? person.personId ?? person.slug ?? person.name;
  return typeof raw === "string" ? raw : String(raw ?? "");
}

// 사람의 고유 identity 키. dedup(mergedPeopleSource)과 카드 React key 가 같은
// 값을 쓰도록 한 곳에서 계산한다. 이름은 절대 쓰지 않는다(동명이인 분리).
// remote PID(userId/dlUserId/acceptedPersonId) → person.id 순. id 는 항상 존재.
// 서로 다른 PID 가 (구버전 데이터로) 같은 person.id 를 갖더라도 PID 가 우선이라
// React key 가 겹치지 않는다.
function getPersonIdentityKey(p: Record<string, unknown>): string {
  const pick = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : "";
  return (
    pick(p.userId) ||
    pick(p.dlUserId) ||
    pick(p.acceptedPersonId) ||
    pick(p.id)
  );
}

// People 카드 상태 3단계. 판정 우선순위: 연결(remote PID 존재) → 초대(PID 없고
// 현재 초대 대기) → 생성. 이름은 상태 판정에 쓰지 않는다.
type PersonStage = "connected" | "invited" | "created";

function resolvePersonStage(
  p: Record<string, unknown>,
  isPending: boolean,
): PersonStage {
  const hasPid = [p.userId, p.dlUserId, p.acceptedPersonId].some(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  if (hasPid) return "connected";
  if (isPending) return "invited";
  return "created";
}

const STAGE_META: Record<PersonStage, { label: string; chipClass: string }> = {
  connected: { label: "연결", chipClass: "bg-[#DDF7EE] text-[#0B7A5D]" },
  invited: { label: "초대", chipClass: "bg-[#FCE8C9] text-[#936018]" },
  created: { label: "생성", chipClass: "bg-[#ECEAE3] text-[#73706A]" },
};

function getPersonName(person: DashboardPerson & Record<string, unknown>) {
  const raw =
    person.name ?? person.displayName ?? person.fullName ?? person.title ?? "Unknown";
  return typeof raw === "string" ? raw : String(raw);
}

function getTierValue(person: DashboardPerson & Record<string, unknown>) {
  const raw = person.tier ?? person.relationshipTier;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  const label =
    typeof person.tierLabel === "string"
      ? person.tierLabel
      : typeof person.tierName === "string"
        ? person.tierName
        : "";

  const match = label.match(/\d+/);
  return match ? Number(match[0]) : 9999;
}

function getTierLabelByValue(tierValue: number) {
  return getDashboardTierLabel(tierValue);
}

function getMetaText(person: DashboardPerson & Record<string, unknown>) {
  const pieces = [
    typeof person.roleLabel === "string" && person.roleLabel.trim()
      ? person.roleLabel.trim()
      : null,
    typeof person.relationshipDetail === "string" && person.relationshipDetail.trim()
      ? person.relationshipDetail.trim()
      : null,
  ].filter(Boolean) as string[];

  if (pieces.length === 0) {
    return "기본 정보 없음";
  }

  return pieces.join(" · ");
}

function getNeedBucket(status: {
  state?: string | null;
  lastCompletedAt?: string | null;
  snoozedUntil?: string | null;
}) {
  if (status.state === "snoozed" || isRelationshipSnoozed(status as never)) {
    return "later" as const;
  }

  if (status.state === "completed" || status.lastCompletedAt) {
    return "done" as const;
  }

  return "need" as const;
}

function getNeedLabel(bucket: NeedFilter) {
  if (bucket === "need") return "관리 필요";
  if (bucket === "ok") return "안정";
  if (bucket === "later") return "보류";
  if (bucket === "done") return "완료";
  return "전체";
}

function getNeedBadgeClass(bucket: NeedFilter) {
  if (bucket === "need") return "bg-rose-100 text-rose-700";
  if (bucket === "ok") return "bg-emerald-100 text-emerald-700";
  if (bucket === "later") return "bg-slate-200 text-slate-700";
  if (bucket === "done") return "bg-blue-100 text-blue-700";
  return "bg-neutral-100 text-neutral-700";
}

function getTierFilterLabel(filter: TierFilter) {
  if (filter === "all") return "전체";
  if (filter === "family") return "가족";
  if (filter === "tier5") return "핵심";
  if (filter === "tier15") return "신뢰";
  if (filter === "tier50") return "친밀";
  return "친근";
}

function getNeedFilterLabel(filter: NeedFilter) {
  if (filter === "all") return "전체";
  if (filter === "need") return "관리 필요";
  if (filter === "ok") return "안정";
  if (filter === "later") return "보류";
  return "완료";
}

function matchesTierFilter(tierValue: number, filter: TierFilter) {
  if (filter === "all") return true;
  if (filter === "family") return tierValue <= 1;
  if (filter === "tier5") return tierValue > 1 && tierValue <= 5;
  if (filter === "tier15") return tierValue > 5 && tierValue <= 15;
  if (filter === "tier50") return tierValue > 15 && tierValue <= 50;
  return tierValue > 50 && tierValue <= 150;
}

function getNeedActionBucket(
  statusMap: RelationshipStatusMap,
  person: DashboardPerson & Record<string, unknown>,
) {
  const normalizedPerson = {
    id: getPersonId(person),
    name: getPersonName(person),
    tier:
      typeof person.tier === "number"
        ? person.tier
        : typeof person.relationshipTier === "number"
          ? person.relationshipTier
          : null,
    cadenceDays: typeof person.cadenceDays === "number" ? person.cadenceDays : null,
    company: typeof person.company === "string" ? person.company : null,
    school: typeof person.school === "string" ? person.school : null,
    city: typeof person.city === "string" ? person.city : null,
    lastContactAt:
      typeof person.lastContactAt === "string" ? person.lastContactAt : null,
  };

  const recommendation = getPrimaryRecommendationForPerson(normalizedPerson, statusMap);
  const status = getRelationshipStatusFromMap(statusMap, normalizedPerson.id);
  const baseBucket = getNeedBucket(status);

  if (baseBucket === "later" || baseBucket === "done") {
    return baseBucket;
  }

  if (recommendation.urgencyLabel === "여유") {
    return "ok" as const;
  }

  return "need" as const;
}

function getCtaClass(kind: EnrichedPerson["ctaKind"]) {
  if (kind === "contact") {
    return "bg-neutral-900 text-white hover:bg-neutral-800";
  }

  if (kind === "reactivate") {
    return "bg-white text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50";
  }

  return "bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100";
}

// People 목록은 가나다(한국어 로케일) 순으로 정렬한다. 전체/가족/핵심/신뢰/
// 친밀/친근 모든 tier 필터는 이 enrichedPeople 정렬 결과를 필터만 하므로 한 곳을
// 바꾸면 모든 필터에 동일하게 적용된다(필터별로 순서가 흔들리지 않는다).
function comparePeople(a: EnrichedPerson, b: EnrichedPerson) {
  const aName = a.name?.trim() ?? "";
  const bName = b.name?.trim() ?? "";

  // 이름 없는 항목은 항상 뒤로 보낸다.
  const aEmpty = aName.length === 0;
  const bEmpty = bName.length === 0;
  if (aEmpty !== bEmpty) {
    return aEmpty ? 1 : -1;
  }

  const byName = aName.localeCompare(bName, "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
  if (byName !== 0) {
    return byName;
  }

  // 동명이인은 안정적인 tie-breaker(id)로 순서를 고정한다.
  return a.id.localeCompare(b.id);
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-500">{body}</p>
    </div>
  );
}

function feedbackClass(tone: ActionFeedbackTone) {
  if (tone === "success") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function formatAcceptedTime(value: string | null) {
  if (!value) {
    return "방금 등록";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "방금 등록";
  }

  return `${parsed.getMonth() + 1}.${parsed.getDate()} 등록`;
}

function formatPendingTime(value: string | null) {
  if (!value) {
    return "방금 초대";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "방금 초대";
  }

  return `${parsed.getMonth() + 1}.${parsed.getDate()} 초대`;
}

function buildChannelChoices(person: DashboardPerson) {
  const recommended = getRecommendedChannels(person, 4).map((item) => item.channel);
  const merged = [...recommended, "copy" as const];

  return Array.from(new Set(merged));
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildRemoteInvitePerson(row: RemoteInviteRow): DashboardPerson {
  const displayName =
    row.accepted_person_name?.trim() ||
    row.invitee_name?.trim() ||
    "이름 없음";

  return {
    // PID 가 없으면 store sync 가 만드는 사람 id(invite-pending-<token>)와
    // 같은 token 기반 id 로 맞춰, 같은 연결이 store/remote 양쪽에서 서로 다른
    // 카드로 갈라지지 않게 한다.
    id: row.accepted_person_id?.trim() || `invite-pending-${row.token}`,
    name: displayName,
    countryCode: "KR",
    tier: (row.tier as 1 | 5 | 15 | 50 | 150 | 500 | 1500) ?? 50,
    roleLabel: row.relationship_label?.trim() || getDashboardTierLabel(row.tier),
    relationshipType: "friend",
    relationshipDetail: "초대 링크로 등록됨",
    affiliationPrimary: null,
    affiliationSecondary: null,
    lastContactAt: row.accepted_at,
    cadenceDays:
      row.tier <= 1
        ? 3
        : row.tier <= 5
          ? 7
          : row.tier <= 15
            ? 14
            : row.tier <= 50
              ? 30
              : 60,
    phone: row.invitee_phone?.trim() || null,
    preferredChannels: row.invitee_phone?.trim()
      ? ["message", "call", "copy"]
      : ["copy"],
    notes: [],
    focusReason: "초대 링크로 새로 등록된 관계입니다.",
    whatsappPhone: null,
    telegramUsername: null,
    lineId: null,
    kakaoTalkUrl: null,
    instagramUsername: null,
    messengerUsername: null,
  };
}

function getSimpleTierStyle(tierValue: number) {
  if (tierValue <= 1) {
    return { label: "가족", bg: "#EFE7FA", text: "#4B2E83", border: "#CDB7EE" };
  }

  if (tierValue <= 5) {
    return { label: "핵심", bg: "#FAE0D8", text: "#A74726", border: "#F2A892" };
  }

  if (tierValue <= 15) {
    return { label: "신뢰", bg: "#E0EFFD", text: "#1467B3", border: "#9FCCF7" };
  }

  if (tierValue <= 50) {
    return { label: "친밀", bg: "#FCE8C9", text: "#936018", border: "#F7B95C" };
  }

  return { label: "친근", bg: "#DDF7EE", text: "#0B7A5D", border: "#8EE5CA" };
}

function getInitials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 2);
}

function IconDetail() {
  return (
    <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

function IconContact() {
  return (
    <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function DashboardPeoplePage() {
  const router = useRouter();
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);
  const markContacted = usePeopleStore((state) => state.markContacted);
  const removePersonByIdentity = usePeopleStore(
    (state) => state.removePersonByIdentity,
  );
  const resetPeopleState = usePeopleStore((state) => state.resetPeopleState);
  const syncInviteDraftsFromRemote = usePeopleStore(
    (state) => state.syncInviteDraftsFromRemote,
  );
  const syncAcceptedInvitesToPeople = usePeopleStore(
    (state) => state.syncAcceptedInvitesToPeople,
  );

  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [needFilter, setNeedFilter] = useState<NeedFilter>("all");
  const [statusMap, setStatusMap] = useState<RelationshipStatusMap>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionMessageTone, setActionMessageTone] =
    useState<ActionFeedbackTone>("success");
  const [openContactPickerId, setOpenContactPickerId] = useState<string | null>(null);
  const [isChannelSubmitting, setIsChannelSubmitting] = useState(false);
  const [remoteInvites, setRemoteInvites] = useState<RemoteInviteRow[]>([]);

  // 초대 수락 직후 People 로 이동해 오면(?accepted=1) 완료 화면 대신 여기서
  // 짧은 성공 toast 를 띄운다(대장 피드백). URL 쿼리는 즉시 정리해 새로고침/
  // 뒤로가기 시 toast 가 다시 뜨지 않게 한다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("accepted") === "1") {
      setActionMessageTone("success");
      setActionMessage("초대 수락이 완료됐어요.");
      window.history.replaceState(null, "", "/dashboard/people");
    }
  }, []);

  useEffect(() => {
    setIsHydrated(true);

    function syncStatus() {
      try {
        setStatusMap(readRelationshipStatusMap());
      } catch {
        setStatusMap({});
      }
    }

    syncStatus();

    const unsubscribe = subscribeRelationshipStatus(syncStatus);

    function handleFocus() {
      syncStatus();
    }

    function handlePageShow() {
      syncStatus();
    }

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadRemoteInvites() {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        return;
      }

      const res = await fetch(
        `/api/invites/mine?userId=${encodeURIComponent(currentUserId)}&limit=50`,
        {
          cache: "no-store",
        },
      );

      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            invites?: RemoteInviteRow[];
          }
        | null;

      if (!isMounted) {
        return;
      }

      const rows =
        res.ok && payload?.ok === true ? payload.invites ?? [] : [];

      setRemoteInvites(rows);
      syncInviteDraftsFromRemote(rows);
      await syncAcceptedInvitesToPeople();
    }

    void loadRemoteInvites();

    return () => {
      isMounted = false;
    };
  }, [syncInviteDraftsFromRemote, syncAcceptedInvitesToPeople]);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActionMessage("");
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const acceptedInvites = useMemo(() => {
    return [...inviteDrafts]
      .filter((item) => item.status === "accepted" && item.acceptedPersonId)
      .sort((a, b) => {
        const left = a.acceptedAt ? new Date(a.acceptedAt).getTime() : 0;
        const right = b.acceptedAt ? new Date(b.acceptedAt).getTime() : 0;
        return right - left;
      });
  }, [inviteDrafts]);

  const pendingInvites = useMemo(() => {
    return inviteDrafts.filter((item) => item.status === "pending");
  }, [inviteDrafts]);

  const remoteAcceptedInvites = useMemo(() => {
    return remoteInvites.filter((item) => item.status === "accepted");
  }, [remoteInvites]);

  const remotePendingInvites = useMemo(() => {
    return remoteInvites.filter((item) => item.status === "pending");
  }, [remoteInvites]);

  const latestPendingInvite = pendingInvites[0] ?? null;
  const latestRemotePendingInvite = remotePendingInvites[0] ?? null;

  const pendingInviteMapByPersonId = useMemo(() => {
    return pendingInvites.reduce<Record<string, (typeof pendingInvites)[number]>>(
      (acc, item) => {
        acc[item.provisionalPersonId] = item;
        return acc;
      },
      {},
    );
  }, [pendingInvites]);

  // 가입완료/설치대기 분리용 dedupe pending pool.
  // 동일 token 의 local/remote pending 을 한 번만 카운트하고,
  // 사람 카드에 매핑하기 위해 sourcePersonId / provisionalPersonId / inviteeName 으로
  // 색인한다. 기존 pendingInviteMapByPersonId 는 invitePath 등 local 한정 필드 사용을 위해 그대로 둔다.
  type DedupPending = {
    token: string;
    inviteeName: string;
    sourcePersonId: string | null;
    provisionalPersonId: string | null;
  };

  const allPendingInvitesDedup = useMemo<DedupPending[]>(() => {
    const tokens = new Set<string>();
    const dedup: DedupPending[] = [];

    for (const inv of pendingInvites) {
      const token = inv.token?.trim();
      if (!token || tokens.has(token)) continue;
      tokens.add(token);
      dedup.push({
        token,
        inviteeName: inv.inviteeName ?? "",
        sourcePersonId: inv.sourcePersonId ?? null,
        provisionalPersonId: inv.provisionalPersonId ?? null,
      });
    }
    for (const inv of remotePendingInvites) {
      const token = inv.token?.trim();
      if (!token || tokens.has(token)) continue;
      tokens.add(token);
      dedup.push({
        token,
        inviteeName: inv.invitee_name ?? "",
        sourcePersonId: null,
        provisionalPersonId: null,
      });
    }
    return dedup;
  }, [pendingInvites, remotePendingInvites]);

  const pendingPersonIndex = useMemo(() => {
    const byId = new Map<string, DedupPending>();
    const byName = new Map<string, DedupPending>();
    for (const inv of allPendingInvitesDedup) {
      if (inv.provisionalPersonId) byId.set(inv.provisionalPersonId, inv);
      if (inv.sourcePersonId) byId.set(inv.sourcePersonId, inv);
      const n = normalizeName(inv.inviteeName);
      if (n) byName.set(n, inv);
    }
    return { byId, byName };
  }, [allPendingInvitesDedup]);

  function findPendingForPerson(person: { id: string; name: string }) {
    const byId = pendingPersonIndex.byId.get(person.id);
    if (byId) return byId;
    const n = normalizeName(person.name);
    if (n) return pendingPersonIndex.byName.get(n) ?? null;
    return null;
  }

  const mergedPeopleSource = useMemo(() => {
  const map = new Map<string, DashboardPerson>();
  const deviceUserId = getCurrentUserId();

  function getKey(p: any) {
    // dedup 키와 카드 React key 가 동일 helper 를 쓰도록 통일한다(이름 제외).
    return getPersonIdentityKey(p as Record<string, unknown>);
  }

  function isSelfPerson(p: any) {
    if (!deviceUserId) return false;
    const candidates = [p.userId, p.dlUserId, p.acceptedPersonId, p.id];
    return candidates.some(
      (value) =>
        typeof value === "string" && value.trim() === deviceUserId,
    );
  }

  // 1) canonical store people 를 먼저 채운다(Home 과 동일 기준). 동시에 이
  //    사람들이 대표하는 식별자(PID / person.id)를 모은다.
  const storeIds = new Set<string>();
  const storePids = new Set<string>();
  people.forEach((p) => {
    if (isSelfPerson(p)) {
      return;
    }
    map.set(getKey(p), p);
    const ext = p as DashboardPerson & Record<string, unknown>;
    if (typeof p.id === "string" && p.id) {
      storeIds.add(p.id);
    }
    for (const pid of [ext.userId, ext.dlUserId, ext.acceptedPersonId]) {
      if (typeof pid === "string" && pid.trim()) {
        storePids.add(pid.trim());
      }
    }
  });

  // 2) remote accepted invite 는 store 에 아직 없는 연결만 추가한다. 같은
  //    PID / source person / invite token 을 가진 사람이 이미 store 에 있으면
  //    같은 연결이므로 건너뛴다. (이 dedup 이 없으면 store sync 가 만든 카드와
  //    remote row 가 서로 다른 키로 남아 카드가 2배로 보이고, 필터 전환 때마다
  //    증식하는 것처럼 보인다.)
  remoteAcceptedInvites.forEach((item) => {
    const pid = (item.accepted_person_id ?? "").trim();
    if (deviceUserId && pid === deviceUserId) {
      return;
    }
    const src = (item.source_person_id ?? "").trim();
    const tokenId = item.token ? `invite-pending-${item.token}` : "";

    if (pid && storePids.has(pid)) {
      return;
    }
    if (src && storeIds.has(src)) {
      return;
    }
    if (tokenId && storeIds.has(tokenId)) {
      return;
    }

    const p = buildRemoteInvitePerson(item);
    const key = getKey(p);
    if (!map.has(key)) {
      map.set(key, p);
    }
  });

  return Array.from(map.values());
}, [people, remoteAcceptedInvites]);

  const enrichedPeople = useMemo<EnrichedPerson[]>(() => {
    return mergedPeopleSource
      .map((person) => {
        const safePerson = person as DashboardPerson & Record<string, unknown>;
        const id = getPersonId(safePerson);
        // 표시 이름: localAlias > remoteProfileName > person.name (resolver).
        const name = getPersonDisplayName(safePerson);
        const tierValue = getTierValue(safePerson);
        const tierLabel = getTierLabelByValue(tierValue);

        const personShape = {
          id,
          name,
          tier:
            typeof safePerson.tier === "number"
              ? safePerson.tier
              : typeof safePerson.relationshipTier === "number"
                ? safePerson.relationshipTier
                : null,
          cadenceDays:
            typeof safePerson.cadenceDays === "number" ? safePerson.cadenceDays : null,
          company: typeof safePerson.company === "string" ? safePerson.company : null,
          school: typeof safePerson.school === "string" ? safePerson.school : null,
          city: typeof safePerson.city === "string" ? safePerson.city : null,
          lastContactAt:
            typeof safePerson.lastContactAt === "string"
              ? safePerson.lastContactAt
              : null,
        };

        const status = getRelationshipStatusFromMap(statusMap, id);
        const reason = buildReasonText(personShape, status);
        const recommendation = getPrimaryRecommendationForPerson(personShape, statusMap);
        const needBucket = getNeedActionBucket(statusMap, safePerson);
        const statusText = isHydrated ? formatRelativeStatus(id) : "아직 기록 없음";
        const draft = buildActionDraft(personShape, reason.body);

        let ctaKind: EnrichedPerson["ctaKind"] = "contact";
        let ctaLabel = "연락하기";

        if (needBucket === "later") {
          ctaKind = "reactivate";
          ctaLabel = "보류 해제";
        } else if (needBucket === "done") {
          ctaKind = "reopen";
          ctaLabel = "다시 보기";
        }

        return {
          raw: safePerson,
          id,
          name,
          tierValue,
          tierLabel,
          needBucket,
          needLabel: getNeedLabel(needBucket),
          needBadgeClass: getNeedBadgeClass(needBucket),
          statusText,
          reasonText: reason.body,
          metaText: getMetaText(safePerson),
          score: recommendation.score,
          draft,
          ctaLabel,
          ctaKind,
        };
      })
      .sort(comparePeople);
  }, [mergedPeopleSource, statusMap, isHydrated]);

  const filteredPeople = useMemo(() => {
    return enrichedPeople.filter((person) => {
      if (!matchesTierFilter(person.tierValue, tierFilter)) {
        return false;
      }

      if (needFilter !== "all" && person.needBucket !== needFilter) {
        return false;
      }

      return true;
    });
  }, [enrichedPeople, tierFilter, needFilter]);

  const tierCounts = useMemo(() => {
    return {
      all: enrichedPeople.length,
      // 가족 chip 만 Me 를 표시 숫자에 포함(Home 가족 카운트와 일치). 목록 배열에는
      // Me 를 넣지 않고 표시 수에만 +1. 다른 tier 와 "전체(all)" 는 그대로.
      family:
        enrichedPeople.filter((person) =>
          matchesTierFilter(person.tierValue, "family"),
        ).length + 1,
      tier5: enrichedPeople.filter((person) =>
        matchesTierFilter(person.tierValue, "tier5"),
      ).length,
      tier15: enrichedPeople.filter((person) =>
        matchesTierFilter(person.tierValue, "tier15"),
      ).length,
      tier50: enrichedPeople.filter((person) =>
        matchesTierFilter(person.tierValue, "tier50"),
      ).length,
      tier150: enrichedPeople.filter((person) =>
        matchesTierFilter(person.tierValue, "tier150"),
      ).length,
    };
  }, [enrichedPeople]);

  const needCounts = useMemo(() => {
    return {
      all: enrichedPeople.length,
      need: enrichedPeople.filter((person) => person.needBucket === "need").length,
      ok: enrichedPeople.filter((person) => person.needBucket === "ok").length,
      later: enrichedPeople.filter((person) => person.needBucket === "later").length,
      done: enrichedPeople.filter((person) => person.needBucket === "done").length,
    };
  }, [enrichedPeople]);

  function openDetail(personId: string) {
    router.push(`/dashboard/people/${personId}`);
  }

  function handleCardKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    personId: string,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(personId);
    }
  }

  async function handlePrimaryAction(
    event: MouseEvent<HTMLButtonElement>,
    person: EnrichedPerson,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (person.ctaKind === "contact") {
      setOpenContactPickerId((prev) => (prev === person.id ? null : person.id));
      return;
    }

    if (person.ctaKind === "reactivate") {
      clearRelationshipSnooze(person.id);
      setNeedFilter("need");
      setActionMessageTone("success");
      setActionMessage("보류를 해제했어요.");
      return;
    }

    resetRelationshipToIdle(person.id);
    setNeedFilter("need");
    setActionMessageTone("success");
    setActionMessage("다시 확인 대상으로 돌렸어요.");
  }

  async function handleChannelAction(
    event: MouseEvent<HTMLButtonElement>,
    person: EnrichedPerson,
    channel: ContactChannel | "copy",
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (isChannelSubmitting) {
      return;
    }

    setIsChannelSubmitting(true);

    try {
      const target = person.raw as DashboardPerson;
      const result = await runPersonContactAction(target, channel, person.draft);

      if (result.ok) {
        setRelationshipActionStarted(person.id, result.relationshipChannel);
        markContacted(person.id);
        setActionMessageTone("success");
        setActionMessage(result.message);
      } else {
        setActionMessageTone("neutral");
        setActionMessage(result.message);
      }

      setOpenContactPickerId(null);
    } finally {
      setIsChannelSubmitting(false);
    }
  }


  function findRemoteInviteForPerson(person: EnrichedPerson) {
    return remoteInvites.find((row) => {
      const acceptedId = row.accepted_person_id?.trim() ?? "";
      const acceptedName = normalizeName(row.accepted_person_name);
      const inviteeName = normalizeName(row.invitee_name);
      const personName = normalizeName(person.name);

      if (acceptedId && acceptedId === person.id) {
        return true;
      }

      if (acceptedName && acceptedName === personName) {
        return true;
      }

      if (inviteeName && inviteeName === personName) {
        return true;
      }

      return false;
    });
  }

  async function handleDeletePerson(
    event: MouseEvent<HTMLButtonElement>,
    person: EnrichedPerson,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = window.confirm(
      `${person.name}님을 People에서 제거할까요?\n\n이 카드의 정확한 초대(토큰)만 함께 정리합니다. 이름이 같은 다른 사람은 영향받지 않아요.`,
    );

    if (!confirmed) {
      return;
    }

    const raw = person.raw as Record<string, unknown>;
    const identityKey = getPersonIdentityKey(raw);
    // 이 카드의 remote PID(가입 식별자). 이름/local id 는 식별에 쓰지 않는다.
    const pick = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : "";
    const cardPid =
      pick(raw.userId) || pick(raw.dlUserId) || pick(raw.acceptedPersonId);

    // 서버에서 지울 invite 는 "정확한 token" 으로만 찾는다. 이름 비교 금지.
    // 이 카드의 PID 와 정확히 연결된 remote invite row / local draft 의 token 만.
    const tokenSet = new Set<string>();
    if (cardPid) {
      remoteInvites.forEach((row) => {
        if ((row.accepted_person_id ?? "").trim() === cardPid && row.token) {
          tokenSet.add(row.token);
        }
      });
      inviteDrafts.forEach((draft) => {
        if (
          (draft.acceptedPersonId === cardPid ||
            draft.inviterUserId === cardPid) &&
          draft.token
        ) {
          tokenSet.add(draft.token);
        }
      });
    }
    const tokens = Array.from(tokenSet).filter(Boolean);

    // local 카드는 항상 정확히 이 identity 하나만 제거(같은 person.id 의 다른
    // PID, 같은 이름의 다른 사람은 절대 함께 지워지지 않는다).
    removePersonByIdentity(identityKey);
    // remote invite 표시 목록도 정확한 token 기준으로만 정리(이름/ id 금지).
    if (tokens.length > 0) {
      setRemoteInvites((prev) => prev.filter((row) => !tokens.includes(row.token)));
    }
    setOpenContactPickerId(null);

    // exact token 이 없으면 서버 삭제를 호출하지 않는다(이름/PID-만 삭제 금지).
    if (tokens.length === 0) {
      if (cardPid) {
        // 서버 초대행이 남아 다음 sync 에서 다시 보일 수 있으므로 "삭제 완료"로
        // 단정하지 않는다.
        setActionMessageTone("neutral");
        setActionMessage(
          "화면에서 숨겼어요. 정확한 초대 토큰을 찾지 못해 서버 기록은 정리하지 못했고, 새로고침 시 다시 보일 수 있어요.",
        );
      } else {
        setActionMessageTone("success");
        setActionMessage("People에서 제거했어요.");
      }
      return;
    }

    try {
      const response = await fetch("/api/invites/delete-for-person", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokens,
          ownerUserId: getCurrentUserId(),
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; deleted?: number; message?: string }
        | null;

      if (!response.ok || !result?.ok) {
        setActionMessageTone("neutral");
        setActionMessage("화면에서는 제거했어요. 서버 초대 기록은 남아 있을 수 있어요.");
        return;
      }
    } catch {
      setActionMessageTone("neutral");
      setActionMessage("화면에서는 제거했어요. 서버 초대 기록은 남아 있을 수 있어요.");
      return;
    }

    setActionMessageTone("success");
    setActionMessage("People에서 제거했어요.");
  }

  async function handleResetAllPeopleData() {
    const confirmed = window.confirm(
      "People / 홈 / 초대 테스트 데이터를 모두 초기화할까요?\n\n실제 친구 테스트를 새로 시작할 때만 실행해 주세요.",
    );

    if (!confirmed) {
      return;
    }

    resetPeopleState();
    setRemoteInvites([]);
    setOpenContactPickerId(null);

    try {
      window.localStorage.removeItem("dunbar-link-dashboard-people-store");
      window.localStorage.removeItem("dunbar-link-dashboard-people-store-v2-clean");
      window.localStorage.removeItem("dunbar-link-home-layout-v16");
      window.localStorage.removeItem("dunbar-link-home-layout-v16-backup-v1");
      window.localStorage.removeItem("dunbar-link-home-onboarding-dismissed-v1");
    } catch {
      // localStorage를 사용할 수 없는 환경에서는 화면 상태만 초기화합니다.
    }

    try {
      const response = await fetch("/api/invites/clear-all", {
        method: "POST",
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !result?.ok) {
        setActionMessageTone("neutral");
        setActionMessage("로컬 데이터는 초기화했어요. 서버 초대 기록은 남아 있을 수 있어요.");
        window.setTimeout(() => window.location.reload(), 700);
        return;
      }
    } catch {
      setActionMessageTone("neutral");
      setActionMessage("로컬 데이터는 초기화했어요. 서버 초대 기록은 남아 있을 수 있어요.");
      window.setTimeout(() => window.location.reload(), 700);
      return;
    }

    setActionMessageTone("success");
    setActionMessage("People 테스트 데이터를 초기화했어요.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  const tierTabs: TierFilter[] = [
    "all",
    "family",
    "tier5",
    "tier15",
    "tier50",
    "tier150",
  ];

  const needTabs: NeedFilter[] = ["all", "need", "ok", "later", "done"];

  // 설치대기: local + remote pending invite 의 token 으로 dedup 된 실제 invite 수.
  // 가입완료: person.isJoined === true && serverId(userId/dlUserId/acceptedPersonId
  // 중 하나)가 있는 사람만. local-only(Home 빈 슬롯에서 추가만 한 사람)는
  // pending invite 도 없고 serverId 도 없으므로 어디에도 카운트되지 않는다.
  function isAcceptedPerson(p: (typeof enrichedPeople)[number]) {
    const r = p.raw as Record<string, unknown>;
    if (r.isJoined !== true) return false;
    const candidates = [r.userId, r.dlUserId, r.acceptedPersonId];
    return candidates.some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  }

  // People 상태 3단계 분류. enrichedPeople 를 identity 키로 한 번만 분류해
  // partition 을 보장한다(전체 = 생성 + 초대 + 연결, 상호 배타). 초대 판정은
  // 기존 검증된 pending 식별(provisionalPersonId/sourcePersonId 기반 id 색인)만
  // 쓰고 이름은 쓰지 않는다. 새 네트워크 요청 없음.
  const stageByIdentity = useMemo(() => {
    const map = new Map<string, PersonStage>();
    for (const person of enrichedPeople) {
      const isPending = Boolean(
        pendingInviteMapByPersonId[person.id] ||
          pendingPersonIndex.byId.get(person.id),
      );
      map.set(
        getPersonIdentityKey(person.raw as Record<string, unknown>),
        resolvePersonStage(person.raw as Record<string, unknown>, isPending),
      );
    }
    return map;
  }, [enrichedPeople, pendingInviteMapByPersonId, pendingPersonIndex]);

  const stageCounts = useMemo(() => {
    const counts = { created: 0, invited: 0, connected: 0, total: 0 };
    for (const stage of stageByIdentity.values()) {
      counts[stage] += 1;
    }
    counts.total = stageByIdentity.size;
    return counts;
  }, [stageByIdentity]);

  if (!hasHydrated) {
    return (
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F5F3EE]">
        <div className="px-5 pb-6 pt-6">
          <div className="rounded-[24px] bg-[#FAFAF8] p-5 shadow-sm ring-1 ring-[#D3D1C7]">
            <p className="text-[15px] font-semibold text-[#0F172A]">불러오는 중...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F5F3EE] text-[#0F172A]">
      <div className="sticky top-0 z-20 border-b border-[#D3D1C7] bg-[#FAFAF8] px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8D99AE]">
              PEOPLE
            </p>
            <h1 className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-[#0F172A]">
              친구들
            </h1>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {/*
              전체 초기화는 개발/테스트 전용. 일반 사용자가 실수로 전체
              데이터를 날리지 않도록 production 에서는 렌더하지 않는다.
              (홈 단축키는 하단 네비 Home 탭과 완전 중복이라 제거)
            */}
            {process.env.NODE_ENV === "development" ? (
              <button
                type="button"
                onClick={handleResetAllPeopleData}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#FBEAF0] text-[17px] text-[#993556] ring-1 ring-[#F4C0D1] active:scale-95"
                aria-label="전체 초기화"
              >
                ↺
              </button>
            ) : null}
          </div>
        </div>

        {actionMessage ? (
          <div
            className={`mt-3 rounded-[18px] px-4 py-3 text-[13px] font-semibold ${feedbackClass(
              actionMessageTone,
            )}`}
          >
            {actionMessage}
          </div>
        ) : null}

        {/* 상태 요약: 생성 | 초대 | 연결 3칸. 모바일 한 줄에 들어가도록 기존
            2칸 대형 카드보다 압축(라벨/숫자/패딩 축소). 전체 = 세 칸의 합. */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <div className="rounded-[12px] bg-[#ECEAE3] px-2.5 py-1.5 ring-1 ring-[#D8D5CC]">
            <p className="text-[10px] font-semibold text-[#73706A]">생성</p>
            <p className="text-[18px] font-bold leading-tight text-[#73706A]">{stageCounts.created}</p>
          </div>

          <div className="rounded-[12px] bg-[#FCE8C9] px-2.5 py-1.5 ring-1 ring-[#F7B95C]">
            <p className="text-[10px] font-semibold text-[#936018]">초대</p>
            <p className="text-[18px] font-bold leading-tight text-[#936018]">{stageCounts.invited}</p>
          </div>

          <div className="rounded-[12px] bg-[#DDF7EE] px-2.5 py-1.5 ring-1 ring-[#8EE5CA]">
            <p className="text-[10px] font-semibold text-[#0B7A5D]">연결</p>
            <p className="text-[18px] font-bold leading-tight text-[#0B7A5D]">{stageCounts.connected}</p>
          </div>
        </div>

        {/*
          Mobile: 6 tier chips must fit on a single row at ~360px viewport.
          Container uses flex-nowrap for no wrap and overflow-x-auto as a
          safety net for ultra-narrow widths. Chip height/padding/font are
          shrunk so 전체·가족·핵심·신뢰·친밀·친근 all fit without horizontal
          scroll on standard mobile widths.
        */}
        <div className="mt-3 flex flex-nowrap gap-[5px] overflow-x-auto pb-0.5">
          {tierTabs.map((tab) => {
            const isActive = tierFilter === tab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setTierFilter(tab)}
                className={[
                  "flex h-[26px] shrink-0 items-center justify-center gap-[3px] rounded-full px-[9px] text-[11px] font-semibold transition active:scale-95",
                  isActive
                    ? "bg-[#2C2C2A] text-[#F1EFE8]"
                    : "bg-white text-[#60656F] ring-1 ring-[#D3D1C7]",
                ].join(" ")}
              >
                <span>{getTierFilterLabel(tab)}</span>
                <span
                  className={
                    isActive ? "text-[#F1EFE8]/70" : "text-[#A9A59A]"
                  }
                >
                  {tierCounts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[120px] pt-3">
        {filteredPeople.length === 0 ? (
          <EmptyState title="아직 없어요" body="추가하거나 초대한 사람이 여기에 보여요." />
        ) : (
          <div className="space-y-2">
            {filteredPeople.map((person) => {
              const pendingInviteDraft = pendingInviteMapByPersonId[person.id] ?? null;
              // local-only pendingInviteDraft 는 invitePath 라우팅용으로 유지.
              // dashed border / "대기" 뱃지 등 시각 표시는 remote pending 도
              // 잡도록 통합 findPendingForPerson() 기준으로 결정한다.
              const isPendingInstall = Boolean(
                pendingInviteDraft || findPendingForPerson(person),
              );
              // 설치대기(pending) 사람도 연락 버튼이 무반응이 되지 않게
              // picker 를 연다 — channelChoices 가 ["copy"](문구 복사)로
              // 좁혀져 있어 가입 전 상대에게도 가능한 액션만 노출된다.
              const isContactPickerOpen =
                person.ctaKind === "contact" &&
                openContactPickerId === person.id;

              const channelChoices = isPendingInstall
                ? (["copy"] as const)
                : buildChannelChoices(person.raw as DashboardPerson);

              const tierStyle = getSimpleTierStyle(person.tierValue);
              const stage =
                stageByIdentity.get(
                  getPersonIdentityKey(person.raw as Record<string, unknown>),
                ) ?? "created";
              const stageMeta = STAGE_META[stage];
              // border 기준: accepted 만 solid. local-only / pending 모두 dashed
              // (Home tile 점선 정책과 일치). isPendingInstall 은 채널 / CTA
              // 분기에 그대로 사용한다.
              const accepted = isAcceptedPerson(person);
              const borderStyle = accepted ? "2.5px solid" : "1.5px dashed";
              // 연결 상대의 최신 remote 프로필 사진(없으면 빈 값 → 이니셜).
              const displayPhoto = getPersonDisplayPhoto(
                person.raw as DashboardPerson,
              );

              return (
                <div
                  // React key 는 person.id 단독이 아니라 identity 키를 쓴다. 구버전
                  // 데이터에서 서로 다른 PID 가 같은 person.id 를 갖는 경우
                  // person.id 단독 key 는 충돌해 필터 전환 시 카드가 누적된다.
                  key={getPersonIdentityKey(person.raw as Record<string, unknown>)}
                  className="rounded-[20px] bg-[#FAFAF8] p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)] ring-1 ring-[#D3D1C7]"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openDetail(person.id)}
                      className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-[17px] font-bold shadow-[0_6px_14px_rgba(15,23,42,0.04)] active:scale-95"
                      style={{
                        background: tierStyle.bg,
                        border: `${borderStyle} ${tierStyle.text}`,
                        color: tierStyle.text,
                      }}
                      aria-label={`${person.name} 상세 보기`}
                    >
                      {getInitials(person.name)}
                      {displayPhoto ? (
                        <img
                          src={displayPhoto}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-[17px] font-bold tracking-[-0.03em] text-[#0F172A]">
                          {person.name}
                        </h2>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: tierStyle.bg,
                            color: tierStyle.text,
                            border: `1px solid ${tierStyle.border}`,
                          }}
                        >
                          {tierStyle.label}
                        </span>
                        {/* 상태 pill 은 tier 칩보다 시각 우선순위를 낮게(작은
                            글씨/연한 색/가는 굵기). 설명 문장은 추가하지 않는다. */}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stageMeta.chipClass}`}
                        >
                          {stageMeta.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();

                          if (isPendingInstall && pendingInviteDraft?.invitePath) {
                            router.push(pendingInviteDraft.invitePath);
                            return;
                          }

                          openDetail(person.id);
                        }}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-[#0F172A] text-white active:scale-95"
                        aria-label="상세 보기"
                      >
                        <IconDetail />
                      </button>

                      <button
                        type="button"
                        onClick={(event) => handlePrimaryAction(event, person)}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-[#2C2C2A] text-[#F1EFE8] active:scale-95"
                        aria-label="연락하기"
                      >
                        <IconContact />
                      </button>

                      <button
                        type="button"
                        onClick={(event) => handleDeletePerson(event, person)}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-[#FBEAF0] text-[#993556] ring-1 ring-[#F4C0D1] active:scale-95"
                        aria-label="삭제"
                      >
                        <IconDelete />
                      </button>
                    </div>
                  </div>

                  {isContactPickerOpen ? (
                    <div
                      className="mt-3 rounded-[18px] bg-white px-3 py-3 ring-1 ring-[#D3D1C7]"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <div className="grid grid-cols-4 gap-2">
                        {channelChoices.map((channel) => (
                          <button
                            key={channel}
                            type="button"
                            disabled={isChannelSubmitting}
                            onClick={(event) =>
                              handleChannelAction(
                                event,
                                person,
                                channel as ContactChannel | "copy",
                              )
                            }
                            className="h-[38px] rounded-[14px] bg-[#F5F3EE] text-[12px] font-semibold text-[#2C2C2A] ring-1 ring-[#D3D1C7] disabled:opacity-60"
                          >
                            {getChannelLabel(channel)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
