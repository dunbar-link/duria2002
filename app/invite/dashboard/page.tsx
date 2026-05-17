"use client";


import { subscribePushForUser } from "@/lib/push/push-client";
import { getCurrentUserId } from "@/lib/auth/current-user";
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


import { readUnreadSignalCount } from "@/lib/signal/read-signals";
import Link from "next/link";
import { sendSignal } from "@/lib/signal/send-signal";
import HomeRecommendationList from "../../dashboard/_components/recommendation/HomeRecommendationList";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardHomeHeader from "../../dashboard/_components/dashboard-home-header";
import DashboardHomeShell from "../../dashboard/_components/dashboard-home-shell";
import HomeLayerSection from "../../dashboard/_components/home/home-layer-section";
import FolderBottomSheet from "../../dashboard/_components/home/folder-bottom-sheet";
import LayerBottomSheet from "../../dashboard/_components/home/layer-bottom-sheet";
import LayerStrip from "../../dashboard/_components/home/layer-strip";
import HomeConnectableSearchSheet from "../../dashboard/_components/home/home-connectable-search-sheet";
import SignalBottomSheet from "../../dashboard/_components/home/signal-bottom-sheet";
import {
  CONNECTABLE_SOURCE_LAYER_ID,
  type ConnectableCandidateStateMap,
  type FolderMap,
  type LayerLayoutState,
  buildDynamicConnectableEntityId,
  layerBlueprints,
  personCatalog,
} from "../../dashboard/_components/home/home-page-types";
import {
  createInitialLayoutState,
  getEntityLabel,
  getHomeLayerDerivedStateMap,
  getSuppressedConnectableEntityIds,
  insertExternalEntityToTarget,
  markConnectableCandidateAddedToLayer,
  markConnectableCandidateDeferred,
  markConnectableCandidateDismissed,
  markConnectableCandidateExplored,
  readConnectableCandidateStateMap,
  writeConnectableCandidateStateMap,
} from "../../dashboard/_components/home/home-page-utils";
import { useFolderLongPressDrag } from "../../dashboard/_components/home/use-folder-long-press-drag";
import { useHomeDragDrop } from "../../dashboard/_components/home/use-home-drag-drop";
import { useHomeFolderInteractions } from "../../dashboard/_components/home/use-home-folder-interactions";
import { useHomeLayerSheet } from "../../dashboard/_components/home/use-home-layer-sheet";
import { useHomeLayoutStorage } from "../../dashboard/_components/home/use-home-layout-storage";
import HomeMoveMenu from "../../dashboard/_components/home-move-menu";
import { usePeopleStore, type InviteDraft } from "../../dashboard/people/store";

import { setRelationshipActionStarted } from "../../dashboard/people/relationship-status";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

const PENDING_EXPLORE_STORAGE_KEY = "dunbar-link-pending-explore-v1";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;
const DEFER_DURATION_MS = 60 * 60 * 1000;
const HOME_ONBOARDING_STORAGE_KEY = "dunbar-link-home-onboarding-dismissed-v1";

type HomeInviteTier = 1 | 5 | 15 | 50 | 150;

function getTierByLayerId(layerId: string): HomeInviteTier {
  if (layerId === "family") return 1;
  if (layerId === "core") return 5;
  if (layerId === "intimate") return 15;
  if (layerId === "trust") return 50;
  return 150;
}

