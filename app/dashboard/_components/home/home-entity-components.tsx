"use client";

import Link from "next/link";
import { useEffect, useState, type DragEvent } from "react";
import {
  type DragSourceArea,
  type FolderEntity,
  type FolderMap,
  HOME_TILE_WIDTH,
} from "./home-page-types";
import { cn, getEntityLabel } from "./home-page-utils";
import { personCatalog } from "./home-page-types";
import { usePeopleStore } from "../../people/store";
import type { DashboardPerson } from "../../people/data";
import { getPersonDisplayName, getPersonDisplayPhoto } from "../../people/data";
import { getLayerColor } from "./layer-color";
import { useLongPress } from "../use-long-press";

const DRAG_HITBOX_EXPAND_PX = 10;
const SELF_PURPLE_BG = "#E5E7EB";
const SELF_PURPLE_BORDER = "#475569";
const SELF_PURPLE_TEXT = "#334155";

const HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY = "dunbar-link-home-blue-signal-senders-v1";
const HOME_BLUE_SIGNAL_CHANGE_EVENT = "dunbar-link-blue-signals-changed";
const PROFILE_STORAGE_KEY = "dunbar-link-me-profile-v3";
const PROFILE_UPDATED_EVENT = "dunbar-link-me-profile-updated";

// 터치(거친 포인터) 기기를 감지한다. 이런 기기에서 person 타일에 native HTML5
// draggable 이 켜져 있으면 길게 누를 때 브라우저가 native drag 를 시작하고,
// 그 onDragStart 가 cancelLongPress() 를 호출해 pointer 기반 long-press 고스트를
// 가로챈다(=이동 고스트가 안 뜸). 이 값으로 터치에서는 person 타일 native drag 를
// 꺼서 long-press 시스템이 터치를 전담하게 한다. SSR 안전을 위해 초기값은 false.
function useIsCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    return undefined;
  }, []);

  return coarse;
}

function readMeProfileImageUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const imageUrl = parsed?.imageUrl;
    const imageDataUrl = parsed?.imageDataUrl;

    if (typeof imageUrl === "string" && imageUrl.trim()) {
      return imageUrl;
    }

    return typeof imageDataUrl === "string" ? imageDataUrl : "";
  } catch {
    return "";
  }
}

function readMeProfileName() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const name = parsed?.name;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

function readBlueSignalSenderIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    );
  } catch {
    return new Set<string>();
  }
}

