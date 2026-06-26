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
  rightLabel,
  action,
}: {
  title: string;
  count: number;
  rightLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-[7px] flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-medium text-slate-500">{title}</h3>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-[11px] text-slate-400">
          {rightLabel ?? `${count}명`}
        </span>
        {action}
      </div>
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
  deferPointerCaptureUntilLongPress = false,
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
  // Home rail 과 동일하게 long-press 발화 시점까지 pointer capture 를 미루고
  // 타일 touch-action 을 none 으로 만든다. 이게 false(=manipulation)면 모바일
  // Chrome 이 ghost 생성 후 터치를 스크롤로 가져가 pointercancel → 추적이
  // 끊긴다(+N 시트 drag-out 이 안 되던 원인). 시트 타일에 true 로 넘긴다.
  deferPointerCaptureUntilLongPress?: boolean;
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
            deferPointerCaptureUntilLongPress={deferPointerCaptureUntilLongPress}
          />
        );

        return tile;
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
  // 홈 visible 4칸이 모두 찬 layer 에서만 헤더에 "사람 추가" 버튼을 노출하고,
  // 누르면 현재 layer 의 hidden 에 새 사람을 추가하도록 상위에 알린다.
  onAddPerson?: (layerId: string) => void;
};

export default function LayerBottomSheet({
  layer,
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
  onAddPerson,
}: LayerBottomSheetProps) {
  // +N 더보기 시트의 "친구 추가" CTA 노출 조건. Home 빈 슬롯 유무와 무관하게
  // 항상 노출해, 사용자가 새 친구를 Home(visible) 대신 +N(hidden)에 직접 넣는
  // 경로를 고를 수 있게 한다. onAddPerson 핸들러가 없는 화면(invite/dashboard 등)
  // 에서는 자동으로 렌더되지 않는다. cap 도달은 누른 뒤 onAddPerson 에서 검사한다.
  const showAddPerson = Boolean(onAddPerson);

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

        {/* P2-4h-c: "홈에 보이는 사람" preview 블럭 제거. 이동은 hidden 사람을
            길게 눌러 Home 화면의 실제 tier/slot 으로 직접 drag-out 하는 UX로
            일원화했으므로 시트 안 preview/ drop target 은 불필요하다. */}
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pb-[2px]">
          <section>
            <SheetSectionTitle
              title="더보기"
              count={hiddenSlotIds
                .filter(Boolean)
                .reduce((sum, entityId) => {
                  return sum + getEntityRealCount(entityId as string, folders);
                }, 0)}
              action={
                showAddPerson ? (
                  <button
                    type="button"
                    onClick={() => onAddPerson?.(layer.id)}
                    className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 active:scale-95"
                  >
                    <span className="text-[15px] leading-none">+</span>
                    친구 추가
                  </button>
                ) : undefined
              }
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
                // P2-4h: +N hidden 사람도 drag source 로 통일한다. long-press
                // ghost(모바일) / 길게 눌러 드래그(PC)로 시트가 닫히며 Home 의
                // layer/slot 으로 직접 끌어 이동한다. 화살표/이동 버튼 제거.
                onLongPressDragStart={onLongPressDragStart}
                suppressDragSource={suppressDragSource}
                // P2-4h-c: Home rail 과 동일하게 touch-action:none + 지연 capture.
                // manipulation 이면 ghost 생성 후 Chrome 이 스크롤로 가져가
                // pointercancel 로 추적이 끊겨 ghost 가 손가락을 안 따라왔다.
                deferPointerCaptureUntilLongPress
              />
            </SheetSectionShell>
          </section>
        </div>
      </section>
    </>
  );
}