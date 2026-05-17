"use client";

import { useState, type DragEvent } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  DragSourceArea,
  FolderDragOverState,
  FolderDragState,
  FolderMap,
  LayerLayoutState,
} from "./home-page-types";
import {
  extractEntityFromFolderHierarchy,
  findEntityLocation,
  getFirstEmptyIndex,
  getTierByLayerId,
  isPersonEntityId,
  moveEntityToTarget,
  moveFolderEntityWithinFolder,
  renameFolderEntity,
} from "./home-page-utils";
import { useHomeFolderMoveMenu } from "./use-home-folder-move-menu";
import { useHomeFolderSheet } from "./use-home-folder-sheet";
import { usePeopleStore } from "../../people/store";

function syncPersonTierForLayer(entityId: string, targetLayerId: string) {
  if (!isPersonEntityId(entityId)) {
    return;
  }
  const nextTier = getTierByLayerId(targetLayerId);
  usePeopleStore.getState().updatePersonTier(entityId, nextTier);
}

export function useHomeFolderInteractions({
  layoutState,
  folders,
  setLayoutState,
  setFolders,
}: {
  layoutState: Record<string, LayerLayoutState>;
  folders: FolderMap;
  setLayoutState: Dispatch<SetStateAction<Record<string, LayerLayoutState>>>;
  setFolders: Dispatch<SetStateAction<FolderMap>>;
}) {
  const [folderDragState, setFolderDragState] = useState<FolderDragState>(null);
  const [folderDragOverState, setFolderDragOverState] =
    useState<FolderDragOverState>(null);

  const {
    folderSheetFolderId,
    folderSheetVisible,
    openFolder,
    openFolderTopLocation,
    openFolderTopLayer,
    openFolderSheet,
    closeFolderSheet,
  } = useHomeFolderSheet({
    layoutState,
    folders,
  });

  const {
    folderMoveMenuState,
    folderMoveEntityId,
    folderMoveEntityLabel,
    folderMoveTargets,
    handleRequestFolderMoveMenu,
    closeFolderMoveMenu,
  } = useHomeFolderMoveMenu({
    openFolder,
    folders,
    layoutState,
  });

  function clearFolderDragUiState() {
    setFolderDragState(null);
    setFolderDragOverState(null);
  }

  function handleOpenFolder(folderId: string) {
    clearFolderDragUiState();
    closeFolderMoveMenu();
    openFolderSheet(folderId);
  }

  function handleCloseFolder() {
    clearFolderDragUiState();
    closeFolderMoveMenu();
    closeFolderSheet();
  }

  function handleSaveFolderName(folderId: string, value: string) {
    setFolders((current) => renameFolderEntity(current, folderId, value));
  }

  function handleFolderMemberDragStart(index: number, entityId: string) {
    if (!openFolder) {
      return;
    }

    setFolderDragState({
      folderId: openFolder.id,
      sourceIndex: index,
      entityId,
    });

    setFolderDragOverState({
      folderId: openFolder.id,
      targetIndex: index,
      action: "swap",
    });
  }

  function handleFolderMemberDragEnd() {
    clearFolderDragUiState();
  }

  function handleFolderMemberDragOver(
    index: number,
    event: DragEvent,
    occupied: boolean
  ) {
    event.preventDefault();

    if (!openFolder || !folderDragState) {
      return;
    }

    if (
      folderDragOverState?.folderId === openFolder.id &&
      folderDragOverState.targetIndex === index &&
      folderDragOverState.action === "swap"
    ) {
      return;
    }

    setFolderDragOverState({
      folderId: openFolder.id,
      targetIndex: index,
      action: "swap",
    });
  }

  function handleFolderMemberDrop(
    index: number,
    event: DragEvent,
    occupied: boolean
  ) {
    event.preventDefault();

    if (!openFolder || !folderDragState) {
      return;
    }

    setFolders((current) =>
      moveFolderEntityWithinFolder(
        current,
        openFolder.id,
        folderDragState.sourceIndex,
        index
      )
    );

    clearFolderDragUiState();
  }

  function moveFolderEntityToLayer(
    folderId: string,
    entityId: string,
    targetLayerId: string,
    targetArea: DragSourceArea,
    targetIndex?: number
  ) {
    const targetLayer = layoutState[targetLayerId];

    if (!targetLayer) {
      return;
    }

    const hasExplicitIndex =
      typeof targetIndex === "number" &&
      Number.isFinite(targetIndex) &&
      targetIndex >= 0 &&
      targetIndex < targetLayer.visibleSlotIds.length;

    if (hasExplicitIndex) {
      const targetSlots =
        targetArea === "visible"
          ? targetLayer.visibleSlotIds
          : targetLayer.hiddenSlotIds;
      const targetEntityIdAtSlot = targetSlots[targetIndex as number] ?? null;
      if (targetEntityIdAtSlot === "family-me") {
        closeFolderMoveMenu();
        return;
      }
    }

    if (
      targetArea === "visible" &&
      !hasExplicitIndex &&
      getFirstEmptyIndex(targetLayer.visibleSlotIds) < 0
    ) {
      return;
    }

    const extracted = extractEntityFromFolderHierarchy(
      layoutState,
      folders,
      folderId,
      entityId
    );

    let nextLayout = extracted.layout;
    const nextFolders = extracted.folders;

    const insertedLocation = findEntityLocation(nextLayout, entityId);

    if (!insertedLocation) {
      setLayoutState(nextLayout);
      setFolders(nextFolders);
      closeFolderMoveMenu();
      return;
    }

    if (targetArea === "visible") {
      const visibleSlots = nextLayout[targetLayerId].visibleSlotIds;
      const visibleIndex = hasExplicitIndex
        ? (targetIndex as number)
        : getFirstEmptyIndex(visibleSlots);

      if (visibleIndex >= 0) {
        nextLayout = moveEntityToTarget(
          nextLayout,
          {
            sourceLayerId: insertedLocation.layerId,
            sourceIndex: insertedLocation.index,
            entityId,
            sourceArea: insertedLocation.area,
          },
          targetLayerId,
          "visible",
          visibleIndex
        );
      }
    } else {
      nextLayout = moveEntityToTarget(
        nextLayout,
        {
          sourceLayerId: insertedLocation.layerId,
          sourceIndex: insertedLocation.index,
          entityId,
          sourceArea: insertedLocation.area,
        },
        targetLayerId,
        "hidden"
      );
    }

    setLayoutState(nextLayout);
    setFolders(nextFolders);
    syncPersonTierForLayer(entityId, targetLayerId);
    closeFolderMoveMenu();
  }

  function handleSendMoveMenuToCurrentHome() {
    if (!openFolder || !folderMoveEntityId || !openFolderTopLocation) {
      return;
    }

    moveFolderEntityToLayer(
      openFolder.id,
      folderMoveEntityId,
      openFolderTopLocation.layerId,
      "visible"
    );
  }

  function handleSendMoveMenuToCurrentMore() {
    if (!openFolder || !folderMoveEntityId || !openFolderTopLocation) {
      return;
    }

    moveFolderEntityToLayer(
      openFolder.id,
      folderMoveEntityId,
      openFolderTopLocation.layerId,
      "hidden"
    );
  }

  function handleMoveMenuToLayerHome(layerKey: string) {
    if (!openFolder || !folderMoveEntityId) {
      return;
    }

    moveFolderEntityToLayer(openFolder.id, folderMoveEntityId, layerKey, "visible");
  }

  function handleMoveMenuToLayerMore(layerKey: string) {
    if (!openFolder || !folderMoveEntityId) {
      return;
    }

    moveFolderEntityToLayer(openFolder.id, folderMoveEntityId, layerKey, "hidden");
  }

  return {
    folderSheetFolderId,
    folderSheetVisible,
    folderDragState,
    folderDragOverState,
    folderMoveMenuState,
    openFolder,
    openFolderTopLocation,
    openFolderTopLayer,
    folderMoveEntityId,
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
    closeFolderMoveMenu,
    handleSendMoveMenuToCurrentHome,
    handleSendMoveMenuToCurrentMore,
    handleMoveMenuToLayerHome,
    handleMoveMenuToLayerMore,
    moveFolderEntityToLayer,
  };
}