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
  getEntityPersonIdsForTierSync,
  getFirstEmptyIndex,
  getLayerCapViolation,
  getTierByLayerId,
  getTopFolderId,
  moveEntityToTarget,
  moveFolderEntityWithinFolder,
  renameFolderEntity,
} from "./home-page-utils";
import { useHomeFolderMoveMenu } from "./use-home-folder-move-menu";
import { useHomeFolderSheet } from "./use-home-folder-sheet";
import { usePeopleStore } from "../../people/store";

/**
 * entity가 target layer로 이동했을 때 person.tier를 일괄 sync한다.
 * person이면 자기 자신만, nested folder가 layer로 빠지는 경우 내부 멤버
 * person id 전체를 target tier로 갱신.
 */
function syncPersonTierForLayer(
  entityId: string,
  targetLayerId: string,
  folders: FolderMap,
) {
  let personIds = getEntityPersonIdsForTierSync(entityId, folders);
  if (personIds.length === 0) {
    // 초대수락(remote sync)으로 연결된 사람의 store id 는 invite-pending-<token>
    // 라서 isPersonEntityId 가 person 으로 인정하지 않는다 →
    // getEntityPersonIdsForTierSync 가 빈 배열을 반환해 폴더에서 꺼낼 때 tier
    // sync 가 누락된다(use-home-drag-drop 의 동일 fallback 과 같은 의미).
    // store.people 에 실재하는 id 면 그 사람 tier 를 갱신한다(folder/connectable/
    // family-me 는 store.people 에 없어 자동 제외).
    const exists = usePeopleStore
      .getState()
      .people.some((person) => person.id === entityId);
    if (!exists) {
      return;
    }
    personIds = [entityId];
  }
  const nextTier = getTierByLayerId(targetLayerId);
  const updatePersonTier = usePeopleStore.getState().updatePersonTier;
  for (const personId of personIds) {
    updatePersonTier(personId, nextTier);
  }
}

export function useHomeFolderInteractions({
  layoutState,
  folders,
  setLayoutState,
  setFolders,
  onCapBlocked,
}: {
  layoutState: Record<string, LayerLayoutState>;
  folders: FolderMap;
  setLayoutState: Dispatch<SetStateAction<Record<string, LayerLayoutState>>>;
  setFolders: Dispatch<SetStateAction<FolderMap>>;
  /** Dunbar cap 초과로 이동이 차단됐을 때 초과된 layerId 로 안내한다. */
  onCapBlocked?: (blockedLayerId: string) => void;
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
    hideFolderSheet,
    finishCloseFolderSheet,
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

    // Dunbar cap: 폴더에서 다른 layer 로 빼내는 경로도 같은 한도를 적용한다.
    // entity 는 폴더가 놓인 layer 의 count 에 이미 포함되어 있으므로 source
    // 는 폴더 top location 의 layer 로 본다. 명시 슬롯에 occupant 가 있으면
    // swap 으로 source layer 에 맞교환된다.
    const capTargetSlots =
      targetArea === "visible"
        ? targetLayer.visibleSlotIds
        : targetLayer.hiddenSlotIds;
    const capDisplacedEntityId = hasExplicitIndex
      ? capTargetSlots[targetIndex as number] ?? null
      : null;
    const sourceTopFolderId = getTopFolderId(folders, folderId);
    const capSourceLayerId =
      findEntityLocation(layoutState, sourceTopFolderId)?.layerId ?? null;
    const capBlockedLayerId = getLayerCapViolation({
      layout: layoutState,
      folders,
      entityId,
      targetLayerId,
      sourceLayerId: capSourceLayerId,
      displacedEntityId: capDisplacedEntityId,
    });

    if (capBlockedLayerId) {
      onCapBlocked?.(capBlockedLayerId);
      closeFolderMoveMenu();
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
    syncPersonTierForLayer(entityId, targetLayerId, folders);

    // P2-4h-d: occupied visible 슬롯에 떨어뜨려 swap 된 occupant 는 folder top
    // layer(insertedLocation.layerId)로 밀려난다. occupant 의 people.tier 를 그
    // layer tier 로 동기화하지 않으면 reconcile 이 occupant 를 원래 target layer
    // 로 되돌려 cap 초과(6/5)를 만든다(모바일 onDrop swap fallback 과 동일 의미).
    // syncPersonTierForLayer 는 invite-pending fallback 을 포함한다.
    if (
      targetArea === "visible" &&
      capDisplacedEntityId &&
      capDisplacedEntityId !== entityId &&
      capDisplacedEntityId !== "family-me" &&
      insertedLocation.layerId !== targetLayerId
    ) {
      syncPersonTierForLayer(
        capDisplacedEntityId,
        insertedLocation.layerId,
        folders,
      );
    }

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
    hideFolderSheet,
    finishCloseFolderSheet,
  };
}