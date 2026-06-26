"use client";

import { subscribePushForUser } from "@/lib/push/push-client";
import { getCurrentUserId } from "@/lib/auth/current-user";
import {
  isIncompleteMeName,
  ME_NAME_REQUIRED_MESSAGE,
  readMeProfileImageUrl,
  readMeProfileName,
  writeMeProfileNameIfEmpty,
} from "@/lib/me/profile-name";
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
  readUnreadReceivedSenderIds,
} from "@/lib/signal/read-signals";
import Link from "next/link";
import { sendSignal } from "@/lib/signal/send-signal";
import HomeRecommendationList from "./_components/recommendation/HomeRecommendationList";
import HomeRecommendationSheet from "./_components/home/home-recommendation-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardHomeHeader from "./_components/dashboard-home-header";
import DashboardHomeShell from "./_components/dashboard-home-shell";
import HomeLayerSection from "./_components/home/home-layer-section";
import FolderBottomSheet from "./_components/home/folder-bottom-sheet";
import LayerBottomSheet from "./_components/home/layer-bottom-sheet";
import LayerStrip from "./_components/home/layer-strip";
import LongPressGhost from "./_components/home/LongPressGhost";
import HomeConnectableSearchSheet from "./_components/home/home-connectable-search-sheet";
import SignalBottomSheet from "./_components/home/signal-bottom-sheet";
import {
  CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY,
  CONNECTABLE_SOURCE_LAYER_ID,
  STORAGE_KEY,
  type ConnectableCandidateStateMap,
  type DragOverState,
  type FolderMap,
  type LayerLayoutState,
  buildDynamicConnectableEntityId,
  layerBlueprints,
  personCatalog,
} from "./_components/home/home-page-types";
import {
  combineEntityIntoTarget,
  createInitialLayoutState,
  findEntityLocation,
  getEntityLabel,
  getEntityPersonIdsForTierSync,
  getFirstEmptyIndex,
  getHomeLayerDerivedStateMap,
  getLayerById,
  getLayerCapMessage,
  getLayerCapViolation,
  getSuppressedConnectableEntityIds,
  insertExternalEntityToTarget,
  isPersonEntityId,
  markConnectableCandidateAddedToLayer,
  markConnectableCandidateDeferred,
  markConnectableCandidateDismissed,
  markConnectableCandidateExplored,
  moveEntityToTarget,
  readConnectableCandidateStateMap,
  resolveRailTarget,
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
import { getPersonDisplayName, isConnectedSignalUserId } from "./people/data";

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

function getAcceptedSelfNameFromRow(row: Record<string, unknown>) {
  // 자동 수락(보류 토큰) 시 사용할 "수락자 본인" 이름을 결정한다.
  // 버그 수정: invitee_name 은 초대자가 입력한 수락자 임시 카드명일 뿐,
  // 수락자의 실제 이름이 아니다. 이를 자동 채택하면 수락자 Me 이름이
  // "철수" 같은 임시명으로 오염된다(완료 화면/연결 person 도 어긋남).
  // 따라서 수락자 이름은 (1) 수락자 자신의 Me 이름(meName), 또는
  // (2) 이미 저장된 acceptedPersonName(이전에 폼으로 직접 입력한 값) 으로만
  // 결정한다. 둘 다 없으면 "" → /api/invites/accept 가 400 으로 거부 →
  // 보류 유지 → 수락자가 자기 이름을 입력해야만 수락된다(invitee_name 미사용).
  const rawMeName = readMeProfileName();
  const meName = isIncompleteMeName(rawMeName) ? "" : rawMeName;
  const acceptedName =
    typeof row.accepted_person_name === "string"
      ? row.accepted_person_name.trim()
      : "";

  return meName || acceptedName || "";
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
    inviterPhotoUrl: null,
    acceptedAt: new Date().toISOString(),
    acceptedPersonId,
    acceptedPersonName: name,
    acceptedPersonPhotoUrl: null,
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

              {/* 데이터 초기화는 개발/테스트 전용 — production 사용자
                  화면에는 노출하지 않는다. */}
              {process.env.NODE_ENV === "development" ? (
                <button
                  type="button"
                  onClick={onResetLocalData}
                  className="flex h-[42px] w-full items-center justify-center rounded-[16px] border border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-500"
                >
                  로컬 친구 데이터 전체 초기화
                </button>
              ) : null}
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

      const acceptedPersonName = getAcceptedSelfNameFromRow(
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
              // 수락 snapshot: 현재 내(accepter) Me 프로필 사진 URL.
              acceptedPersonPhotoUrl: readMeProfileImageUrl(),
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
  // Recommendation sheet visibility. Decouples the recommendation feed from
  // the fixed home view so the home stops needing vertical scroll. The sheet
  // mounts the existing HomeRecommendationList unchanged.
  const [recommendationSheetOpen, setRecommendationSheetOpen] = useState(false);
  const [selectedHomePersonId, setSelectedHomePersonId] = useState<
    string | null
  >(null);
  const [signalOpen, setSignalOpen] = useState(false);
  const [signalTarget, setSignalTarget] = useState<{
    id: string;
    personId: string;
    name: string;
  } | null>(null);

  // 받은 미확인 신호의 sender userId 목록(서버 기준). 신호함 배지는 이 중
  // "현재 연결된 sender" 가 하나라도 있을 때만 켜진다(파생 hasUnreadSignal).
  const [unreadSenderIds, setUnreadSenderIds] = useState<string[]>([]);

  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [blueSignalSenderIds, setBlueSignalSenderIds] = useState<string[]>([]);
  const [redActionDismissedMap, setRedActionDismissedMap] = useState<
    Record<string, string>
  >({});

  // 연결을 삭제한 sender 의 미확인 신호는 배지에 반영하지 않는다. people 가
  // 비동기 rehydrate 되므로 파생값으로 두어 people 로딩 후 재계산되게 한다.
  const hasUnreadSignal = useMemo(
    () =>
      unreadSenderIds.some((senderId) =>
        isConnectedSignalUserId(senderId, people, inviteDrafts),
      ),
    [unreadSenderIds, people, inviteDrafts],
  );

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
    targetArea: "visible" | "hidden";
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Me 이름 미완성(빈 값/"나") 여부. SSR hydration mismatch 방지를 위해 초기엔
  // false(미노출)로 두고 mount 후 클라이언트에서 결정한다. Home 재진입마다
  // mount effect 가 재read 하므로 이름 저장 후 자동으로 사라진다. 새 storage
  // key/전역 상태/이벤트 리스너 없음 — 기존 판정 함수만 재사용.
  const [meNameIncomplete, setMeNameIncomplete] = useState(false);

  const derivedStateMap = useMemo(() => {
    return getHomeLayerDerivedStateMap(layoutState, folders);
  }, [layoutState, folders]);

  // Home stale 방지: 타일 라벨은 모듈 전역 personCatalog 에서 오는데, catalog 는
  // effect(렌더 후)에서 갱신되어 people 변경 직후 렌더에는 옛 이름이 남았다
  // (People/Signals 는 김철수2 인데 Home 만 철수임시). 렌더 중(useMemo)에 people 의
  // 최신 getPersonDisplayName 으로 catalog 의 이름 필드만 동기화해, 같은 렌더
  // 패스에서 타일이 최신 displayName 을 읽도록 한다. urgent 등 다른 필드 보존을
  // 위해 entry 를 교체하지 않고 이름/이니셜만 mutate 한다(신규 person 만 등록).
  useMemo(() => {
    if (!hasHydrated) {
      return null;
    }
    for (const person of people) {
      const display = getPersonDisplayName(person);
      const existing = personCatalog[person.id];
      if (existing) {
        existing.canonicalName = display;
        existing.myAlias = display;
        existing.initials = getInitialsFromName(display);
      } else {
        registerAddedPersonToHomeCatalog({ id: person.id, name: display });
      }
    }
    return null;
  }, [people, hasHydrated]);

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

    // Me 이름이 미완성이면 Home 상단 activation CTA 를 노출한다. 이름이 채워진
    // 뒤 Home 으로 다시 진입하면 이 effect 가 재실행돼 자동 비노출된다.
    setMeNameIncomplete(isIncompleteMeName(readMeProfileName()));
  }, []);

  useEffect(() => {
    async function loadSignalCount() {
      const userId = getCurrentUserId();
      if (!userId) {
        return;
      }

      // Home mount-time backfill: 앱이 닫힌 사이 받은 미확인(received & !is_read)
      // 신호를 (1) 신호함 배지용 sender 목록과 (2) sender별 파란점으로 복원한다.
      // realtime INSERT 경로는 그대로 두고, 서버 signals 테이블(영속 read-state)을
      // 진실원으로 보강한다.
      // - 조회 실패 시 헬퍼가 [] 반환 → 기존 blue state(=localStorage) 유지(앱 안 깨짐).
      // - 기존 state(=localStorage 반영분)와 union 병합, 변화가 있을 때만 write +
      //   state 갱신(불필요한 이벤트/렌더 방지). 읽은 신호는 is_read=true 라 여기에
      //   안 잡혀 새로고침 후 파란점이 다시 생기지 않는다.
      const senderIds = await readUnreadReceivedSenderIds(userId);
      setUnreadSenderIds(senderIds);

      if (senderIds.length === 0) {
        return;
      }

      setBlueSignalSenderIds((current) => {
        const merged = Array.from(new Set([...current, ...senderIds]));
        if (merged.length === current.length) {
          return current;
        }
        writeBlueSignalSenderIds(merged);
        return merged;
      });
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

          // 받은 미확인 신호 sender 목록을 갱신한다(배지는 연결된 sender만 반영).
          readUnreadReceivedSenderIds(userId).then((senderIds) => {
            setUnreadSenderIds(senderIds);
          });

          const row = payload.new as Record<string, unknown>;
          const senderId =
            typeof row.sender_id === "string" ? row.sender_id.trim() : "";

          // 연결이 끊긴(=내 people/inviteDrafts 에 없는) sender 의 신호는
          // 파란점/알림에 반영하지 않는다. 연결된 sender 일 때만 처리한다.
          if (
            senderId &&
            senderId !== userId &&
            isConnectedSignalUserId(senderId, people, inviteDrafts)
          ) {
            setBlueSignalSenderIds((current) => {
              const next = Array.from(new Set([...current, senderId]));
              writeBlueSignalSenderIds(next);
              return next;
            });

            showSignalNotification();
          }
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
          readUnreadReceivedSenderIds(userId).then((senderIds) => {
            setUnreadSenderIds(senderIds);
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
        // Home 타일 표시명: localAlias > remoteProfileName > person.name.
        name: getPersonDisplayName(person),
      });
    }

    setLayoutState((current) => {
      // 폴더 멤버는 폴더 안에서 관리되므로 재배치/삽입 대상에서 제외한다(폴더 보존).
      // 폴더 추가(combine) 시점에 이미 폴더 레이어 tier 로 sync 되므로 손대지 않는다.
      const folderMemberIds = new Set<string>();
      for (const folder of Object.values(folders)) {
        for (const memberId of folder.memberIds) {
          if (memberId) {
            folderMemberIds.add(memberId);
          }
        }
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
      if (layerIds.length === 0) {
        return current;
      }

      // 현재 레이어 슬롯(visible/hidden)에 배치된 person 위치를 수집한다.
      type SlotLocation = {
        layerId: string;
        area: "visible" | "hidden";
        index: number;
      };
      const slotLocationById = new Map<string, SlotLocation>();
      for (const [layerId, layer] of Object.entries(next)) {
        layer.visibleSlotIds.forEach((id, index) => {
          if (id) {
            slotLocationById.set(id, { layerId, area: "visible", index });
          }
        });
        layer.hiddenSlotIds.forEach((id, index) => {
          if (id) {
            slotLocationById.set(id, { layerId, area: "hidden", index });
          }
        });
      }

      const resolveTargetLayerId = (tier: number) =>
        layerIds.find((layerId) => getTierByLayerId(layerId) === tier) ??
        layerIds[layerIds.length - 1];

      const placeIntoLayer = (layerId: string, personId: string) => {
        const layer = next[layerId];
        if (!layer) {
          return;
        }
        const emptyVisibleIndex = layer.visibleSlotIds.findIndex((id) => !id);
        if (emptyVisibleIndex >= 0) {
          layer.visibleSlotIds[emptyVisibleIndex] = personId;
          return;
        }
        if (!layer.hiddenSlotIds.includes(personId)) {
          layer.hiddenSlotIds.push(personId);
        }
      };

      let changed = false;

      for (const person of people) {
        // 폴더 안의 사람은 폴더 동작 보존을 위해 건드리지 않는다.
        if (folderMemberIds.has(person.id)) {
          continue;
        }

        const targetLayerId = resolveTargetLayerId(person.tier);
        if (!targetLayerId) {
          continue;
        }

        const location = slotLocationById.get(person.id);

        // (1) 아직 어디에도 배치되지 않은 사람 → People tier 레이어에 삽입.
        if (!location) {
          placeIntoLayer(targetLayerId, person.id);
          changed = true;
          continue;
        }

        // (2) 이미 People tier 와 일치하는 레이어에 있으면 위치를 그대로 둔다
        //     (visible/hidden, index 보존 — 정상 사용자의 배치는 건드리지 않음).
        if (location.layerId === targetLayerId) {
          continue;
        }

        // (3) People tier 와 다른 레이어에 배치돼 있으면(=Home/People tier 불일치)
        //     기존 슬롯에서 빼고 People tier 레이어로 옮긴다. Home 에서 옮기면
        //     항상 People tier 가 sync 되므로, 이 보정은 sync 누락 / 초대수락 기본
        //     배치 등으로 생긴 불일치에서만 동작하고 정상 배치는 바꾸지 않는다.
        if (location.area === "visible") {
          next[location.layerId].visibleSlotIds[location.index] = null;
        } else {
          next[location.layerId].hiddenSlotIds = next[
            location.layerId
          ].hiddenSlotIds.filter((id) => id !== person.id);
        }
        placeIntoLayer(targetLayerId, person.id);
        changed = true;
      }

      return changed ? next : current;
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

  // Dunbar cap 차단 안내 토스트. 드래그/이동/추가의 모든 cap 차단 경로가
  // 공유한다. 짧게 보여주고 자동으로 사라진다.
  const [capNotice, setCapNotice] = useState<string | null>(null);
  const capNoticeTimerRef = useRef<number | null>(null);

  const notifyCapBlocked = useCallback((blockedLayerId: string) => {
    setCapNotice(getLayerCapMessage(blockedLayerId));

    if (capNoticeTimerRef.current !== null) {
      window.clearTimeout(capNoticeTimerRef.current);
    }

    capNoticeTimerRef.current = window.setTimeout(() => {
      setCapNotice(null);
      capNoticeTimerRef.current = null;
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (capNoticeTimerRef.current !== null) {
        window.clearTimeout(capNoticeTimerRef.current);
      }
    };
  }, []);

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
    onCapBlocked: notifyCapBlocked,
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
    onCapBlocked: notifyCapBlocked,
  });

  // Hover preview state for the folder ghost drag. Mirrored from the hook's
  // onHoverChange callback into a DragOverState-shaped value so the existing
  // LayerStrip "놓기" highlight can be reused without touching the home
  // HTML5 dragOverState system. Visible slot hovers only — the +N (more)
  // area is reachable via specialDropTargetKey, which we deliberately don't
  // mirror here to keep the change small.
  const [folderGhostHoverState, setFolderGhostHoverState] =
    useState<DragOverState>(null);

  // home-main / +N(layer-sheet) long-press drag 가 공유하는 "놓기" 하이라이트
  // 미러. folder 경로의 onHoverChange 와 같은 패턴이지만, 그 경로와 달리
  // shouldSkipDropTarget(드롭 후보 계산)을 추가하지 않으므로 "나"(family-me)
  // 슬롯은 여기서 시각적으로만 걸러낸다 — 그 슬롯에 드롭하면 onDrop 가드가
  // no-op 처리하므로 하이라이트도 보여주지 않는 게 일관적이다.
  const handleLongPressGhostHover = useCallback(
    (
      candidate: {
        layerId: string;
        area: "visible" | "hidden";
        index?: number;
      } | null,
    ) => {
      if (
        candidate &&
        candidate.area === "visible" &&
        typeof candidate.index === "number"
      ) {
        const slotEntityId =
          layoutState[candidate.layerId]?.visibleSlotIds[candidate.index] ??
          null;
        if (slotEntityId === "family-me") {
          setFolderGhostHoverState(null);
          return;
        }
        setFolderGhostHoverState({
          targetLayerId: candidate.layerId,
          targetIndex: candidate.index,
          targetArea: "visible",
          action: "swap",
        });
      } else {
        setFolderGhostHoverState(null);
      }
    },
    [layoutState],
  );

  const { dragState: folderLongPressDragState, beginDrag: beginFolderLongPressDrag } =
    useFolderLongPressDrag({
      onDrop: ({ folderId, entityId, layerId, area, index }) => {
        moveFolderEntityToLayer(folderId, entityId, layerId, area, index);
      },
      // Exclude only "나"(family-me) own slot from drop candidacy during a
      // folder ghost drag. The earlier Phase 1.15A-1 also excluded the
      // visible left/right neighbors, but the source-side lock (1.15B),
      // canonical pin (1.16), and legacy me-target guard now prevent any
      // path from displacing 나 — so blocking the adjacent slots merely
      // hides legitimate landing spots (e.g., right next to me in the
      // family layer) from the user. The own-slot block stays because we
      // still want a drop on top of "나" to no-op cleanly and let the
      // user see the highlight skip past it.
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
        return slots[candidate.index] === "family-me";
      },
      // Mirror live hit-test into a parallel dragOverState so home tiles can
      // show the same "놓기" highlight they show during HTML5 drags. Only
      // visible-area candidates with a concrete index can be represented as
      // a DragOverState; everything else (more area, null) clears the
      // mirror so no stale highlight lingers.
      onHoverChange: (candidate) => {
        if (
          candidate &&
          candidate.area === "visible" &&
          typeof candidate.index === "number"
        ) {
          setFolderGhostHoverState({
            targetLayerId: candidate.layerId,
            targetIndex: candidate.index,
            targetArea: "visible",
            action: "swap",
          });
        } else {
          setFolderGhostHoverState(null);
        }
      },
    });

  const handleFolderLongPressDragStart = useCallback(
    (entityId: string, point: { x: number; y: number }) => {
      if (!openFolder) {
        return;
      }

      const sourceFolderId = openFolder.id;
      const label = getEntityLabel(entityId, folders);

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

    if (wasActive && !isActive) {
      finishCloseFolderSheet();
    }
  }, [folderLongPressDragState, finishCloseFolderSheet]);

  const {
    dragState: layerSheetLongPressDragState,
    beginDrag: beginLayerSheetLongPressDrag,
  } = useFolderLongPressDrag({
    onDrop: ({ entityId, layerId, area, index }) => {
      // P2-4f-b: drop 처리 가드도 drag-start 가드와 동일하게 완화한다.
      // isPersonEntityId 는 invite-pending-<token>(초대수락 연결사람) 을 person
      // 으로 인정하지 않아, ghost 는 떴지만(start 가드는 b437683 에서 완화됨)
      // drop 시 여기서 early-return 되어 이동/tier 업데이트가 안 됐다.
      // store.people 에 실재하는 id 면 허용(family-me/connectable:/folder- 는
      // store.people 에 없어 자동 제외).
      const isDroppablePerson =
        isPersonEntityId(entityId) ||
        usePeopleStore.getState().people.some((p) => p.id === entityId);
      if (!isDroppablePerson) {
        return;
      }

      // Step F1 (mobile MVP): combine disabled. The incoming action from
      // useFolderLongPressDrag is intentionally ignored — every drop is
      // treated as "swap" so the combine branch below never fires. This
      // keeps combineEntityIntoTarget intact for desktop (D2) and for
      // future re-enablement, while mobile long-press only does
      // swap/move/noop on occupied slots / empty slots / me / folders.
      const action = "swap" as "swap" | "combine";

      // Mobile combine: only when the long-press drag landed in the centre
      // band of an occupied visible slot (action==="combine"). All other
      // hits fall through to the existing swap path so Phase 2 rail fallback
      // (index===undefined → first empty slot) keeps working unchanged.
      if (
        action === "combine" &&
        typeof index === "number" &&
        area === "visible"
      ) {
        const targetLayer = layoutState[layerId];
        const targetEntityId =
          targetLayer?.visibleSlotIds[index] ?? null;
        const involvesMe =
          entityId === "family-me" || targetEntityId === "family-me";
        const sourceIsFolder = Boolean(folders[entityId]);
        const targetIsFolder = Boolean(
          targetEntityId && folders[targetEntityId],
        );

        if (
          targetEntityId &&
          targetEntityId !== entityId &&
          !involvesMe &&
          !sourceIsFolder &&
          !targetIsFolder
        ) {
          const location = findEntityLocation(layoutState, entityId);
          if (location) {
            // Dunbar cap: combine 은 target layer 인원이 순증한다.
            const capBlockedLayerId = getLayerCapViolation({
              layout: layoutState,
              folders,
              entityId,
              targetLayerId: layerId,
              sourceLayerId: location.layerId,
            });

            if (capBlockedLayerId) {
              notifyCapBlocked(capBlockedLayerId);
              return;
            }

            const result = combineEntityIntoTarget(
              layoutState,
              folders,
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
            if (result.layout !== layoutState) {
              setLayoutState(result.layout);
              setFolders(result.folders);
              usePeopleStore
                .getState()
                .updatePersonTier(entityId, getTierByLayerId(layerId));
            }
            return;
          }
        }
      }

      // Resolve the move synchronously from the committed layoutState — see
      // the home-main long-press path for the full rationale. Reading didMove
      // from inside the setLayoutState updater was unreliable (React runs the
      // updater during render), so updatePersonTier could be skipped and the
      // 9c15bfb reconcile effect would relocate the person back. Deciding
      // synchronously guarantees the person.tier sync fires for every move.
      const targetLayer = layoutState[layerId];
      if (!targetLayer) {
        return;
      }

      // Mobile rail-fallback drops land on a layer but not a concrete slot, so
      // they arrive as area="visible" with index=undefined. moveEntityToTarget
      // bails on a visible target without an index (silent no-op = "이동 안 됨"),
      // so resolve to the layer's first empty visible slot — or the hidden
      // overflow when the visible row is full — exactly like the desktop
      // rail-drop path (handleDropToRailLayer / resolveRailTarget).
      let dropArea = area;
      let dropIndex = index;
      if (area === "visible" && typeof index !== "number") {
        const railTarget = resolveRailTarget(layoutState, layerId);
        dropArea = railTarget.targetArea;
        dropIndex = railTarget.targetIndex;
      }

      const targetSlots =
        dropArea === "visible"
          ? targetLayer.visibleSlotIds
          : targetLayer.hiddenSlotIds;

      // Never let a drop land on "나"(family-me)'s slot.
      if (
        typeof dropIndex === "number" &&
        targetSlots[dropIndex] === "family-me"
      ) {
        return;
      }

      const location = findEntityLocation(layoutState, entityId);
      if (!location) {
        return;
      }

      // Dropped back on its own slot/layer → nothing to do.
      if (
        location.layerId === layerId &&
        location.area === dropArea &&
        (typeof dropIndex !== "number" || location.index === dropIndex)
      ) {
        return;
      }

      // Swap meta: re-tier the entity displaced into source's old layer so
      // People count stays consistent with Home (mobile person→folder swap).
      const occupant =
        typeof dropIndex === "number" ? targetSlots[dropIndex] ?? null : null;
      const swappedTargetEntityId =
        occupant &&
        occupant !== entityId &&
        occupant !== "family-me" &&
        location.layerId !== layerId
          ? occupant
          : null;
      const sourceOldLayerId = location.layerId;

      // Dunbar cap: cross-layer 이동/swap pre-check. swap 은 밀려나는
      // occupant(swappedTargetEntityId)가 source layer 로 맞교환되므로
      // displaced 로 상쇄해 계산한다. 같은 layer 재배치는 통과.
      const capBlockedLayerId = getLayerCapViolation({
        layout: layoutState,
        folders,
        entityId,
        targetLayerId: layerId,
        sourceLayerId: location.layerId,
        displacedEntityId: swappedTargetEntityId,
      });

      if (capBlockedLayerId) {
        notifyCapBlocked(capBlockedLayerId);
        return;
      }

      setLayoutState((current) =>
        moveEntityToTarget(
          current,
          {
            sourceLayerId: location.layerId,
            sourceIndex: location.index,
            entityId,
            sourceArea: location.area,
          },
          layerId,
          dropArea,
          dropIndex,
        ),
      );

      const updatePersonTier = usePeopleStore.getState().updatePersonTier;
      updatePersonTier(entityId, getTierByLayerId(layerId));

      if (swappedTargetEntityId) {
        const swappedTier = getTierByLayerId(sourceOldLayerId);
        for (const pid of getEntityPersonIdsForTierSync(
          swappedTargetEntityId,
          folders,
        )) {
          updatePersonTier(pid, swappedTier);
        }
      }
    },
    // folder 경로에서 검증된 "놓기" 하이라이트 미러를 이 long-press 경로에도
    // 연결한다(시각 전용 — 드롭 계산/onDrop 로직은 변경 없음).
    onHoverChange: handleLongPressGhostHover,
  });

  const handleLayerSheetLongPressDragStart = useCallback(
    (entityId: string, point: { x: number; y: number }) => {
      if (!openLayerId) {
        return;
      }

      // P2-4f: invite-pending 연결사람도 long-press drag 허용(home-main 과 동일).
      const isDraggablePerson =
        isPersonEntityId(entityId) ||
        usePeopleStore.getState().people.some((p) => p.id === entityId);
      if (!isDraggablePerson) {
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

  // Step F2: button-based hidden -> visible promotion. The +N sheet no
  // longer supports long-press drag inside its hidden grid; instead each
  // tile exposes a small "↑" button that calls this handler. Moves the
  // entity to the first empty visible slot of the open layer. family-me
  // and full-visible cases are silent no-ops.
  const handlePromoteHiddenToVisible = useCallback(
    (entityId: string) => {
      if (!openLayerId) {
        return;
      }
      if (entityId === "family-me") {
        return;
      }
      if (!isPersonEntityId(entityId)) {
        return;
      }

      let didMove = false;
      // 홈이 가득 찼을 때 더보기로 밀려난 사람의 표시 이름(toast 안내용).
      let displacedLabel = "";

      setLayoutState((current) => {
        const targetLayer = current[openLayerId];
        if (!targetLayer) {
          return current;
        }

        const location = findEntityLocation(current, entityId);
        if (!location) {
          return current;
        }

        if (
          location.layerId === openLayerId &&
          location.area === "visible"
        ) {
          return current;
        }

        // 1) 홈 visible 에 빈자리가 있으면 그 자리로 올린다(기존 동작).
        // 2) 가득 찼으면 홈 visible 의 "마지막 비-Me 사람" 슬롯과 위치만 swap.
        //    Me 슬롯과 폴더(비-person)는 교체 대상에서 제외한다. 같은 layer
        //    안의 표시 위치 교환이라 tier / People tier / cap 은 불변이다.
        let targetIndex = getFirstEmptyIndex(targetLayer.visibleSlotIds);

        if (targetIndex < 0) {
          let swapIndex = -1;
          for (let i = targetLayer.visibleSlotIds.length - 1; i >= 0; i--) {
            const slotId = targetLayer.visibleSlotIds[i];
            if (!slotId || slotId === "family-me" || !isPersonEntityId(slotId)) {
              continue;
            }
            swapIndex = i;
            break;
          }

          if (swapIndex < 0) {
            return current;
          }

          targetIndex = swapIndex;
          const displacedId = targetLayer.visibleSlotIds[swapIndex];
          if (displacedId) {
            displacedLabel = getEntityLabel(displacedId, folders);
          }
        }

        const next = moveEntityToTarget(
          current,
          {
            sourceLayerId: location.layerId,
            sourceIndex: location.index,
            entityId,
            sourceArea: location.area,
          },
          openLayerId,
          "visible",
          targetIndex,
        );

        if (next === current) {
          return current;
        }

        didMove = true;
        return next;
      });

      if (didMove) {
        usePeopleStore
          .getState()
          .updatePersonTier(entityId, getTierByLayerId(openLayerId));

        // full swap(밀려난 사람 있음)일 때만 안내 toast. 빈자리 승격은
        // 기존처럼 조용히 처리한다(추가 toast 없음). 기존 capNotice
        // 토스트 인프라를 그대로 재사용한다.
        if (displacedLabel) {
          const promotedLabel = getEntityLabel(entityId, folders);
          setCapNotice(
            `${promotedLabel}님을 홈에 올리고 ${displacedLabel}님을 더보기로 옮겼어요`,
          );
          if (capNoticeTimerRef.current !== null) {
            window.clearTimeout(capNoticeTimerRef.current);
          }
          capNoticeTimerRef.current = window.setTimeout(() => {
            setCapNotice(null);
            capNoticeTimerRef.current = null;
          }, 2800);
        }
      }
    },
    [openLayerId, setLayoutState, folders],
  );

  // P2-4g: +N(더보기/hidden) 안의 사람을 다른 단계(layer)로 꺼내는 버튼 기반
  // 이동 메뉴. 폴더 이동 메뉴(HomeMoveMenu)와 같은 컴포넌트를 재사용하되,
  // +N 은 folder 추출이 필요 없으므로 layout 직접 이동(moveEntityToTarget)으로
  // 처리한다. 드래그 hit-test 의존 없이 PC·모바일 공통으로 동작한다.
  const [layerMoveMenuState, setLayerMoveMenuState] = useState<{
    entityId: string;
    sourceLayerId: string;
  } | null>(null);

  const layerMoveEntityLabel = layerMoveMenuState
    ? getEntityLabel(layerMoveMenuState.entityId, folders)
    : "";

  const layerMoveCurrentLabel = layerMoveMenuState
    ? getLayerById(layerMoveMenuState.sourceLayerId)?.label ?? "현재"
    : "현재";

  const layerMoveTargets = useMemo(
    () =>
      layerBlueprints.map((layer) => ({
        layerKey: layer.id,
        layerLabel: layer.label,
        canSendHome: getFirstEmptyIndex(layoutState[layer.id].visibleSlotIds) >= 0,
        canSendMore: true,
      })),
    [layoutState],
  );

  const handleRequestLayerMoveMenu = useCallback(
    (entityId: string) => {
      if (!openLayerId) {
        return;
      }
      setLayerMoveMenuState({ entityId, sourceLayerId: openLayerId });
    },
    [openLayerId],
  );

  const closeLayerMoveMenu = useCallback(() => {
    setLayerMoveMenuState(null);
  }, []);

  const moveLayerEntityToLayer = useCallback(
    (targetLayerId: string, targetArea: "visible" | "hidden") => {
      const menu = layerMoveMenuState;
      if (!menu) {
        return;
      }

      const { entityId } = menu;
      const location = findEntityLocation(layoutState, entityId);
      if (!location) {
        setLayerMoveMenuState(null);
        return;
      }

      // 홈(visible) 으로 보낼 땐 rail 규칙으로 첫 빈 visible(없으면 hidden)로,
      // 더보기(hidden) 로 보낼 땐 첫 빈 hidden 으로 보낸다(데스크탑 rail-drop 과 동일).
      let dropArea: "visible" | "hidden" = targetArea;
      let dropIndex: number | undefined;
      if (targetArea === "visible") {
        const railTarget = resolveRailTarget(layoutState, targetLayerId);
        dropArea = railTarget.targetArea;
        dropIndex = railTarget.targetIndex;
      }

      // 원래 자리로 보내는 경우는 no-op.
      if (
        location.layerId === targetLayerId &&
        location.area === dropArea &&
        (typeof dropIndex !== "number" || location.index === dropIndex)
      ) {
        setLayerMoveMenuState(null);
        return;
      }

      // Dunbar cap: 빈 슬롯/ hidden 으로만 들어가므로 displaced 없음.
      const capBlockedLayerId = getLayerCapViolation({
        layout: layoutState,
        folders,
        entityId,
        targetLayerId,
        sourceLayerId: location.layerId,
      });
      if (capBlockedLayerId) {
        notifyCapBlocked(capBlockedLayerId);
        setLayerMoveMenuState(null);
        return;
      }

      setLayoutState((current) =>
        moveEntityToTarget(
          current,
          {
            sourceLayerId: location.layerId,
            sourceIndex: location.index,
            entityId,
            sourceArea: location.area,
          },
          targetLayerId,
          dropArea,
          dropIndex,
        ),
      );

      // people.tier 동기화. person/folder 멤버 + invite-pending fallback 모두 포함.
      const updatePersonTier = usePeopleStore.getState().updatePersonTier;
      let personIds = getEntityPersonIdsForTierSync(entityId, folders);
      if (personIds.length === 0) {
        const exists = usePeopleStore
          .getState()
          .people.some((person) => person.id === entityId);
        if (exists) {
          personIds = [entityId];
        }
      }
      const nextTier = getTierByLayerId(targetLayerId);
      for (const personId of personIds) {
        updatePersonTier(personId, nextTier);
      }

      setLayerMoveMenuState(null);
    },
    [layerMoveMenuState, layoutState, folders, notifyCapBlocked, setLayoutState],
  );

  const {
    dragState: homeMainLongPressDragState,
    beginDrag: beginHomeMainLongPressDrag,
  } = useFolderLongPressDrag({
    onDrop: ({ entityId, layerId, area, index }) => {
      // P2-4f-b: drop 처리 가드도 drag-start 가드와 동일하게 완화한다.
      // isPersonEntityId 는 invite-pending-<token>(초대수락 연결사람) 을 person
      // 으로 인정하지 않아, ghost 는 떴지만(start 가드는 b437683 에서 완화됨)
      // drop 시 여기서 early-return 되어 이동/tier 업데이트가 안 됐다.
      // store.people 에 실재하는 id 면 허용(family-me/connectable:/folder- 는
      // store.people 에 없어 자동 제외).
      const isDroppablePerson =
        isPersonEntityId(entityId) ||
        usePeopleStore.getState().people.some((p) => p.id === entityId);
      if (!isDroppablePerson) {
        return;
      }

      // Step F1 (mobile MVP): combine disabled — same policy as the
      // layer-sheet path above. Force-downgrade to "swap" so the combine
      // branch never fires. Desktop HTML5 path (use-home-drag-drop) keeps
      // its own combine behavior untouched (D2).
      const action = "swap" as "swap" | "combine";

      // Mobile combine: identical gate to the layer-sheet path above —
      // action==="combine" + occupied visible slot + neither side is me/folder.
      // Phase 2 rail fallback (index===undefined) and edge-of-slot hits stay
      // on the swap path because they emit action==="swap".
      if (
        action === "combine" &&
        typeof index === "number" &&
        area === "visible"
      ) {
        const targetLayer = layoutState[layerId];
        const targetEntityId =
          targetLayer?.visibleSlotIds[index] ?? null;
        const involvesMe =
          entityId === "family-me" || targetEntityId === "family-me";
        const sourceIsFolder = Boolean(folders[entityId]);
        const targetIsFolder = Boolean(
          targetEntityId && folders[targetEntityId],
        );

        if (
          targetEntityId &&
          targetEntityId !== entityId &&
          !involvesMe &&
          !sourceIsFolder &&
          !targetIsFolder
        ) {
          const location = findEntityLocation(layoutState, entityId);
          if (location) {
            // Dunbar cap: combine 은 target layer 인원이 순증한다.
            const capBlockedLayerId = getLayerCapViolation({
              layout: layoutState,
              folders,
              entityId,
              targetLayerId: layerId,
              sourceLayerId: location.layerId,
            });

            if (capBlockedLayerId) {
              notifyCapBlocked(capBlockedLayerId);
              return;
            }

            const result = combineEntityIntoTarget(
              layoutState,
              folders,
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
            if (result.layout !== layoutState) {
              setLayoutState(result.layout);
              setFolders(result.folders);
              usePeopleStore
                .getState()
                .updatePersonTier(entityId, getTierByLayerId(layerId));
            }
            return;
          }
        }
      }

      // Resolve the move synchronously from the committed layoutState. The
      // previous version mutated didMove / swap meta INSIDE the setLayoutState
      // updater and read them right after, but React runs functional updaters
      // during the render phase (after this callback returns), so the post-call
      // read saw stale values and updatePersonTier was skipped — leaving People
      // tier unsynced. The 9c15bfb reconcile effect then relocated the person
      // back to their (unchanged) tier layer, so on mobile the tile looked
      // impossible to move. Deciding synchronously (like the desktop HTML5
      // path) guarantees the person.tier sync fires for every real move.
      const targetLayer = layoutState[layerId];
      if (!targetLayer) {
        return;
      }

      // Mobile rail-fallback drops land on a layer but not a concrete slot, so
      // they arrive as area="visible" with index=undefined. moveEntityToTarget
      // bails on a visible target without an index (silent no-op = "이동 안 됨"),
      // so resolve to the layer's first empty visible slot — or the hidden
      // overflow when the visible row is full — exactly like the desktop
      // rail-drop path (handleDropToRailLayer / resolveRailTarget).
      let dropArea = area;
      let dropIndex = index;
      if (area === "visible" && typeof index !== "number") {
        const railTarget = resolveRailTarget(layoutState, layerId);
        dropArea = railTarget.targetArea;
        dropIndex = railTarget.targetIndex;
      }

      const targetSlots =
        dropArea === "visible"
          ? targetLayer.visibleSlotIds
          : targetLayer.hiddenSlotIds;

      // Never let a drop land on "나"(family-me)'s slot.
      if (
        typeof dropIndex === "number" &&
        targetSlots[dropIndex] === "family-me"
      ) {
        return;
      }

      const location = findEntityLocation(layoutState, entityId);
      if (!location) {
        return;
      }

      // Dropped back on its own slot/layer → nothing to do.
      if (
        location.layerId === layerId &&
        location.area === dropArea &&
        (typeof dropIndex !== "number" || location.index === dropIndex)
      ) {
        return;
      }

      // Swap meta: re-tier the entity displaced into source's old layer so
      // People count stays consistent with Home (mobile person→folder swap).
      const occupant =
        typeof dropIndex === "number" ? targetSlots[dropIndex] ?? null : null;
      const swappedTargetEntityId =
        occupant &&
        occupant !== entityId &&
        occupant !== "family-me" &&
        location.layerId !== layerId
          ? occupant
          : null;
      const sourceOldLayerId = location.layerId;

      // Dunbar cap: cross-layer 이동/swap pre-check. swap 은 밀려나는
      // occupant(swappedTargetEntityId)가 source layer 로 맞교환되므로
      // displaced 로 상쇄해 계산한다. 같은 layer 재배치는 통과.
      const capBlockedLayerId = getLayerCapViolation({
        layout: layoutState,
        folders,
        entityId,
        targetLayerId: layerId,
        sourceLayerId: location.layerId,
        displacedEntityId: swappedTargetEntityId,
      });

      if (capBlockedLayerId) {
        notifyCapBlocked(capBlockedLayerId);
        return;
      }

      setLayoutState((current) =>
        moveEntityToTarget(
          current,
          {
            sourceLayerId: location.layerId,
            sourceIndex: location.index,
            entityId,
            sourceArea: location.area,
          },
          layerId,
          dropArea,
          dropIndex,
        ),
      );

      const updatePersonTier = usePeopleStore.getState().updatePersonTier;
      updatePersonTier(entityId, getTierByLayerId(layerId));

      if (swappedTargetEntityId) {
        const swappedTier = getTierByLayerId(sourceOldLayerId);
        for (const pid of getEntityPersonIdsForTierSync(
          swappedTargetEntityId,
          folders,
        )) {
          updatePersonTier(pid, swappedTier);
        }
      }
    },
    // folder 경로에서 검증된 "놓기" 하이라이트 미러를 이 long-press 경로에도
    // 연결한다(시각 전용 — 드롭 계산/onDrop 로직은 변경 없음).
    onHoverChange: handleLongPressGhostHover,
  });

  const handleHomeMainLongPressDragStart = useCallback(
    (entityId: string, point: { x: number; y: number }) => {
      // P2-4f: isPersonEntityId 는 invite-pending-<token>(초대수락 연결사람) 을
      // person 으로 인정하지 않아 모바일 long-press drag 가 시작되지 않았다
      // (진동만, ghost 없음 → tier 이동 불가). desktop HTML5 drag 는 이 가드가
      // 없어 PC 는 정상이었다. P2-4a tier fallback 과 동일하게 store.people 에
      // 실재하는 id 면 허용한다(family-me/connectable:/folder- 는 store.people
      // 에 없어 자동 제외).
      const isDraggablePerson =
        isPersonEntityId(entityId) ||
        usePeopleStore.getState().people.some((p) => p.id === entityId);
      if (!isDraggablePerson) {
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

  // long-press ghost drag 중인 소스 entityId. LayerStrip 의 PersonTile 이
  // HTML5 drag 소스와 동일한 dim(scale 0.92 + opacity 0.35) 스타일을 재사용해
  // "잡고 있다" 느낌을 주고 drop 순간이동감을 줄인다. folder 멤버/+N(hidden)
  // 소스는 홈 레일에 타일이 없으므로 실질적으로 home-main 드래그에서 보인다.
  const longPressDraggingEntityId =
    homeMainLongPressDragState?.entityId ??
    layerSheetLongPressDragState?.entityId ??
    folderLongPressDragState?.entityId ??
    null;

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
    setAddSheetState({ layerId, index, targetArea: "visible" });
    setPendingName("");
  }

  // +N 시트의 "사람 추가" 진입(홈 visible 4칸이 찬 layer 전용). 새 사람을
  // 현재 layer 의 hidden 영역에 배치한다. 사람을 만들기 전에 cap 을 먼저
  // 확인해, cap 초과면 생성하지 않고 기존 안내(notifyCapBlocked)만 띄운다.
  function handleOpenAddToHidden(layerId: string) {
    const capBlockedLayerId = getLayerCapViolation({
      layout: layoutState,
      folders,
      entityId: null,
      targetLayerId: layerId,
    });

    if (capBlockedLayerId) {
      notifyCapBlocked(capBlockedLayerId);
      return;
    }

    handleCloseMore();
    setAddSheetState({ layerId, index: -1, targetArea: "hidden" });
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
    const targetArea = addSheetState.targetArea;

    // Dunbar cap: 빈 슬롯이 보여도 folder/+N 인원까지 합친 실제 count 가
    // 한도에 닿았으면 새 사람을 만들지 않는다.
    const capBlockedLayerId = getLayerCapViolation({
      layout: layoutState,
      folders,
      entityId: null,
      targetLayerId,
    });

    if (capBlockedLayerId) {
      notifyCapBlocked(capBlockedLayerId);
      handleCloseAddSheet();
      return;
    }

    const created = addPerson({
      name: trimmed,
      tier: getTierByLayerId(targetLayerId),
      relationshipType: targetLayerId === "family" ? "family" : "friend",
      roleLabel: getLayerLabelById(targetLayerId),
    });

    registerAddedPersonToHomeCatalog(created);

    if (targetArea === "hidden") {
      // 홈 visible 4칸이 찬 layer 의 +N 추가: 현재 layer 의 hidden 에 정확히
      // 1회 배치한다(기존 placement 엔진 재사용 — null padding/순서 정규화 포함,
      // visible 사람은 밀어내지 않음).
      setLayoutState((current) =>
        insertExternalEntityToTarget(current, created.id, targetLayerId, "hidden"),
      );
    } else {
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
    }

    setSelectedHomePersonId(created.id);
    setPersonActionFeedback("친구를 추가했어요.");

    handleCloseAddSheet();
  }

  function handleAddFromSearch(entityId: string, targetLayerId: string) {
    // Dunbar cap: 검색 후보를 layer 에 새로 추가하는 경로.
    const capBlockedLayerId = getLayerCapViolation({
      layout: layoutState,
      folders,
      entityId,
      targetLayerId,
      sourceLayerId: null,
    });

    if (capBlockedLayerId) {
      notifyCapBlocked(capBlockedLayerId);
      setSearchSheetOpen(false);
      return;
    }

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
      `${getPersonDisplayName(selectedHomePerson)}님을 홈과 People에서 제거할까요?\n\n초대/신호 기록은 Supabase DB에 남겨둡니다.`,
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

    // me 이름이 미완성이면 신호 시트를 열지 않고 이름 입력을 안내한다.
    if (isIncompleteMeName(readMeProfileName())) {
      setSelectedHomePersonId(targetPerson.id);
      setPersonActionFeedback(ME_NAME_REQUIRED_MESSAGE);
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
      name: getPersonDisplayName(targetPerson),
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
    // blue 목록/타일 표시는 "상대 userId(=signals.sender_id)" 기준이다. 과거엔
    // person.id 로만 게이트해 person.id != userId 인 연결에서 탭으로 파란점이 안
    // 꺼졌다. receiverUserId(상대 userId) 우선 매칭 + person.id 는 하위호환 fallback.
    const hasBlueSignalForTarget =
      (receiverUserId && blueSignalSenderIds.includes(receiverUserId)) ||
      blueSignalSenderIds.includes(targetPerson.id);
    if (hasBlueSignalForTarget && receiverUserId) {
      // me 이름이 미완성이면 답장 신호 시트를 열지 않고(파란점도 유지) 이름
      // 입력을 안내한다.
      if (isIncompleteMeName(readMeProfileName())) {
        setSelectedHomePersonId(targetPerson.id);
        setPersonActionFeedback(ME_NAME_REQUIRED_MESSAGE);
        return;
      }

      const currentUserId = getCurrentUserId();

      setSignalTarget({
        id: receiverUserId,
        personId: targetPerson.id,
        name: getPersonDisplayName(targetPerson),
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
        void readUnreadReceivedSenderIds(currentUserId).then((senderIds) => {
          setUnreadSenderIds(senderIds);
        });
      });

      return;
    }


    if (!isJoined) {
      dismissRedActionForPerson(targetPerson.id);

      if (personCatalog[targetPerson.id]) {
        personCatalog[targetPerson.id].urgent = false;
      }

      // 미가입 사람을 탭하면 더 이상 자동으로 초대를 보내지 않는다.
      // 액션 시트만 열고, 사용자가 명시적으로 "초대 보내기" 버튼을 눌렀을 때만
      // handleSendInviteFromPersonSheet → handleSendInviteForPerson 가 동작한다.
      // 결과적으로 invite row / 설치대기 count / 클립보드 복사 모두
      // 명시적 클릭 단계에서만 발생.
      setSelectedHomePersonId(targetPerson.id);
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
          // 초대 생성 snapshot: 현재 내(inviter) Me 프로필 사진 URL.
          inviterPhotoUrl: readMeProfileImageUrl(),
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
    // me 이름이 미완성("나"/빈 값)이면 초대 draft 생성·서버 upsert·공유 시트를
    // 모두 막고 이름 입력을 안내한다.
    if (isIncompleteMeName(readMeProfileName())) {
      setSelectedHomePersonId(targetPerson.id);
      setPersonActionFeedback(ME_NAME_REQUIRED_MESSAGE);
      return;
    }

    // 같은 사람한테 이미 pending invite 가 있으면 새 draft 를 만들지 않고
    // 그대로 재사용한다. createInviteDraft 는 호출될 때마다 새 token 으로
    // local draft 를 누적 push 하므로, 명시 "초대 보내기" 버튼을 여러 번
    // 눌렀을 때 설치대기 count 가 부풀려지는 부작용을 차단.
    const existingDraft = inviteDrafts
      .filter(
        (item) =>
          item.sourcePersonId === targetPerson.id && item.status === "pending",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const draft =
      existingDraft ??
      createInviteDraft({
        sourcePersonId: targetPerson.id,
        inviteeName: targetPerson.name,
        tier: normalizeInviteTier(targetPerson.tier),
        relationshipType: targetPerson.relationshipType,
      });

    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${draft.invitePath}`
        : draft.invitePath;

    const shareTitle = "던바링크 초대";
    const shareText = `${targetPerson.name}님, 던바링크에 들어와서 자기 정보를 입력해줘.\n${inviteUrl}`;

    // 모바일 Web Share 는 user-gesture tick 안에서 호출돼야 한다(특히 iOS Safari).
    // 원격 저장 fetch 를 await 로 먼저 기다리면 gesture 가 소실되어
    // navigator.share 가 NotAllowedError 로 막히고 clipboard fallback 만 탔다.
    // 해결: 저장 fetch 는 await 없이 "시작"만 하고(=동기 dispatch),
    // navigator.share 를 그 직후(첫 await 이전) 호출해 gesture 를 보존한다.
    // 저장 결과는 share 이후에 회수한다.
    const savePromise = ensureRemoteInviteDraft(draft);

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

    const saved = await savePromise;

    if (!saved) {
      // ensureRemoteInviteDraft 가 실패 피드백을 이미 설정함.
      setSelectedHomePersonId(targetPerson.id);
      return;
    }

    if (shareOutcome === "shared") {
      // 공유 시트가 열렸으면 중복 토스트를 띄우지 않는다.
      setPersonActionFeedback("");
      return;
    }

    if (shareOutcome === "aborted") {
      setSelectedHomePersonId(targetPerson.id);
      setPersonActionFeedback("공유를 취소했어요.");
      return;
    }

    // Web Share 미지원/비-secure context → 링크 복사 fallback.
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareTitle}\n${shareText}`);
        setSelectedHomePersonId(targetPerson.id);
        setPersonActionFeedback("초대 링크를 복사했어요.");
        return;
      } catch {
        // clipboard 도 실패하면 아래 안내로 떨어진다.
      }
    }

    setSelectedHomePersonId(targetPerson.id);
    setPersonActionFeedback("공유 기능을 사용할 수 없어요. 상세에서 다시 시도해 주세요.");
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
        {capNotice ? (
          <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-[96px] z-[130] flex justify-center px-6"
          >
            <div className="max-w-[340px] rounded-[18px] bg-[#2C2C2A] px-4 py-3 text-center text-[13px] font-semibold leading-snug text-[#F1EFE8] shadow-[0_12px_30px_rgba(15,23,42,0.25)]">
              {capNotice}
            </div>
          </div>
        ) : null}

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
                {hasUnreadSignal ? (
                  <span className="absolute right-[2px] top-[2px] h-[10px] w-[10px] rounded-full bg-red-500 ring-2 ring-white" />
                ) : null}
              </Link>
            </div>
          </div>
        </div>

        <div
          // Fold 펼침(≈1:1)처럼 세로가 짧은 viewport 에서는 레이어 5줄이 가용
          // 높이를 넘어 최하단(핵심/가족)이 잘렸다(P1). 홈 콘텐츠 영역만 세로
          // 스크롤을 허용해 잘림을 해소한다 — 긴 화면에선 콘텐츠가 다 들어가
          // 스크롤이 생기지 않으므로 기존과 동일. 드래그 중에는 touch-none 으로
          // 스크롤이 잠기고, 타일 발 터치는 touch-action:none(eae3fba)이라 pan
          // 을 시작하지 않아 빈 영역에서만 스크롤된다. pb 는 스크롤 끝에서
          // 마지막 레이어가 하단에 붙지 않게 하는 여백(스크롤 콘텐츠에 포함).
          className={`hide-scrollbar min-h-0 flex-1 overflow-y-auto px-[10px] pb-[12px] pt-[6px] [overscroll-behavior-y:contain] ${
            folderLongPressDragState ||
            layerSheetLongPressDragState ||
            homeMainLongPressDragState
              ? "touch-none"
              : ""
          }`}
        >
          <DashboardHomeShell>
            <div className="flex flex-col gap-[12px]">
              {/* Me 이름 미완성 사용자 activation: 본인 이름을 먼저 입력하도록
                  안내. drag/drop 레일(HomeLayerSection) 앞의 compact 인라인
                  CTA(모달/고정 아님). 전체 행이 /dashboard/me 로 이동하는 Link. */}
              {meNameIncomplete ? (
                <Link
                  href="/dashboard/me"
                  aria-label="Me 페이지에서 내 이름 입력하기"
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-[#E3D9C5] bg-[#FBF4E9] px-4 py-3 active:scale-[0.99]"
                >
                  <span className="min-w-0 text-[13px] font-semibold leading-snug text-[#7A5B2E]">
                    먼저 Me에서 내 이름을 입력해 주세요
                  </span>
                  <span className="shrink-0 rounded-full bg-[#2C2C2A] px-3 py-1.5 text-[12px] font-semibold text-[#F1EFE8]">
                    Me 입력하기
                  </span>
                </Link>
              ) : null}
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
                      // While a folder ghost drag is in flight, surface its
                      // hovered slot through the same dragOverState that
                      // home HTML5 drags use so LayerStrip's existing
                      // "놓기" highlight kicks in without any layer-strip
                      // code change. Outside of folder drag the original
                      // home dragOverState shows through unchanged.
                      dragOverState={folderGhostHoverState ?? dragOverState}
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
                      // Lock out home tiles as a new drag source while a
                      // folder ghost drag is already in flight, so the
                      // finger cannot hijack "나"/other home tiles as a
                      // second long-press / HTML5 drag source.
                      suppressDragSource={Boolean(folderLongPressDragState)}
                      longPressDraggingEntityId={longPressDraggingEntityId}
                    />
                  );
                }}
              />

              {/* Recommendation feed lives in a bottom sheet (Step A1).
                 The home view keeps a single compact opener that clearly
                 reads as a recommendation entry rather than a search icon.
                 Layout: left context label "연결 가능" + right action
                 "추천 보기 ›" so the button intent is unambiguous on
                 mobile at a glance. */}
              <div className="pt-[2px]">
                <button
                  type="button"
                  onClick={() => setRecommendationSheetOpen(true)}
                  aria-label="연결 가능 추천 보기"
                  className="flex w-full items-center justify-between rounded-[18px] border border-slate-200/85 bg-white/92 px-[16px] py-[12px] shadow-[0_2px_6px_rgba(15,23,42,0.05)] transition active:scale-[0.985]"
                >
                  <span className="text-[12px] font-medium text-slate-500">
                    연결 가능
                  </span>
                  <span className="flex items-center gap-[6px] text-[13px] font-semibold text-slate-700">
                    추천 보기
                    <span
                      aria-hidden="true"
                      className="text-[16px] leading-none text-slate-400"
                    >
                      ›
                    </span>
                  </span>
                </button>
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

      <HomeRecommendationSheet
        open={recommendationSheetOpen}
        onClose={() => setRecommendationSheetOpen(false)}
        ownerUserId={FIXED_OWNER_USER_ID}
        occupiedEntityIds={occupiedEntityIds}
        suppressedEntityIds={suppressedConnectableEntityIds}
        connectableStateMap={connectableStateMap}
        isDraggingCandidate={isConnectableDragActive}
        onOpenSearch={() => {
          setRecommendationSheetOpen(false);
          setSearchSheetOpen(true);
        }}
        onExploreCandidate={handleExploreRecommendation}
        onDismissCandidate={handleDismissCandidate}
        onDeferCandidate={handleDeferCandidate}
        onDragStartCandidate={(entityId) => {
          // Close the sheet before the ghost starts flying so the home
          // tiles below become the drop targets. drag/drop/persistence
          // logic itself is unchanged — only the opener is dismissed.
          setRecommendationSheetOpen(false);
          handleDragStart(
            CONNECTABLE_SOURCE_LAYER_ID,
            -1,
            entityId,
            "visible",
          );
        }}
        onDragEndCandidate={handleDragEnd}
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
          // Defensive: if the +N sheet is somehow still open when a
          // folder ghost drag begins, prevent its tiles from acting as a
          // second drag source.
          suppressDragSource={Boolean(folderLongPressDragState)}
          onPromoteHiddenToVisible={handlePromoteHiddenToVisible}
          onRequestMove={handleRequestLayerMoveMenu}
          onAddPerson={handleOpenAddToHidden}
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
          onRequestMove={handleRequestFolderMoveMenu}
        />
      ) : null}

      <HomeMoveMenu
        open={folderMoveMenuState !== null}
        personName={folderMoveEntityLabel}
        currentLayerLabel={openFolderTopLayer?.label ?? "현재"}
        targets={folderMoveTargets}
        onSendToCurrentHome={handleSendMoveMenuToCurrentHome}
        onSendToCurrentMore={handleSendMoveMenuToCurrentMore}
        onMoveToLayerHome={handleMoveMenuToLayerHome}
        onMoveToLayerMore={handleMoveMenuToLayerMore}
        onClose={closeFolderMoveMenu}
      />

      <HomeMoveMenu
        open={layerMoveMenuState !== null}
        personName={layerMoveEntityLabel}
        currentLayerLabel={layerMoveCurrentLabel}
        targets={layerMoveTargets}
        onSendToCurrentHome={() =>
          moveLayerEntityToLayer(
            layerMoveMenuState?.sourceLayerId ?? "",
            "visible",
          )
        }
        onSendToCurrentMore={() =>
          moveLayerEntityToLayer(
            layerMoveMenuState?.sourceLayerId ?? "",
            "hidden",
          )
        }
        onMoveToLayerHome={(layerKey) =>
          moveLayerEntityToLayer(layerKey, "visible")
        }
        onMoveToLayerMore={(layerKey) =>
          moveLayerEntityToLayer(layerKey, "hidden")
        }
        onClose={closeLayerMoveMenu}
      />

      <LongPressGhost state={folderLongPressDragState} />
      <LongPressGhost state={layerSheetLongPressDragState} />
      <LongPressGhost state={homeMainLongPressDragState} />

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
                name: getPersonDisplayName(selectedHomePerson),
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
