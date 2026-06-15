"use client";

import type { DragEvent, ReactNode } from "react";
import {
  type DragOverState,
  type DragState,
  type DragSourceArea,
  type FolderMap,
  type LayerBlueprint,
  SHEET_GRID_COLUMN_COUNT,
  SHEET_GRID_GAP_X,
  SHEET_TILE_WIDTH,
  VISIBLE_SLOT_COUNT,
  layerBlueprints,
} from "./home-page-types";
import { cn, getEntityRealCount, isPersonEntityId } from "./home-page-utils";
import { EmptyDropSlot, PersonTile } from "./home-entity-components";

function SheetSectionTitle({
  title,
  count,
  rightLabel,
}: {
  title: string;
  count: number;
  rightLabel?: string;
}) {
  return (
    <div className="mb-[7px] flex items-center justify-between">
      <h3 className="text-[12px] font-medium text-slate-500">{title}</h3>
      <span className="text-[11px] text-slate-400">
        {rightLabel ?? `${count}명`}
      </span>
    </div>
  );
}

function SheetSectionShell({
  children,
  isDropContainer,
  isDropTarget,
  onDragOverContainer,
  onDropContainer,
}: {
  children: ReactNode;
  isDropContainer?: boolean;
  isDropTarget?: boolean;
  onDragOverContainer?: (event: DragEvent) => void;
  onDropContainer?: (event: DragEvent) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,250,252,0.86)_100%)] px-[12px] py-[11px] shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition-all duration-150",
        // 더보기 빈 "+" 슬롯을 더는 그리지 않으므로 10칸(≈174px) 높이가 필요
        // 없다. drop 컨테이너 역할은 유지하되 compact 한 최소 높이만 둔다.
        isDropContainer && "relative min-h-[72px]",
        isDropTarget &&
          "border-slate-300 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.10)] ring-2 ring-slate-200/80"
      )}
      onDragOver={onDragOverContainer}
      onDrop={onDropContainer}
    >
      {children}
    </div>
  );
}