function getConnectedUserId(entityId: string, people: DashboardPerson[]) {
  const person = people.find((item) => item.id === entityId);

  if (!person) {
    return "";
  }

  const record = person as DashboardPerson & Record<string, unknown>;
  const userIdCandidates = [record.userId, record.dlUserId, record.acceptedPersonId];

  for (const candidate of userIdCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function hasBlueSignalForPerson(
  entityId: string,
  people: DashboardPerson[],
  senderIds: Set<string>,
) {
  const userId = getConnectedUserId(entityId, people);
  return Boolean(userId && senderIds.has(userId));
}

function hasBlueSignalInFolder(
  folder: FolderEntity,
  folders: FolderMap,
  people: DashboardPerson[],
  senderIds: Set<string>,
): boolean {
  return folder.memberIds.some((memberId) => {
    if (!memberId || typeof memberId !== "string") {
      return false;
    }

    const nestedFolder = folders[memberId];

    if (nestedFolder) {
      return hasBlueSignalInFolder(nestedFolder, folders, people, senderIds);
    }

    return hasBlueSignalForPerson(memberId, people, senderIds);
  });
}

// Home 타일 오른쪽 위 빨간 배지(UrgentBadge) 전용 조건.
// "아직 연결되지 않은 사람(미가입/초대중/연결 전)"에게만 표시한다.
// 연결 완료(isJoined=true)된 사람은 cadence 가 due 여도 여기서 빨간점을 켜지 않는다
// (cadence 기반 챙김 표시는 People/상세 책임이며, store 의 getRecommendedAction 계산은
//  그대로 보존한다 — 단지 Home 타일 빨간점에 더는 쓰지 않을 뿐).
function isUnjoinedBadgeNeeded(
  entityId: string,
  people: DashboardPerson[],
) {
  const person = people.find((item) => item.id === entityId);

  if (!person || person.id === "me") {
    return false;
  }

  return (person as any).isJoined !== true;
}

function hasUnjoinedInFolder(
  folder: FolderEntity,
  folders: FolderMap,
  people: DashboardPerson[],
): boolean {
  return folder.memberIds.some((memberId) => {
    if (!memberId || typeof memberId !== "string") {
      return false;
    }

    const nestedFolder = folders[memberId];

    if (nestedFolder) {
      return hasUnjoinedInFolder(nestedFolder, folders, people);
    }

    return isUnjoinedBadgeNeeded(memberId, people);
  });
}

export function UrgentBadge() {
  return (
    <span
      role="img"
      aria-label="챙길 사람"
      title="챙길 사람"
      className="pointer-events-none absolute right-[-2px] top-[-2px] z-20 rounded-full border-2 border-white bg-[#E24B4A] shadow-[0_2px_6px_rgba(226,75,74,0.30)]"
      style={{ width: 10, height: 10 }}
    />
  );
}


export function BlueSignalBadge() {
  return (
    <span
      role="img"
      aria-label="받은 신호"
      title="받은 신호"
      className="pointer-events-none absolute left-[-2px] top-[-2px] z-20 h-[12px] w-[12px] rounded-full border-2 border-white bg-blue-500 shadow-[0_3px_8px_rgba(59,130,246,0.26)]"
    />
  );
}


function isJoinedEntity(entityId: string) {
  try {
    if (typeof window === "undefined") {
      return false;
    }

    const raw = window.localStorage.getItem("dunbar-link-dashboard-people-store");

    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    const people = Array.isArray(state?.people) ? state.people : [];
    const inviteDrafts = Array.isArray(state?.inviteDrafts)
      ? state.inviteDrafts
      : [];

    const person = people.find(
      (item: Record<string, unknown>) => item.id === entityId,
    );

    if (!person) {
      return false;
    }
    if (person.isJoined !== true) {
      return false;
    }
    const serverIdCandidates = [
      person.userId,
      person.dlUserId,
      person.acceptedPersonId,
    ];
    const hasServerId = serverIdCandidates.some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
    if (!hasServerId) {
      return false;
    }

    // Safety net: if a pending invite is still attached to this person, treat
    // the tile as "not connected yet" so the dashed border (PersonFace) stays.
    // Prevents the 진한 테두리 false-positive when isJoined/userId leak in
    // before the invite is actually accepted (stale matchers in
    // syncAcceptedInvitesToPeople etc.). Accepted invites have status="accepted"
    // and are intentionally excluded from this gate.
    const personName =
      typeof person.name === "string" ? person.name.trim().toLowerCase() : "";
    const hasPendingInvite = inviteDrafts.some(
      (draft: Record<string, unknown>) => {
        if (draft.status !== "pending") return false;
        if (draft.sourcePersonId === entityId) return true;
        if (draft.provisionalPersonId === entityId) return true;
        const inviteeName =
          typeof draft.inviteeName === "string"
            ? draft.inviteeName.trim().toLowerCase()
            : "";
        if (personName && inviteeName && personName === inviteeName) {
          return true;
        }
        return false;
      },
    );

    if (hasPendingInvite) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}


export function GroupPreviewIcon({
  preview,
  tintClass,
  tileSize = HOME_TILE_WIDTH,
}: {
  preview: string[];
  tintClass: string;
  tileSize?: number;
}) {
  const items = preview.slice(0, 9);
  const gridItems = Array.from({ length: 9 }, (_, index) => items[index] ?? null);

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-[2px] rounded-[18px] border border-slate-300/90 p-[5px] shadow-[0_6px_14px_rgba(15,23,42,0.05)]",
        tintClass,
      )}
      style={{ width: tileSize, height: tileSize }}
    >
      {gridItems.map((item, index) => (
        <div
          key={`${item ?? "empty"}-${index}`}
          className={cn(
            "flex items-center justify-center rounded-[5px] text-[8px] font-semibold",
            item
              ? "bg-white/74 text-slate-600"
              : "border border-dashed border-white/60 bg-white/22 text-transparent",
          )}
        >
          {item ?? "·"}
        </div>
      ))}
    </div>
  );
}