function getLayerIdByTier(tier: number): string {
  if (tier === 1) return "family";
  if (tier === 5) return "core";
  if (tier === 15) return "intimate";
  if (tier === 50) return "trust";
  return "friendly";
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

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[16px] w-[16px]"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51L15.42 17.49" />
      <path d="M15.41 6.51L8.59 10.49" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[16px] w-[16px]"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function InviteShareCard() {
  const [feedback, setFeedback] = useState("");

  const shareTitle = "던바링크";
  const shareText = "중요한 사람을 놓치지 않게 도와주는 앱이야. 같이 써볼래?";
  const shareUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";


  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFeedback("");
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function handleShare() {
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        setFeedback("공유 창을 열었어요.");
        return;
      }

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(
          `${shareTitle}\n${shareText}\n${shareUrl}`,
        );
        setFeedback("문구를 복사했어요.");
        return;
      }

      setFeedback("이 브라우저에서는 바로 공유할 수 없어요.");
    } catch {
      setFeedback("공유를 취소했어요.");
    }
  }

  async function handleCopy() {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(
          `${shareTitle}\n${shareText}\n${shareUrl}`,
        );
        setFeedback("문구를 복사했어요.");
        return;
      }

      setFeedback("복사를 지원하지 않는 환경이에요.");
    } catch {
      setFeedback("복사에 실패했어요.");
    }
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white/95 px-[14px] py-[14px] shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-slate-800">
              친구 초대
            </h2>
            <span className="rounded-full bg-slate-100 px-[8px] py-[3px] text-[10px] font-semibold text-slate-500">
              베타
            </span>
          </div>

          <p className="mt-[6px] text-[12px] leading-[1.5] text-slate-600">
            링크를 보내고 같이 테스트할 수 있어요.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleShare();
            }}
            className="inline-flex h-[38px] items-center justify-center gap-[6px] rounded-[16px] bg-slate-900 px-[12px] text-[12px] font-semibold text-white"
          >
            <ShareIcon />
            공유
          </button>

          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            className="inline-flex h-[38px] items-center justify-center gap-[6px] rounded-[16px] border border-slate-200 bg-white px-[12px] text-[12px] font-semibold text-slate-700"
          >
            <CopyIcon />
            복사
          </button>
        </div>
      </div>

      {feedback ? (
        <div className="mt-[10px] rounded-[14px] bg-emerald-50 px-[12px] py-[9px] text-[12px] font-medium text-emerald-700 ring-1 ring-emerald-200">
          {feedback}
        </div>
      ) : null}
    </section>
  );
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
              사람을 넣고,
              <br />한 명씩 챙기면 돼요.
            </h2>

            <div className="mt-5 grid gap-2.5">
              <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-slate-900">
                  1. People에서 추가
                </p>
              </div>

              <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-slate-900">
                  2. Home에서 구조 보기
                </p>
              </div>

              <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-slate-900">
                  3. Focus에서 바로 연락
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

function HomePersonActionSheet({
  open,
  person,
  inviteDraft,
  feedback,
  onClose,
  onOpenDetail,
  onSendInvite,
  onCheckInviteStatus,
}: {
  open: boolean;
  person: { id: string; name: string } | null;
  inviteDraft: InviteDraft | null;
  feedback: string;
  onClose: () => void;
  onOpenDetail: () => void;
  onSendInvite: () => void;
  onCheckInviteStatus: () => void;
}) {
  if (!open || !person) {
    return null;
  }

  const statusMeta = getInviteStatusMeta(inviteDraft);

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
              <button
                type="button"
                onClick={onOpenDetail}
                className="flex h-[48px] w-full items-center justify-center rounded-[18px] bg-slate-900 text-[14px] font-semibold text-white"
              >
                상세 보기
              </button>

              <button
                type="button"
                onClick={onSendInvite}
                className="flex h-[48px] w-full items-center justify-center rounded-[18px] border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
              >
                초대 보내기
              </button>

              <button
                type="button"
                onClick={onCheckInviteStatus}
                className="flex h-[48px] w-full items-center justify-center rounded-[18px] border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
              >
                가입 상태 확인
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

function resolveReceiverUserId(
  person: { id: string } & Record<string, unknown>,
  inviteDraft: InviteDraft | null,
) {
  const directCandidates = [
    person.userId,
    person.user_id,
    person.authUserId,
    person.auth_user_id,
    person.dlUserId,
    person.dl_user_id,
  ];

  for (const value of directCandidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  if (inviteDraft?.acceptedPersonId?.trim()) {
    return inviteDraft.acceptedPersonId.trim();
  }

  return person.id;
}

export default function DashboardPage() {

  const router = useRouter();
  const people = usePeopleStore((state) => state.people);
  const addPerson = usePeopleStore((state) => state.addPerson);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const createInviteDraft = usePeopleStore((state) => state.createInviteDraft);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);

  const syncAcceptedInvitesToPeople = usePeopleStore(
    (state) => state.syncAcceptedInvitesToPeople,
  );

  const [layoutState, setLayoutState] = useState<
    Record<string, LayerLayoutState>
  >(() => createInitialLayoutState());
  const [folders, setFolders] = useState<FolderMap>({});

  useHomeLayoutStorage({
    layoutState,
    folders,
    setLayoutState,
    setFolders,
  });

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    void syncAcceptedInvitesToPeople();
  }, [hasHydrated, syncAcceptedInvitesToPeople]);

  const [connectableStateMap, setConnectableStateMap] =
    useState<ConnectableCandidateStateMap>({});
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [selectedHomePersonId, setSelectedHomePersonId] = useState<
    string | null
  >(null);
  const [signalOpen, setSignalOpen] = useState(false);
  const [signalTarget, setSignalTarget] = useState<{
    id: string;
    name: string;
    receiverUserId: string;
  } | null>(null);