function QuickLayerDropRail({
  activeLayerId,
  activeKey,
  onDragOverLayer,
  onDropToLayer,
}: {
  activeLayerId: string;
  activeKey: string | null;
  onDragOverLayer: (layerId: string, event: DragEvent) => void;
  onDropToLayer: (layerId: string) => void;
}) {
  return (
    <section className="mb-3">
      <div className="mb-[7px] flex items-center justify-between">
        <h3 className="text-[12px] font-medium text-slate-500">
          빠른 레이어 이동
        </h3>
        <span className="text-[11px] text-slate-400">빈 홈 먼저 채워요</span>
      </div>

      <div className="flex flex-wrap gap-[8px]">
        {layerBlueprints.map((layer) => {
          const key = `rail-${layer.id}`;
          const isActive = activeKey === key;

          return (
            <button
              key={layer.id}
              type="button"
              onDragOver={(event) => onDragOverLayer(layer.id, event)}
              onDrop={() => onDropToLayer(layer.id)}
              className={cn(
                "rounded-full border px-[12px] py-[7px] text-[11px] font-medium transition-all duration-150",
                layer.id === activeLayerId
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-slate-200 bg-white text-slate-500",
                isActive &&
                  "border-slate-500 bg-white text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-2 ring-slate-200/80"
              )}
            >
              {layer.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BottomSheetGrid({
  layer,
  ids,
  area,
  folders,
  dragState,
  dragOverState,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpenFolder,
  onLongPressDragStart,
  suppressDragSource = false,
  onPromote,
  canPromote = false,
}: {
  layer: LayerBlueprint;
  ids: Array<string | null>;
  area: DragSourceArea;
  folders: FolderMap;
  dragState: DragState;
  dragOverState: DragOverState;
  onDragStart: (
    layerId: string,
    index: number,
    entityId: string,
    sourceArea: DragSourceArea
  ) => void;
  onDragEnd: () => void;
  onDragOver: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean
  ) => void;
  onDrop: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean
  ) => void;
  onOpenFolder: (folderId: string) => void;
  onLongPressDragStart?: (
    entityId: string,
    point: { x: number; y: number },
  ) => void;
  suppressDragSource?: boolean;
  // When provided and area === "hidden", each non-folder, non-me tile gets a
  // small "↑" button at its bottom-right that promotes the entity to the
  // first empty visible slot. Drag inside this grid is fully disabled when
  // this hook is wired up (Step F2).
  onPromote?: (entityId: string) => void;
  canPromote?: boolean;
}) {
  const isDragActive = dragState !== null;

  return (
    <div
      className="grid justify-start gap-y-[14px]"
      style={{
        // 더보기(hidden) 섹션만 컨테이너 폭에 맞춰 자동 줄바꿈(좁은 모바일 4열,
        // 넓은 화면 5열). visible 섹션은 기존 5열 고정 규칙을 그대로 둔다.
        gridTemplateColumns:
          area === "hidden"
            ? `repeat(auto-fill, ${SHEET_TILE_WIDTH}px)`
            : `repeat(${SHEET_GRID_COLUMN_COUNT}, ${SHEET_TILE_WIDTH}px)`,
        columnGap: `${SHEET_GRID_GAP_X}px`,
        width: area === "hidden" ? "100%" : "fit-content",
      }}
    >
      {ids.map((entityId, index) => {
        const isDropTarget =
          dragOverState?.targetLayerId === layer.id &&
          dragOverState.targetArea === area &&
          dragOverState.targetIndex === index;

        const isCombineTarget =
          isDropTarget && dragOverState?.action === "combine";

        if (!entityId) {
          // 더보기(hidden) 섹션은 normalizeHiddenSlots 의 null 패딩 슬롯을
          // 빈 "+" 슬롯으로 그리지 않는다(실제 사람 카드와 1:1 일치). visible
          // 섹션의 빈 슬롯은 "홈 4칸 중 남은 자리" 의미라 그대로 둔다.
          if (area === "hidden") {
            return null;
          }

          return (
            <EmptyDropSlot
              key={`${layer.id}-${area}-empty-${index}`}
              layerId={layer.id}
              index={index}
              tintClass={layer.iconTintClass}
              targetArea={area}
              isDropTarget={isDropTarget}
              isDragActive={isDragActive}
              tileWidth={SHEET_TILE_WIDTH}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          );
        }

        const isFolder = Boolean(folders[entityId]);
        const showPromoteButton =
          Boolean(onPromote) &&
          area === "hidden" &&
          !isFolder &&
          entityId !== "family-me";

        const tile = (
          <PersonTile
            key={`${layer.id}-${area}-${entityId}`}
            entityId={entityId}
            folders={folders}
            tintClass={layer.iconTintClass}
            layerId={layer.id}
            index={index}
            sourceArea={area}
            isDragging={
              dragState?.sourceLayerId === layer.id &&
              dragState.entityId === entityId &&
              dragState.sourceArea === area
            }
            isDropTarget={isDropTarget}
            isCombineTarget={isCombineTarget}
            isDragActive={isDragActive}
            tileWidth={SHEET_TILE_WIDTH}
            labelMaxWidth={58}
            suppressDragSource={suppressDragSource}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onOpenFolder={onOpenFolder}
            onLongPressDragStart={onLongPressDragStart}
          />
        );

        if (!showPromoteButton) {
          return tile;
        }

        return (
          <div
            key={`${layer.id}-${area}-${entityId}`}
            className="relative shrink-0 overflow-visible"
            style={{ width: SHEET_TILE_WIDTH }}
          >
            {tile}
            <button
              type="button"
              aria-label="홈으로 올리기"
              aria-disabled={!canPromote}
              disabled={!canPromote}
              onClick={(event) => {
                event.stopPropagation();
                if (!canPromote) return;
                onPromote?.(entityId);
              }}
              // Sit just inside the face's bottom-right corner so the button
              // is never clipped by the outer overflow-y-auto scroll
              // container (which transparently promotes overflow-x to clip).
              className={cn(
                "pointer-events-auto absolute z-20 flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[12px] font-semibold leading-none shadow-[0_4px_10px_rgba(15,23,42,0.18)] transition-colors duration-150",
                canPromote
                  ? "border-slate-300 bg-white text-slate-600 active:scale-95 hover:bg-slate-50"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-40",
              )}
              style={{ right: 6, bottom: 24 }}
            >
              ↑
            </button>
          </div>
        );
      })}
    </div>
  );
}

type LayerBottomSheetProps = {
  layer: LayerBlueprint;
  visibleSlotIds: Array<string | null>;
  hiddenSlotIds: Array<string | null>;
  folders: FolderMap;
  dragState: DragState;
  dragOverState: DragOverState;
  isVisible: boolean;
  specialDropTargetKey: string | null;
  onDragStart: (
    layerId: string,
    index: number,
    entityId: string,
    sourceArea: DragSourceArea
  ) => void;
  onDragEnd: () => void;
  onDragOver: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean
  ) => void;
  onDrop: (
    layerId: string,
    index: number,
    targetArea: DragSourceArea,
    event: DragEvent,
    occupied: boolean
  ) => void;
  onDragOverRailLayer: (layerId: string, event: DragEvent) => void;
  onDropToRailLayer: (layerId: string) => void;
  onDragOverHiddenContainer: (layerId: string, event: DragEvent) => void;
  onDropToHiddenContainer: (layerId: string, event: DragEvent) => void;
  onClose: () => void;
  onOpenFolder: (folderId: string) => void;
  onLongPressDragStart?: (
    entityId: string,
    point: { x: number; y: number },
  ) => void;
  // When true, person tiles inside this sheet cannot start a new HTML5 drag
  // or long-press drag. Used to lock out the +N sheet as a drag source
  // while a folder ghost drag is already in flight.
  suppressDragSource?: boolean;
  // Step F2: button-based promotion for entities sitting in the hidden
  // section. When provided, the hidden grid loses its long-press drag and
  // each non-folder, non-me tile gets a small "↑" button.
  onPromoteHiddenToVisible?: (entityId: string) => void;
  // 홈 visible 4칸이 모두 찬 layer 에서만 헤더에 "사람 추가" 버튼을 노출하고,
  // 누르면 현재 layer 의 hidden 에 새 사람을 추가하도록 상위에 알린다.
  onAddPerson?: (layerId: string) => void;
};

export default function LayerBottomSheet({
  layer,
  visibleSlotIds,
  hiddenSlotIds,
  folders,
  dragState,
  dragOverState,
  isVisible,
  specialDropTargetKey,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragOverRailLayer,
  onDropToRailLayer,
  onDragOverHiddenContainer,
  onDropToHiddenContainer,
  onClose,
  onOpenFolder,
  onLongPressDragStart,
  suppressDragSource = false,
  onPromoteHiddenToVisible,
  onAddPerson,
}: LayerBottomSheetProps) {
  // 홈으로 올리기 활성 조건: visible 에 빈자리가 있거나(빈자리 승격),
  // 빈자리가 없어도 교체 가능한 "비-Me 사람" 슬롯이 있으면(full swap) 활성.
  // Me 슬롯과 폴더(비-person)는 교체 대상이 아니므로 둘만 있으면 비활성 유지.
  const canPromoteHidden =
    visibleSlotIds.some((id) => id === null) ||
    visibleSlotIds.some(
      (id) => id !== null && id !== "family-me" && isPersonEntityId(id),
    );
  const visibleFilledCount = visibleSlotIds.filter(Boolean).length;
  // 홈에 보이는 4칸이 모두 차 있을 때만(빈 "+" 진입점이 사라진 상태) 헤더에
  // "사람 추가" 를 노출한다. cap 도달 여부는 누른 뒤 onAddPerson 에서 검사하므로
  // 버튼 자체는 숨기지 않는다.
  const showAddPerson =
    Boolean(onAddPerson) && visibleFilledCount === VISIBLE_SLOT_COUNT;

  return (
    <>
      <button
        type="button"
        aria-label="시트 닫기"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/28 backdrop-blur-[1px] transition-opacity duration-200",
          isVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <section
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto rounded-t-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] px-[16px] pb-4 pt-3 shadow-[0_-12px_30px_rgba(15,23,42,0.16)] transition-all duration-200 ease-out",
          isVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[24px] opacity-0"
        )}
        style={{
          // inset-x-0 + mx-auto 와 함께 좌우 10px 대칭 여백을 만든다(viewport-20).
          // 세로 등장/퇴장은 className 의 translate-y 가 담당하므로 translateX 는
          // 추가하지 않는다.
          width: "calc(100% - 20px)",
          maxWidth: "412px",
        }}
      >
        <div className="mx-auto mb-[10px] h-[4px] w-[56px] rounded-full bg-slate-200" />

        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className={`${layer.labelClass} text-[16px] font-semibold`}>
              {layer.label}
            </h2>
            <p className="mt-[3px] text-[11px] text-slate-400">
              가볍게 정리해요
            </p>
          </div>

          <div className="flex items-center gap-2">
            {showAddPerson ? (
              <button
                type="button"
                onClick={() => onAddPerson?.(layer.id)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 active:scale-95"
              >
                사람 추가
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>

        {dragState ? (
          <QuickLayerDropRail
            activeLayerId={layer.id}
            activeKey={specialDropTargetKey}
            onDragOverLayer={onDragOverRailLayer}
            onDropToLayer={onDropToRailLayer}
          />
        ) : null}

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pb-[2px]">
          <section>
            <SheetSectionTitle
              title="홈에 보이는 사람"
              count={visibleSlotIds
                .filter(Boolean)
                .reduce((sum, entityId) => {
                  return sum + getEntityRealCount(entityId as string, folders);
                }, 0)}
              rightLabel={`${visibleFilledCount}/${VISIBLE_SLOT_COUNT}`}
            />

            <SheetSectionShell>
              <BottomSheetGrid
                layer={layer}
                ids={visibleSlotIds}
                area="visible"
                folders={folders}
                dragState={dragState}
                dragOverState={dragOverState}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onOpenFolder={onOpenFolder}
                onLongPressDragStart={onLongPressDragStart}
                suppressDragSource={suppressDragSource}
              />
            </SheetSectionShell>
          </section>

          <section>
            <SheetSectionTitle
              title="더보기"
              count={hiddenSlotIds
                .filter(Boolean)
                .reduce((sum, entityId) => {
                  return sum + getEntityRealCount(entityId as string, folders);
                }, 0)}
            />

            <SheetSectionShell
              isDropContainer
              isDropTarget={specialDropTargetKey === `hidden-container-${layer.id}`}
              onDragOverContainer={(event) =>
                onDragOverHiddenContainer(layer.id, event)
              }
              onDropContainer={(event) => onDropToHiddenContainer(layer.id, event)}
            >
              <BottomSheetGrid
                layer={layer}
                ids={hiddenSlotIds}
                area="hidden"
                folders={folders}
                dragState={dragState}
                dragOverState={dragOverState}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onOpenFolder={onOpenFolder}
                // Step F2: +N hidden section is button-only — no long-press
                // drag, and HTML5 drag also blocked on these tiles.
                suppressDragSource
                onPromote={onPromoteHiddenToVisible}
                canPromote={canPromoteHidden}
              />
            </SheetSectionShell>
          </section>
        </div>
      </section>
    </>
  );
}