"use client";

import { useEffect, useMemo, useState } from "react";
import type { HomeMoveMenuLayerTarget } from "../home-move-menu";
import type {
  FolderMap,
  FolderMoveMenuState,
  LayerLayoutState,
} from "./home-page-types";
import { layerBlueprints } from "./home-page-types";
import { getEntityLabel, getFirstEmptyIndex } from "./home-page-utils";

export function useHomeFolderMoveMenu({
  openFolder,
  folders,
  layoutState,
}: {
  openFolder: { id: string } | null;
  folders: FolderMap;
  layoutState: Record<string, LayerLayoutState>;
}) {
  const [folderMoveMenuState, setFolderMoveMenuState] =
    useState<FolderMoveMenuState>(null);

  const folderMoveEntityId = folderMoveMenuState?.entityId ?? null;

  const folderMoveEntityLabel = useMemo(() => {
    if (!folderMoveEntityId) {
      return "";
    }

    return getEntityLabel(folderMoveEntityId, folders);
  }, [folderMoveEntityId, folders]);

  const folderMoveTargets = useMemo<HomeMoveMenuLayerTarget[]>(() => {
    if (!openFolder) {
      return [];
    }

    return layerBlueprints.map((layer) => ({
      layerKey: layer.id,
      layerLabel: layer.label,
      canSendHome: getFirstEmptyIndex(layoutState[layer.id].visibleSlotIds) >= 0,
      canSendMore: true,
    }));
  }, [layoutState, openFolder]);

  useEffect(() => {
    if (!openFolder && folderMoveMenuState) {
      setFolderMoveMenuState(null);
    }
  }, [folderMoveMenuState, openFolder]);

  function handleRequestFolderMoveMenu(entityId: string) {
    if (!openFolder) {
      return;
    }

    setFolderMoveMenuState({
      folderId: openFolder.id,
      entityId,
    });
  }

  function closeFolderMoveMenu() {
    setFolderMoveMenuState(null);
  }

  return {
    folderMoveMenuState,
    folderMoveEntityId,
    folderMoveEntityLabel,
    folderMoveTargets,
    handleRequestFolderMoveMenu,
    closeFolderMoveMenu,
  };
}