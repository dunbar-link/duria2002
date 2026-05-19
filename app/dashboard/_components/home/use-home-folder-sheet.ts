"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FolderMap, LayerLayoutState } from "./home-page-types";
import { FOLDER_SHEET_CLOSE_MS } from "./home-page-types";
import {
  findEntityLocation,
  getLayerById,
  getTopFolderId,
} from "./home-page-utils";

export function useHomeFolderSheet({
  layoutState,
  folders,
}: {
  layoutState: Record<string, LayerLayoutState>;
  folders: FolderMap;
}) {
  const [folderSheetFolderId, setFolderSheetFolderId] = useState<string | null>(
    null
  );
  const [folderSheetVisible, setFolderSheetVisible] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openFolder = useMemo(() => {
    if (!folderSheetFolderId) {
      return null;
    }

    return folders[folderSheetFolderId] ?? null;
  }, [folderSheetFolderId, folders]);

  const openFolderTopLocation = useMemo(() => {
    if (!openFolder) {
      return null;
    }

    const topFolderId = getTopFolderId(folders, openFolder.id);
    return findEntityLocation(layoutState, topFolderId);
  }, [folders, layoutState, openFolder]);

  const openFolderTopLayer = useMemo(() => {
    if (!openFolderTopLocation) {
      return null;
    }

    return getLayerById(openFolderTopLocation.layerId);
  }, [openFolderTopLocation]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!folderSheetFolderId) {
      return;
    }

    if (folders[folderSheetFolderId]) {
      return;
    }

    setFolderSheetVisible(false);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setFolderSheetFolderId(null);
      closeTimerRef.current = null;
    }, FOLDER_SHEET_CLOSE_MS);
  }, [folderSheetFolderId, folders]);

  function openFolderSheet(folderId: string) {
    if (!folders[folderId]) {
      return;
    }

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setFolderSheetFolderId(folderId);

    requestAnimationFrame(() => {
      setFolderSheetVisible(true);
    });
  }

  function closeFolderSheet() {
    setFolderSheetVisible(false);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setFolderSheetFolderId(null);
      closeTimerRef.current = null;
    }, FOLDER_SHEET_CLOSE_MS);
  }

  // Visually animate the sheet hidden without scheduling unmount. Used when a
  // ghost drag starts from inside the folder so FolderMemberTile stays mounted
  // and keeps owning the active touch until the drag ends.
  function hideFolderSheet() {
    setFolderSheetVisible(false);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  // Complete the deferred close: cancel any pending timer and immediately clear
  // folderSheetFolderId so the sheet unmounts. Call this after the ghost drag
  // has settled.
  function finishCloseFolderSheet() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setFolderSheetFolderId(null);
  }

  return {
    folderSheetFolderId,
    folderSheetVisible,
    openFolder,
    openFolderTopLocation,
    openFolderTopLayer,
    openFolderSheet,
    closeFolderSheet,
    hideFolderSheet,
    finishCloseFolderSheet,
  };
}