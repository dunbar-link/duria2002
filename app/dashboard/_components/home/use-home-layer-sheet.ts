"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SHEET_CLOSE_MS } from "./home-page-types";
import { getLayerById } from "./home-page-utils";

export function useHomeLayerSheet({
  onCloseCleanup,
}: {
  onCloseCleanup?: () => void;
}) {
  const [openLayerId, setOpenLayerId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openLayer = useMemo(() => {
    if (!openLayerId) {
      return null;
    }

    return getLayerById(openLayerId);
  }, [openLayerId]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function handleOpenMore(layerId: string) {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setOpenLayerId(layerId);

    requestAnimationFrame(() => {
      setSheetVisible(true);
    });
  }

  function handleCloseMore() {
    setSheetVisible(false);
    onCloseCleanup?.();

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setOpenLayerId(null);
      closeTimerRef.current = null;
    }, SHEET_CLOSE_MS);
  }

  return {
    sheetVisible,
    openLayerId,
    openLayer,
    handleOpenMore,
    handleCloseMore,
  };
}