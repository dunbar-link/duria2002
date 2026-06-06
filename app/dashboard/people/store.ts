"use client";

import { getCurrentUserId } from "@/lib/auth/current-user";
import { isIncompleteMeName, readMeProfileName } from "@/lib/me/profile-name";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  AddDashboardPersonInput,
  buildAddedPerson,
  DashboardPerson,
  DashboardTier,
  getChannelAvailability,
  ContactChannel,
  RelationshipType,
} from "./data";

export type RelationshipStatus =
  | "overdue"
  | "due_today"
  | "due_soon"
  | "warm"
  | "stable"
  | "neglected";

export type RecommendedAction =
  | "contact_now"
  | "schedule_this_week"
  | "send_light_touch"
  | "maintain"
  | "no_action";

export type InviteDraftStatus = "pending" | "accepted";

export type InviteDraft = {
  token: string;
  provisionalPersonId: string;
  createdAt: string;
  invitePath: string;
  inviteeName: string;
  sourcePersonId: string | null;
  tier: AddDashboardPersonInput["tier"];
  relationshipType: RelationshipType;
  relationshipLabel: string;
  inviterNote: string;
  inviterUserId: string | null;
  inviterName: string | null;
  acceptedAt: string | null;
  acceptedPersonId: string | null;
  acceptedPersonName: string | null;
  status: InviteDraftStatus;
};

export type CreateInviteDraftInput = {
  inviteeName?: string;
  sourcePersonId?: string | null;
  tier: DashboardTier;
  relationshipType: RelationshipType;
  relationshipLabel?: string;
  inviterNote?: string;
};

export type RemoteInviteDraftLike = {
  token?: string | null;
  invitePath?: string | null;
  invite_path?: string | null;
  inviteeName?: string | null;
  invitee_name?: string | null;
  sourcePersonId?: string | null;
  source_person_id?: string | null;
  tier?: AddDashboardPersonInput["tier"] | number | null;
  relationshipType?: RelationshipType | string | null;
  relationship_type?: RelationshipType | string | null;
  relationshipLabel?: string | null;
  relationship_label?: string | null;
  inviterNote?: string | null;
  inviter_note?: string | null;
  inviterUserId?: string | null;
  inviter_user_id?: string | null;
  inviterName?: string | null;
  inviter_name?: string | null;
  acceptedAt?: string | null;
  accepted_at?: string | null;
  acceptedPersonId?: string | null;
  accepted_person_id?: string | null;
  acceptedUserId?: string | null;
  accepted_user_id?: string | null;
  acceptedPersonName?: string | null;
  accepted_person_name?: string | null;
  status?: InviteDraftStatus | string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

type AcceptInviteInput = {
  token: string;
  name: string;
  relationshipDetail?: string;
  affiliationPrimary?: string;
  affiliationSecondary?: string;
  phone?: string;
  kakaoTalkUrl?: string;
  whatsappPhone?: string;
  telegramUsername?: string;
  lineId?: string;
  instagramUsername?: string;
  messengerUsername?: string;
  note?: string;
};

type AcceptInviteResult =
  | {
      ok: true;
      personId: string;
      personName: string;
    }
  | {
      ok: false;
      message: string;
    };

type PeopleState = {
  people: DashboardPerson[];
  quickNotes: Record<string, string>;
  hasHydrated: boolean;
  availableChannels: Record<string, ContactChannel[]>;
  preferredChannels: Record<string, ContactChannel>;
  inviteDrafts: InviteDraft[];

  addPerson: (input: AddDashboardPersonInput) => DashboardPerson;
  updatePersonTier: (id: string, tier: DashboardTier) => void;
  updatePersonAlias: (id: string, alias: string) => void;
  markContacted: (id: string, at?: string) => void;
  snooze: (id: string, days?: number) => void;
  snoozePerson: (id: string) => void;
  removePerson: (id: string) => void;
  resetPeopleState: () => void;
  setHasHydrated: (value: boolean) => void;

  saveQuickNote: (id: string, note: string) => void;
  getQuickNote: (id: string) => string;

  getAvailableChannels: (id: string) => ContactChannel[];
  getPreferredChannel: (id: string) => ContactChannel;

  getTierCadenceDays: (person: DashboardPerson) => number;
  getDaysSinceLastContact: (person: DashboardPerson) => number;
  getDaysUntilNextContact: (person: DashboardPerson) => number;

  getRelationshipStatus: (person: DashboardPerson) => RelationshipStatus;
  getRecommendedAction: (person: DashboardPerson) => RecommendedAction;
  getWhyNowReason: (person: DashboardPerson) => string;

  createInviteDraft: (input: CreateInviteDraftInput) => InviteDraft;
  setInviteDrafts: (drafts: InviteDraft[]) => void;
  getInviteDraftByToken: (token: string) => InviteDraft | null;
  syncInviteDraftsFromRemote: (rows: RemoteInviteDraftLike[]) => void;
  syncAcceptedInvitesToPeople: () => Promise<void>;

  acceptInvite: (input: AcceptInviteInput) => AcceptInviteResult;
};

const DAY_MS = 1000 * 60 * 60 * 24;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function diffInDays(from: Date, to: Date) {
  const fromStart = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  );
  const toStart = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toStart.getTime() - fromStart.getTime()) / DAY_MS);
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function getTierCadenceDaysByTier(tier: number) {
  if (tier <= 1) return 3;
  if (tier <= 5) return 3;
  if (tier <= 15) return 7;
  if (tier <= 50) return 14;
  if (tier <= 150) return 30;
  if (tier <= 500) return 60;
  return 120;
}

