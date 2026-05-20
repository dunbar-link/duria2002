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

    const bodyStyle = document.body.style as CSSStyleDeclaration & {
      webkitUserSelect?: string;
      webkitTouchCallout?: string;
      webkitTapHighlightColor?: string;
    };

    const previousTouchAction = bodyStyle.touchAction;
    const previousOverflow = bodyStyle.overflow;
    const previousUserSelect = bodyStyle.userSelect;
    const previousWebkitUserSelect = bodyStyle.webkitUserSelect ?? "";
    const previousWebkitTouchCallout = bodyStyle.webkitTouchCallout ?? "";
    const previousWebkitTapHighlightColor = bodyStyle.webkitTapHighlightColor ?? "";

    bodyStyle.touchAction = "none";
    bodyStyle.overflow = "hidden";
    bodyStyle.userSelect = "none";
    bodyStyle.webkitUserSelect = "none";
    bodyStyle.webkitTouchCallout = "none";
    bodyStyle.webkitTapHighlightColor = "transparent";

    const activatedAt = Date.now();
    const cancelGraceMs = 300;
    let firstMoveLogged = false;

    console.debug("[DL_FOLDER_DRAG_DEBUG] ghost drag activated", {
      state: stateRef.current,
      bodyTouchAction: bodyStyle.touchAction,
      bodyOverflow: bodyStyle.overflow,
      bodyUserSelect: bodyStyle.userSelect,
    });

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
      if (!firstMoveLogged) {
        firstMoveLogged = true;
        console.debug("[DL_FOLDER_DRAG_DEBUG] first window pointermove", {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
          msSinceActivated: Date.now() - activatedAt,
        });
      }
      event.preventDefault();
      setState((prev) =>
        prev ? { ...prev, x: event.clientX, y: event.clientY } : prev,
      );
    }

    function handleUp(event: PointerEvent) {
      const current = stateRef.current;
      const target = current
        ? findDropTarget(event.clientX, event.clientY)
        : null;
      console.debug("[DL_FOLDER_DRAG_DEBUG] window pointerup", {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        hasState: Boolean(current),
        dropTarget: target,
        msSinceActivated: Date.now() - activatedAt,
      });
      if (current) {
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
      const elapsed = Date.now() - activatedAt;
      console.debug("[DL_FOLDER_DRAG_DEBUG] window pointercancel", {
        msSinceActivated: elapsed,
        willIgnoreByGrace: elapsed < cancelGraceMs,
        graceMs: cancelGraceMs,
      });
      // Spurious pointercancel may fire shortly after the drag starts when the
      // source overlay (folder sheet / +N sheet) unmounts and removes the
      // captured target element. Ignore cancels inside the grace window so the
      // ghost drag survives the overlay teardown. Normal pointerup completes
      // drops as before.
      if (elapsed < cancelGraceMs) {
        return;
      }
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
      console.debug("[DL_FOLDER_DRAG_DEBUG] ghost drag cleanup", {
        msSinceActivated: Date.now() - activatedAt,
      });
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("keydown", handleKey);
      bodyStyle.touchAction = previousTouchAction;
      bodyStyle.overflow = previousOverflow;
      bodyStyle.userSelect = previousUserSelect;
      bodyStyle.webkitUserSelect = previousWebkitUserSelect;
      bodyStyle.webkitTouchCallout = previousWebkitTouchCallout;
      bodyStyle.webkitTapHighlightColor = previousWebkitTapHighlightColor;
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
