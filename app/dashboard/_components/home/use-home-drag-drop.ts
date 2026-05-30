import {
  useCallback,
  useState,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";
import type {
  DragOverState,
  DragSourceArea,
  DragState,
  FolderMap,
  LayerLayoutState,
} from "./home-page-types";
import { CONNECTABLE_SOURCE_LAYER_ID } from "./home-page-types";
import {
  combineEntityIntoTarget,
  getEntityPersonIdsForTierSync,
  getHoverActionFromPointer,
  getTierByLayerId,
  insertExternalEntityToTarget,
  moveEntityToTarget,
  resolveRailTarget,
} from "./home-page-utils";
import { usePeopleStore } from "../../people/store";

/**
 * entity가 target layer로 이동했을 때 person.tier를 일괄 sync한다.
 * person이면 자기 자신만, folder면 내부 멤버(person, nested 포함)
 * 모두 target tier로 갱신. 그 외(me, connectable 등)는 no-op.
 */
function syncPersonTierForLayer(
  entityId: string,
  targetLayerId: string,
  folders: FolderMap,
) {
  const personIds = getEntityPersonIdsForTierSync(entityId, folders);
  if (personIds.length === 0) {
    return;
  }
  const nextTier = getTierByLayerId(targetLayerId);
  const updatePersonTier = usePeopleStore.getState().updatePersonTier;
  for (const personId of personIds) {
    updatePersonTier(personId, nextTier);
  }
}

type UseHomeDragDropParams = {
  layoutState: Record<string, LayerLayoutState>;
  folders: FolderMap;
  setLayoutState: Dispatch<SetStateAction<Record<string, LayerLayoutState>>>;
  setFolders: Dispatch<SetStateAction<FolderMap>>;
  onExternalEntityAdded?: (
    entityId: string,
    targetLayerId: string,
    targetArea: DragSourceArea
  ) => void;
};

export function useHomeDragDrop({
  layoutState,
  folders,
  setLayoutState,
  setFolders,
  onExternalEntityAdded,
}: UseHomeDragDropParams) {
  const [dragState, setDragState] = useState<DragState>(null);
  const [dragOverState, setDragOverState] = useState<DragOverState>(null);
  const [specialDropTargetKey, setSpecialDropTargetKey] = useState<string | null>(
    null
  );

  const clearDragUiState = useCallback(() => {
    setDragState(null);
    setDragOverState(null);
    setSpecialDropTargetKey(null);
  }, []);

  const handleDragStart = useCallback(
    (
      layerId: string,
      index: number,
      entityId: string,
      sourceArea: DragSourceArea
    ) => {
      setDragState({
        sourceLayerId: layerId,
        sourceIndex: index,
        entityId,
        sourceArea,
      });

      if (layerId === CONNECTABLE_SOURCE_LAYER_ID) {
        setDragOverState(null);
      } else {
        setDragOverState({
          targetLayerId: layerId,
          targetIndex: index,
          targetArea: sourceArea,
          action: "swap",
        });
      }

      setSpecialDropTargetKey(null);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    clearDragUiState();
  }, [clearDragUiState]);

  const handleDragOver = useCallback(
    (
      layerId: string,
      index: number,
      targetArea: DragSourceArea,
      event: DragEvent,
      occupied: boolean
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (!dragState) {
        return;
      }

      setSpecialDropTargetKey(null);

      const isExternalSource =
        dragState.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID;

      const action =
        occupied && !isExternalSource ? getHoverActionFromPointer(event) : "swap";

      if (
        dragOverState?.targetLayerId === layerId &&
        dragOverState.targetIndex === index &&
        dragOverState.targetArea === targetArea &&
        dragOverState.action === action
      ) {
        return;
      }

      setDragOverState({
        targetLayerId: layerId,
        targetIndex: index,
        targetArea,
        action,
      });
    },
    [dragOverState, dragState]
  );

  const handleDrop = useCallback(
    (
      targetLayerId: string,
      targetIndex: number,
      targetArea: DragSourceArea,
      event: DragEvent,
      occupied: boolean
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (!dragState) {
        return;
      }

      setSpecialDropTargetKey(null);

      const isExternalSource =
        dragState.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID;

      if (isExternalSource) {
        setLayoutState((current) =>
          insertExternalEntityToTarget(
            current,
            dragState.entityId,
            targetLayerId,
            targetArea,
            occupied ? undefined : targetIndex
          )
        );

        onExternalEntityAdded?.(dragState.entityId, targetLayerId, targetArea);
        clearDragUiState();
        return;
      }

      // Mirror the source-side family-me lock (Phase 1.15B) onto the drop
      // side: never let any drag land on me's slot, so a swap cannot
      // displace "나". Combined with the canonical pin (Phase 1.16) this
      // means me is neither a valid source nor a valid target.
      if (occupied) {
        const targetSlotArray =
          targetArea === "visible"
            ? layoutState[targetLayerId]?.visibleSlotIds
            : layoutState[targetLayerId]?.hiddenSlotIds;
        if (targetSlotArray?.[targetIndex] === "family-me") {
          clearDragUiState();
          return;
        }
      }

      const action = occupied ? getHoverActionFromPointer(event) : "swap";

      if (occupied && action === "combine") {
        const targetSlotArray =
          targetArea === "visible"
            ? layoutState[targetLayerId]?.visibleSlotIds
            : layoutState[targetLayerId]?.hiddenSlotIds;
        const targetEntityId = targetSlotArray?.[targetIndex] ?? null;
        const involvesMe =
          dragState.entityId === "family-me" || targetEntityId === "family-me";
        const sourceIsFolder = Boolean(folders[dragState.entityId]);
        const targetIsFolder = Boolean(
          targetEntityId && folders[targetEntityId]
        );

        if (involvesMe || sourceIsFolder || targetIsFolder) {
          setLayoutState((current) =>
            moveEntityToTarget(
              current,
              dragState,
              targetLayerId,
              targetArea,
              targetIndex
            )
          );
          syncPersonTierForLayer(dragState.entityId, targetLayerId, folders);
          clearDragUiState();
          return;
        }

        const result = combineEntityIntoTarget(
          layoutState,
          folders,
          dragState,
          targetLayerId,
          targetArea,
          targetIndex
        );

        setLayoutState(result.layout);
        setFolders(result.folders);
        syncPersonTierForLayer(dragState.entityId, targetLayerId, folders);
        clearDragUiState();
        return;
      }

      setLayoutState((current) =>
        moveEntityToTarget(
          current,
          dragState,
          targetLayerId,
          targetArea,
          targetIndex
        )
      );

      syncPersonTierForLayer(dragState.entityId, targetLayerId, folders);
      clearDragUiState();
    },
    [
      clearDragUiState,
      dragState,
      folders,
      layoutState,
      onExternalEntityAdded,
      setFolders,
      setLayoutState,
    ]
  );

  const handleDragOverMore = useCallback(
    (layerId: string, event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!dragState) {
        return;
      }

      setDragOverState(null);
      setSpecialDropTargetKey(`more-${layerId}`);
    },
    [dragState]
  );

  const handleDropToMore = useCallback(
    (layerId: string, event?: DragEvent) => {
      event?.preventDefault();
      event?.stopPropagation();

      if (!dragState) {
        return;
      }

      setDragOverState(null);
      setSpecialDropTargetKey(`more-${layerId}`);

      if (dragState.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID) {
        setLayoutState((current) =>
          insertExternalEntityToTarget(
            current,
            dragState.entityId,
            layerId,
            "hidden"
          )
        );

        onExternalEntityAdded?.(dragState.entityId, layerId, "hidden");
        clearDragUiState();
        return;
      }

      setLayoutState((current) =>
        moveEntityToTarget(current, dragState, layerId, "hidden")
      );

      syncPersonTierForLayer(dragState.entityId, layerId, folders);
      clearDragUiState();
    },
    [clearDragUiState, dragState, folders, onExternalEntityAdded, setLayoutState]
  );

  const handleDragOverRailLayer = useCallback(
    (layerId: string, event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!dragState) {
        return;
      }

      const resolved = resolveRailTarget(layoutState, layerId);

      const nextTargetIndex =
        typeof resolved.targetIndex === "number" ? resolved.targetIndex : 0;

      const isExternalSource =
        dragState.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID;

      const occupyingTarget =
        resolved.targetArea === "visible" &&
        layoutState[layerId]?.visibleSlotIds?.[nextTargetIndex] != null;

      const action =
        occupyingTarget && !isExternalSource ? "swap" : "swap";

      setSpecialDropTargetKey(`rail-${layerId}`);

      if (
        dragOverState?.targetLayerId === layerId &&
        dragOverState.targetArea === resolved.targetArea &&
        dragOverState.targetIndex === nextTargetIndex &&
        dragOverState.action === action
      ) {
        return;
      }

      setDragOverState({
        targetLayerId: layerId,
        targetIndex: nextTargetIndex,
        targetArea: resolved.targetArea,
        action,
      });
    },
    [dragOverState, dragState, layoutState]
  );

  const handleDropToRailLayer = useCallback(
    (layerId: string) => {
      if (!dragState) {
        return;
      }

      if (dragState.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID) {
        const resolved = resolveRailTarget(layoutState, layerId);

        setLayoutState((current) => {
          const currentResolved = resolveRailTarget(current, layerId);

          return insertExternalEntityToTarget(
            current,
            dragState.entityId,
            layerId,
            currentResolved.targetArea,
            currentResolved.targetIndex
          );
        });

        onExternalEntityAdded?.(
          dragState.entityId,
          layerId,
          resolved.targetArea
        );
        clearDragUiState();
        return;
      }

      setLayoutState((current) => {
        const resolved = resolveRailTarget(current, layerId);

        return moveEntityToTarget(
          current,
          dragState,
          layerId,
          resolved.targetArea,
          resolved.targetIndex
        );
      });

      syncPersonTierForLayer(dragState.entityId, layerId, folders);
      clearDragUiState();
    },
    [clearDragUiState, dragState, folders, layoutState, onExternalEntityAdded, setLayoutState]
  );

  const handleDragOverHiddenContainer = useCallback(
    (layerId: string, event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!dragState) {
        return;
      }

      setDragOverState(null);
      setSpecialDropTargetKey(`hidden-container-${layerId}`);
    },
    [dragState]
  );

  const handleDropToHiddenContainer = useCallback(
    (layerId: string, event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!dragState) {
        return;
      }

      if (dragState.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID) {
        setLayoutState((current) =>
          insertExternalEntityToTarget(
            current,
            dragState.entityId,
            layerId,
            "hidden"
          )
        );

        onExternalEntityAdded?.(dragState.entityId, layerId, "hidden");
        clearDragUiState();
        return;
      }

      setLayoutState((current) =>
        moveEntityToTarget(current, dragState, layerId, "hidden")
      );

      syncPersonTierForLayer(dragState.entityId, layerId, folders);
      clearDragUiState();
    },
    [clearDragUiState, dragState, folders, onExternalEntityAdded, setLayoutState]
  );

  const isConnectableDragActive =
    dragState?.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID;

  return {
    dragState,
    dragOverState,
    specialDropTargetKey,
    isConnectableDragActive,
    clearDragUiState,
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
  };
}