function getFallbackDaysSinceByTier(tier: number) {
  const cadence = getTierCadenceDaysByTier(tier);

  if (tier <= 1) return cadence - 1;
  if (tier <= 5) return cadence + 1;
  if (tier <= 15) return cadence - 3;
  if (tier <= 50) return Math.floor(cadence * 0.8);
  if (tier <= 150) return Math.floor(cadence * 0.45);
  if (tier <= 500) return Math.floor(cadence * 0.7);
  return Math.floor(cadence * 0.35);
}

function buildChannelState(people: DashboardPerson[]) {
  const availableChannels: Record<string, ContactChannel[]> = {};
  const preferredChannels: Record<string, ContactChannel> = {};

  for (const person of people) {
    const available = getChannelAvailability(person)
      .filter((item) => item.available && item.channel !== "copy")
      .map((item) => item.channel);

    availableChannels[person.id] = available.length > 0 ? available : ["copy"];

    const preferred =
      person.preferredChannels.find((channel) => available.includes(channel)) ??
      available[0] ??
      "copy";

    preferredChannels[person.id] = preferred;
  }

  return {
    availableChannels,
    preferredChannels,
  };
}

function cleanText(value?: string | null) {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length > 0 ? next : "";
}

function getDefaultRelationshipLabel(type: RelationshipType) {
  if (type === "friend") return "친구";
  if (type === "family") return "가족";
  if (type === "school") return "학교";
  if (type === "work") return "직장";
  if (type === "senior_junior") return "선후배";
  if (type === "business") return "거래처";
  return "기타";
}

