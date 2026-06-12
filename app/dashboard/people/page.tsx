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
  accepted_person_id: string | null;
  accepted_person_name: string | null;
  accepted_at: string | null;
  created_at: string | null;
};

function getPersonId(person: DashboardPerson & Record<string, unknown>) {
  const raw = person.id ?? person.pid ?? person.personId ?? person.slug ?? person.name;
  return typeof raw === "string" ? raw : String(raw ?? "");
}

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

function comparePeople(a: EnrichedPerson, b: EnrichedPerson) {
  const needOrder: Record<NeedFilter, number> = {
    all: 99,
    need: 0,
    ok: 1,
    later: 2,
    done: 3,
  };

  if (needOrder[a.needBucket] !== needOrder[b.needBucket]) {
    return needOrder[a.needBucket] - needOrder[b.needBucket];
  }

  if (a.tierValue !== b.tierValue) {
    return a.tierValue - b.tierValue;
  }

  if (b.score !== a.score) {
    return b.score - a.score;
  }

  return a.name.localeCompare(b.name);
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
    id: row.accepted_person_id?.trim() || `remote-invite-${row.token}`,
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.6a2 2 0 0 1-.45 2.11L8 9.71a16 16 0 0 0 6.29 6.29l1.28-1.28a2 2 0 0 1 2.11-.45c.83.29 1.7.5 2.6.62A2 2 0 0 1 22 16.92z" />
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
  const removePerson = usePeopleStore((state) => state.removePerson);
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

  // person-level dedup: 같은 사람에게 여러 번 초대 버튼을 눌러 invite 가
  // 여러 행 생겨도 설치대기 count 는 1 로만 친다. key 우선순위는 sourcePersonId
  // → provisionalPersonId → 정규화된 inviteeName 순. 셋 다 비면 token 으로 fallback.
  const allPendingInvitesByPerson = useMemo<DedupPending[]>(() => {
    const seen = new Set<string>();
    const result: DedupPending[] = [];
    for (const inv of allPendingInvitesDedup) {
      let personKey = "";
      if (inv.sourcePersonId) {
        personKey = `pid:${inv.sourcePersonId}`;
      } else if (inv.provisionalPersonId) {
        personKey = `pid:${inv.provisionalPersonId}`;
      } else {
        const n = normalizeName(inv.inviteeName);
        personKey = n ? `name:${n}` : `token:${inv.token}`;
      }
      if (seen.has(personKey)) continue;
      seen.add(personKey);
      result.push(inv);
    }
    return result;
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
    return (
      p.userId ||
      p.acceptedPersonId ||
      p.id ||
      p.name
    );
  }

  function isSelfPerson(p: any) {
    if (!deviceUserId) return false;
    const candidates = [p.userId, p.dlUserId, p.acceptedPersonId, p.id];
    return candidates.some(
      (value) =>
        typeof value === "string" && value.trim() === deviceUserId,
    );
  }

  // remote 먼저
  remoteAcceptedInvites.forEach((item) => {
    if (
      deviceUserId &&
      (item.accepted_person_id ?? "").trim() === deviceUserId
    ) {
      return;
    }

    const p = buildRemoteInvitePerson(item);
    const key = getKey(p);

    if (!map.has(key)) {
      map.set(key, p);
    }
  });

  // local 덮어쓰기
  people.forEach((p) => {
    if (isSelfPerson(p)) {
      return;
    }
    const key = getKey(p);
    map.set(key, p);
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
      family: enrichedPeople.filter((person) =>
        matchesTierFilter(person.tierValue, "family"),
      ).length,
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
      `${person.name}님을 People과 홈 데이터에서 제거할까요?\n\n연결 전 초대 기록도 함께 정리해서 설치대기 숫자가 남지 않게 합니다.`,
    );

    if (!confirmed) {
      return;
    }

    const normalizedPersonName = normalizeName(person.name);
    const matchedRemoteInvites = remoteInvites.filter((row) => {
      const acceptedId = row.accepted_person_id?.trim() ?? "";
      const acceptedName = normalizeName(row.accepted_person_name);
      const inviteeName = normalizeName(row.invitee_name);

      if (acceptedId && acceptedId === person.id) {
        return true;
      }

      if (acceptedName && acceptedName === normalizedPersonName) {
        return true;
      }

      if (inviteeName && inviteeName === normalizedPersonName) {
        return true;
      }

      return false;
    });

    const matchedLocalDrafts = inviteDrafts.filter((draft) => {
      if (draft.sourcePersonId === person.id) return true;
      if (draft.provisionalPersonId === person.id) return true;
      if (draft.acceptedPersonId === person.id) return true;
      if (normalizeName(draft.inviteeName) === normalizedPersonName) return true;
      if (normalizeName(draft.acceptedPersonName) === normalizedPersonName) return true;
      return false;
    });

    const tokens = Array.from(
      new Set([
        ...matchedRemoteInvites.map((row) => row.token).filter(Boolean),
        ...matchedLocalDrafts.map((draft) => draft.token).filter(Boolean),
      ]),
    );

    removePerson(person.id);
    setRemoteInvites((prev) =>
      prev.filter((row) => {
        if (tokens.includes(row.token)) {
          return false;
        }

        if (row.accepted_person_id && row.accepted_person_id === person.id) {
          return false;
        }

        const rowName = normalizeName(row.accepted_person_name ?? row.invitee_name);
        return rowName !== normalizedPersonName;
      }),
    );
    setOpenContactPickerId(null);

    try {
      const response = await fetch("/api/invites/delete-for-person", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokens,
          personId: person.id,
          personName: person.name,
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

  // 설치대기는 person 단위 dedup 결과를 사용해 같은 사람 중복 카운트 차단.
  // 가입완료는 isAcceptedPerson 그대로 (isJoined + serverId).
  const summaryPendingCount = allPendingInvitesByPerson.length;
  const summaryAcceptedCount = enrichedPeople.filter(isAcceptedPerson).length;

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

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-[14px] bg-[#DDF7EE] px-3 py-2 ring-1 ring-[#8EE5CA]">
            <p className="text-[10px] font-semibold text-[#0B7A5D]">가입 완료</p>
            <p className="mt-0.5 text-[19px] font-bold leading-tight text-[#0B7A5D]">{summaryAcceptedCount}</p>
          </div>

          <div className="rounded-[14px] bg-[#FCE8C9] px-3 py-2 ring-1 ring-[#F7B95C]">
            <p className="text-[10px] font-semibold text-[#936018]">설치 대기</p>
            <p className="mt-0.5 text-[19px] font-bold leading-tight text-[#936018]">{summaryPendingCount}</p>
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
          <EmptyState title="아직 없어요" body="가입 완료된 사람이 여기에 보여요." />
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
                  key={person.id}
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

                      <div className="mt-1 flex items-center gap-2">
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
