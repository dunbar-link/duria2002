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
  layerBlueprints,
} from "./home-page-types";
import { cn, getEntityRealCount } from "./home-page-utils";
import { EmptyDropSlot, PersonTile } from "./home-entity-components";

function SheetSectionTitle({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="mb-[7px] flex items-center justify-between">
      <h3 className="text-[12px] font-medium text-slate-500">{title}</h3>
      <span className="text-[11px] text-slate-400">{count}명</span>
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
        isDropContainer && "relative min-h-[174px]",
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
}) {
  const isDragActive = dragState !== null;

  return (
    <div
      className="grid justify-start gap-y-[14px]"
      style={{
        gridTemplateColumns: `repeat(${SHEET_GRID_COLUMN_COUNT}, ${SHEET_TILE_WIDTH}px)`,
        columnGap: `${SHEET_GRID_GAP_X}px`,
        width: "fit-content",
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

        return (
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
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onOpenFolder={onOpenFolder}
          />
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
}: LayerBottomSheetProps) {
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
          "fixed inset-x-[10px] bottom-0 z-50 mx-auto rounded-t-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] px-[16px] pb-4 pt-3 shadow-[0_-12px_30px_rgba(15,23,42,0.16)] transition-all duration-200 ease-out",
          isVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-[24px] opacity-0"
        )}
        style={{
          width: "min(100%, 412px)",
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

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-50"
          >
            닫기
          </button>
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
              />
            </SheetSectionShell>
          </section>
        </div>
      </section>
    </>
  );
}