function generateInviteToken() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `invite_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildProvisionalPersonId(token: string) {
  return `invite-pending-${token}`;
}

/**
 * 같은 sourcePersonId 에 pending invite draft 가 여러 개면 가장 최근 1개만
 * 남기고 나머지 pending 중복을 제거한다. accepted draft 와 sourcePersonId 가
 * 없는(폼 기반 단발) pending draft 는 손대지 않는다.
 *
 * createInviteDraft 내부 dedup 이전에 이미 persist 된 stale 중복을 hydration
 * 시점에 1회 정리하기 위한 순수 함수. 입력과 동일하면 같은 배열 참조를 반환해
 * 불필요한 state 갱신을 피한다.
 */
function dedupePendingInviteDraftsBySource(
  drafts: InviteDraft[],
): InviteDraft[] {
  const newestPendingTokenBySource = new Map<string, string>();

  for (const draft of drafts) {
    if (draft.status !== "pending") continue;
    const src = draft.sourcePersonId?.trim();
    if (!src) continue;

    const currentToken = newestPendingTokenBySource.get(src);
    if (!currentToken) {
      newestPendingTokenBySource.set(src, draft.token);
      continue;
    }

    const currentDraft = drafts.find((d) => d.token === currentToken);
    const currentCreatedAt = currentDraft?.createdAt ?? "";
    if (draft.createdAt.localeCompare(currentCreatedAt) > 0) {
      newestPendingTokenBySource.set(src, draft.token);
    }
  }

  const keepTokens = new Set(newestPendingTokenBySource.values());

  const next = drafts.filter((draft) => {
    if (draft.status !== "pending") return true;
    const src = draft.sourcePersonId?.trim();
    if (!src) return true;
    return keepTokens.has(draft.token);
  });

  return next.length === drafts.length ? drafts : next;
}

function normalizeTier(value: unknown): AddDashboardPersonInput["tier"] {
  if (
    value === 1 ||
    value === 5 ||
    value === 15 ||
    value === 50 ||
    value === 150
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (value <= 1) return 1;
    if (value <= 5) return 5;
    if (value <= 15) return 15;
    if (value <= 50) return 50;
    return 150;
  }

  return 50;
}

function normalizeRelationshipType(value: unknown): RelationshipType {
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

  if (value === "etc") {
    return "other";
  }

  return "friend";
}

function normalizeRemoteInviteDraft(
  row: RemoteInviteDraftLike,
): InviteDraft | null {
  const token = cleanText(row.token);

  if (!token) {
    return null;
  }

  const relationshipType = normalizeRelationshipType(
    row.relationshipType ?? row.relationship_type,
  );
  const relationshipLabel =
    cleanText(row.relationshipLabel) ||
    cleanText(row.relationship_label) ||
    getDefaultRelationshipLabel(relationshipType);
  const acceptedAt = cleanText(row.acceptedAt) || cleanText(row.accepted_at);

  return {
    token,
    provisionalPersonId: buildProvisionalPersonId(token),
    createdAt:
      cleanText(row.createdAt) ||
      cleanText(row.created_at) ||
      new Date().toISOString(),
    invitePath:
      cleanText(row.invitePath) ||
      cleanText(row.invite_path) ||
      `/invite/${token}`,
    inviteeName: cleanText(row.inviteeName) || cleanText(row.invitee_name),
    sourcePersonId:
      cleanText(row.sourcePersonId) || cleanText(row.source_person_id) || null,
    tier: normalizeTier(row.tier),
    relationshipType,
    relationshipLabel,
    inviterNote: cleanText(row.inviterNote) || cleanText(row.inviter_note),
    inviterUserId:
      cleanText(row.inviterUserId) || cleanText(row.inviter_user_id) || null,
    inviterName:
      cleanText(row.inviterName) || cleanText(row.inviter_name) || null,
    acceptedAt: acceptedAt || null,
    acceptedPersonId:
      cleanText(row.acceptedPersonId) ||
      cleanText(row.accepted_person_id) ||
      cleanText(row.acceptedUserId) ||
      cleanText(row.accepted_user_id) ||
      null,
    acceptedPersonName:
      cleanText(row.acceptedPersonName) ||
      cleanText(row.accepted_person_name) ||
      null,
    status: row.status === "accepted" || acceptedAt ? "accepted" : "pending",
  };
}

function getStoredUserId(person: DashboardPerson & Record<string, unknown>) {
  const userId = typeof person.userId === "string" ? person.userId.trim() : "";
  const dlUserId =
    typeof person.dlUserId === "string" ? person.dlUserId.trim() : "";
  const acceptedPersonId =
    typeof person.acceptedPersonId === "string"
      ? person.acceptedPersonId.trim()
      : "";

  return userId || dlUserId || acceptedPersonId;
}

function normalizePersonName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function dedupePeopleByIdentity(people: DashboardPerson[]) {
  const byIdentity = new Map<string, DashboardPerson>();

  for (const person of people) {
    const extended = person as DashboardPerson & Record<string, unknown>;
    const userId = getStoredUserId(extended);
    const nameKey = normalizePersonName(person.name);
    const key = userId
      ? `user:${userId}`
      : nameKey
        ? `name:${nameKey}`
        : `id:${person.id}`;
    const existing = byIdentity.get(key);

    if (!existing) {
      byIdentity.set(key, person);
      continue;
    }

    byIdentity.set(key, {
      ...existing,
      ...person,
      id: existing.id || person.id,
      name: existing.name || person.name,
      lastContactAt: person.lastContactAt ?? existing.lastContactAt,
    });
  }

  return Array.from(byIdentity.values());
}

const initialPeople: DashboardPerson[] = [];
const initialQuickNotes: Record<string, string> = {};
const defaultChannelState = buildChannelState(initialPeople);

export const usePeopleStore = create<PeopleState>()(
  persist(
    (set, get) => ({
      people: initialPeople,
      quickNotes: initialQuickNotes,
      hasHydrated: false,
      availableChannels: defaultChannelState.availableChannels,
      preferredChannels: defaultChannelState.preferredChannels,
      inviteDrafts: [],

      addPerson: (input) => {
        const nextPerson = buildAddedPerson(input);

        set((state) => {
          const existingByName = state.people.find(
            (person) =>
              normalizePersonName(person.name) ===
              normalizePersonName(nextPerson.name),
          );

          const nextPeople = dedupePeopleByIdentity(
            existingByName ? state.people : [...state.people, nextPerson],
          );
          const nextChannels = buildChannelState(nextPeople);

          return {
            people: nextPeople,
            availableChannels: nextChannels.availableChannels,
            preferredChannels: nextChannels.preferredChannels,
          };
        });

        return nextPerson;
      },

      updatePersonTier: (id, tier) => {
        const trimmedId = id.trim();
        if (!trimmedId) {
          return;
        }
        set((state) => {
          let changed = false;
          const nextPeople = state.people.map((person) => {
            if (person.id !== trimmedId) {
              return person;
            }
            if (person.tier === tier) {
              return person;
            }
            changed = true;
            return { ...person, tier };
          });
          if (!changed) {
            return {} as Partial<PeopleState>;
          }
          return { people: nextPeople };
        });
      },

      // 내가 친구를 부르는 표시 이름(별명)을 직접 수정한다.
      // - alias 가 비어 있지 않으면: 표시 이름(person.name) = alias, localAlias 보존.
      // - alias 를 비우면: localAlias 제거 후 person.name 을 remoteProfileName
      //   (없으면 기존 이름)으로 되돌린다.
      // remote sync(syncAcceptedInvitesToPeople)는 localAlias 가 있으면 name 을
      // 덮어쓰지 않으므로, 사용자가 지정한 별명이 상대 이름 변경에 의해 사라지지 않는다.
      updatePersonAlias: (id, alias) => {
        const trimmedId = id.trim();
        if (!trimmedId) {
          return;
        }
        const nextAlias = cleanText(alias);
        set((state) => ({
          people: state.people.map((person) => {
            if (person.id !== trimmedId) {
              return person;
            }
            const remoteName = cleanText(person.remoteProfileName);
            return {
              ...person,
              localAlias: nextAlias || undefined,
              name: nextAlias || remoteName || person.name,
            };
          }),
        }));
      },

      markContacted: (id, at) =>
        set((state) => ({
          people: state.people.map((person) =>
            person.id === id
              ? {
                  ...person,
                  lastContactAt: at ?? new Date().toISOString(),
                  lastContactedAt: at ?? new Date().toISOString(),
                }
              : person,
          ),
        })),

      snooze: (id, days = 3) =>
        set((state) => {
          const today = startOfToday();

          return {
            people: state.people.map((person) => {
              if (person.id !== id) return person;

              const cadenceDays = getTierCadenceDaysByTier(person.tier);
              const targetNext = addDays(today, days);
              const newLast = addDays(targetNext, -cadenceDays);

              return {
                ...person,
                lastContactAt: newLast.toISOString(),
              };
            }),
          };
        }),

      snoozePerson: (id) => get().snooze(id, 3),

      removePerson: (id) => {
        const targetId = id.trim();

        if (!targetId) {
          return;
        }

        set((state) => {
          const targetPerson = state.people.find(
            (person) => person.id === targetId,
          );
          const targetName = targetPerson?.name?.trim() ?? "";
          const targetUserId =
            typeof (
              targetPerson as
                | (DashboardPerson & Record<string, unknown>)
                | undefined
            )?.userId === "string"
              ? ((targetPerson as DashboardPerson & Record<string, unknown>)
                  .userId as string)
              : typeof (
                    targetPerson as
                      | (DashboardPerson & Record<string, unknown>)
                      | undefined
                  )?.dlUserId === "string"
                ? ((targetPerson as DashboardPerson & Record<string, unknown>)
                    .dlUserId as string)
                : typeof (
                      targetPerson as
                        | (DashboardPerson & Record<string, unknown>)
                        | undefined
                    )?.acceptedPersonId === "string"
                  ? ((targetPerson as DashboardPerson & Record<string, unknown>)
                      .acceptedPersonId as string)
                  : "";

          const nextPeople = state.people.filter(
            (person) => person.id !== targetId,
          );
          const nextQuickNotes = { ...state.quickNotes };
          delete nextQuickNotes[targetId];

          const nextInviteDrafts = state.inviteDrafts.filter((draft) => {
            if (draft.provisionalPersonId === targetId) return false;
            if (draft.sourcePersonId === targetId) return false;
            if (draft.acceptedPersonId && draft.acceptedPersonId === targetId)
              return false;
            if (targetUserId && draft.acceptedPersonId === targetUserId)
              return false;
            if (targetName && draft.acceptedPersonName === targetName)
              return false;
            if (targetName && draft.inviteeName === targetName) return false;
            return true;
          });

          const nextChannels = buildChannelState(nextPeople);

          return {
            people: nextPeople,
            quickNotes: nextQuickNotes,
            availableChannels: nextChannels.availableChannels,
            preferredChannels: nextChannels.preferredChannels,
            inviteDrafts: nextInviteDrafts,
          };
        });
      },

      resetPeopleState: () => {
        const rebuilt = buildChannelState([]);

        set({
          people: [],
          quickNotes: {},
          availableChannels: rebuilt.availableChannels,
          preferredChannels: rebuilt.preferredChannels,
          inviteDrafts: [],
        });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),

      saveQuickNote: (id, note) =>
        set((state) => ({
          quickNotes: {
            ...state.quickNotes,
            [id]: note.trim(),
          },
        })),

      getQuickNote: (id) => get().quickNotes[id] ?? "",

      getAvailableChannels: (id) => get().availableChannels[id] ?? ["copy"],

      getPreferredChannel: (id) => get().preferredChannels[id] ?? "copy",

      getTierCadenceDays: (person) => getTierCadenceDaysByTier(person.tier),

      getDaysSinceLastContact: (person) => {
        const last = parseDate(person.lastContactAt);
        const today = startOfToday();

        if (!last) {
          return getFallbackDaysSinceByTier(person.tier);
        }

        return Math.max(0, diffInDays(last, today));
      },

      getDaysUntilNextContact: (person) => {
        const cadence = get().getTierCadenceDays(person);
        const since = get().getDaysSinceLastContact(person);
        return cadence - since;
      },

      getRelationshipStatus: (person) => {
        const until = get().getDaysUntilNextContact(person);
        const since = get().getDaysSinceLastContact(person);

        if (until < 0) return "overdue";
        if (until === 0) return "due_today";
        if (until <= 3) return "due_soon";
        if (since <= Math.max(2, Math.floor(person.cadenceDays * 0.35)))
          return "warm";
        if (since <= Math.max(5, Math.floor(person.cadenceDays * 0.65)))
          return "stable";
        return "neglected";
      },

      getRecommendedAction: (person) => {
        const status = get().getRelationshipStatus(person);

        if (status === "overdue" || status === "due_today")
          return "contact_now";
        if (status === "due_soon") return "schedule_this_week";
        if (status === "warm") return "send_light_touch";
        if (status === "stable") return "maintain";

        return "no_action";
      },

      getWhyNowReason: (person) => {
        const status = get().getRelationshipStatus(person);
        const since = get().getDaysSinceLastContact(person);
        const until = get().getDaysUntilNextContact(person);
        const note = get().getQuickNote(person.id);

        if (note) return `저장된 메모가 있다. ${note}`;
        if (status === "overdue") return `${Math.abs(until)}일 지남`;
        if (status === "due_today") return "오늘이 타이밍";
        if (status === "due_soon") return `${until}일 내`;
        if (status === "warm") return `${since}일 내 교류`;
        if (status === "stable") return "리듬 유지중";

        return `${since}일 미접촉`;
      },

      createInviteDraft: (input) => {
        const sourcePersonId = input.sourcePersonId?.trim() || null;

        // sourcePersonId 기준 dedup (store 내부에서 최신 state 로 판정).
        // 같은 사람한테 여러 번 초대해도 local pending draft 는 1개만 유지한다.
        // call-site 가드는 React state closure 에 의존하므로 연타/race 시
        // 빠져나갈 수 있다. 여기서 freshest state 로 한 번 더 막아 중복 token
        // 생성 자체를 차단한다.
        //
        // sourcePersonId 가 없는 invite(폼 기반 단발 초대)는 서로 묶이면 안
        // 되므로 dedup 하지 않고 항상 새로 만든다.
        if (sourcePersonId) {
          const existingPending = get()
            .inviteDrafts.filter(
              (d) =>
                d.sourcePersonId === sourcePersonId && d.status === "pending",
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          if (existingPending.length > 0) {
            const keep = existingPending[0];

            // stale 중복 정리: 같은 sourcePersonId 의 pending draft 가 2개
            // 이상이면 가장 최근 1개만 남기고 제거.
            if (existingPending.length > 1) {
              const staleTokens = new Set(
                existingPending.slice(1).map((d) => d.token),
              );
              set((state) => ({
                inviteDrafts: state.inviteDrafts.filter(
                  (d) => !staleTokens.has(d.token),
                ),
              }));
            }

            return keep;
          }
        }

        const token = generateInviteToken();
        const relationshipType = input.relationshipType;
        const relationshipLabel =
          cleanText(input.relationshipLabel) ||
          getDefaultRelationshipLabel(relationshipType);

        const inviterUserId = getCurrentUserId() || null;
        // me 이름이 비어 있거나 "나"(placeholder)면 dl_invites에 박제하지
        // 않는다. null로 두면 나중에 me 이름이 채워졌을 때
        // /api/invites/refresh-name 으로 일괄 동기화된다.
        const rawInviterName = readMeProfileName();
        const inviterName = isIncompleteMeName(rawInviterName)
          ? null
          : rawInviterName;

        const draft: InviteDraft = {
          token,
          provisionalPersonId: buildProvisionalPersonId(token),
          createdAt: new Date().toISOString(),
          invitePath: `/invite/${token}`,
          inviteeName: cleanText(input.inviteeName),
          sourcePersonId,
          tier: normalizeTier(input.tier),
          relationshipType,
          relationshipLabel,
          inviterNote: cleanText(input.inviterNote),
          inviterUserId,
          inviterName,
          acceptedAt: null,
          acceptedPersonId: null,
          acceptedPersonName: null,
          status: "pending",
        };

        set((state) => ({
          inviteDrafts: [draft, ...state.inviteDrafts],
        }));

        return draft;
      },

      setInviteDrafts: (drafts) => set({ inviteDrafts: drafts }),

      getInviteDraftByToken: (token) => {
        const target = token.trim();
        return get().inviteDrafts.find((item) => item.token === target) ?? null;
      },

      syncInviteDraftsFromRemote: (rows) => {
        const normalized = rows
          .map((row) => normalizeRemoteInviteDraft(row))
          .filter((item): item is InviteDraft => Boolean(item));

        if (normalized.length === 0) {
          return;
        }

        set((state) => {
          const merged = new Map<string, InviteDraft>();

          for (const item of state.inviteDrafts) {
            merged.set(item.token, item);
          }

          for (const item of normalized) {
            const existing = merged.get(item.token);

            if (!existing) {
              merged.set(item.token, item);
              continue;
            }

            merged.set(item.token, {
              ...existing,
              ...item,
              provisionalPersonId:
                existing.provisionalPersonId || item.provisionalPersonId,
              status:
                item.status === "accepted" || existing.status === "accepted"
                  ? "accepted"
                  : "pending",
              inviterUserId: item.inviterUserId ?? existing.inviterUserId,
              inviterName: item.inviterName ?? existing.inviterName,
              acceptedAt: item.acceptedAt ?? existing.acceptedAt,
              acceptedPersonId:
                item.acceptedPersonId ?? existing.acceptedPersonId,
              acceptedPersonName:
                item.acceptedPersonName ?? existing.acceptedPersonName,
            });
          }

          return {
            inviteDrafts: Array.from(merged.values()).sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          };
        });
      },

      syncAcceptedInvitesToPeople: async () => {
        const currentUserId = getCurrentUserId();

        if (!currentUserId) {
          return;
        }

        const res = await fetch(
          `/api/invites/mine?userId=${encodeURIComponent(currentUserId)}&status=accepted`,
        );

        const payload = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              invites?: RemoteInviteDraftLike[];
            }
          | null;

        if (!res.ok || !payload?.ok) {
          console.warn("accepted invite sync failed");
          return;
        }

        const data = payload.invites ?? [];

        const normalizedRows = (data as RemoteInviteDraftLike[])
          .map((row) => normalizeRemoteInviteDraft(row))
          .filter((item): item is InviteDraft => Boolean(item));

        if (normalizedRows.length === 0) return;

        set((state) => {
          const now = new Date().toISOString();
          const deviceUserId = currentUserId;

          const updatedPeople = state.people.map((person) => {
            const extended = person as DashboardPerson &
              Record<string, unknown>;
            const counterpartId = getStoredUserId(extended);
            const personName = normalizePersonName(person.name);

            // 방향 1: 상대가 "수락자"(내가 초대자)인 초대.
            // 이때 상대의 현재 이름은 acceptedPersonName 이다.
            const acceptedInvite = normalizedRows.find((item) => {
              if (
                item.acceptedPersonId &&
                item.acceptedPersonId === deviceUserId
              )
                return false;
              if (item.sourcePersonId && item.sourcePersonId === person.id)
                return true;
              if (
                item.acceptedPersonId &&
                item.acceptedPersonId === counterpartId
              )
                return true;
              if (
                item.acceptedPersonName &&
                normalizePersonName(item.acceptedPersonName) === personName
              )
                return true;
              if (
                item.inviteeName &&
                normalizePersonName(item.inviteeName) === personName
              )
                return true;
              return false;
            });

            // 방향 2(버그 수정): 상대가 "초대자"(내가 수락자)인 초대.
            // 이때 상대의 현재 이름은 inviterName 이다. 기존에는 이 방향이
            // 위 matcher 의 `acceptedPersonId === deviceUserId` 조건에서 제외돼,
            // 상대가 Me 이름을 바꿔도(refresh-name → inviter_name 갱신) 기존
            // person.name 이 갱신되지 않았다. (철수 → 김철수 미반영 원인)
            const inviterInvite = normalizedRows.find((item) => {
              if (item.acceptedPersonId !== deviceUserId) return false;
              if (item.inviterUserId && item.inviterUserId === deviceUserId)
                return false;
              if (item.sourcePersonId && item.sourcePersonId === person.id)
                return true;
              if (item.inviterUserId && item.inviterUserId === counterpartId)
                return true;
              if (
                item.inviterName &&
                normalizePersonName(item.inviterName) === personName
              )
                return true;
              return false;
            });

            if (!acceptedInvite && !inviterInvite) {
              return person;
            }

            // 상대의 현재 remote 이름: 방향1(acceptedPersonName) 우선,
            // 없으면 방향2(inviterName). 본인(deviceUserId)이면 적용하지 않는다.
            const acceptedName =
              acceptedInvite &&
              acceptedInvite.acceptedPersonId !== deviceUserId
                ? cleanText(acceptedInvite.acceptedPersonName)
                : "";
            const inviterName =
              inviterInvite && inviterInvite.inviterUserId !== deviceUserId
                ? cleanText(inviterInvite.inviterName)
                : "";
            const remoteName = acceptedName || inviterName;

            // 내가 직접 지정한 별명(localAlias)이 있으면 remote 이름이
            // 표시 이름을 덮어쓰지 않는다(친구 이름 직접 수정 보존).
            const aliasName = cleanText(person.localAlias);

            const counterpartUserId =
              (acceptedInvite?.acceptedPersonId ??
                inviterInvite?.inviterUserId ??
                counterpartId) ||
              undefined;

            const linkAcceptedAt =
              acceptedInvite?.acceptedAt ?? inviterInvite?.acceptedAt ?? now;

            return {
              ...person,
              // 표시 이름 우선순위: alias > remote > 기존.
              // remoteName 이 비어 있으면 기존 이름을 지우지 않는다.
              name: aliasName || remoteName || person.name,
              remoteProfileName:
                remoteName || person.remoteProfileName || undefined,
              isJoined: true,
              userId: counterpartUserId,
              dlUserId: counterpartUserId,
              acceptedPersonId: counterpartUserId,
              lastContactAt: person.lastContactAt ?? linkAcceptedAt,
            };
          });

          const mergedInviteDrafts = new Map<string, InviteDraft>();

          for (const item of state.inviteDrafts) {
            mergedInviteDrafts.set(item.token, item);
          }

          for (const item of normalizedRows) {
            const existing = mergedInviteDrafts.get(item.token);

            mergedInviteDrafts.set(item.token, {
              ...(existing ?? item),
              ...item,
              provisionalPersonId:
                existing?.provisionalPersonId ||
                item.sourcePersonId ||
                item.provisionalPersonId,
              status: "accepted",
              inviterUserId: item.inviterUserId ?? existing?.inviterUserId ?? null,
              inviterName: item.inviterName ?? existing?.inviterName ?? null,
              acceptedAt: item.acceptedAt ?? existing?.acceptedAt ?? now,
              acceptedPersonId:
                item.acceptedPersonId ?? existing?.acceptedPersonId ?? null,
              acceptedPersonName:
                item.acceptedPersonName ?? existing?.acceptedPersonName ?? null,
            });
          }

          const existingKeys = new Set(
            updatedPeople.map((person) => {
              const extended = person as DashboardPerson & Record<string, unknown>;
              const storedUserId = getStoredUserId(extended);
              const nameKey = normalizePersonName(person.name);
              return storedUserId
                ? `user:${storedUserId}`
                : nameKey
                  ? `name:${nameKey}`
                  : `id:${person.id}`;
            }),
          );

          const missingAcceptedPeople = normalizedRows
            .filter((item) => item.status === "accepted")
            .filter(
              (item) =>
                !item.acceptedPersonId ||
                item.acceptedPersonId !== currentUserId,
            )
            .map((item) => {
              // 자기 자신이 acceptedPerson인 케이스는 이미 위 filter에서
              // 제외되지만, 안전망으로 self 우선 readMeProfileName() 사용.
              // placeholder는 더 이상 사용하지 않는다 — 자기 me 이름 또는
              // snapshot 이름(acceptedPersonName/inviteeName)으로 fallback.
              const acceptedUserId = cleanText(item.acceptedPersonId);
              const isSelf =
                Boolean(acceptedUserId) && acceptedUserId === deviceUserId;
              const acceptedName =
                (isSelf ? readMeProfileName() : "") ||
                cleanText(item.acceptedPersonName) ||
                cleanText(item.inviteeName) ||
                "";
              const key = acceptedUserId
                ? `user:${acceptedUserId}`
                : `name:${normalizePersonName(acceptedName)}`;

              if (existingKeys.has(key)) {
                return null;
              }

              existingKeys.add(key);

              const nextPerson = buildAddedPerson({
                name: acceptedName,
                tier: item.tier,
                relationshipType: item.relationshipType,
                roleLabel:
                  item.relationshipLabel ||
                  getDefaultRelationshipLabel(item.relationshipType),
              });

              return {
                ...nextPerson,
                id: item.sourcePersonId || nextPerson.id,
                isJoined: true,
                userId: acceptedUserId || undefined,
                dlUserId: acceptedUserId || undefined,
                acceptedPersonId: acceptedUserId || undefined,
                remoteProfileName: acceptedName || undefined,
                lastContactAt: item.acceptedAt ?? now,
                lastContactedAt: item.acceptedAt ?? now,
              } as DashboardPerson;
            })
            .filter((item): item is DashboardPerson => Boolean(item));

          const inviterPeople = normalizedRows
            .filter((item) => item.status === "accepted")
            .filter(
              (item) =>
                item.acceptedPersonId &&
                item.acceptedPersonId === currentUserId,
            )
            .filter(
              (item) =>
                !item.inviterUserId || item.inviterUserId !== currentUserId,
            )
            .filter(
              (item) =>
                cleanText(item.inviterUserId) || cleanText(item.inviterName),
            )
            .map((item) => {
              // 자기 자신이 inviter인 케이스는 위 filter에서 제외되지만,
              // 안전망으로 self 우선 readMeProfileName() 사용. placeholder는
              // 더 이상 사용하지 않는다 — snapshot 이름이 비어있으면 빈
              // 문자열로 두고, /api/invites/refresh-name 호출 이후의
              // 다음 sync에서 회복된다.
              const inviterUserId = cleanText(item.inviterUserId);
              const isSelf =
                Boolean(inviterUserId) && inviterUserId === deviceUserId;
              const inviterName =
                (isSelf ? readMeProfileName() : "") ||
                cleanText(item.inviterName) ||
                "";
              const key = inviterUserId
                ? `user:${inviterUserId}`
                : `name:${normalizePersonName(inviterName)}`;

              if (existingKeys.has(key)) {
                return null;
              }

              existingKeys.add(key);

              const nextPerson = buildAddedPerson({
                name: inviterName,
                tier: item.tier,
                relationshipType: item.relationshipType,
                roleLabel:
                  item.relationshipLabel ||
                  getDefaultRelationshipLabel(item.relationshipType),
              });

              return {
                ...nextPerson,
                isJoined: true,
                userId: inviterUserId || undefined,
                dlUserId: inviterUserId || undefined,
                acceptedPersonId: inviterUserId || undefined,
                remoteProfileName: inviterName || undefined,
                lastContactAt: item.acceptedAt ?? now,
                lastContactedAt: item.acceptedAt ?? now,
              } as DashboardPerson;
            })
            .filter((item): item is DashboardPerson => Boolean(item));

          const dedupedPeople = dedupePeopleByIdentity([
            ...updatedPeople,
            ...missingAcceptedPeople,
            ...inviterPeople,
          ]);

          const cleanedPeople = deviceUserId
            ? dedupedPeople.filter(
                (person) =>
                  getStoredUserId(
                    person as DashboardPerson & Record<string, unknown>,
                  ) !== deviceUserId,
              )
            : dedupedPeople;

          const nextChannels = buildChannelState(cleanedPeople);

          return {
            people: cleanedPeople,
            availableChannels: nextChannels.availableChannels,
            preferredChannels: nextChannels.preferredChannels,
            inviteDrafts: Array.from(mergedInviteDrafts.values()).sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          };
        });
      },

      acceptInvite: (input) => {
        const token = input.token.trim();
        const invite = get().inviteDrafts.find((item) => item.token === token);

        if (!invite) {
          return {
            ok: false,
            message: "유효한 초대 링크를 찾지 못했어요.",
          };
        }

        if (invite.status === "accepted" && invite.acceptedPersonId) {
          return {
            ok: false,
            message: "이미 입력이 완료된 초대 링크예요.",
          };
        }

        const trimmedName = cleanText(input.name);

        if (!trimmedName) {
          return {
            ok: false,
            message: "이름은 꼭 입력해 주세요.",
          };
        }

        const acceptedUserId = getCurrentUserId();

        const nextPerson = buildAddedPerson({
          name: trimmedName,
          tier: invite.tier,
          relationshipType: invite.relationshipType,
          roleLabel: invite.relationshipLabel,
          relationshipDetail: cleanText(input.relationshipDetail),
          affiliationPrimary: cleanText(input.affiliationPrimary),
          affiliationSecondary: cleanText(input.affiliationSecondary),
          phone: cleanText(input.phone),
          kakaoTalkUrl: cleanText(input.kakaoTalkUrl),
          whatsappPhone: cleanText(input.whatsappPhone),
          telegramUsername: cleanText(input.telegramUsername),
          lineId: cleanText(input.lineId),
          instagramUsername: cleanText(input.instagramUsername),
          messengerUsername: cleanText(input.messengerUsername),
          note: cleanText(input.note),
        });

        const joinedPerson = {
          ...nextPerson,
          isJoined: true,
          userId: acceptedUserId,
          dlUserId: acceptedUserId,
          acceptedPersonId: acceptedUserId,
          lastContactAt: nextPerson.lastContactAt ?? new Date().toISOString(),
        } as DashboardPerson;

        const nextPeople = [...get().people, joinedPerson];
        const nextChannels = buildChannelState(nextPeople);

        set((state) => ({
          people: nextPeople,
          availableChannels: nextChannels.availableChannels,
          preferredChannels: nextChannels.preferredChannels,
          inviteDrafts: state.inviteDrafts.map((item) =>
            item.token === token
              ? {
                  ...item,
                  status: "accepted",
                  acceptedAt: new Date().toISOString(),
                  acceptedPersonId: acceptedUserId,
                  acceptedPersonName: nextPerson.name,
                }
              : item,
          ),
        }));

        return {
          ok: true,
          personId: nextPerson.id,
          personName: nextPerson.name,
        };
      },
    }),
    {
      name: "dunbar-link-dashboard-people-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        people: state.people,
        quickNotes: state.quickNotes,
        availableChannels: state.availableChannels,
        preferredChannels: state.preferredChannels,
        inviteDrafts: state.inviteDrafts,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // persist 된 stale 중복 pending invite(같은 sourcePersonId 다중)를
        // hydration 시 1회 정리. 새 token 생성 없이 가장 최근 1개만 남긴다.
        const deduped = dedupePendingInviteDraftsBySource(state.inviteDrafts);
        if (deduped !== state.inviteDrafts) {
          state.setInviteDrafts(deduped);
        }

        state.setHasHydrated(true);
      },
    },
  ),
);

export const usePersonStore = usePeopleStore;
