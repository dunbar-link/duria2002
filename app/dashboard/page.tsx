"use client";

import { subscribePushForUser } from "@/lib/push/push-client";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { writeMeProfileNameIfEmpty } from "@/lib/me/profile-name";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function canUseBrowserNotification() {
  return typeof window !== "undefined" && "Notification" in window;
}

async function ensureNotificationPermission() {
  if (!canUseBrowserNotification()) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

function showSignalNotification() {
  if (!canUseBrowserNotification()) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  new Notification("새 신호가 도착했어요", {
    body: "던바링크에서 확인해요.",
    icon: "/favicon.ico",
  });
}

import {
  markSignalsReadFromSender,
  readUnreadSignalCount,
} from "@/lib/signal/read-signals";
import Link from "next/link";
import { sendSignal } from "@/lib/signal/send-signal";
import HomeRecommendationList from "./_components/recommendation/HomeRecommendationList";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardHomeHeader from "./_components/dashboard-home-header";
import DashboardHomeShell from "./_components/dashboard-home-shell";
import HomeLayerSection from "./_components/home/home-layer-section";
import FolderBottomSheet from "./_components/home/folder-bottom-sheet";
import LayerBottomSheet from "./_components/home/layer-bottom-sheet";
import LayerStrip from "./_components/home/layer-strip";
import HomeConnectableSearchSheet from "./_components/home/home-connectable-search-sheet";
import SignalBottomSheet from "./_components/home/signal-bottom-sheet";
import {
  CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY,
  CONNECTABLE_SOURCE_LAYER_ID,
  STORAGE_KEY,
  type ConnectableCandidateStateMap,
  type FolderMap,
  type LayerLayoutState,
  buildDynamicConnectableEntityId,
  layerBlueprints,
  personCatalog,
} from "./_components/home/home-page-types";
import {
  createInitialLayoutState,
  findEntityLocation,
  getEntityLabel,
  getHomeLayerDerivedStateMap,
  getSuppressedConnectableEntityIds,
  insertExternalEntityToTarget,
  isPersonEntityId,
  markConnectableCandidateAddedToLayer,
  markConnectableCandidateDeferred,
  markConnectableCandidateDismissed,
  markConnectableCandidateExplored,
  moveEntityToTarget,
  readConnectableCandidateStateMap,
  writeConnectableCandidateStateMap,
} from "./_components/home/home-page-utils";
import { useFolderLongPressDrag } from "./_components/home/use-folder-long-press-drag";
import { useHomeDragDrop } from "./_components/home/use-home-drag-drop";
import { useHomeFolderInteractions } from "./_components/home/use-home-folder-interactions";
import { useHomeLayerSheet } from "./_components/home/use-home-layer-sheet";
import { useHomeLayoutStorage } from "./_components/home/use-home-layout-storage";
import HomeMoveMenu from "./_components/home-move-menu";
import type { ConnectableCandidate } from "./_components/home/connectable-candidate-types";
import { usePeopleStore, type InviteDraft } from "./people/store";

import { setRelationshipActionStarted } from "./people/relationship-status";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

const PENDING_EXPLORE_STORAGE_KEY = "dunbar-link-pending-explore-v1";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;
const DEFER_DURATION_MS = 60 * 60 * 1000;
const HOME_ONBOARDING_STORAGE_KEY = "dunbar-link-home-onboarding-dismissed-v1";

const HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY =
  "dunbar-link-home-blue-signal-senders-v1";
const HOME_BLUE_SIGNAL_CHANGE_EVENT = "dunbar-link-blue-signals-changed";

const HOME_RED_ACTION_DISMISSED_STORAGE_KEY =
  "dunbar-link-home-red-action-dismissed-v1";

const PENDING_INVITE_STORAGE_KEY = "dunbar-link-pending-invite-token";
const LEGACY_PENDING_INVITE_STORAGE_KEY = "dl_invite_token";
const PENDING_INVITE_META_STORAGE_KEY = "dunbar-link-pending-invite-meta";

function readRedActionDismissedMap() {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }

  try {
    const raw = window.localStorage.getItem(
      HOME_RED_ACTION_DISMISSED_STORAGE_KEY,
    );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const next: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === "string" && typeof value === "string") {
        next[key] = value;
      }
    }

    return next;
  } catch {
    return {};
  }
}

function writeRedActionDismissedMap(value: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    HOME_RED_ACTION_DISMISSED_STORAGE_KEY,
    JSON.stringify(value),
  );
}

function parseTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getCareCadenceDays(tier: number) {
  if (tier <= 1) return 3;
  if (tier <= 5) return 3;
  if (tier <= 15) return 7;
  if (tier <= 50) return 14;
  return 30;
}

function isDismissedAfter(
  personId: string,
  dismissedMap: Record<string, string>,
  basisTime: number,
) {
  const dismissedTime = parseTime(dismissedMap[personId]);
  return dismissedTime > 0 && dismissedTime >= basisTime;
}

function readBlueSignalSenderIds() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(
      HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY,
    );
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      ),
    );
  } catch {
    return [] as string[];
  }
}

function writeBlueSignalSenderIds(senderIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  const uniqueIds = Array.from(
    new Set(senderIds.map((item) => item.trim()).filter(Boolean)),
  );

  window.localStorage.setItem(
    HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY,
    JSON.stringify(uniqueIds),
  );

  window.setTimeout(() => {
    window.dispatchEvent(new Event(HOME_BLUE_SIGNAL_CHANGE_EVENT));
  }, 0);
}

function readPendingInviteToken() {
  if (typeof window === "undefined") {
    return "";
  }

  const primary = window.localStorage
    .getItem(PENDING_INVITE_STORAGE_KEY)
    ?.trim();
  const legacy = window.localStorage
    .getItem(LEGACY_PENDING_INVITE_STORAGE_KEY)
    ?.trim();

  return primary || legacy || "";
}

function clearPendingInviteToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_PENDING_INVITE_STORAGE_KEY);
  window.localStorage.removeItem(PENDING_INVITE_META_STORAGE_KEY);
}

function getInviteeNameFromRow(row: Record<string, unknown>) {
  const acceptedName =
    typeof row.accepted_person_name === "string"
      ? row.accepted_person_name.trim()
      : "";
  const inviteeName =
    typeof row.invitee_name === "string" ? row.invitee_name.trim() : "";

  return acceptedName || inviteeName || "초대받은 사람";
}

function getTierByLayerId(layerId: string): 1 | 5 | 15 | 50 | 150 {
  if (layerId === "family") return 1;
  if (layerId === "core") return 5;
  if (layerId === "intimate") return 15;
  if (layerId === "trust") return 50;
  return 150;
}


function normalizeInviteTier(tier: number): 1 | 5 | 15 | 50 | 150 {
  if (tier === 1) return 1;
  if (tier === 5) return 5;
  if (tier === 15) return 15;
  if (tier === 50) return 50;
  return 150;
}

function getLayerLabelById(layerId: string): string {
  if (layerId === "family") return "가족";
  if (layerId === "core") return "핵심";
  if (layerId === "intimate") return "신뢰";
  if (layerId === "trust") return "친밀";
  return "친근";
}

function getInitialsFromName(name: string) {
  const trimmed = name.trim();

  if (!trimmed) {
    return "?";
  }

  if (trimmed.length === 1) {
    return trimmed;
  }

  return trimmed.slice(0, 2);
}

function registerAddedPersonToHomeCatalog(person: {
  id: string;
  name: string;
}) {
  personCatalog[person.id] = {
    id: person.id,
    initials: getInitialsFromName(person.name),
    canonicalName: person.name,
    myAlias: person.name,
    profileHref: `/dashboard/people/${person.id}`,
    type: "person",
  };
}



function HomeOnboardingOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="온보딩 닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/36"
      />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="mx-auto w-full max-w-md px-4 pb-24">
          <div className="pointer-events-auto rounded-t-[32px] bg-white px-5 pb-6 pt-5 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />

            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Start
            </p>

            <h2 className="mt-3 text-[24px] font-semibold leading-[1.3] tracking-tight text-slate-900">
              가까운 사람부터
              <br />하나씩 넣어볼까요?
            </h2>

            <div className="mt-5 grid gap-2.5">
              <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-slate-900">
                  1. 내 이름과 사진을 먼저 정해요
                </p>
              </div>

              <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-slate-900">
                  2. 챙기고 싶은 사람을 추가해요
                </p>
              </div>

              <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-slate-900">
                  3. 가볍게 신호를 보내봐요
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 flex h-[48px] w-full items-center justify-center rounded-[18px] bg-slate-900 text-[14px] font-semibold text-white"
            >
              시작하기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AddPersonSheet({
  open,
  layerId,
  value,
  onChange,
  onClose,
  onAddOnly,
}: {
  open: boolean;
  layerId: string | null;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onAddOnly: () => void;
}) {
  if (!open || !layerId) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="사람 추가 닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/36"
      />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="mx-auto w-full max-w-md px-4 pb-24">
          <div className="pointer-events-auto rounded-t-[32px] bg-white px-5 pb-6 pt-5 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />

            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Add
            </p>

            <h2 className="mt-3 text-[24px] font-semibold leading-[1.3] tracking-tight text-slate-900">
              {getLayerLabelById(layerId)}에
              <br />
              사람 넣기
            </h2>

            <div className="mt-5">
              <label className="text-[13px] font-semibold text-slate-700">
                이름
              </label>

              <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddOnly();
                  }
                }}
                placeholder="예: 민수"
                className="mt-2 h-[52px] w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none focus:border-slate-400"
                autoFocus
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={onAddOnly}
                className="flex h-[48px] w-full items-center justify-center rounded-[18px] bg-slate-900 text-[14px] font-semibold text-white"
              >
                이름만 넣기
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex h-[48px] w-full items-center justify-center rounded-[18px] border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function getInviteStatusMeta(draft: InviteDraft | null) {
  if (!draft) {
    return {
      badge: "초대 전",
      badgeClass: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
      title: "아직 초대 전",
      body: "초대 링크를 만들 수 있어요.",
    };
  }

  if (draft.status === "accepted") {
    return {
      badge: "가입 완료",
      badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      title: "가입 완료",
      body: draft.acceptedPersonName
        ? `${draft.acceptedPersonName} 님이 입력했어요.`
        : "입력이 완료되었어요.",
    };
  }

  return {
    badge: "초대 보냄",
    badgeClass: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    title: "설치 대기 중",
    body: "같은 링크를 다시 보낼 수 있어요.",
  };
}

function buildAcceptedInviteDraftFromPerson(
  person: Record<string, unknown>,
): InviteDraft | null {
  const personId = typeof person.id === "string" ? person.id : "";
  const name = typeof person.name === "string" ? person.name : "";
  const isJoined = person.isJoined === true;
  const acceptedPersonId =
    typeof person.userId === "string"
      ? person.userId
      : typeof person.dlUserId === "string"
        ? person.dlUserId
        : typeof person.acceptedPersonId === "string"
          ? person.acceptedPersonId
          : null;

  if (!personId || !name || !isJoined) {
    return null;
  }

  return {
    token: `accepted-${personId}`,
    provisionalPersonId: `accepted-${personId}`,
    createdAt: new Date().toISOString(),
    invitePath: "",
    inviteeName: name,
    sourcePersonId: personId,
    tier: (typeof person.tier === "number"
      ? person.tier
      : 50) as InviteDraft["tier"],
    relationshipType: "friend",
    relationshipLabel: "친구",
    inviterNote: "",
    inviterUserId: null,
    inviterName: null,
    acceptedAt: new Date().toISOString(),
    acceptedPersonId,
    acceptedPersonName: name,
    status: "accepted",
  };
}

function HomePersonActionSheet({
  open,
  person,
  inviteDraft,
  feedback,
  onClose,
  onOpenDetail,
  onSendInvite,
  onCheckInviteStatus,
  onOpenSignal,
  onRemoveFromHome,
  onResetLocalData,
}: {
  open: boolean;
  person: { id: string; name: string } | null;
  inviteDraft: InviteDraft | null;
  feedback: string;
  onClose: () => void;
  onOpenDetail: () => void;
  onSendInvite: () => void;
  onCheckInviteStatus: () => void;
  onOpenSignal: () => void;
  onRemoveFromHome: () => void;
  onResetLocalData: () => void;
}) {
  if (!open || !person) {
    return null;
  }

  const statusMeta = getInviteStatusMeta(inviteDraft);
  const isConnected = inviteDraft?.status === "accepted";

  return (
    <>
      <button
        type="button"
        aria-label="사람 액션 닫기"
        onClick={onClose}
        className="fixed inset-0 z-[74] bg-slate-900/36"
      />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[75]">
        <div className="mx-auto w-full max-w-md px-4 pb-24">
          <div className="pointer-events-auto rounded-t-[32px] bg-white px-5 pb-6 pt-5 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />

            <div className="mt-1 flex items-center gap-[10px]">
              <div className="flex h-[50px] w-[50px] items-center justify-center rounded-[16px] border border-slate-300/90 bg-slate-50 text-[16px] font-semibold text-slate-800">
                {getInitialsFromName(person.name)}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[22px] font-semibold leading-[1.2] tracking-tight text-slate-900">
                  {person.name}
                </h2>

                <div className="mt-[6px]">
                  <span
                    className={`rounded-full px-[10px] py-[6px] text-[11px] font-semibold ${statusMeta.badgeClass}`}
                  >
                    {statusMeta.badge}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[13px] font-semibold text-slate-800">
              {statusMeta.title}
            </p>
            <p className="mt-1 text-[13px] leading-[1.55] text-slate-600">
              {statusMeta.body}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3">
              {isConnected ? (
                <button
                  type="button"
                  onClick={onOpenSignal}
                  className="flex h-[48px] w-full items-center justify-center rounded-[18px] bg-slate-900 text-[14px] font-semibold text-white"
                >
                  신호 보내기
                </button>
              ) : null}

              <button
                type="button"
                onClick={onOpenDetail}
                className={`flex h-[48px] w-full items-center justify-center rounded-[18px] text-[14px] font-semibold ${
                  isConnected
                    ? "border border-slate-200 bg-white text-slate-700"
                    : "bg-slate-900 text-white"
                }`}
              >
                상세 보기
              </button>

              {!isConnected ? (
                <button
                  type="button"
                  onClick={onSendInvite}
                  className="flex h-[48px] w-full items-center justify-center rounded-[18px] border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
                >
                  초대 보내기
                </button>
              ) : null}

              <button
                type="button"
                onClick={onCheckInviteStatus}
                className="flex h-[48px] w-full items-center justify-center rounded-[18px] border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
              >
                가입 상태 확인
              </button>

              <button
                type="button"
                onClick={onRemoveFromHome}
                className="flex h-[48px] w-full items-center justify-center rounded-[18px] border border-rose-200 bg-rose-50 text-[14px] font-semibold text-rose-700"
              >
                홈에서 제거
              </button>

              <button
                type="button"
                onClick={onResetLocalData}
                className="flex h-[42px] w-full items-center justify-center rounded-[16px] border border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-500"
              >
                로컬 친구 데이터 전체 초기화
              </button>
            </div>

            {feedback ? (
              <div className="mt-4 rounded-[16px] bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                {feedback}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  async function handleEnableNotification() {
    const userId = getCurrentUserId();
    const success = await subscribePushForUser(userId);
    setNotificationEnabled(success);
  }

  const router = useRouter();
  const people = usePeopleStore((state) => state.people);
  const addPerson = usePeopleStore((state) => state.addPerson);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const createInviteDraft = usePeopleStore((state) => state.createInviteDraft);
  const markContacted = usePeopleStore((state) => state.markContacted);
  const removePerson = usePeopleStore((state) => state.removePerson);
  const resetPeopleState = usePeopleStore((state) => state.resetPeopleState);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);

  const syncAcceptedInvitesToPeople = usePeopleStore(
    (state) => state.syncAcceptedInvitesToPeople,
  );

  const [layoutState, setLayoutState] = useState<
    Record<string, LayerLayoutState>
  >(() => createInitialLayoutState());
  const [folders, setFolders] = useState<FolderMap>({});

  const { storageReady } = useHomeLayoutStorage({
    layoutState,
    folders,
    setLayoutState,
    setFolders,
  });

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const validPersonIds = new Set(people.map((person) => person.id));

    function isValidLayoutEntity(entityId: string | null) {
      if (!entityId) {
        return false;
      }

      if (entityId === "family-me") {
        return true;
      }

      if (entityId.startsWith("folder-")) {
        return true;
      }

      return validPersonIds.has(entityId);
    }

    setLayoutState((current) => {
      let changed = false;
      const next: Record<string, LayerLayoutState> = {};

      for (const [layerId, layer] of Object.entries(current)) {
        const nextVisibleSlotIds = layer.visibleSlotIds.map((entityId) => {
          if (!entityId) {
            return null;
          }

          if (isValidLayoutEntity(entityId)) {
            return entityId;
          }

          changed = true;
          return null;
        });

        const nextHiddenSlotIds = layer.hiddenSlotIds.filter((entityId) => {
          const keep = isValidLayoutEntity(entityId);
          if (!keep) {
            changed = true;
          }
          return keep;
        });

        next[layerId] = {
          ...layer,
          visibleSlotIds: nextVisibleSlotIds,
          hiddenSlotIds: nextHiddenSlotIds,
        };
      }

      return changed ? next : current;
    });

    setFolders((current) => {
      let changed = false;
      const next: FolderMap = {};

      for (const [folderId, folder] of Object.entries(current)) {
        const nextMemberIds = folder.memberIds.filter((memberId) => {
          const keep = isValidLayoutEntity(memberId);
          if (!keep) {
            changed = true;
          }
          return keep;
        });

        next[folderId] = {
          ...folder,
          memberIds: nextMemberIds,
        };
      }

      return changed ? next : current;
    });
  }, [people, hasHydrated, setLayoutState, setFolders]);

  
