"use client";

import { sendSignal } from "@/lib/signal/send-signal";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useLongPress } from "../use-long-press";
import type {
  FolderDragOverState,
  FolderDragState,
  FolderEntity,
  FolderMap,
} from "./home-page-types";
import {
  SHEET_GRID_COLUMN_COUNT,
  SHEET_GRID_GAP_X,
  SHEET_TILE_WIDTH,
} from "./home-page-types";
import {
  cn,
  fillSlots,
  getEntityLabel,
  getEntityRealCount,
  getFolderDisplayName,
} from "./home-page-utils";
import { BaseEntityVisual, UrgentBadge } from "./home-entity-components";
import { personCatalog } from "./home-page-types";
import { usePeopleStore } from "../../people/store";
import type { DashboardPerson } from "../../people/data";
import SignalBottomSheet from "./signal-bottom-sheet";

type PersonRuntimeFlags = {
  isMe?: boolean;
  isJoined?: boolean;
  joined?: boolean;
  status?: string;
  connectionStatus?: string;
};


function isPersonActionNeeded(
  entityId: string,
  people: DashboardPerson[],
  getRecommendedAction: (person: DashboardPerson) => string,
) {
  const person = people.find((item) => item.id === entityId);

  if (!person || person.id === "me") {
    return false;
  }

  if (!((person as DashboardPerson & PersonRuntimeFlags).isJoined === true || (person as DashboardPerson & PersonRuntimeFlags).joined === true || (person as DashboardPerson & PersonRuntimeFlags).status === "joined" || (person as DashboardPerson & PersonRuntimeFlags).connectionStatus === "joined")) {
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
    if (!memberId || typeof memberId !== "string") return false;

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

function collectFolderPersonIds(folder: FolderEntity, folders: FolderMap): string[] {
  const collected: string[] = [];

  for (const memberId of folder.memberIds) {
    if (!memberId || typeof memberId !== "string") {
      continue;
    }

    const nestedFolder = folders[memberId];

    if (nestedFolder) {
      collected.push(...collectFolderPersonIds(nestedFolder, folders));
      continue;
    }

    const catalogPerson = personCatalog[memberId];

    if (catalogPerson?.isMe) {
      continue;
    }

    collected.push(memberId);
  }

  return Array.from(new Set(collected));
}

function FolderEmptySlot({
  tintClass,
  isDropTarget,
  isDragActive,
  tileWidth = SHEET_TILE_WIDTH,
  onDragOver,
  onDrop,
}: {
  tintClass: string;
  isDropTarget: boolean;
  isDragActive: boolean;
  tileWidth?: number;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center overflow-visible"
      style={{ width: tileWidth }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-[18px] border border-dashed text-[11px] font-medium transition-all duration-200",
          tintClass,
          isDragActive
            ? "border-slate-300/80 bg-white/68 text-slate-400 opacity-90"
            : "border-slate-200/70 text-slate-300 opacity-45",
          isDropTarget &&
            "scale-[1.06] border-slate-500 bg-white text-slate-600 shadow-[0_12px_26px_rgba(15,23,42,0.14)] ring-2 ring-slate-200/80",
        )}
        style={{ width: tileWidth - 4, height: tileWidth - 4 }}
      >
        {isDropTarget ? "놓기" : "자리"}
      </div>

      <span className="mt-[5px] text-[10px] font-medium leading-none text-transparent">
        empty
      </span>
    </div>
  );
}

function FolderMemberTile({
  entityId,
  folders,
  tintClass,
  index,
  tileWidth,
  isDragging,
  isDropTarget,
  isDragActive,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpenFolder,
  onLongPressDragStart,
  onPersonClick,
  people,
  getRecommendedAction,
}: {
  entityId: string;
  folders: FolderMap;
  tintClass: string;
  index: number;
  tileWidth: number;
  isDragging: boolean;
  isDropTarget: boolean;
  isDragActive: boolean;
  onDragStart: (index: number, entityId: string) => void;
  onDragEnd: () => void;
  onDragOver: (index: number, event: DragEvent, occupied: boolean) => void;
  onDrop: (index: number, event: DragEvent, occupied: boolean) => void;
  onOpenFolder: (folderId: string) => void;
  onLongPressDragStart: (
    entityId: string,
    point: { x: number; y: number },
  ) => void;
  onPersonClick?: (entityId: string) => void;
  people: DashboardPerson[];
  getRecommendedAction: (person: DashboardPerson) => string;
}) {
  const folder = folders[entityId];
  const person = folder ? null : personCatalog[entityId];

  const showUrgentBadge = folder
    ? hasUrgentInFolder(folder, folders, people, getRecommendedAction)
    : isPersonActionNeeded(entityId, people, getRecommendedAction);

  const { bind, wasLongPressedRef, cancelLongPress } = useLongPress({
    onLongPress: (point) => {
      onLongPressDragStart(entityId, point);
    },
    delay: 420,
    moveTolerance: 8,
    capturePointer: true,
  });

  function handleClick() {
    if (wasLongPressedRef.current) {
      wasLongPressedRef.current = false;
      return;
    }

    if (folder) {
      onOpenFolder(entityId);
      return;
    }

    if (onPersonClick) {
      onPersonClick(entityId);
      return;
    }
  }

  return (
    <div
      className={cn(
        "group flex shrink-0 cursor-pointer flex-col items-center overflow-visible rounded-[20px] transition-all duration-200",
        isDragActive && "will-change-transform",
        isDragging && "z-20 scale-[0.92] opacity-35",
        !isDragging && isDropTarget && "scale-[1.05]",
      )}
      style={{
        width: tileWidth,
        // touch-action: none so iOS/Android cannot classify a touch that
        // begins on a folder member tile as a pan/scroll gesture at
        // pointerdown. This closes the race where mid-gesture body
        // touch-action changes are ignored by the native gesture classifier
        // and pointermove/pointerup ownership gets handed to native scroll.
        // tap/click still fires normally.
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      draggable
      onDragStart={() => {
        cancelLongPress();
        onDragStart(index, entityId);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.stopPropagation();
        onDragOver(index, event, true);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDrop(index, event, true);
      }}
      onClick={handleClick}
      {...bind}
    >
      <div
        className={cn(
          "relative overflow-visible rounded-[20px] p-[2px] transition-all duration-200",
          isDragActive && "bg-white/55",
          isDropTarget &&
            "bg-white/92 shadow-[0_10px_24px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/70",
        )}
      >
        <BaseEntityVisual
          entityId={entityId}
          folders={folders}
          tintClass={tintClass}
          tileSize={tileWidth - 4}
        />

        {showUrgentBadge ? <UrgentBadge /> : null}
      </div>

      <span
        className={cn(
          "mt-[5px] truncate text-center text-[10px] font-medium leading-none transition-colors duration-200",
          isDropTarget ? "text-slate-700" : "text-slate-500",
        )}
        style={{ maxWidth: 58 }}
      >
        {getEntityLabel(entityId, folders)}
      </span>

      <span className="mt-[6px] text-[9px] font-medium leading-none text-slate-300">
        길게 눌러 이동
      </span>
    </div>
  );
}

type FolderBottomSheetProps = {
  folder: FolderEntity;
  folders: FolderMap;
  topLayerLabel: string;
  isVisible: boolean;
  folderDragState: FolderDragState;
  folderDragOverState: FolderDragOverState;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onDragStart: (index: number, entityId: string) => void;
  onDragEnd: () => void;
  onDragOver: (index: number, event: DragEvent, occupied: boolean) => void;
  onDrop: (index: number, event: DragEvent, occupied: boolean) => void;
  onOpenFolder: (folderId: string) => void;
  onLongPressDragStart: (
    entityId: string,
    point: { x: number; y: number },
  ) => void;
  onPersonClick?: (entityId: string) => void;
};

export default function FolderBottomSheet({
  folder,
  folders,
  topLayerLabel,
  isVisible,
  folderDragState,
  folderDragOverState,
  onClose,
  onChangeName,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpenFolder,
  onLongPressDragStart,
  onPersonClick,
}: FolderBottomSheetProps) {
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const markContacted = usePeopleStore((state) => state.markContacted);
  const getRecommendedAction = usePeopleStore(
    (state) => state.getRecommendedAction,
  );

  const [nameInput, setNameInput] = useState(folder.customName ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const [signalFeedback, setSignalFeedback] = useState("");

  useEffect(() => {
    setNameInput(folder.customName ?? "");
    setIsEditingName(false);
    setSignalFeedback("");
  }, [folder.id, folder.customName]);

  const directMemberIds = folder.memberIds;

  const allFolderPersonIds = useMemo(() => {
    return collectFolderPersonIds(folder, folders);
  }, [folder, folders]);

  const connectedMembers = useMemo(() => {
    return allFolderPersonIds
      .map((personId) => {
        const person = people.find((item) => item.id === personId);

        if (!person) {
          return null;
        }

        const latestInviteDraft = inviteDrafts
          .filter((draft) => draft.sourcePersonId === personId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

        if (latestInviteDraft?.status !== "accepted") {
          return null;
        }

        const personRecord = person as Record<string, unknown>;
        const receiverUserId =
          typeof personRecord.userId === "string"
            ? personRecord.userId
            : typeof personRecord.dlUserId === "string"
              ? personRecord.dlUserId
              : typeof personRecord.acceptedPersonId === "string"
                ? personRecord.acceptedPersonId
                : latestInviteDraft.acceptedPersonId;

        if (!receiverUserId) {
          return null;
        }

        return {
          personId,
          receiverUserId,
        };
      })
      .filter(
        (item): item is { personId: string; receiverUserId: string } =>
          Boolean(item),
      );
  }, [allFolderPersonIds, inviteDrafts, people]);

  const connectedMemberIds = useMemo(() => {
    return connectedMembers.map((item) => item.receiverUserId);
  }, [connectedMembers]);

  const gridIds = fillSlots(directMemberIds, Math.max(9, directMemberIds.length));
  const isDragActive = folderDragState !== null;
  const canSendFolderSignal = connectedMemberIds.length > 0;

  function handleSaveName() {
    onChangeName(nameInput);
    setIsEditingName(false);
  }

  function handleOpenSignalSheet() {
    if (!canSendFolderSignal) {
      setSignalFeedback("연결된 사람이 아직 없어요. 먼저 초대해 주세요.");
      return;
    }

    setSignalFeedback("");
    setSignalOpen(true);
  }

 async function handleSendFolderSignal(emoji: string) {
  if (connectedMemberIds.length === 0) {
    setSignalFeedback("보낼 수 있는 연결된 사람이 없어요.");
    return;
  }

  const senderId = getCurrentUserId();

  const success = await sendSignal(senderId, connectedMemberIds, emoji);

  if (!success) {
    setSignalFeedback("신호 전송에 실패했어요.");
    return;
  }

  for (const member of connectedMembers) {
    markContacted(member.personId);
  }

  setSignalFeedback(`${emoji} ${connectedMemberIds.length}명에게 보냈어요.`);
}


  return (
    <>
      <button
        type="button"
        aria-label="폴더 시트 닫기"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[60] bg-slate-900/34 backdrop-blur-[1px] transition-opacity duration-200",
          isVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <section
        className={cn(
          "fixed inset-x-[18px] bottom-[18px] z-[70] mx-auto rounded-[28px] border border-slate-200/85 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] px-[16px] pb-4 pt-3 shadow-[0_16px_40px_rgba(15,23,42,0.18)] transition-all duration-200 ease-out",
          isVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[18px] opacity-0",
        )}
        style={{ width: "min(100%, 380px)" }}
      >
        <div className="mx-auto mb-[10px] h-[4px] w-[56px] rounded-full bg-slate-200" />

        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {!isEditingName ? (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="max-w-full text-left"
              >
                <h2 className="truncate text-[16px] font-semibold text-slate-900">
                  {getFolderDisplayName(folder.id, folders)}
                </h2>
                <p className="mt-[3px] text-[11px] text-slate-400">
                  {folder.customName?.trim()
                    ? `직접 지정한 이름 · 실제 ${getEntityRealCount(folder.id, folders)}명`
                    : `자동 이름 · 실제 ${getEntityRealCount(folder.id, folders)}명`}
                </p>
                <p className="mt-[4px] text-[11px] text-slate-300">
                  현재 레이어 · {topLayerLabel}
                </p>
              </button>
            ) : (
              <div>
                <input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="비우면 자동 이름으로 돌아가요"
                  className="h-[38px] w-full rounded-[14px] border border-slate-200 bg-white px-3 text-[12px] text-slate-700 outline-none placeholder:text-slate-300"
                  autoFocus
                />

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveName}
                    className="rounded-[12px] border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600"
                  >
                    저장
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNameInput(folder.customName ?? "");
                      setIsEditingName(false);
                    }}
                    className="rounded-[12px] border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-400"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2 rounded-[20px] border border-slate-200/80 bg-white px-3 py-3 shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-700">
              폴더 신호
            </p>
            <p className="mt-[3px] text-[11px] text-slate-400">
              연결됨 {connectedMemberIds.length}명 · 전체 {allFolderPersonIds.length}명
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenSignalSheet}
            className={cn(
              "h-[38px] rounded-[16px] px-4 text-[13px] font-semibold transition active:scale-95",
              canSendFolderSignal
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-400",
            )}
          >
            신호
          </button>
        </div>

        {signalFeedback ? (
          <div className="mb-3 rounded-[16px] bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700 ring-1 ring-emerald-200">
            {signalFeedback}
          </div>
        ) : null}

        <section className="rounded-[22px] border border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,250,252,0.86)_100%)] px-[12px] py-[11px] shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
          <div className="mb-[7px] flex items-center justify-between">
            <h3 className="text-[12px] font-medium text-slate-500">
              내부 구성원
            </h3>

            <span className="text-[11px] text-slate-400">
              {directMemberIds.reduce((sum, entityId) => {
                if (!entityId) return sum;
                return sum + getEntityRealCount(entityId, folders);
              }, 0)}
              명
            </span>
          </div>

          <div className="mb-[10px] text-[11px] leading-relaxed text-slate-400">
            클릭하면 상세로 이동
            <br />
            길게 누르면 레이어 밖으로 이동
          </div>

          <div
            className="grid justify-start gap-y-[14px]"
            style={{
              gridTemplateColumns: `repeat(${SHEET_GRID_COLUMN_COUNT}, ${SHEET_TILE_WIDTH}px)`,
              columnGap: `${SHEET_GRID_GAP_X}px`,
              width: "fit-content",
            }}
          >
            {gridIds.map((entityId, index) => {
              const isDropTarget =
                folderDragOverState?.folderId === folder.id &&
                folderDragOverState.targetIndex === index;

              if (!entityId) {
                return (
                  <FolderEmptySlot
                    key={`${folder.id}-empty-${index}`}
                    tintClass="bg-slate-100"
                    isDropTarget={isDropTarget}
                    isDragActive={isDragActive}
                    tileWidth={SHEET_TILE_WIDTH}
                    onDragOver={(event) => {
                      event.stopPropagation();
                      onDragOver(index, event, false);
                    }}
                    onDrop={(event) => {
                      event.stopPropagation();
                      onDrop(index, event, false);
                    }}
                  />
                );
              }

              return (
                <FolderMemberTile
                  key={`${folder.id}-${entityId}-${index}`}
                  entityId={entityId}
                  folders={folders}
                  tintClass="bg-slate-100"
                  index={index}
                  tileWidth={SHEET_TILE_WIDTH}
                  isDragging={
                    folderDragState?.folderId === folder.id &&
                    folderDragState.entityId === entityId &&
                    folderDragState.sourceIndex === index
                  }
                  isDropTarget={isDropTarget}
                  isDragActive={isDragActive}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onOpenFolder={onOpenFolder}
                  onLongPressDragStart={onLongPressDragStart}
                  onPersonClick={onPersonClick}
                  people={people}
                  getRecommendedAction={getRecommendedAction}
                />
              );
            })}
          </div>
        </section>
      </section>

      <SignalBottomSheet
        open={signalOpen}
        onClose={() => setSignalOpen(false)}
        onSelect={handleSendFolderSignal}
      />
    </>
  );
}