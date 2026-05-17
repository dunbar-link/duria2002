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

function isPersonActionNeeded(
  entityId: string,
  people: DashboardPerson[],
  getRecommendedAction: (person: DashboardPerson) => string,
) {
  const person = people.find((item) => item.id === entityId);

  if (!person || person.id === "me") {
    return false;
  }

  if (!(person as any).isJoined) {
    return true;
  }

  return getRecommendedAction(person) !== "maintain";
}

function hasUrgentInFolder(
  folder: FolderEntity,
  folders: FolderMap,
  people: DashboardPerson[],
  getRecommendedAction: (person: DashboardPerson) => string,
): boolean {
  return folder.memberIds.some((memberId) => {
    if (!memberId || typeof memberId !== "string") {
      return false;
    }

    const nestedFolder = folders[memberId];

    if (nestedFolder) {
      return hasUrgentInFolder(
        nestedFolder,
        folders,
        people,
        getRecommendedAction,
      );
    }

    return isPersonActionNeeded(memberId, people, getRecommendedAction);
  });
}

export function UrgentBadge() {
  return (
    <span
      className="pointer-events-none absolute right-[-2px] top-[-2px] z-20 rounded-full border-2 border-white bg-[#E24B4A]"
      style={{ width: 9, height: 9 }}
    />
  );
}


export function BlueSignalBadge() {
  return (
    <span className="pointer-events-none absolute left-[-2px] top-[-2px] z-20 h-[11px] w-[11px] rounded-full border-2 border-white bg-blue-500 shadow-[0_3px_8px_rgba(59,130,246,0.26)]" />
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

    return people.some((person: Record<string, unknown>) => {
      if (person.id !== entityId) {
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
      return serverIdCandidates.some(
        (value) =>
          typeof value === "string" && value.trim().length > 0,
      );
    });
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

  if (effectiveImageUrl) {
    return (
      <img
        src={effectiveImageUrl}
        alt=""
        className="object-cover shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
        style={{
          width: tileSize,
          height: tileSize,
          borderRadius: 14,
          border: faceBorder,
        }}
      />
    );
  }

  if (avatarEmoji) {
    return (
      <div
        className="flex items-center justify-center shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
        style={{
          width: tileSize,
          height: tileSize,
          borderRadius: 14,
          background: isMe ? SELF_PURPLE_BG : layerColor.bg,
          border: faceBorder,
          color: isMe ? SELF_PURPLE_TEXT : layerColor.text,
          fontSize: 28,
        }}
      >
        <span className="leading-none">{avatarEmoji}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center font-semibold shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: 14,
        background: faceBackground,
        border: faceBorder,
        color: faceText,
      }}
    >
      <span className="text-[18px] leading-none tracking-[-0.02em]">
        {isMe && meName ? meName.slice(0, 2) : initials}
      </span>
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

          return (
            <div
              key={`${folder.id}-${memberId}-${index}`}
              className="flex items-center justify-center rounded-[6px] bg-white/82 text-[8px] font-semibold text-slate-700"
            >
              <span className="leading-none">{text}</span>
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
  tileSize = HOME_TILE_WIDTH,
}: {
  entityId: string;
  folders: FolderMap;
  tintClass: string;
  layerId?: string;
  isConnected?: boolean;
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
      imageUrl={person.imageUrl}
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpenFolder,
  onPersonClick,
  onLongPressDragStart,
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
}) {
  const folder = folders[entityId];
  const person = folder ? null : personCatalog[entityId];
  const people = usePeopleStore((state) => state.people);
  const getRecommendedAction = usePeopleStore(
    (state) => state.getRecommendedAction,
  );
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
    ? hasUrgentInFolder(folder, folders, people, getRecommendedAction)
    : isPersonActionNeeded(entityId, people, getRecommendedAction);

  const showBlueSignalBadge = folder
    ? hasBlueSignalInFolder(folder, folders, people, blueSignalSenderIds)
    : hasBlueSignalForPerson(entityId, people, blueSignalSenderIds);

  const isConnected = !folder && isJoinedEntity(entityId);
  const isHighPriority = !folder && showUrgentBadge;

  const longPressEnabled = Boolean(onLongPressDragStart && !folder);
  const { bind: longPressBind, wasLongPressedRef, cancelLongPress } = useLongPress({
    onLongPress: (point) => {
      if (!onLongPressDragStart) return;
      onLongPressDragStart(entityId, point);
    },
    delay: 420,
    moveTolerance: 8,
    disabled: !longPressEnabled,
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
      touchAction: "manipulation",
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none",
    }}
    draggable
    {...(longPressEnabled ? longPressBind : {})}
    onDragStart={() => {
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
          : getEntityLabel(entityId, folders)}
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
      <button
        type="button"
        onClick={() => {
          if (consumeLongPressClickIfNeeded()) return;
          onPersonClick(entityId);
        }}
        className="shrink-0 overflow-visible text-left transition-transform duration-150 hover:-translate-y-[1px] active:scale-[0.985]"
      >
        {wrappedTile}
      </button>
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
        className="relative z-10 flex items-center justify-center text-[15px] font-semibold transition-all duration-200"
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
          transform: isDropTarget ? "scale(1.06)" : "scale(1)",
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
        aria-label={`더보기 ${hiddenCount <= 0 ? "E" : `+${hiddenCount}`}명`}
        onClick={onClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="relative z-10 block shrink-0 cursor-pointer overflow-visible transition-all duration-150 hover:-translate-y-[1px] active:scale-[0.985]"
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
          {hiddenCount <= 0 ? "E" : `+${hiddenCount}`}
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
    <div className="relative h-[58px] w-[64px] shrink-0">
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