useEffect(() => {
  function handleBlueSignalUpdate() {
    const ids = readBlueSignalSenderIds();
    setBlueSignalSenderIds(ids);
  }

  window.addEventListener(
    HOME_BLUE_SIGNAL_CHANGE_EVENT,
    handleBlueSignalUpdate,
  );

  return () => {
    window.removeEventListener(
      HOME_BLUE_SIGNAL_CHANGE_EVENT,
      handleBlueSignalUpdate,
    );
  };
}, []);



useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    void syncAcceptedInvitesToPeople();
  }, [hasHydrated, syncAcceptedInvitesToPeople]);

 useEffect(() => {
  if (!hasHydrated) return;

  let cancelled = false;

  async function acceptPendingInviteToken() {
    const pendingToken = readPendingInviteToken();
    if (!pendingToken) return;

    const acceptedPersonId = getCurrentUserId();
    const acceptedAt = new Date().toISOString();

    try {
      const inviteRes = await fetch(`/api/invites/${encodeURIComponent(pendingToken)}`);

      if (cancelled) return;

      if (!inviteRes.ok) {
        console.warn("보류 초대 토큰 확인 실패:", inviteRes.status);
        return;
      }

      const inviteRow = (await inviteRes.json()) as Record<string, unknown>;

      const acceptedPersonName = getInviteeNameFromRow(
        inviteRow as Record<string, unknown>,
      );

      if ((inviteRow as Record<string, unknown>).status !== "accepted") {
        try {
          const acceptRes = await fetch("/api/invites/accept", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              token: pendingToken,
              acceptedPersonId,
              acceptedPersonName,
              acceptedAt,
            }),
          });

          if (cancelled) {
            return;
          }

          if (!acceptRes.ok) {
            console.warn("보류 초대 자동 수락 실패:", acceptRes.status);
            return;
          }

          const acceptData = (await acceptRes.json()) as {
            ok?: boolean;
          };

          if (!acceptData.ok) {
            console.warn("보류 초대 자동 수락 실패: ok=false");
            return;
          }
        } catch (acceptError) {
          console.warn("보류 초대 자동 수락 실패:", acceptError);
          return;
        }
      }

      // 🔥 여기부터 중요
      writeMeProfileNameIfEmpty(acceptedPersonName);

      clearPendingInviteToken();

      await syncAcceptedInvitesToPeople();

      const connectedPerson = people.find(
        (p) => p.name.trim() === acceptedPersonName.trim(),
      );

      if (connectedPerson) {
        markContacted(connectedPerson.id);
        dismissRedActionForPerson(connectedPerson.id);

        if (personCatalog[connectedPerson.id]) {
          personCatalog[connectedPerson.id].urgent = false;
        }
      }
    } catch (error) {
      console.warn("보류 초대 자동 연결 실패:", error);
    }
  }

  acceptPendingInviteToken();

  return () => {
    cancelled = true;
  };
}, [hasHydrated, people, syncAcceptedInvitesToPeople]);

  const [connectableStateMap, setConnectableStateMap] =
    useState<ConnectableCandidateStateMap>({});
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [selectedHomePersonId, setSelectedHomePersonId] = useState<
    string | null
  >(null);
  const [signalOpen, setSignalOpen] = useState(false);
  const [signalTarget, setSignalTarget] = useState<{
    id: string;
    personId: string;
    name: string;
  } | null>(null);

  const [signalCount, setSignalCount] = useState(0);

  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [blueSignalSenderIds, setBlueSignalSenderIds] = useState<string[]>([]);
  const [redActionDismissedMap, setRedActionDismissedMap] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!canUseBrowserNotification()) {
      return;
    }

    setNotificationEnabled(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    setBlueSignalSenderIds(readBlueSignalSenderIds());
    setRedActionDismissedMap(readRedActionDismissedMap());
  }, []);

  const [personActionFeedback, setPersonActionFeedback] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [addSheetState, setAddSheetState] = useState<{
    layerId: string;
    index: number;
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const derivedStateMap = useMemo(() => {
    return getHomeLayerDerivedStateMap(layoutState, folders);
  }, [layoutState, folders]);

  const occupiedEntityIds = useMemo<Set<string>>(() => {
  const set = new Set<string>();

  Object.values(layoutState).forEach((layer) => {
    layer.visibleSlotIds.forEach((entityId) => {
      if (typeof entityId === "string") {
        set.add(entityId);
      }
    });

    layer.hiddenSlotIds.forEach((entityId) => {
      if (typeof entityId === "string") {
        set.add(entityId);
      }
    });
  });

  return set;
}, [layoutState]);

  const suppressedConnectableEntityIds = useMemo(() => {
    return getSuppressedConnectableEntityIds(connectableStateMap);
  }, [connectableStateMap]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setConnectableStateMap(readConnectableCandidateStateMap());

    const dismissed = window.localStorage.getItem(HOME_ONBOARDING_STORAGE_KEY);
    if (!dismissed) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    async function loadSignalCount() {
      const userId = getCurrentUserId();
      const count = await readUnreadSignalCount(userId);
      setSignalCount(count);
    }

    void loadSignalCount();
  }, []);

  useEffect(() => {
    const userId = getCurrentUserId();

    const channel = supabase
      .channel(`realtime-signals-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signals",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          console.log("📩 새로운 신호 도착:", payload);

          readUnreadSignalCount(userId).then((count) => {
            setSignalCount(count);
          });

          const row = payload.new as Record<string, unknown>;
          const senderId =
            typeof row.sender_id === "string" ? row.sender_id.trim() : "";

          if (senderId && senderId !== userId) {
            const matchedPerson = people.find((person) => {
              const personRecord = person as Record<string, unknown>;
              const latestInviteDraft =
                inviteDrafts
                  .filter((item) => item.sourcePersonId === person.id)
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
                null;

              return (
                person.id === senderId ||
                personRecord.userId === senderId ||
                personRecord.dlUserId === senderId ||
                personRecord.acceptedPersonId === senderId ||
                latestInviteDraft?.acceptedPersonId === senderId
              );
            });

            const blueId = senderId;

            setBlueSignalSenderIds((current) => {
              const next = Array.from(new Set([...current, blueId]));
              writeBlueSignalSenderIds(next);
              return next;
            });
          }

          showSignalNotification();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "signals",
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          readUnreadSignalCount(userId).then((count) => {
            setSignalCount(count);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inviteDrafts, people]);


  useEffect(() => {
    writeConnectableCandidateStateMap(connectableStateMap);
  }, [connectableStateMap]);

  useEffect(() => {
    // Wait for both Zustand people store rehydration AND useHomeLayoutStorage
    // scrubber commit (storageReady) before running the unplaced-people
    // auto-insert. Otherwise the `folders` closure may still be the initial
    // empty map, causing folder members to be misclassified as unplaced and
    // duplicated into root layer slots (Phase 1.12 race fix).
    if (!hasHydrated || !storageReady) {
      return;
    }

    for (const person of people) {
      registerAddedPersonToHomeCatalog({
        id: person.id,
        name: person.name,
      });
    }

    setLayoutState((current) => {
      const placedEntityIds = new Set<string>();

      for (const layer of Object.values(current)) {
        for (const entityId of layer.visibleSlotIds) {
          if (entityId) {
            placedEntityIds.add(entityId);
          }
        }

        for (const entityId of layer.hiddenSlotIds) {
          if (entityId) {
            placedEntityIds.add(entityId);
          }
        }
      }

      for (const folder of Object.values(folders)) {
        for (const memberId of folder.memberIds) {
          if (memberId) {
            placedEntityIds.add(memberId);
          }
        }
      }

      const unplacedPeople = people.filter(
        (person) => !placedEntityIds.has(person.id),
      );

      if (unplacedPeople.length === 0) {
        return current;
      }

      const next: Record<string, LayerLayoutState> = {};

      for (const [layerId, layer] of Object.entries(current)) {
        next[layerId] = {
          ...layer,
          visibleSlotIds: [...layer.visibleSlotIds],
          hiddenSlotIds: [...layer.hiddenSlotIds],
        };
      }

      const layerIds = Object.keys(next);

      for (const person of unplacedPeople) {
        const targetLayerId =
          layerIds.find(
            (layerId) => getTierByLayerId(layerId) === person.tier,
          ) ?? layerIds[layerIds.length - 1];

        if (!targetLayerId) {
          continue;
        }

        const targetLayer = next[targetLayerId];

        if (!targetLayer) {
          continue;
        }

        const emptyVisibleIndex = targetLayer.visibleSlotIds.findIndex(
          (id) => !id,
        );

        if (emptyVisibleIndex >= 0) {
          targetLayer.visibleSlotIds[emptyVisibleIndex] = person.id;
          continue;
        }

        if (!targetLayer.hiddenSlotIds.includes(person.id)) {
          targetLayer.hiddenSlotIds.push(person.id);
        }
      }

      return next;
    });
  }, [people, hasHydrated, storageReady, folders]);

  const selectedHomePerson = useMemo(() => {
    if (!selectedHomePersonId) {
      return null;
    }

    return people.find((person) => person.id === selectedHomePersonId) ?? null;
  }, [people, selectedHomePersonId]);

  const selectedInviteDraft = useMemo(() => {
    if (!selectedHomePerson) {
      return null;
    }

    const matched = inviteDrafts
      .filter((item) => item.sourcePersonId === selectedHomePerson.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return matched[0] ?? null;
  }, [inviteDrafts, selectedHomePerson]);

  const selectedEffectiveInviteDraft = useMemo(() => {
    if (selectedInviteDraft) {
      return selectedInviteDraft;
    }

    if (!selectedHomePerson) {
      return null;
    }

    return buildAcceptedInviteDraftFromPerson(
      selectedHomePerson as unknown as Record<string, unknown>,
    );
  }, [selectedInviteDraft, selectedHomePerson]);

  const {
    dragState,
    dragOverState,
    specialDropTargetKey,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleDragOverMore,
    handleDropToMore,
    handleDragOverRailLayer,
    handleDropToRailLayer,
    handleDragOverHiddenContainer,
    handleDropToHiddenContainer,
  } = useHomeDragDrop({
    layoutState,
    setLayoutState,
    folders,
    setFolders,
  });

  const isConnectableDragActive = false;

  const {
    openLayer,
    openLayerId,
    sheetVisible,
    handleOpenMore,
    handleCloseMore,
  } = useHomeLayerSheet({});

  const {
    openFolder,
    openFolderTopLayer,
    folderSheetVisible,
    folderDragState,
    folderDragOverState,
    folderMoveMenuState,
    folderMoveEntityLabel,
    folderMoveTargets,
    handleOpenFolder,
    handleCloseFolder,
    handleSaveFolderName,
    handleFolderMemberDragStart,
    handleFolderMemberDragEnd,
    handleFolderMemberDragOver,
    handleFolderMemberDrop,
    handleRequestFolderMoveMenu,
    handleSendMoveMenuToCurrentHome,
    handleSendMoveMenuToCurrentMore,
    handleMoveMenuToLayerHome,
    handleMoveMenuToLayerMore,
    closeFolderMoveMenu,
    moveFolderEntityToLayer,
    hideFolderSheet,
    finishCloseFolderSheet,
  } = useHomeFolderInteractions({
    layoutState,
    setLayoutState,
    folders,
    setFolders,
  });

  const { dragState: folderLongPressDragState, beginDrag: beginFolderLongPressDrag } =
    useFolderLongPressDrag({
      onDrop: ({ folderId, entityId, layerId, area, index }) => {
        console.debug("[DL_FOLDER_DRAG_DEBUG] folder onDrop fire", {
          folderId,
          entityId,
          layerId,
          area,
          index,
        });
        moveFolderEntityToLayer(folderId, entityId, layerId, area, index);
      },
      // Exclude "나"(family-me) slot — and on a small viewport its visible
      // left/right neighbor slots — from drop candidacy during a folder
      // ghost drag. Otherwise a finger that started over the folder's
      // leftmost member can land on a slot adjacent to me and the swap
      // makes it look like the folder member was dropped on me. Hidden
      // (more) area only excludes me's exact slot; adjacency is not
      // meaningful there since it's a separate panel.
      shouldSkipDropTarget: (candidate) => {
        if (typeof candidate.index !== "number") {
          return false;
        }
        const layer = layoutState[candidate.layerId];
        if (!layer) {
          return false;
        }
        const slots =
          candidate.area === "visible"
            ? layer.visibleSlotIds
            : layer.hiddenSlotIds;
        if (slots[candidate.index] === "family-me") {
          return true;
        }
        if (candidate.area === "visible") {
          if (slots[candidate.index - 1] === "family-me") {
            return true;
          }
          if (slots[candidate.index + 1] === "family-me") {
            return true;
          }
        }
        return false;
      },
    });

  const handleFolderLongPressDragStart = useCallback(
    (entityId: string, point: { x: number; y: number }) => {
      if (!openFolder) {
        return;
      }

      const sourceFolderId = openFolder.id;
      const label = getEntityLabel(entityId, folders);

      console.debug("[DL_FOLDER_DRAG_DEBUG] handleFolderLongPressDragStart", {
        entityId,
        sourceFolderId,
        point,
      });

      // Defer the folder sheet's DOM unmount until the ghost drag settles.
      // The sheet animates closed visually (visible=false) but FolderMemberTile
      // stays mounted, keeping the captured/active touch ownership intact.
      // After folderLongPressDragState transitions back to null, the effect
      // below calls finishCloseFolderSheet to complete the unmount.
      hideFolderSheet();
      handleCloseMore();
      beginFolderLongPressDrag({
        entityId,
        sourceFolderId,
        label,
        x: point.x,
        y: point.y,
      });
    },
    [
      beginFolderLongPressDrag,
      folders,
      handleCloseMore,
      hideFolderSheet,
      openFolder,
    ],
  );

  const folderLongPressDragActiveRef = useRef(false);
  useEffect(() => {
    const isActive = Boolean(folderLongPressDragState);
    const wasActive = folderLongPressDragActiveRef.current;
    folderLongPressDragActiveRef.current = isActive;

    console.debug("[DL_FOLDER_DRAG_DEBUG] folderDragState transition", {
      wasActive,
      isActive,
      dragState: folderLongPressDragState,
    });

    if (wasActive && !isActive) {
      console.debug(
        "[DL_FOLDER_DRAG_DEBUG] finishCloseFolderSheet trigger (drag ended)",
      );
      finishCloseFolderSheet();
    }
  }, [folderLongPressDragState, finishCloseFolderSheet]);

  const {
    dragState: layerSheetLongPressDragState,
    beginDrag: beginLayerSheetLongPressDrag,
  } = useFolderLongPressDrag({
    onDrop: ({ entityId, layerId, area, index }) => {
      if (!isPersonEntityId(entityId)) {
        return;
      }

      let didMove = false;

      setLayoutState((current) => {
        const targetLayer = current[layerId];

        if (!targetLayer) {
          return current;
        }

        if (typeof index === "number") {
          const targetSlots =
            area === "visible"
              ? targetLayer.visibleSlotIds
              : targetLayer.hiddenSlotIds;
          if (targetSlots[index] === "family-me") {
            return current;
          }
        }

        const location = findEntityLocation(current, entityId);

        if (!location) {
          return current;
        }

        if (
          location.layerId === layerId &&
          location.area === area &&
          (typeof index !== "number" || location.index === index)
        ) {
          return current;
        }

        didMove = true;

        return moveEntityToTarget(
          current,
          {
            sourceLayerId: location.layerId,
            sourceIndex: location.index,
            entityId,
            sourceArea: location.area,
          },
          layerId,
          area,
          index,
        );
      });

      if (didMove) {
        usePeopleStore.getState().updatePersonTier(entityId, getTierByLayerId(layerId));
      }
    },
  });

  const handleLayerSheetLongPressDragStart = useCallback(
    (entityId: string, point: { x: number; y: number }) => {
      if (!openLayerId) {
        return;
      }

      if (!isPersonEntityId(entityId)) {
        return;
      }

      const label = getEntityLabel(entityId, folders);

      handleCloseMore();
      beginLayerSheetLongPressDrag({
        entityId,
        sourceFolderId: openLayerId,
        label,
        x: point.x,
        y: point.y,
      });
    },
    [
      beginLayerSheetLongPressDrag,
      folders,
      handleCloseMore,
      openLayerId,
    ],
  );

  const {
    dragState: homeMainLongPressDragState,
    beginDrag: beginHomeMainLongPressDrag,
  } = useFolderLongPressDrag({
    onDrop: ({ entityId, layerId, area, index }) => {
      if (!isPersonEntityId(entityId)) {
        return;
      }

      let didMove = false;

      setLayoutState((current) => {
        const targetLayer = current[layerId];

        if (!targetLayer) {
          return current;
        }

        if (typeof index === "number") {
          const targetSlots =
            area === "visible"
              ? targetLayer.visibleSlotIds
              : targetLayer.hiddenSlotIds;
          if (targetSlots[index] === "family-me") {
            return current;
          }
        }

        const location = findEntityLocation(current, entityId);

        if (!location) {
          return current;
        }

        if (
          location.layerId === layerId &&
          location.area === area &&
          (typeof index !== "number" || location.index === index)
        ) {
          return current;
        }

        didMove = true;

        return moveEntityToTarget(
          current,
          {
            sourceLayerId: location.layerId,
            sourceIndex: location.index,
            entityId,
            sourceArea: location.area,
          },
          layerId,
          area,
          index,
        );
      });

      if (didMove) {
        usePeopleStore
          .getState()
          .updatePersonTier(entityId, getTierByLayerId(layerId));
      }
    },
  });

  const handleHomeMainLongPressDragStart = useCallback(
    (entityId: string, point: { x: number; y: number }) => {
      if (!isPersonEntityId(entityId)) {
        return;
      }

      beginHomeMainLongPressDrag({
        entityId,
        sourceFolderId: "home-main",
        label: getEntityLabel(entityId, folders),
        x: point.x,
        y: point.y,
      });
    },
    [beginHomeMainLongPressDrag, folders],
  );

  const handleClosePersonActionSheet = useCallback(() => {
    setSelectedHomePersonId(null);
    setPersonActionFeedback("");
  }, []);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(HOME_ONBOARDING_STORAGE_KEY, "1");
    }
  }, []);

  function handleOpenAddSheet(layerId: string, index: number) {
    setAddSheetState({ layerId, index });
    setPendingName("");
  }

  function handleCloseAddSheet() {
    setAddSheetState(null);
    setPendingName("");
  }

  function handleConfirmAddOnly() {
    if (!addSheetState) {
      return;
    }

    const trimmed = pendingName.trim();

    if (!trimmed) {
      return;
    }

    const targetLayerId = addSheetState.layerId;
    const targetIndex = addSheetState.index;

    const created = addPerson({
      name: trimmed,
      tier: getTierByLayerId(targetLayerId),
      relationshipType: targetLayerId === "family" ? "family" : "friend",
      roleLabel: getLayerLabelById(targetLayerId),
    });

    registerAddedPersonToHomeCatalog(created);

    setLayoutState((current) => {
      const next = { ...current };

      // 🔥 folderId 보호
      for (const layer of Object.values(next)) {
        layer.visibleSlotIds = layer.visibleSlotIds.map((id) =>
          id && id.startsWith("folder-") ? id : id,
        );

        layer.hiddenSlotIds = layer.hiddenSlotIds.map((id) =>
          id && id.startsWith("folder-") ? id : id,
        );
      }

      const target = current[targetLayerId];

      if (!target) {
        return current;
      }

      const nextVisible = [...target.visibleSlotIds];
      nextVisible[targetIndex] = created.id;

      return {
        ...current,
        [targetLayerId]: {
          ...target,
          visibleSlotIds: nextVisible,
        },
      };
    });

    setSelectedHomePersonId(created.id);
    setPersonActionFeedback("사람을 추가했어요.");

    handleCloseAddSheet();
  }

  function handleAddFromSearch(entityId: string, targetLayerId: string) {
    setConnectableStateMap((current) =>
      markConnectableCandidateAddedToLayer(current, {
        entityId,
        targetLayerId,
        targetArea: "visible",
      }),
    );

    setLayoutState((current) => {
      const target = current[targetLayerId];

      if (!target) {
        return current;
      }

      const nextVisibleSlotIds = [...target.visibleSlotIds];
      const emptyIndex = nextVisibleSlotIds.findIndex((slotId) => !slotId);

      if (emptyIndex >= 0) {
        nextVisibleSlotIds[emptyIndex] = entityId;

        return {
          ...current,
          [targetLayerId]: {
            ...target,
            visibleSlotIds: nextVisibleSlotIds,
          },
        };
      }

      if (target.hiddenSlotIds.includes(entityId)) {
        return current;
      }

      return {
        ...current,
        [targetLayerId]: {
          ...target,
          hiddenSlotIds: [...target.hiddenSlotIds, entityId],
        },
      };
    });

    setSearchSheetOpen(false);
  }

  function handleExploreFromSearch(
    entityId: string,
    targetPid: string,
    entityName: string,
  ) {
    setConnectableStateMap((current) =>
      markConnectableCandidateExplored(current, {
        entityId,
        targetPid,
        name: entityName,
        source: "home-connectable-search",
      }),
    );

    try {
      window.sessionStorage.setItem(
        PENDING_EXPLORE_STORAGE_KEY,
        JSON.stringify({
          entityId,
          targetId: entityId,
          targetPid,
          targetName: entityName,
          source: "home-connectable-search",
          requestedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore storage write error
    }

    setSearchSheetOpen(false);

    const params = new URLSearchParams({
      targetId: entityId,
      targetPid,
      targetName: entityName,
      source: "home-connectable-search",
    });

    router.push(`/path?${params.toString()}`);
  }

  function handleExploreRecommendation(candidate: any) {
    const entityId = buildDynamicConnectableEntityId(candidate.pid);

    setConnectableStateMap((current) =>
      markConnectableCandidateExplored(current, {
        entityId,
        targetPid: candidate.pid,
        name: candidate.name,
        source: "home-connectable",
      }),
    );
  }

  function handleDismissCandidate(entityId: string) {
    const untilIsoString = new Date(
      Date.now() + DISMISS_DURATION_MS,
    ).toISOString();

    setConnectableStateMap((current) =>
      markConnectableCandidateDismissed(
        current,
        entityId,
        untilIsoString,
        "home-connectable",
      ),
    );
  }

  function handleDeferCandidate(entityId: string) {
    const untilIsoString = new Date(
      Date.now() + DEFER_DURATION_MS,
    ).toISOString();

    setConnectableStateMap((current) =>
      markConnectableCandidateDeferred(
        current,
        entityId,
        untilIsoString,
        "home-connectable",
      ),
    );
  }

  function removeEntityFromHomeLayout(entityId: string) {
    setLayoutState((current) => {
      const next: Record<string, LayerLayoutState> = {};

      for (const [layerId, layer] of Object.entries(current)) {
        next[layerId] = {
          ...layer,
          visibleSlotIds: layer.visibleSlotIds.map((slotId) =>
            slotId === entityId ? null : slotId,
          ),
          hiddenSlotIds: layer.hiddenSlotIds.filter(
            (slotId) => slotId && slotId !== entityId,
          ),
        };
      }

      return next;
    });

    setFolders((current) => {
      const next: FolderMap = {};

      for (const [folderId, folder] of Object.entries(current)) {
        if (folderId === entityId) {
          continue;
        }

        next[folderId] = {
          ...folder,
          memberIds: folder.memberIds.filter(
            (memberId) => memberId && memberId !== entityId,
          ),
        };
      }

      return next;
    });
  }

  function handleRemoveSelectedHomePerson() {
    if (!selectedHomePerson) {
      return;
    }

    const confirmed = window.confirm(
      `${selectedHomePerson.name}님을 홈과 People에서 제거할까요?\n\n초대/신호 기록은 Supabase DB에 남겨둡니다.`,
    );

    if (!confirmed) {
      return;
    }

    removeEntityFromHomeLayout(selectedHomePerson.id);
    removePerson(selectedHomePerson.id);
    delete personCatalog[selectedHomePerson.id];

    setSelectedHomePersonId(null);
    setSignalOpen(false);
    setSignalTarget(null);
    setPersonActionFeedback("");
  }

  function handleResetLocalFriendTestData() {
    const confirmed = window.confirm(
      "로컬 친구 테스트 데이터를 모두 지울까요?\n\n홈 배치, 폴더, People 목록, 로컬 초대 상태가 초기화됩니다.\nSupabase의 초대/신호 기록은 삭제하지 않습니다.",
    );

    if (!confirmed) {
      return;
    }

    resetPeopleState();
    setLayoutState(createInitialLayoutState());
    setFolders({});
    setSelectedHomePersonId(null);
    setSignalOpen(false);
    setSignalTarget(null);
    setPersonActionFeedback("");
    setConnectableStateMap({});

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(`${STORAGE_KEY}-backup-v1`);
      window.localStorage.removeItem(CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY);
      window.localStorage.removeItem(PENDING_EXPLORE_STORAGE_KEY);
      window.localStorage.removeItem(HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY);
      window.dispatchEvent(new Event(HOME_BLUE_SIGNAL_CHANGE_EVENT));
    }
  }

  function openSignalForPerson(targetPerson: typeof selectedHomePerson) {
    if (!targetPerson) {
      return;
    }

    const latestInviteDraft =
      inviteDrafts
        .filter((item) => item.sourcePersonId === targetPerson.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

    const targetRecord = targetPerson as Record<string, unknown>;
    const receiverUserId =
      typeof targetRecord.userId === "string"
        ? targetRecord.userId
        : typeof targetRecord.dlUserId === "string"
          ? targetRecord.dlUserId
          : typeof targetRecord.acceptedPersonId === "string"
            ? targetRecord.acceptedPersonId
            : latestInviteDraft?.acceptedPersonId ?? null;

    if (!receiverUserId) {
      setPersonActionFeedback(
        "실제 사용자 ID가 아직 연결되지 않았어요. 가입 상태 확인을 먼저 눌러주세요.",
      );
      return;
    }

    setRelationshipActionStarted(targetPerson.id, "copy");
    setSignalTarget({
      id: receiverUserId,
      personId: targetPerson.id,
      name: targetPerson.name,
    });
    setSelectedHomePersonId(null);
    setSignalOpen(true);
  }

  function dismissRedActionForPerson(personId: string) {
    if (!personId.trim()) {
      return;
    }

    const dismissedAt = new Date().toISOString();

    setRedActionDismissedMap((current) => {
      const next = {
        ...current,
        [personId]: dismissedAt,
      };

      writeRedActionDismissedMap(next);
      return next;
    });
  }

  function isRedActionRequiredForPerson(person: (typeof people)[number]) {
    const latestInviteDraft =
      inviteDrafts
        .filter((item) => item.sourcePersonId === person.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

    const personRecord = person as Record<string, unknown>;

    const receiverUserId =
      typeof personRecord.userId === "string"
        ? personRecord.userId
        : typeof personRecord.dlUserId === "string"
          ? personRecord.dlUserId
          : typeof personRecord.acceptedPersonId === "string"
            ? personRecord.acceptedPersonId
            : latestInviteDraft?.acceptedPersonId ?? null;

    const isJoined =
      personRecord.isJoined === true ||
      personRecord.joined === true ||
      personRecord.status === "joined" ||
      personRecord.connectionStatus === "joined" ||
      Boolean(receiverUserId) ||
      latestInviteDraft?.status === "accepted";

    const createdTime = parseTime(personRecord.createdAt);
    const inviteCreatedTime = parseTime(latestInviteDraft?.createdAt);
    const acceptedTime = parseTime(latestInviteDraft?.acceptedAt);
    const lastContactTime = Math.max(
      parseTime(personRecord.lastContactAt),
      parseTime(personRecord.lastContactedAt),
      parseTime(personRecord.last_contact_at),
      parseTime(personRecord.last_contacted_at),
    );

    if (!isJoined && latestInviteDraft) {
      const basisTime = Math.max(inviteCreatedTime, createdTime);
      return !isDismissedAfter(person.id, redActionDismissedMap, basisTime);
    }

    if (isJoined && lastContactTime <= 0) {
      const basisTime = Math.max(acceptedTime, inviteCreatedTime, createdTime);
      return !isDismissedAfter(person.id, redActionDismissedMap, basisTime);
    }

    if (lastContactTime <= 0) {
      return false;
    }

    const cadenceMs = getCareCadenceDays(person.tier) * 24 * 60 * 60 * 1000;
    const dueTime = lastContactTime + cadenceMs;

    if (Date.now() < dueTime) {
      return false;
    }

    return !isDismissedAfter(person.id, redActionDismissedMap, dueTime);
  }

  for (const person of people) {
    personCatalog[person.id] = {
    id: person.id,
    initials: getInitialsFromName(person.name),
    canonicalName: person.name,
    myAlias: person.name,
    profileHref: `/dashboard/people/${person.id}`,
    type: "person",
    urgent:
      isRedActionRequiredForPerson(person) ||
      blueSignalSenderIds.includes(person.id),
    };
  }


  function handleHomePersonClick(entityId: string) {
    if (entityId === "family-me") {
      router.push("/dashboard/me");
      return;
    }

    const targetPerson = people.find((person) => person.id === entityId);

    if (!targetPerson) {
      return;
    }

    const latestInviteDraft =
      inviteDrafts
        .filter((item) => item.sourcePersonId === targetPerson.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

    const targetRecord = targetPerson as Record<string, unknown>;

    const receiverUserId =
      typeof targetRecord.userId === "string"
        ? targetRecord.userId
        : typeof targetRecord.dlUserId === "string"
          ? targetRecord.dlUserId
          : typeof targetRecord.acceptedPersonId === "string"
            ? targetRecord.acceptedPersonId
            : latestInviteDraft?.acceptedPersonId ?? null;

const isJoined =
  targetRecord.isJoined === true ||
  targetRecord.joined === true ||
  targetRecord.status === "joined" ||
  targetRecord.connectionStatus === "joined" ||
  Boolean(receiverUserId) ||
  latestInviteDraft?.status === "accepted";


    // 🔵 파란점: 받은 신호가 있으면 클릭 즉시 읽음 처리 후 바로 답장 신호를 연다.
    if (blueSignalSenderIds.includes(targetPerson.id) && receiverUserId) {
      const currentUserId = getCurrentUserId();

      setSignalTarget({
        id: receiverUserId,
        personId: targetPerson.id,
        name: targetPerson.name,
      });

      setSignalOpen(true);

      setBlueSignalSenderIds((current) => {
        const next = current.filter(
          (id) => id !== targetPerson.id && id !== receiverUserId,
        );
        writeBlueSignalSenderIds(next);
        return next;
      });

      void markSignalsReadFromSender(currentUserId, receiverUserId).then(() => {
        void readUnreadSignalCount(currentUserId).then((count) => {
          setSignalCount(count);
        });
      });

      return;
    }

    
    if (!isJoined) {
      dismissRedActionForPerson(targetPerson.id);

      if (personCatalog[targetPerson.id]) {
        personCatalog[targetPerson.id].urgent = false;
      }

      void handleSendInviteForPerson(targetPerson);
      return;
    }

    markContacted(targetPerson.id);
    dismissRedActionForPerson(targetPerson.id);

    if (personCatalog[targetPerson.id]) {
      personCatalog[targetPerson.id].urgent = false;
    }

    router.push(`/dashboard/people/${targetPerson.id}`);
  }

  async function ensureRemoteInviteDraft(draft: InviteDraft) {
    try {
      const response = await fetch("/api/invites/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: draft.token,
          invitePath: draft.invitePath,
          inviteeName: draft.inviteeName,
          sourcePersonId: draft.sourcePersonId,
          tier: draft.tier,
          relationshipType: draft.relationshipType,
          relationshipLabel: draft.relationshipLabel,
          inviterNote: draft.inviterNote,
          inviterUserId: draft.inviterUserId,
          inviterName: draft.inviterName,
          status: draft.status,
          createdAt: draft.createdAt,
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !result?.ok) {
        console.warn(
          "초대 원격 저장 실패:",
          result?.message ?? response.statusText,
        );
        setPersonActionFeedback(
          "초대 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
        return false;
      }

      return true;
    } catch (error) {
      console.warn("초대 원격 저장 실패:", error);
      setPersonActionFeedback(
        "초대 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );
      return false;
    }
  }

  async function handleSendInviteForPerson(targetPerson: (typeof people)[number]) {
    // 클로즈 베타용 1클릭 초대 UX:
    // 홈 아이콘을 누르면 액션 시트를 거치지 않고 바로 공유창을 연다.
    const draft = createInviteDraft({
      sourcePersonId: targetPerson.id,
      inviteeName: targetPerson.name,
      tier: normalizeInviteTier(targetPerson.tier),
      relationshipType: targetPerson.relationshipType,
    });

    const saved = await ensureRemoteInviteDraft(draft);
    if (!saved) {
      setSelectedHomePersonId(targetPerson.id);
      return;
    }

    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${draft.invitePath}`
        : draft.invitePath;

    const shareTitle = "던바링크 초대";
    const shareText = `${targetPerson.name}님, 던바링크에 들어와서 자기 정보를 입력해줘.\n${inviteUrl}`;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
        });
        setPersonActionFeedback("");
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareTitle}\n${shareText}`);
        setSelectedHomePersonId(targetPerson.id);
        setPersonActionFeedback("초대 링크를 복사했어요.");
        return;
      }

      setSelectedHomePersonId(targetPerson.id);
      setPersonActionFeedback("공유 기능을 사용할 수 없어요. 상세에서 다시 시도해 주세요.");
    } catch {
      setSelectedHomePersonId(targetPerson.id);
      setPersonActionFeedback("공유를 취소했어요.");
    }
  }

  async function handleSendInviteFromPersonSheet() {
    if (!selectedHomePerson) {
      return;
    }

    await handleSendInviteForPerson(selectedHomePerson);
  }

  async function handleCheckInviteStatus() {
    await syncAcceptedInvitesToPeople();

    if (!selectedEffectiveInviteDraft) {
      setPersonActionFeedback("아직 초대를 보내지 않았어요.");
      return;
    }

    if (selectedEffectiveInviteDraft.status === "accepted") {
      setPersonActionFeedback("가입 완료 상태예요.");
      return;
    }

    setPersonActionFeedback("아직 가입 전이에요.");
  }

  function handleOpenSelectedPersonDetail() {
    if (!selectedHomePerson) {
      return;
    }

    handleClosePersonActionSheet();
    router.push(`/dashboard/people/${selectedHomePerson.id}`);
  }

  return (
    <>
      <main className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F5F3EE] text-slate-900">
        <div className="sticky top-0 z-20 shrink-0 border-b border-[#D3D1C7] bg-[#FAFAF8] px-[10px] pt-[10px]">
          <div className="relative">
            <DashboardHomeHeader />

            <div className="absolute right-[8px] top-[8px] z-[30] flex items-center gap-[6px]">
              <button
                type="button"
                onClick={() => {
                  void handleEnableNotification();
                }}
                className="flex h-[42px] items-center justify-center gap-[7px] whitespace-nowrap rounded-[20px] border border-[#D3D1C7] bg-[#FAFAF8] px-[13px] text-[13px] font-semibold text-[#2C2C2A] active:scale-95"
              >
                <span className="h-[6px] w-[6px] rounded-full bg-[#1D9E75]" />
                {notificationEnabled ? "알림 ON" : "알림"}
              </button>

              <Link
                href="/dashboard/signals"
                className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[#D3D1C7] bg-[#F1EFE8] text-[21px] shadow-none active:scale-95"
                aria-label="신호함 열기"
              >
                💬
                {signalCount > 0 ? (
                  <span className="absolute right-[2px] top-[2px] h-[10px] w-[10px] rounded-full bg-red-500 ring-2 ring-white" />
                ) : null}
              </Link>
            </div>
          </div>
        </div>

        <div
          className={`hide-scrollbar min-h-0 flex-1 overflow-x-hidden px-[10px] pb-[120px] pt-[6px] [overscroll-behavior-y:contain] ${
            folderLongPressDragState ||
            layerSheetLongPressDragState ||
            homeMainLongPressDragState
              ? "overflow-y-hidden touch-none"
              : "overflow-y-auto"
          }`}
        >
          <DashboardHomeShell>
            <div className="flex flex-col gap-[12px]">
              <HomeLayerSection
                layers={layerBlueprints}
                renderLayer={(layer) => {
                  const derived = derivedStateMap[layer.id];

                  return (
                    <LayerStrip
                      key={layer.id}
                      layer={layer}
                      visibleSlotIds={layoutState[layer.id].visibleSlotIds}
                      hiddenCount={derived.hiddenCount}
                      dynamicCountLabel={derived.dynamicCountLabel}
                      folders={folders}
                      dragState={dragState}
                      dragOverState={dragOverState}
                      isMoreDropTarget={
                        specialDropTargetKey === `more-${layer.id}`
                      }
                      isRailDropTarget={
                        specialDropTargetKey === `rail-${layer.id}`
                      }
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onOpenMore={handleOpenMore}
                      onDragOverMore={handleDragOverMore}
                      onDropToMore={handleDropToMore}
                      onOpenFolder={handleOpenFolder}
                      onDragOverRailLayer={handleDragOverRailLayer}
                      onDropToRailLayer={handleDropToRailLayer}
                      onEmptySlotClick={handleOpenAddSheet}
                      onPersonClick={handleHomePersonClick}
                      onLongPressDragStart={handleHomeMainLongPressDragStart}
                    />
                  );
                }}
              />

              <div className="pt-[2px]">
                <HomeRecommendationList
                  ownerUserId={FIXED_OWNER_USER_ID}
                  occupiedEntityIds={occupiedEntityIds}
                  suppressedEntityIds={suppressedConnectableEntityIds}
                  connectableStateMap={connectableStateMap}
                  isDraggingCandidate={isConnectableDragActive}
                  onOpenSearch={() => {
                    setSearchSheetOpen(true);
                  }}
                  onExploreCandidate={handleExploreRecommendation}
                  onDismissCandidate={handleDismissCandidate}
                  onDeferCandidate={handleDeferCandidate}
                  onDragStartCandidate={(entityId) => {
                    handleDragStart(
                      CONNECTABLE_SOURCE_LAYER_ID,
                      -1,
                      entityId,
                      "visible",
                    );
                  }}
                  onDragEndCandidate={handleDragEnd}
                />
              </div>
            </div>
          </DashboardHomeShell>
        </div>

        <style jsx>{`
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </main>

      <HomeConnectableSearchSheet
        open={searchSheetOpen}
        ownerUserId={FIXED_OWNER_USER_ID}
        occupiedEntityIds={occupiedEntityIds}
        suppressedConnectableEntityIds={suppressedConnectableEntityIds}
        onClose={() => {
          setSearchSheetOpen(false);
        }}
        onAddToLayer={handleAddFromSearch}
        onExploreCandidate={handleExploreFromSearch}
      />

      {openLayer && openLayerId ? (
        <LayerBottomSheet
          layer={openLayer}
          visibleSlotIds={layoutState[openLayerId].visibleSlotIds}
          hiddenSlotIds={layoutState[openLayerId].hiddenSlotIds}
          folders={folders}
          dragState={dragState}
          dragOverState={dragOverState}
          isVisible={sheetVisible}
          specialDropTargetKey={specialDropTargetKey}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragOverRailLayer={handleDragOverRailLayer}
          onDropToRailLayer={handleDropToRailLayer}
          onDragOverHiddenContainer={handleDragOverHiddenContainer}
          onDropToHiddenContainer={handleDropToHiddenContainer}
          onClose={handleCloseMore}
          onOpenFolder={handleOpenFolder}
          onLongPressDragStart={handleLayerSheetLongPressDragStart}
        />
      ) : null}

      {openFolder ? (
        <FolderBottomSheet
          folder={openFolder}
          folders={folders}
          topLayerLabel={openFolderTopLayer?.label ?? "레이어"}
          isVisible={folderSheetVisible}
          folderDragState={folderDragState}
          folderDragOverState={folderDragOverState}
          onClose={handleCloseFolder}
          onChangeName={(value) => handleSaveFolderName(openFolder.id, value)}
          onDragStart={handleFolderMemberDragStart}
          onDragEnd={handleFolderMemberDragEnd}
          onDragOver={handleFolderMemberDragOver}
          onDrop={handleFolderMemberDrop}
          onOpenFolder={handleOpenFolder}
          onLongPressDragStart={handleFolderLongPressDragStart}
          onPersonClick={handleHomePersonClick}
        />
      ) : null}

      <HomeMoveMenu
        open={false}
        personName={folderMoveEntityLabel}
        currentLayerLabel={openFolderTopLayer?.label ?? "현재"}
        targets={folderMoveTargets}
        onSendToCurrentHome={handleSendMoveMenuToCurrentHome}
        onSendToCurrentMore={handleSendMoveMenuToCurrentMore}
        onMoveToLayerHome={handleMoveMenuToLayerHome}
        onMoveToLayerMore={handleMoveMenuToLayerMore}
        onClose={closeFolderMoveMenu}
      />

      {folderLongPressDragState ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: folderLongPressDragState.x,
            top: folderLongPressDragState.y,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: "#FFFFFF",
              border: "2px solid #475569",
              boxShadow: "0 14px 30px rgba(15,23,42,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            {folderLongPressDragState.label.slice(0, 2) || "?"}
          </div>
        </div>
      ) : null}

      {layerSheetLongPressDragState ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: layerSheetLongPressDragState.x,
            top: layerSheetLongPressDragState.y,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: "#FFFFFF",
              border: "2px solid #475569",
              boxShadow: "0 14px 30px rgba(15,23,42,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            {layerSheetLongPressDragState.label.slice(0, 2) || "?"}
          </div>
        </div>
      ) : null}

      {homeMainLongPressDragState ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: homeMainLongPressDragState.x,
            top: homeMainLongPressDragState.y,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: "#FFFFFF",
              border: "2px solid #475569",
              boxShadow: "0 14px 30px rgba(15,23,42,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            {homeMainLongPressDragState.label.slice(0, 2) || "?"}
          </div>
        </div>
      ) : null}

      <HomeOnboardingOverlay
        open={showOnboarding}
        onClose={dismissOnboarding}
      />

      <AddPersonSheet
        open={Boolean(addSheetState)}
        layerId={addSheetState?.layerId ?? null}
        value={pendingName}
        onChange={setPendingName}
        onClose={handleCloseAddSheet}
        onAddOnly={handleConfirmAddOnly}
      />

      <HomePersonActionSheet
        open={Boolean(selectedHomePerson)}
        person={
          selectedHomePerson
            ? {
                id: selectedHomePerson.id,
                name: selectedHomePerson.name,
              }
            : null
        }
        inviteDraft={selectedEffectiveInviteDraft}
        feedback={personActionFeedback}
        onClose={handleClosePersonActionSheet}
        onOpenDetail={handleOpenSelectedPersonDetail}
        onSendInvite={() => {
          void handleSendInviteFromPersonSheet();
        }}
        onCheckInviteStatus={() => {
          void handleCheckInviteStatus();
        }}
        onOpenSignal={() => {
          openSignalForPerson(selectedHomePerson);
        }}
        onRemoveFromHome={handleRemoveSelectedHomePerson}
        onResetLocalData={handleResetLocalFriendTestData}
      />

      <SignalBottomSheet
        open={signalOpen}
        onClose={() => {
          setSignalOpen(false);
        }}
        onSelect={async (emoji) => {
          if (!signalTarget) return;

          const senderId = getCurrentUserId();

          const success = await sendSignal(senderId, [signalTarget.id], emoji);

          if (!success) {
            console.log("개인 신호 실패");
            return;
          }

          console.log("개인 신호 성공:", signalTarget.name, emoji);
          markContacted(signalTarget.personId);
          dismissRedActionForPerson(signalTarget.personId);

          if (personCatalog[signalTarget.personId]) {
            personCatalog[signalTarget.personId].urgent = false;
          }

          // 보낸 신호는 상대방 화면의 파란점으로 표시된다.
          // 내 화면에는 파란점을 추가하지 않는다.

          void fetch("/api/push/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              receiverIds: [signalTarget.id],
              title: "새 신호가 도착했어요",
              body: `${emoji} 신호가 왔어요.`,
              url: "/dashboard/signals",
            }),
          });

          setSignalOpen(false);
        }}
      />
    </>
  );
}
