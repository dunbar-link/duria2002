"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FolderDropArea = "visible" | "hidden";

export type FolderLongPressDragState = {
  entityId: string;
  sourceFolderId: string;
  label: string;
  x: number;
  y: number;
};

type DropPayload = {
  folderId: string;
  entityId: string;
  layerId: string;
  area: FolderDropArea;
  index?: number;
};

type BeginDragInput = {
  entityId: string;
  sourceFolderId: string;
  label: string;
  x: number;
  y: number;
};

export function useFolderLongPressDrag({
  onDrop,
}: {
  onDrop: (payload: DropPayload) => void;
}) {
  const [state, setState] = useState<FolderLongPressDragState | null>(null);

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const stateRef = useRef<FolderLongPressDragState | null>(null);
  stateRef.current = state;

  const isActive = state !== null;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const previousTouchAction = document.body.style.touchAction;
    const previousOverflow = document.body.style.overflow;
    document.body.style.touchAction = "none";
    document.body.style.overflow = "hidden";

    function findDropTarget(
      x: number,
      y: number,
    ): { layerId: string; area: FolderDropArea; index?: number } | null {
      const elements = document.elementsFromPoint(x, y);

      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }

        const candidate = element.closest<HTMLElement>(
          "[data-drop-zone][data-layer-id], [data-slot][data-layer-id]",
        );

        if (!candidate) {
          continue;
        }

        const layerId = candidate.getAttribute("data-layer-id");
        if (!layerId) {
          continue;
        }

        const dropZone = candidate.getAttribute("data-drop-zone");
        if (dropZone === "more") {
          return { layerId, area: "hidden" };
        }
        if (dropZone === "slot" || candidate.hasAttribute("data-slot")) {
          const indexAttr = candidate.getAttribute("data-index");
          const parsedIndex = indexAttr !== null ? Number(indexAttr) : NaN;
          const index = Number.isFinite(parsedIndex) ? parsedIndex : undefined;
          return { layerId, area: "visible", index };
        }
      }

      return null;
    }

    function handleMove(event: PointerEvent) {
      event.preventDefault();
      setState((prev) =>
        prev ? { ...prev, x: event.clientX, y: event.clientY } : prev,
      );
    }

    function handleUp(event: PointerEvent) {
      const current = stateRef.current;
      if (current) {
        const target = findDropTarget(event.clientX, event.clientY);
        if (target) {
          onDropRef.current({
            folderId: current.sourceFolderId,
            entityId: current.entityId,
            layerId: target.layerId,
            area: target.area,
            index: target.index,
          });
        }
      }
      setState(null);
    }

    function handleCancel() {
      setState(null);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setState(null);
      }
    }

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("keydown", handleKey);
      document.body.style.touchAction = previousTouchAction;
      document.body.style.overflow = previousOverflow;
    };
  }, [isActive]);

  const beginDrag = useCallback((input: BeginDragInput) => {
    setState(input);
  }, []);

  const cancelDrag = useCallback(() => {
    setState(null);
  }, []);

  return {
    dragState: state,
    isDragging: isActive,
    beginDrag,
    cancelDrag,
  };
}
