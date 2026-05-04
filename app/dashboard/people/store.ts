"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/auth/current-user";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  AddDashboardPersonInput,
  buildAddedPerson,
  DashboardPerson,
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
  acceptedAt: string | null;
  acceptedPersonId: string | null;
  acceptedPersonName: string | null;
  status: InviteDraftStatus;
};

export type CreateInviteDraftInput = {
  inviteeName?: string;
  sourcePersonId?: string | null;
  tier: AddDashboardPersonInput["tier"];
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
  relationshipType?: RelationshipType | null;
  relationship_type?: RelationshipType | null;
  relationshipLabel?: string | null;
  relationship_label?: string | null;
  inviterNote?: string | null;
  inviter_note?: string | null;
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
    value === "etc"
  ) {
    return value;
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
        const token = generateInviteToken();
        const relationshipType = input.relationshipType;
        const relationshipLabel =
          cleanText(input.relationshipLabel) ||
          getDefaultRelationshipLabel(relationshipType);

        const draft: InviteDraft = {
          token,
          provisionalPersonId: buildProvisionalPersonId(token),
          createdAt: new Date().toISOString(),
          invitePath: `/invite/${token}`,
          inviteeName: cleanText(input.inviteeName),
          sourcePersonId: input.sourcePersonId?.trim() || null,
          tier: input.tier,
          relationshipType,
          relationshipLabel,
          inviterNote: cleanText(input.inviterNote),
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
        const supabase = createClient();

        const { data, error } = await supabase
          .from("dl_invites")
          .select(
            "token, invite_path, invitee_name, source_person_id, tier, relationship_type, relationship_label, inviter_note, accepted_at, accepted_person_id, accepted_person_name, status, created_at",
          )
          .eq("status", "accepted");

        if (error) {
          console.warn("초대 수락 상태 동기화 실패:", error.message);
          return;
        }

        const normalizedRows = ((data ?? []) as RemoteInviteDraftLike[])
          .map((row) => normalizeRemoteInviteDraft(row))
          .filter((item): item is InviteDraft => Boolean(item));

        if (normalizedRows.length === 0) return;

        set((state) => {
          const now = new Date().toISOString();

          const updatedPeople = state.people.map((person) => {
            const extended = person as DashboardPerson &
              Record<string, unknown>;
            const currentUserId = getStoredUserId(extended);
            const personName = normalizePersonName(person.name);

            const matchedInvite = normalizedRows.find((item) => {
              if (item.sourcePersonId && item.sourcePersonId === person.id)
                return true;
              if (
                item.acceptedPersonId &&
                item.acceptedPersonId === currentUserId
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

            if (!matchedInvite) {
              return person;
            }

            return {
              ...person,
              isJoined: true,
              userId:
                (matchedInvite.acceptedPersonId ?? currentUserId) || undefined,
              dlUserId:
                (matchedInvite.acceptedPersonId ?? currentUserId) || undefined,
              acceptedPersonId:
                (matchedInvite.acceptedPersonId ?? currentUserId) || undefined,
              lastContactAt:
                person.lastContactAt ?? matchedInvite.acceptedAt ?? now,
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
              acceptedAt: item.acceptedAt ?? existing?.acceptedAt ?? now,
              acceptedPersonId:
                item.acceptedPersonId ?? existing?.acceptedPersonId,
              acceptedPersonName:
                item.acceptedPersonName ?? existing?.acceptedPersonName,
            });
          }

          const dedupedPeople = dedupePeopleByIdentity(updatedPeople);
          const nextChannels = buildChannelState(dedupedPeople);

          return {
            people: dedupedPeople,
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
        state?.setHasHydrated(true);
      },
    },
  ),
);

export const usePersonStore = usePeopleStore;
