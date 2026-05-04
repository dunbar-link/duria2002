"use client";

import { normalizeDashboardPersonId } from "./data";

export type RelationshipActionChannel =
  | "call"
  | "message"
  | "kakao"
  | "whatsapp"
  | "telegram"
  | "line"
  | "instagram"
  | "messenger"
  | "copy";

export type RelationshipActionState =
  | "idle"
  | "started"
  | "completed"
  | "snoozed";

export type RelationshipStatusItem = {
  personId: string;
  state: RelationshipActionState;
  lastActionAt: string | null;
  lastCompletedAt: string | null;
  snoozedUntil: string | null;
  lastChannel: RelationshipActionChannel | null;
  note: string;
};

export type RelationshipStatusMap = Record<string, RelationshipStatusItem>;

type PersonLike = {
  id: string;
  name: string;
  tier?: number | null;
  relationshipTier?: number | null;
  cadenceDays?: number | null;
  company?: string | null;
  school?: string | null;
  city?: string | null;
  lastContactAt?: string | null;
};

export type MaintenanceRecommendation = {
  personId: string;
  score: number;
  cadenceDays: number;
  daysSinceLastTouch: number;
  urgencyLabel: "지금" | "곧" | "여유";
  reasonTitle: string;
  reasonBody: string;
  defaultChannel: RelationshipActionChannel;
};

const STORAGE_KEY = "dl_relationship_status_v1";
const EVENT_NAME = "dl_relationship_status_changed";

function isBrowser() {
  return typeof window !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePersonId(personId: string) {
  return normalizeDashboardPersonId(personId);
}

function safeParse(input: string | null): RelationshipStatusMap {
  if (!input) {
    return {};
  }

  try {
    const parsed = JSON.parse(input) as RelationshipStatusMap;
    return normalizeMap(parsed);
  } catch {
    return {};
  }
}

function normalizeMap(
  map: RelationshipStatusMap | undefined | null,
): RelationshipStatusMap {
  const source = map ?? {};
  const next: RelationshipStatusMap = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const normalizedId = normalizePersonId(rawKey);

    next[normalizedId] = {
      personId: normalizedId,
      state: rawValue?.state ?? "idle",
      lastActionAt: rawValue?.lastActionAt ?? null,
      lastCompletedAt: rawValue?.lastCompletedAt ?? null,
      snoozedUntil: rawValue?.snoozedUntil ?? null,
      lastChannel: rawValue?.lastChannel ?? null,
      note: rawValue?.note ?? "",
    };
  }

  return next;
}

function emitRelationshipStatusChanged() {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(EVENT_NAME));
}

function writeRelationshipStatusMap(map: RelationshipStatusMap) {
  if (!isBrowser()) {
    return;
  }

  const normalizedMap = normalizeMap(map);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedMap));
  emitRelationshipStatusChanged();
}

function ensureItem(
  personId: string,
  existing?: RelationshipStatusItem | null,
): RelationshipStatusItem {
  const normalizedId = normalizePersonId(personId);

  return (
    existing ?? {
      personId: normalizedId,
      state: "idle",
      lastActionAt: null,
      lastCompletedAt: null,
      snoozedUntil: null,
      lastChannel: null,
      note: "",
    }
  );
}

function patchItem(
  personId: string,
  patch: Partial<RelationshipStatusItem>,
): RelationshipStatusMap {
  const normalizedId = normalizePersonId(personId);
  const map = readRelationshipStatusMap();
  const current = ensureItem(normalizedId, map[normalizedId]);

  const next: RelationshipStatusItem = {
    ...current,
    ...patch,
    personId: normalizedId,
  };

  const updated = {
    ...map,
    [normalizedId]: next,
  };

  writeRelationshipStatusMap(updated);
  return updated;
}

function toDate(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const value = new Date(input);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value;
}

function diffDays(from: Date, to: Date) {
  const diff = to.getTime() - from.getTime();
  return Math.floor(diff / 86400000);
}

function getTierValue(person: PersonLike) {
  return person.tier ?? person.relationshipTier ?? null;
}

export function getCadenceDays(person: PersonLike) {
  if (typeof person.cadenceDays === "number" && person.cadenceDays > 0) {
    return person.cadenceDays;
  }

  const tier = getTierValue(person);

  if (tier !== null && tier <= 1) return 3;
  if (tier !== null && tier <= 5) return 7;
  if (tier !== null && tier <= 15) return 14;
  if (tier !== null && tier <= 50) return 30;
  if (tier !== null && tier <= 150) return 60;
  if (tier !== null && tier <= 500) return 120;
  if (tier !== null && tier <= 1500) return 180;

  return 30;
}