const [signalCount, setSignalCount] = useState(0);
const [currentUserId, setCurrentUserId] = useState("");

const [notificationEnabled, setNotificationEnabled] = useState(false);

useEffect(() => {
  if (!canUseBrowserNotification()) {
    return;
  }

  setNotificationEnabled(Notification.permission === "granted");
}, []);

useEffect(() => {
  setCurrentUserId(getCurrentUserId());
}, []);

async function handleEnableNotification() {
  const userId = currentUserId || getCurrentUserId();
  setCurrentUserId(userId);

  const success = await subscribePushForUser(userId);
  setNotificationEnabled(success);
}


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
    const next = new Set<string>();

    for (const layer of Object.values(layoutState)) {
      for (const entityId of layer.visibleSlotIds) {
        if (typeof entityId === "string" && entityId.length > 0) {
          next.add(entityId);
        }
      }

      for (const entityId of layer.hiddenSlotIds) {
        if (typeof entityId === "string" && entityId.length > 0) {
          next.add(entityId);
        }
      }
    }

    return next;
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
  if (!currentUserId) {
    return;
  }

  async function loadSignalCount() {
    const count = await readUnreadSignalCount(currentUserId);
    setSignalCount(count);
  }

  void loadSignalCount();
}, [currentUserId]);

useEffect(() => {
  if (!currentUserId) {
    return;
  }

  const channel = supabase
    .channel(`realtime-signals-${currentUserId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "signals",
        filter: `receiver_id=eq.${currentUserId}`,
      },
      (payload) => {
        console.log("📩 새로운 신호 도착:", payload);

        readUnreadSignalCount(currentUserId).then((count) => {
          setSignalCount(count);
        });
showSignalNotification();

      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [currentUserId]);

useEffect(() => {
  if (!hasHydrated) {
    return;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  function triggerWhenVisible() {
    if (document.visibilityState !== "visible") {
      return;
    }
    void syncAcceptedInvitesToPeople();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      void syncAcceptedInvitesToPeople();
    }
  }

  function handleFocus() {
    void syncAcceptedInvitesToPeople();
  }

  const intervalId = window.setInterval(triggerWhenVisible, 60000);
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, [hasHydrated, syncAcceptedInvitesToPeople]);

  useEffect(() => {
    writeConnectableCandidateStateMap(connectableStateMap);
  }, [connectableStateMap]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const peopleIds = new Set<string>();

    for (const person of people) {
      registerAddedPersonToHomeCatalog({
        id: person.id,
        name: person.name,
      });
      peopleIds.add(person.id);
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

      const unplacedPeopleIds = new Set<string>();

      for (const personId of peopleIds) {
        if (!placedEntityIds.has(personId)) {
          unplacedPeopleIds.add(personId);
        }
      }

      if (unplacedPeopleIds.size === 0) {
        return current;
      }

      let updated = current;

      for (const personId of unplacedPeopleIds) {
        const matchedPerson = people.find((person) => person.id === personId);
        const targetLayerId = getLayerIdByTier(matchedPerson?.tier ?? 150);

        updated = insertExternalEntityToTarget(
          updated,
          personId,
          targetLayerId,
          "hidden",
        );
      }

      return updated;
    });
  }, [people, hasHydrated, folders]);

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

  const isConnectableDragActive =
    dragState?.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID;

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
  } = useHomeFolderInteractions({
    layoutState,
    setLayoutState,
    folders,
    setFolders,
  });

  const { dragState: folderLongPressDragState, beginDrag: beginFolderLongPressDrag } =
    useFolderLongPressDrag({
      onDrop: ({ folderId, entityId, layerId, area }) => {
        moveFolderEntityToLayer(folderId, entityId, layerId, area);
      },
    });

  const handleFolderLongPressDragStart = useCallback(
    (entityId: string, point: { x: number; y: number }) => {
      if (!openFolder) {
        return;
      }

      const sourceFolderId = openFolder.id;
      const label = getEntityLabel(entityId, folders);

      handleCloseFolder();
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
      handleCloseFolder,
      handleCloseMore,
      openFolder,
    ],
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
    const targetPid = entityId.startsWith("connectable:")
      ? entityId.slice("connectable:".length).trim()
      : entityId;

    const entityName =
      connectableStateMap[entityId]?.name ??
      personCatalog[entityId]?.canonicalName ??
      personCatalog[entityId]?.myAlias ??
      targetPid;

    setConnectableStateMap((current) =>
      markConnectableCandidateAddedToLayer(current, {
        entityId,
        targetPid,
        name: entityName,
        targetLayerId,
        targetArea: "visible",
        source: "home-connectable-search",
      }),
    );

    setLayoutState((current) => {
      const target = current[targetLayerId];

      if (!target) {
        return current;
      }

      const emptyIndex = target.visibleSlotIds.findIndex((slotId) => !slotId);

      if (emptyIndex >= 0) {
        return insertExternalEntityToTarget(
          current,
          entityId,
          targetLayerId,
          "visible",
          emptyIndex,
        );
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

  function handleExploreRecommendation(candidate: { pid: string; name: string }) {
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

    const isConnected = latestInviteDraft?.status === "accepted";

    if (!isConnected) {
      setSelectedHomePersonId(targetPerson.id);
      setPersonActionFeedback("아직 연결 전이에요. 먼저 초대해요.");
      return;
    }

    const receiverUserId = resolveReceiverUserId(targetPerson, latestInviteDraft);

    if (!receiverUserId) {
      setSelectedHomePersonId(targetPerson.id);
      setPersonActionFeedback("연결된 사용자 ID를 찾지 못했어요.");
      return;
    }

    setRelationshipActionStarted(entityId, "copy");
    setSignalTarget({
      id: targetPerson.id,
      name: targetPerson.name,
      receiverUserId,
    });
    setSignalOpen(true);
  }

  async function handleSendInviteFromPersonSheet() {
    if (!selectedHomePerson) {
      return;
    }

    const draft =
      selectedInviteDraft ??
      createInviteDraft({
        sourcePersonId: selectedHomePerson.id,
        inviteeName: selectedHomePerson.name,
        tier: selectedHomePerson.tier,
        relationshipType: selectedHomePerson.relationshipType,
      });

    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${draft.invitePath}`
        : draft.invitePath;

    const shareTitle = "던바링크 초대";
    const shareText = `${selectedHomePerson.name}님, 던바링크에 들어와서 자기 정보를 입력해줘.\n${inviteUrl}`;

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
        });
        setPersonActionFeedback("초대 링크를 열었어요.");
        return;
      }

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(`${shareTitle}\n${shareText}`);
        setPersonActionFeedback("초대 링크를 복사했어요.");
        return;
      }

      setPersonActionFeedback("이 브라우저에서는 공유를 바로 열 수 없어요.");
    } catch {
      setPersonActionFeedback("공유를 취소했어요.");
    }
  }

  function handleCheckInviteStatus() {
    if (!selectedInviteDraft) {
      setPersonActionFeedback("아직 초대를 보내지 않았어요.");
      return;
    }

    if (selectedInviteDraft.status === "accepted") {
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
     <main className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,#F6F1E9_0%,#F3F6FB_38%,#F2F3F5_100%)] text-slate-900">
  <div className="sticky top-0 z-20 shrink-0 bg-[linear-gradient(180deg,rgba(246,241,233,0.97)_0%,rgba(243,246,251,0.93)_70%,rgba(243,246,251,0)_100%)] px-[10px] pt-[10px] backdrop-blur-[6px]">
    <div className="relative">
      <DashboardHomeHeader />

      <div className="absolute right-[8px] top-[8px] z-[30] flex items-center gap-[6px]">
        <button
  type="button"
  onClick={() => {
    void handleEnableNotification();
  }}
  className="flex h-[42px] items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-[10px] text-[12px] font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.12)] active:scale-95"
>
  {notificationEnabled ? "알림 ON" : "알림"}
</button>

        <Link
          href="/dashboard/signals"
          className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full border border-slate-200 bg-white text-[21px] shadow-[0_8px_20px_rgba(15,23,42,0.12)] active:scale-95"
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

        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[10px] pb-[120px] pt-[6px] [overscroll-behavior-y:contain]">
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
                    />
                  );
                }}
              />

              <InviteShareCard />

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
        inviteDraft={selectedInviteDraft}
        feedback={personActionFeedback}
        onClose={handleClosePersonActionSheet}
        onOpenDetail={handleOpenSelectedPersonDetail}
        onSendInvite={() => {
          void handleSendInviteFromPersonSheet();
        }}
        onCheckInviteStatus={handleCheckInviteStatus}
      />

     <SignalBottomSheet
  open={signalOpen}
  onClose={() => {
    setSignalOpen(false);
  }}
  onSelect={async (emoji) => {
    if (!signalTarget) return;

    const senderId = currentUserId || getCurrentUserId();

    const success = await sendSignal(
      senderId,
      [signalTarget.receiverUserId],
      emoji,
    );

    if (!success) {
      console.log("개인 신호 실패");
      return;
    }

    console.log("개인 신호 성공:", signalTarget.name, emoji);

void fetch("/api/push/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    receiverIds: [signalTarget.receiverUserId],
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
