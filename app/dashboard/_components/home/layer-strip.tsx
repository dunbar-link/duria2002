"use client";

import type { DragEvent } from "react";
import type {
  DragOverState,
  DragState,
  DragSourceArea,
  FolderMap,
  LayerBlueprint,
} from "./home-page-types";
import { HOME_GRID_GAP_X, HOME_TILE_WIDTH } from "./home-page-types";
import {
  EmptyDropSlot,
  PersonTile,
  RightMetaColumn,
} from "./home-entity-components";

type LayerStripProps = {
  layer: LayerBlueprint;
  visibleSlotIds: Array<string | null>;
  hiddenCount: number;
  dynamicCountLabel: string;
  folders: FolderMap;
  dragState: DragState;
  dragOverState: DragOverState;
  isMoreDropTarget: boolean;
  isRailDropTarget: boolean;
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
  onOpenMore: (layerId: string) => void;
  onDragOverMore: (layerId: string, event: DragEvent) => void;
  onDropToMore: (layerId: string, event: DragEvent) => void;
  onOpenFolder: (folderId: string) => void;
  onDragOverRailLayer: (layerId: string, event: DragEvent) => void;
  onDropToRailLayer: (layerId: string) => void;
  onEmptySlotClick: (layerId: string, index: number) => void;
  onPersonClick?: (entityId: string) => void;
  onLongPressDragStart?: (
    entityId: string,
    point: { x: number; y: number },
  ) => void;
};

export default function LayerStrip({
  layer,
  visibleSlotIds,
  hiddenCount,
  dynamicCountLabel,
  folders,
  dragState,
  dragOverState,
  isMoreDropTarget,
  isRailDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpenMore,
  onDragOverMore,
  onDropToMore,
  onOpenFolder,
  onDragOverRailLayer,
  onDropToRailLayer,
  onEmptySlotClick,
  onPersonClick,
  onLongPressDragStart,
}: LayerStripProps) {
  const isDragActive = dragState !== null;
  const isConnectableDrag = dragState?.sourceLayerId === "connectable-source";

  return (
    <section
      className={`relative rounded-[18px] py-[3px] transition-all duration-200 ${
        isRailDropTarget
          ? "bg-white/80 shadow-[0_10px_26px_rgba(15,23,42,0.10)] ring-1 ring-slate-300/70"
          : isDragActive
            ? "bg-white/20"
            : ""
      }`}
      onDragOver={(event) => {
        if (!isDragActive) {
          return;
        }

        onDragOverRailLayer(layer.id, event);
      }}
      onDrop={() => {
        if (!isDragActive) {
          return;
        }

        onDropToRailLayer(layer.id);
      }}
    >
      {isRailDropTarget && isConnectableDrag ? (
        <div className="pointer-events-none absolute inset-x-[6px] top-[2px] z-0 rounded-[18px] border border-dashed border-slate-400/70 bg-white/45" />
      ) : null}

      <div className="relative z-10 flex items-start justify-between gap-[6px]">
        <div className="min-w-0 flex-1">
          <div
            className="grid grid-cols-4 gap-y-[14px]"
            style={{ columnGap: `${HOME_GRID_GAP_X}px` }}
          >
            {visibleSlotIds.map((entityId, index) => {
              const isDropTarget =
                dragOverState?.targetLayerId === layer.id &&
                dragOverState.targetArea === "visible" &&
                dragOverState.targetIndex === index;

              const isCombineTarget =
                isDropTarget && dragOverState?.action === "combine";

              if (!entityId) {
                return (
                  <EmptyDropSlot
                    key={`${layer.id}-empty-${index}`}
                    layerId={layer.id}
                    index={index}
                    tintClass={layer.iconTintClass}
                    targetArea="visible"
                    isDropTarget={isDropTarget}
                    isDragActive={isDragActive}
                    tileWidth={HOME_TILE_WIDTH}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onClick={() => onEmptySlotClick(layer.id, index)}
                  />
                );
              }

              return (
                <PersonTile
                  key={entityId}
                  entityId={entityId}
                  folders={folders}
                  tintClass={layer.iconTintClass}
                  layerId={layer.id}
                  index={index}
                  sourceArea="visible"
                  isDragging={
                    dragState?.sourceLayerId === layer.id &&
                    dragState.entityId === entityId &&
                    dragState.sourceArea === "visible"
                  }
                  isDropTarget={isDropTarget}
                  isCombineTarget={isCombineTarget}
                  isDragActive={isDragActive}
                  tileWidth={HOME_TILE_WIDTH}
                  labelMaxWidth={58}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onOpenFolder={onOpenFolder}
                  onPersonClick={onPersonClick}
                  onLongPressDragStart={onLongPressDragStart}
                />
              );
            })}
          </div>
        </div>

        <RightMetaColumn
          label={layer.label}
          countLabel={dynamicCountLabel}
          hiddenCount={hiddenCount}
          layerId={layer.id}
          labelClass={layer.labelClass}
          tintClass={layer.iconTintClass}
          isDragActive={isDragActive}
          isMoreDropTarget={isMoreDropTarget}
          onOpenMore={() => onOpenMore(layer.id)}
          onDragOverMore={(event) => onDragOverMore(layer.id, event)}
          onDropToMore={(event) => onDropToMore(layer.id, event)}
        />
      </div>

      {isRailDropTarget && isConnectableDrag ? (
        <div className="pointer-events-none mt-[8px] flex justify-center">
          <span className="rounded-full bg-white/90 px-[10px] py-[4px] text-[10px] font-medium leading-none text-slate-600 shadow-[0_4px_10px_rgba(15,23,42,0.06)]">
            이 레이어에 놓기
          </span>
        </div>
      ) : null}
    </section>
  );
}