function getDaysSinceLastTouch(
  person: PersonLike,
  status?: RelationshipStatusItem | null,
) {
  const reference =
    toDate(status?.lastCompletedAt) ??
    toDate(status?.lastActionAt) ??
    toDate(person.lastContactAt) ??
    null;

  if (!reference) {
    return 999;
  }

  return Math.max(0, diffDays(reference, new Date()));
}

export function isRelationshipSnoozed(status?: RelationshipStatusItem | null) {
  const snoozedUntil = toDate(status?.snoozedUntil);

  if (!snoozedUntil) {
    return false;
  }

  return snoozedUntil.getTime() > Date.now();
}

function getUrgencyLabel(
  daysSinceLastTouch: number,
  cadenceDays: number,
): "지금" | "곧" | "여유" {
  if (daysSinceLastTouch >= cadenceDays) return "지금";
  if (daysSinceLastTouch >= Math.max(1, cadenceDays - 3)) return "곧";
  return "여유";
}

function getDefaultChannel(
  person: PersonLike,
  urgencyLabel: "지금" | "곧" | "여유",
): RelationshipActionChannel {
  const tier = getTierValue(person);

  if (urgencyLabel === "지금" && (tier === 1 || tier === 5)) {
    return "call";
  }

  if (person.company || person.school) {
    return "message";
  }

  return "message";
}

export function buildReasonText(
  person: PersonLike,
  status?: RelationshipStatusItem | null,
) {
  const cadenceDays = getCadenceDays(person);
  const daysSinceLastTouch = getDaysSinceLastTouch(person, status);
  const urgencyLabel = getUrgencyLabel(daysSinceLastTouch, cadenceDays);

  if (status?.state === "completed" && status.lastCompletedAt) {
    return {
      title: "최근에 잘 이어졌어요",
      body: `${person.name}님과 최근 안부를 주고받았어요. 지금은 잠시 두고 다음 흐름을 보면 돼요.`,
      urgencyLabel: "여유" as const,
      cadenceDays,
      daysSinceLastTouch,
    };
  }

  if (isRelationshipSnoozed(status)) {
    return {
      title: "잠시 쉬어가는 중이에요",
      body: `${person.name}님은 정한 시점까지 잠시 쉬어가고 있어요. 때가 되면 다시 이어가면 돼요.`,
      urgencyLabel: "여유" as const,
      cadenceDays,
      daysSinceLastTouch,
    };
  }

  if (daysSinceLastTouch >= cadenceDays + 7) {
    return {
      title: "지금 한 번 챙겨보세요",
      body: `${person.name}님과 ${daysSinceLastTouch}일 동안 연락이 없었어요. 짧게 인사만 해도 흐름이 다시 이어져요.`,
      urgencyLabel,
      cadenceDays,
      daysSinceLastTouch,
    };
  }

  if (daysSinceLastTouch >= cadenceDays) {
    return {
      title: "오늘 가볍게 이어가세요",
      body: `${person.name}님은 지금쯤 한 번 안부를 건네기 좋은 타이밍이에요.`,
      urgencyLabel,
      cadenceDays,
      daysSinceLastTouch,
    };
  }

  if (daysSinceLastTouch >= Math.max(1, cadenceDays - 3)) {
    return {
      title: "곧 한 번 이어가세요",
      body: `${person.name}님과 다시 연락하기 좋은 시점이 가까워졌어요.`,
      urgencyLabel,
      cadenceDays,
      daysSinceLastTouch,
    };
  }

  return {
    title: "편하게 이어가세요",
    body: `${person.name}님은 아직 여유가 있지만, 지금 짧게 인사해두면 더 자연스럽게 이어갈 수 있어요.`,
    urgencyLabel,
    cadenceDays,
    daysSinceLastTouch,
  };
}

export function buildActionDraft(person: PersonLike, reasonBody?: string) {
  void reasonBody;

  return `안녕하세요 ${person.name}님, 오랜만이에요. 문득 생각나서 안부 남겨요. 요즘 어떻게 지내세요?`;
}