export function PersonFace({
  initials,
  avatarEmoji,
  imageUrl,
  isMe,
  isConnected,
  tintClass,
  layerId,
  tileSize = HOME_TILE_WIDTH,
}: {
  initials: string;
  avatarEmoji?: string;
  imageUrl?: string;
  isMe?: boolean;
  isConnected?: boolean;
  tintClass: string;
  layerId?: string;
  tileSize?: number;
}) {
  const [hasMounted, setHasMounted] = useState(false);
  const [meProfileImageDataUrl, setMeProfileImageDataUrl] = useState("");
  const [meName, setMeName] = useState("");

  useEffect(() => {
    setHasMounted(true);

    if (!isMe) {
      return;
    }

    function syncProfile() {
      setMeProfileImageDataUrl(readMeProfileImageUrl());
      setMeName(readMeProfileName());
    }

    syncProfile();
    window.addEventListener(PROFILE_UPDATED_EVENT, syncProfile);
    window.addEventListener("storage", syncProfile);

    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, syncProfile);
      window.removeEventListener("storage", syncProfile);
    };
  }, [isMe]);

  const layerColor = getLayerColor(layerId ?? "friendly");
  const effectiveImageUrl = hasMounted
    ? isMe && meProfileImageDataUrl
      ? meProfileImageDataUrl
      : imageUrl
    : "";
  const faceBackground = isMe ? SELF_PURPLE_BG : layerColor.bg;
  const faceBorder = isMe
    ? `2.5px solid ${SELF_PURPLE_BORDER}`
    : isConnected
      ? `2.5px solid ${layerColor.text}`
      : `1.5px dashed ${layerColor.border}`;
  const faceText = isMe ? SELF_PURPLE_TEXT : layerColor.text;

  // 베이스(이모지 또는 이니셜)를 항상 그리고, 사진이 있으면 그 위에 덮는다.
  // 사진 URL 이 깨지면(onError) 이미지를 숨겨 베이스(이니셜)로 폴백한다 —
  // per-item state 없이 동작. isMe 타일의 localStorage 사진 경로는 그대로 유지.
  const baseContent = avatarEmoji ? (
    <span className="leading-none" style={{ fontSize: 28 }}>
      {avatarEmoji}
    </span>
  ) : (
    <span className="text-[18px] font-semibold leading-none tracking-[-0.02em]">
      {isMe && meName ? meName.slice(0, 2) : initials}
    </span>
  );

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: 14,
        background: faceBackground,
        border: faceBorder,
        color: faceText,
      }}
    >
      {baseContent}
      {effectiveImageUrl ? (
        <img
          src={effectiveImageUrl}
          alt=""
          // P2-4i-b: native 이미지 드래그/포인터 가로채기 방지(부모 타일이 제스처
          // 처리). 폴더 시트 멤버 타일도 P2-4i 로 사진을 받으므로 함께 보강.
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

function buildFolderPreviewMembers(folder: FolderEntity) {
  const compactIds = folder.memberIds.filter(
    (memberId): memberId is string =>
      typeof memberId === "string" && memberId.length > 0,
  );

  const previewMembers = [...compactIds];

  while (previewMembers.length < 9) {
    previewMembers.push("");
  }

  return previewMembers.slice(0, 9);
}

export function FolderPreviewIcon({
  folder,
  folders,
  tintClass,
  tileSize = HOME_TILE_WIDTH,
}: {
  folder: FolderEntity;
  folders: FolderMap;
  tintClass: string;
  tileSize?: number;
}) {
  const previewMembers = buildFolderPreviewMembers(folder);
  // P2-4i: 폴더 미니 아이콘에 프로필 사진을 반영하기 위해 live people 을 구독한다.
  // 사진이 있으면 썸네일, 없으면 기존 이니셜/이모지 텍스트(폴백)를 유지한다.
  const people = usePeopleStore((state) => state.people);

  return (
    <div
      className={cn(
        "relative rounded-[18px] border border-slate-300/90 p-[4px] shadow-[0_6px_14px_rgba(15,23,42,0.06)]",
        tintClass,
      )}
      style={{ width: tileSize, height: tileSize }}
    >
      <div className="grid h-full w-full grid-cols-3 gap-[2px] rounded-[12px] bg-white/42 p-[3px]">
        {previewMembers.map((memberId, index) => {
          if (!memberId) {
            return (
              <div
                key={`${folder.id}-empty-${index}`}
                className="rounded-[6px] border border-dashed border-white/60 bg-white/25"
              />
            );
          }

          if (folders[memberId]) {
            return (
              <div
                key={`${folder.id}-${memberId}-${index}`}
                className="flex items-center justify-center rounded-[6px] bg-white/82 text-[8px] font-semibold text-slate-700"
              >
                □
              </div>
            );
          }

          const person = personCatalog[memberId];
          const text =
            person?.avatarEmoji ||
            person?.initials ||
            person?.groupPreview?.[0] ||
            "•";
          // 연결 상대의 최신 remote 프로필 사진(없으면 빈 값 → 텍스트 폴백).
          // invite-pending 멤버도 people store 에 있어 같은 경로로 조회된다.
          const livePerson = people.find((candidate) => candidate.id === memberId);
          const photo = livePerson ? getPersonDisplayPhoto(livePerson) : "";

          return (
            <div
              key={`${folder.id}-${memberId}-${index}`}
              className="relative flex items-center justify-center overflow-hidden rounded-[6px] bg-white/82 text-[8px] font-semibold text-slate-700"
            >
              <span className="leading-none">{text}</span>
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  // P2-4i-b: <img> 는 기본 draggable=true 라 길게 누르면 native
                  // 이미지 드래그가 타일 pointer/drag lifecycle 을 가로채 Home 이
                  // 멈출 수 있다. pointer-events-none + draggable=false 로 부모
                  // 타일이 모든 제스처를 받게 한다.
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BaseEntityVisual({
  entityId,
  folders,
  tintClass,
  layerId,
  isConnected,
  liveImageUrl,
  tileSize = HOME_TILE_WIDTH,
}: {
  entityId: string;
  folders: FolderMap;
  tintClass: string;
  layerId?: string;
  isConnected?: boolean;
  // live people store 에서 계산한 연결 상대의 remote 프로필 사진(없으면 빈 값).
  // 정적 personCatalog 의 imageUrl 보다 우선한다(me 타일은 PersonFace 가 별도 처리).
  liveImageUrl?: string;
  tileSize?: number;
}) {
  const folder = folders[entityId];

  if (folder) {
    return (
      <FolderPreviewIcon
        folder={folder}
        folders={folders}
        tintClass={tintClass}
        tileSize={tileSize}
      />
    );
  }

  const person = personCatalog[entityId];

  if (!person) {
    return (
      <div
        className="flex items-center justify-center rounded-[18px] border border-slate-300/90 bg-white text-slate-400 shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
        style={{ width: tileSize, height: tileSize }}
      >
        ?
      </div>
    );
  }

  if (person.type === "group") {
    return (
      <GroupPreviewIcon
        preview={person.groupPreview ?? []}
        tintClass={tintClass}
        tileSize={tileSize}
      />
    );
  }

  return (
    <PersonFace
      initials={person.initials}
      avatarEmoji={person.avatarEmoji}
      imageUrl={liveImageUrl || person.imageUrl}
      isMe={person.isMe}
      isConnected={isConnected}
      tintClass={tintClass}
      layerId={layerId}
      tileSize={tileSize}
    />
  );
}

export function PersonTile({
  entityId,
  folders,
  tintClass,
  layerId,
  index,
  sourceArea,
  isDragging,
  isDropTarget,
  isCombineTarget,
  isDragActive,
  tileWidth = HOME_TILE_WIDTH,
  labelMaxWidth = 58,
  suppressDragSource = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpenFolder,
  onPersonClick,
  onLongPressDragStart,
  deferPointerCaptureUntilLongPress = false,
}: {
  entityId: string;
  folders: FolderMap;
  tintClass: string;
  layerId: string;
  index: number;
  sourceArea: DragSourceArea;
  isDragging: boolean;
  isDropTarget: boolean;
  isCombineTarget: boolean;
  isDragActive: boolean;
  tileWidth?: number;
  labelMaxWidth?: number;
  // When true (and for family-me always), this tile will not start a new
  // HTML5 drag or long-press drag. Used by the home view while a folder
  // ghost drag is already in flight so the finger cannot accidentally
  // hijack a home tile as a second drag source.
  suppressDragSource?: boolean;
  onDragStart: (
    layerId: string,
    index: number,
    entityId: string,
    sourceArea: DragSourceArea,
  ) => void;
  onDragEnd: () => void;
  onDragOver: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean,
  ) => void;
  onDrop: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean,
  ) => void;
  onOpenFolder: (folderId: string) => void;
  onPersonClick?: (entityId: string) => void;
  onLongPressDragStart?: (
    entityId: string,
    point: { x: number; y: number },
  ) => void;
  // Home rail tiles set this true so setPointerCapture is deferred to the
  // long-press fire — a plain tap then keeps its synthetic click on mobile.
  // Overflow/folder sheet tiles leave it false (capture on pointerdown) to
  // stay scroll-stable during the hold.
  deferPointerCaptureUntilLongPress?: boolean;
}) {
  const folder = folders[entityId];
  const person = folder ? null : personCatalog[entityId];
  const people = usePeopleStore((state) => state.people);
  const isCoarsePointer = useIsCoarsePointer();
  const [blueSignalSenderIds, setBlueSignalSenderIds] = useState<Set<string>>(
    () => readBlueSignalSenderIds(),
  );
  const [meTileLabel, setMeTileLabel] = useState("");

  useEffect(() => {
    function syncBlueSignalSenderIds() {
      setBlueSignalSenderIds(readBlueSignalSenderIds());
    }

    syncBlueSignalSenderIds();
    window.addEventListener(HOME_BLUE_SIGNAL_CHANGE_EVENT, syncBlueSignalSenderIds);
    window.addEventListener("storage", syncBlueSignalSenderIds);

    return () => {
      window.removeEventListener(
        HOME_BLUE_SIGNAL_CHANGE_EVENT,
        syncBlueSignalSenderIds,
      );
      window.removeEventListener("storage", syncBlueSignalSenderIds);
    };
  }, []);

  useEffect(() => {
    if (entityId !== "family-me") return;

    function syncMeLabel() {
      setMeTileLabel(readMeProfileName());
    }

    syncMeLabel();
    window.addEventListener(PROFILE_UPDATED_EVENT, syncMeLabel);
    window.addEventListener("storage", syncMeLabel);

    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, syncMeLabel);
      window.removeEventListener("storage", syncMeLabel);
    };
  }, [entityId]);

  const showUrgentBadge = folder
    ? hasUnjoinedInFolder(folder, folders, people)
    : isUnjoinedBadgeNeeded(entityId, people);

  const showBlueSignalBadge = folder
    ? hasBlueSignalInFolder(folder, folders, people, blueSignalSenderIds)
    : hasBlueSignalForPerson(entityId, people, blueSignalSenderIds);

  const isConnected = !folder && isJoinedEntity(entityId);
  const isHighPriority = !folder && showUrgentBadge;

  // Step F6: aria-label/title hint mirroring handleHomePersonClick's branches.
  // Visual UI unchanged; this only helps screen readers and desktop hover
  // learn what a tap will actually do (signal reply / invite share / detail).
  // Home 타일 표시명은 live people store 의 getPersonDisplayName 을 최우선 사용한다.
  // personCatalog(모듈 전역) 라벨은 갱신 타이밍/읽기 경로상 stale 될 수 있어
  // (People/Signals 는 최신인데 Home 만 옛 이름) catalog 는 fallback 으로만 둔다.
  // PersonTile 은 위에서 people 를 구독하므로 store 변경에 즉시 반응한다.
  const livePersonForLabel =
    folder || entityId === "family-me"
      ? null
      : people.find((candidate) => candidate.id === entityId) ?? null;
  const liveDisplayName = livePersonForLabel
    ? getPersonDisplayName(livePersonForLabel)
    : "";
  // 연결 상대의 최신 remote 프로필 사진(없으면 빈 값 → 이니셜 폴백).
  const liveImageUrl = livePersonForLabel
    ? getPersonDisplayPhoto(livePersonForLabel)
    : "";
  const tileLabel =
    entityId === "family-me" && meTileLabel
      ? meTileLabel
      : liveDisplayName || getEntityLabel(entityId, folders);
  const tapActionHint =
    entityId === "family-me"
      ? "내 프로필"
      : showBlueSignalBadge
        ? `${tileLabel} — 신호 답장`
        : !isConnected
          ? `${tileLabel} — 초대 공유`
          : `${tileLabel} — 상세 보기`;

  // family-me is never a valid drag source under any path; combine with the
  // consumer-provided suppressDragSource (e.g., set true while a folder
  // ghost drag is already in flight) to gate both long-press and HTML5
  // drag initiation. tap/click remains unaffected.
  const isMeTile = entityId === "family-me";
  const dragSourceBlocked = suppressDragSource || isMeTile;

  // 터치 기기(coarse pointer)에서는 person·folder 모두 native HTML5 drag 를 끈다.
  // person 은 long-press ghost 를 쓰고, folder 는 탭으로 시트만 연다.
  // P2-4i-b: 과거엔 folder 만 모바일 native drag 가 켜져 있었는데(`!folder`),
  // 폴더 미니 아이콘에 사진(<img>)이 들어오자 길게 누르면 native drag 가 시작돼
  // dragend/drop 이 안 와 dragState 가 stuck → Home freeze 가 됐다. 데스크톱
  // (정밀 포인터)은 person·folder 모두 HTML5 drag 를 그대로 쓴다.
  const nativeDragEnabled = !dragSourceBlocked && !isCoarsePointer;

  const longPressEnabled = Boolean(
    onLongPressDragStart && !folder && !dragSourceBlocked,
  );
  const { bind: longPressBind, wasLongPressedRef, cancelLongPress } = useLongPress({
    onLongPress: (point) => {
      if (!onLongPressDragStart) return;
      onLongPressDragStart(entityId, point);
    },
    delay: 420,
    moveTolerance: 8,
    disabled: !longPressEnabled,
    capturePointer: longPressEnabled,
    captureOnPointerDown: !deferPointerCaptureUntilLongPress,
  });

  const tileCore = (
  <div
    data-slot
    data-layer-id={layerId}
    data-index={index}
    className={cn(
      "group relative z-10 flex shrink-0 cursor-pointer flex-col items-center overflow-visible rounded-[20px] transition-all duration-200",
      isHighPriority && "scale-[1.08] z-20",
      isDragActive && "will-change-transform",
      isDragging && "z-20 scale-[0.92] opacity-35",
      !isDragging && isDropTarget && "scale-[1.05]",
    )}
    style={{
      width: tileWidth,
      // 홈 레일(비스크롤)의 long-press drag 소스 타일은 touch-action: none.
      // manipulation 은 pan 을 허용하므로 ghost 생성 후 손가락이 움직이는 순간
      // Chrome 이 터치를 스크롤 제스처로 가져가며 pointercancel 을 쏘고(실기기
      // 진단 로그: start→ghost→+0.8s pointercancel), 이후 pointermove 가 끊겨
      // 이동이 불가능했다. touch-action 은 터치 시작 시점 요소 기준으로
      // 평가되므로 드래그 시작 후의 body lock(touch-action:none)으로는 막을 수
      // 없다. +N/폴더 시트 타일은 시트 스크롤을 위해 manipulation 을 유지한다.
      touchAction:
        longPressEnabled && deferPointerCaptureUntilLongPress
          ? "none"
          : "manipulation",
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none",
    }}
    draggable={nativeDragEnabled}
    {...(longPressEnabled ? longPressBind : {})}
    onDragStart={(event) => {
      if (dragSourceBlocked) {
        // Belt-and-braces: even though draggable={false}, prevent any
        // residual native drag initiation from claiming this tile as a
        // source while a folder ghost drag is active or this is me.
        event.preventDefault();
        return;
      }
      if (longPressEnabled) {
        cancelLongPress();
      }
      onDragStart(layerId, index, entityId, sourceArea);
    }}
    onDragEnd={onDragEnd}
    onDragOver={(event) => {
      event.stopPropagation();
      onDragOver(layerId, index, sourceArea, event, true);
    }}
    onDrop={(event) => {
      event.stopPropagation();
      onDrop(layerId, index, sourceArea, event, true);
    }}
    onContextMenu={(event) => event.preventDefault()}
  >
      <div
     className={cn(
  "relative overflow-visible rounded-[20px] p-[2px] transition-all duration-200",
  "[@media(pointer:coarse)]:motion-safe:group-active:scale-[1.04]",
  "[@media(pointer:coarse)]:group-active:ring-[1.5px] [@media(pointer:coarse)]:group-active:ring-slate-400/40",
  isDragActive && "bg-white/55",
  isDropTarget &&
    "bg-white/92 shadow-[0_10px_24px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/70",
  isCombineTarget &&
    "scale-[1.08] bg-white ring-2 ring-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.22)] outline outline-2 outline-slate-200/70",
)}
      >
 {isHighPriority && (
    <div className="absolute inset-0 rounded-[22px] bg-red-100/40 blur-[8px]" />
  )}
        <BaseEntityVisual
          entityId={entityId}
          folders={folders}
          tintClass={tintClass}
          layerId={layerId}
          isConnected={isConnected}
          liveImageUrl={liveImageUrl}
          tileSize={tileWidth - 4}
        />

        {showUrgentBadge ? <UrgentBadge /> : null}
        {showBlueSignalBadge ? <BlueSignalBadge /> : null}
      </div>

      <span
        className={cn(
          "mt-[5px] truncate text-center text-[10px] font-medium leading-none transition-colors duration-200",
          isDropTarget ? "text-slate-700" : "text-slate-500",
        )}
        style={{ maxWidth: labelMaxWidth }}
      >
        {entityId === "family-me" && meTileLabel
          ? meTileLabel
          : liveDisplayName || getEntityLabel(entityId, folders)}
      </span>
    </div>
  );

  const dropAssist =
    isDragActive && !isDragging ? (
      <div
        aria-hidden="true"
        className="absolute rounded-[24px]"
        style={{
          left: -DRAG_HITBOX_EXPAND_PX,
          top: -DRAG_HITBOX_EXPAND_PX,
          width: tileWidth + DRAG_HITBOX_EXPAND_PX * 2,
          height: tileWidth + 24 + DRAG_HITBOX_EXPAND_PX * 2,
        }}
        onDragOver={(event) => {
          event.stopPropagation();
          onDragOver(layerId, index, sourceArea, event, true);
        }}
        onDrop={(event) => {
          event.stopPropagation();
          onDrop(layerId, index, sourceArea, event, true);
        }}
      />
    ) : null;

  const wrappedTile = (
    <div
      className="relative flex shrink-0 items-start justify-center overflow-visible"
      style={{ width: tileWidth }}
    >
      {dropAssist}
      {tileCore}
    </div>
  );

  const consumeLongPressClickIfNeeded = () => {
    if (longPressEnabled && wasLongPressedRef.current) {
      wasLongPressedRef.current = false;
      return true;
    }
    return false;
  };

  if (folder) {
    return (
      <button
        type="button"
        onClick={() => {
          if (consumeLongPressClickIfNeeded()) return;
          onOpenFolder(entityId);
        }}
        className="shrink-0 overflow-visible text-left transition-transform duration-150 hover:-translate-y-[1px] active:scale-[0.985]"
      >
        {wrappedTile}
      </button>
    );
  }

  if (onPersonClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={tapActionHint}
        title={tapActionHint}
        onClick={() => {
          if (consumeLongPressClickIfNeeded()) return;
          onPersonClick(entityId);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (consumeLongPressClickIfNeeded()) return;
            onPersonClick(entityId);
          }
        }}
        className="shrink-0 cursor-pointer overflow-visible text-left transition-transform duration-150 hover:-translate-y-[1px] active:scale-[0.985]"
      >
        {wrappedTile}
      </div>
    );
  }

  if (person?.profileHref && sourceArea === "visible") {
    return (
      <div className="shrink-0 overflow-visible">
        <Link
          href={person.profileHref}
          aria-label={`${getEntityLabel(entityId, folders)} 열기`}
          className="block overflow-visible transition-transform duration-150 hover:-translate-y-[1px] active:scale-[0.985]"
          draggable={false}
          onClick={(event) => {
            if (consumeLongPressClickIfNeeded()) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {wrappedTile}
        </Link>
      </div>
    );
  }

  return wrappedTile;
}

export function EmptyDropSlot({
  layerId,
  index,
  tintClass,
  targetArea,
  isDropTarget,
  isDragActive,
  tileWidth = HOME_TILE_WIDTH,
  onDragOver,
  onDrop,
  onClick,
}: {
  layerId: string;
  index: number;
  tintClass: string;
  targetArea: DragSourceArea;
  isDropTarget: boolean;
  isDragActive: boolean;
  tileWidth?: number;
  onDragOver: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean,
  ) => void;
  onDrop: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean,
  ) => void;
  onClick?: () => void;
}) {
  const layerColor = getLayerColor(layerId);

  return (
    <button
      type="button"
      data-slot
      data-layer-id={layerId}
      data-index={index}
      className="relative flex shrink-0 flex-col items-center overflow-visible"
      style={{ width: tileWidth }}
      onClick={onClick}
      onDragOver={(event) => {
        event.stopPropagation();
        onDragOver(layerId, index, targetArea, event, false);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDrop(layerId, index, targetArea, event, false);
      }}
    >
      {isDragActive ? (
        <div
          aria-hidden="true"
          className="absolute rounded-[24px]"
          style={{
            left: -DRAG_HITBOX_EXPAND_PX,
            top: -DRAG_HITBOX_EXPAND_PX,
            width: tileWidth + DRAG_HITBOX_EXPAND_PX * 2,
            height: tileWidth + 24 + DRAG_HITBOX_EXPAND_PX * 2,
          }}
          onDragOver={(event) => {
            event.stopPropagation();
            onDragOver(layerId, index, targetArea, event, false);
          }}
          onDrop={(event) => {
            event.stopPropagation();
            onDrop(layerId, index, targetArea, event, false);
          }}
        />
      ) : null}

      <div
        className={`relative z-10 flex items-center justify-center text-[15px] font-semibold transition-all duration-200 motion-reduce:transition-none motion-reduce:transform-none ${
          isDropTarget ? "scale-[1.06]" : "scale-100"
        }`}
        style={{
          width: tileWidth - 4,
          height: tileWidth - 4,
          borderRadius: 14,
          background: isDropTarget ? "#FAFAF8" : layerColor.bg,
          border: `1.5px dashed ${isDropTarget ? layerColor.text : layerColor.border}`,
          color: layerColor.text,
          opacity: isDragActive ? 0.98 : 1,
          boxShadow: isDropTarget
            ? "0 10px 24px rgba(15,23,42,0.14)"
            : "0 4px 12px rgba(15,23,42,0.03)",
        }}
      >
        {isDropTarget ? "놓기" : "+"}
      </div>

      <span className="mt-[5px] text-[10px] font-medium leading-none text-transparent">
        empty
      </span>
    </button>
  );
}

export function CompactMoreIcon({
  hiddenCount,
  tintClass,
  layerId,
  isDropTarget,
  isDragActive,
  onClick,
  onDragOver,
  onDrop,
}: {
  hiddenCount: number;
  tintClass: string;
  layerId: string;
  isDropTarget: boolean;
  isDragActive: boolean;
  onClick: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  const layerColor = getLayerColor(layerId);
  const moreBackground = layerColor.bg;
  const moreBorder = layerColor.border;
  const moreText = layerColor.text;

  return (
    <div
      className={cn(
        "relative flex h-[58px] w-[54px] items-end justify-center rounded-[18px] transition-all duration-150",
        isDropTarget && "scale-[1.04]",
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragActive ? (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-[18px] transition-all duration-150",
            isDropTarget
              ? "bg-white/92 ring-2 ring-slate-200/80 shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
              : "bg-white/35",
          )}
        />
      ) : null}

      <button
        type="button"
        aria-label={hiddenCount <= 0 ? "친구 더 추가하기" : `더보기 +${hiddenCount}명`}
        onClick={onClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="relative z-10 block shrink-0 cursor-pointer overflow-visible p-[9px] transition-all duration-150 hover:-translate-y-[1px] active:scale-[0.985]"
      >
        <div
          className="flex h-[40px] w-[40px] items-center justify-center text-[12px] font-semibold shadow-[0_4px_10px_rgba(15,23,42,0.04)] transition-all duration-150"
          style={{
            borderRadius: 14,
            background: isDropTarget ? "#FAFAF8" : moreBackground,
            border: `1.5px solid ${isDropTarget ? moreText : moreBorder}`,
            color: isDropTarget ? moreText : moreText,
            boxShadow: isDropTarget
              ? "0 10px 24px rgba(15,23,42,0.14)"
              : "0 4px 10px rgba(15,23,42,0.04)",
          }}
        >
          {hiddenCount <= 0 ? "+" : `+${hiddenCount}`}
        </div>
      </button>
    </div>
  );
}

export function RightMetaColumn({
  label,
  countLabel,
  hiddenCount,
  layerId,
  labelClass,
  tintClass,
  isDragActive,
  isMoreDropTarget,
  onOpenMore,
  onDragOverMore,
  onDropToMore,
}: {
  label: string;
  countLabel: string;
  hiddenCount: number;
  layerId: string;
  labelClass: string;
  tintClass: string;
  isDragActive: boolean;
  isMoreDropTarget: boolean;
  onOpenMore: () => void;
  onDragOverMore: (event: DragEvent) => void;
  onDropToMore: (event: DragEvent) => void;
}) {
  const layerColor = getLayerColor(layerId);
  const metaText = layerColor.text;

  return (
    <div className="relative h-[68px] w-[64px] shrink-0">
      <div className="absolute right-0 top-0 flex items-center gap-[5px] whitespace-nowrap">
        <span
          className="text-[12px] font-semibold leading-none tracking-[-0.01em]"
          style={{ color: metaText }}
        >
          {label}
        </span>
        <span
          className="text-[12px] font-medium leading-none"
          style={{ color: "#A9A59A" }}
        >
          {countLabel.replace("/family", "/∞")}
        </span>
      </div>

      <div
        className="absolute bottom-0 right-0"
        data-drop-zone="more"
        data-layer-id={layerId}
        onDragOver={onDragOverMore}
        onDrop={onDropToMore}
      >
        <CompactMoreIcon
          hiddenCount={hiddenCount}
          tintClass={tintClass}
          layerId={layerId}
          isDropTarget={isMoreDropTarget}
          isDragActive={isDragActive}
          onClick={onOpenMore}
          onDragOver={onDragOverMore}
          onDrop={onDropToMore}
        />
      </div>
    </div>
  );
}