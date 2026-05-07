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
  getHoverActionFromPointer,
  insertExternalEntityToTarget,
  moveEntityToTarget,
  resolveRailTarget,
} from "./home-page-utils";

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

      const action = occupied ? getHoverActionFromPointer(event) : "swap";

      if (occupied && action === "combine") {
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

      clearDragUiState();
    },
    [clearDragUiState, dragState, onExternalEntityAdded, setLayoutState]
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

      clearDragUiState();
    },
    [clearDragUiState, dragState, layoutState, onExternalEntityAdded, setLayoutState]
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

      clearDragUiState();
    },
    [clearDragUiState, dragState, onExternalEntityAdded, setLayoutState]
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