export function getPrimaryRecommendationForPerson(
  person: PersonLike,
  map?: RelationshipStatusMap,
): MaintenanceRecommendation {
  const normalizedId = normalizePersonId(person.id);
  const normalizedMap = normalizeMap(map);
  const status = normalizedMap[normalizedId];
  const reason = buildReasonText(person, status);
  const defaultChannel = getDefaultChannel(person, reason.urgencyLabel);

  let score = reason.daysSinceLastTouch - reason.cadenceDays;

  if (reason.urgencyLabel === "지금") score += 40;
  if (reason.urgencyLabel === "곧") score += 20;

  const tier = getTierValue(person);
  if (tier === 1) score += 20;
  if (tier === 5) score += 15;
  if (tier === 15) score += 10;

  if (status?.state === "started") score -= 10;
  if (status?.state === "completed") score -= 400;
  if (isRelationshipSnoozed(status)) score -= 1000;

  return {
    personId: normalizedId,
    score,
    cadenceDays: reason.cadenceDays,
    daysSinceLastTouch: reason.daysSinceLastTouch,
    urgencyLabel: reason.urgencyLabel,
    reasonTitle: reason.title,
    reasonBody: reason.body,
    defaultChannel,
  };
}

export function rankPeopleForMaintenance<T extends PersonLike>(
  people: T[],
  map?: RelationshipStatusMap,
) {
  return [...people]
    .map((person) => ({
      person,
      recommendation: getPrimaryRecommendationForPerson(person, map),
    }))
    .sort((a, b) => b.recommendation.score - a.recommendation.score);
}

export function pickPrimaryRecommendation<T extends PersonLike>(
  people: T[],
  map?: RelationshipStatusMap,
) {
  const ranked = rankPeopleForMaintenance(people, map);
  return ranked.find((item) => item.recommendation.score > -999) ?? ranked[0] ?? null;
}

export function readRelationshipStatusMap(): RelationshipStatusMap {
  if (!isBrowser()) {
    return {};
  }

  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function getRelationshipStatus(personId: string) {
  const normalizedId = normalizePersonId(personId);
  const map = readRelationshipStatusMap();
  return ensureItem(normalizedId, map[normalizedId]);
}

export function getRelationshipStatusFromMap(
  map: RelationshipStatusMap | undefined,
  personId: string,
) {
  const normalizedId = normalizePersonId(personId);
  const normalizedMap = normalizeMap(map);
  return ensureItem(normalizedId, normalizedMap[normalizedId]);
}

export function subscribeRelationshipStatus(listener: () => void) {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  };

  const onCustom = () => listener();

  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}

export function formatRelativeStatus(personId: string) {
  const item = getRelationshipStatus(personId);

  if (item.state === "snoozed" && item.snoozedUntil) {
    const date = toDate(item.snoozedUntil);

    if (date && date.getTime() > Date.now()) {
      const remain = Math.max(0, diffDays(new Date(), date));
      return `잠시 미룸 · ${remain}일 남음`;
    }
  }

  if (item.state === "completed" && item.lastCompletedAt) {
    const date = toDate(item.lastCompletedAt);

    if (date) {
      const days = diffDays(date, new Date());

      if (days <= 0) return "오늘 잘 이어짐";
      if (days === 1) return "어제 잘 이어짐";
      return `${days}일 전 잘 이어짐`;
    }
  }

  if (item.lastActionAt) {
    const date = toDate(item.lastActionAt);

    if (date) {
      const days = diffDays(date, new Date());

      if (days <= 0) return "오늘 할 일";
      return `${days}일 전 시작`;
    }
  }

  return "아직 기록 없음";
}

export function setRelationshipActionStarted(
  personId: string,
  channel: RelationshipActionChannel,
) {
  patchItem(personId, {
    state: "started",
    lastActionAt: nowIso(),
    lastChannel: channel,
    snoozedUntil: null,
  });
}

export function setRelationshipCompleted(personId: string) {
  const timestamp = nowIso();

  patchItem(personId, {
    state: "completed",
    lastActionAt: timestamp,
    lastCompletedAt: timestamp,
    snoozedUntil: null,
  });
}

export function setRelationshipSnoozed(personId: string, days: number) {
  const target = new Date();
  target.setDate(target.getDate() + days);

  patchItem(personId, {
    state: "snoozed",
    snoozedUntil: target.toISOString(),
    lastActionAt: nowIso(),
    lastCompletedAt: null,
  });
}

export function clearRelationshipSnooze(personId: string) {
  patchItem(personId, {
    snoozedUntil: null,
    state: "idle",
  });
}

export function resetRelationshipToIdle(personId: string) {
  patchItem(personId, {
    state: "idle",
    lastActionAt: null,
    lastCompletedAt: null,
    snoozedUntil: null,
  });
}

export function setRelationshipNote(personId: string, note: string) {
  patchItem(personId, {
    note,
  });
}
