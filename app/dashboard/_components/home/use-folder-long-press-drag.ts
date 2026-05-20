"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FOLDER_HOVER_CENTER_MAX,
  FOLDER_HOVER_CENTER_MIN,
} from "./home-page-types";

export type FolderDropArea = "visible" | "hidden";

export type FolderLongPressDragState = {
  entityId: string;
  sourceFolderId: string;
  label: string;
  x: number;
  y: number;
};

// "combine" only appears for occupied-slot hits whose pointer is inside the
// slot's central rectangle (same FOLDER_HOVER_CENTER_MIN/MAX band desktop
// HTML5 drag uses). The "+N more" zone and the rail fallback always emit
// "swap" so accidental folder creation can't happen from coarse hits.
type DropAction = "swap" | "combine";

type DropPayload = {
  folderId: string;
  entityId: string;
  layerId: string;
  area: FolderDropArea;
  index?: number;
  action: DropAction;
};

type DropCandidate = {
  layerId: string;
  area: FolderDropArea;
  index?: number;
  action: DropAction;
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
  shouldSkipDropTarget,
  onHoverChange,
}: {
  onDrop: (payload: DropPayload) => void;
  // Optional consumer hook to exclude specific slots from hit-testing. When it
  // returns true for a candidate, findDropTarget continues scanning the next
  // elementsFromPoint result instead of accepting that slot. Used by the
  // folder ghost drag path to keep family-me's slot out of drop candidacy;
  // other consumers leave it undefined to preserve their existing behavior.
  shouldSkipDropTarget?: (candidate: DropCandidate) => boolean;
  // Optional consumer hook that receives the current hit-test result on every
  // pointermove and null when the drag tears down. Lets a consumer mirror the
  // hovered slot into a separate dragOverState so home tiles can show the
  // existing "놓기" highlight while the ghost is in flight.
  onHoverChange?: (candidate: DropCandidate | null) => void;
}) {
  const [state, setState] = useState<FolderLongPressDragState | null>(null);

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const shouldSkipDropTargetRef = useRef(shouldSkipDropTarget);
  shouldSkipDropTargetRef.current = shouldSkipDropTarget;

  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;

  const stateRef = useRef<FolderLongPressDragState | null>(null);
  stateRef.current = state;

  // Holds the sync cleanup function created at beginDrag time. Calling it
  // removes window listeners and restores body styles. Set back to null after
  // it runs so duplicate runCleanup calls are no-ops.
  const cleanupRef = useRef<(() => void) | null>(null);

  const runCleanup = useCallback(() => {
    const fn = cleanupRef.current;
    if (!fn) {
      return;
    }
    cleanupRef.current = null;
    fn();
  }, []);

  const beginDrag = useCallback(
    (input: BeginDragInput) => {
      // Defensive: tear down any prior drag setup that somehow remained.
      runCleanup();

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
      const previousWebkitTapHighlightColor =
        bodyStyle.webkitTapHighlightColor ?? "";

      // Apply body lock SYNCHRONOUSLY so the iOS / Android native gesture
      // classifier sees touch-action: none before it can claim the touch as a
      // scroll. Previously this ran inside useEffect([isActive]) which only
      // fired after the next React commit, by which time the mobile browser
      // had already taken touch ownership and stopped emitting pointermove.
      bodyStyle.touchAction = "none";
      bodyStyle.overflow = "hidden";
      bodyStyle.userSelect = "none";
      bodyStyle.webkitUserSelect = "none";
      bodyStyle.webkitTouchCallout = "none";
      bodyStyle.webkitTapHighlightColor = "transparent";

      const activatedAt = Date.now();
      // Keep a tiny grace window only to absorb the spurious pointercancel
      // that can fire within the same animation frame as the source overlay
      // (folder sheet / +N sheet) starting its fade-out. Previously this was
      // 300ms which swallowed iOS's "I'm taking this gesture as scroll"
      // cancel and left the ghost stuck on screen forever (no later
      // pointermove/pointerup ever arrived). 16ms ≈ one frame is enough for
      // the React commit / DOM teardown to settle without masking a real
      // native-gesture handoff.
      const cancelGraceMs = 16;
      // If nothing happens for this long after activation (no move/up/cancel),
      // assume the native gesture classifier silently took over and force a
      // cleanup so the ghost cannot linger as a stale on-screen artifact.
      const inactivityTimeoutMs = 2500;
      let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

      function resetInactivityTimer() {
        if (inactivityTimer !== null) {
          clearTimeout(inactivityTimer);
        }
        inactivityTimer = setTimeout(() => {
          inactivityTimer = null;
          cleanup();
          setState(null);
        }, inactivityTimeoutMs);
      }

      function findDropTarget(
        x: number,
        y: number,
      ): DropCandidate | null {
        const elements = document.elementsFromPoint(x, y);
        const skip = shouldSkipDropTargetRef.current;

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
          let resolved: DropCandidate | null = null;

          if (dropZone === "more") {
            resolved = { layerId, area: "hidden", action: "swap" };
          } else if (dropZone === "slot" || candidate.hasAttribute("data-slot")) {
            const indexAttr = candidate.getAttribute("data-index");
            const parsedIndex = indexAttr !== null ? Number(indexAttr) : NaN;
            const index = Number.isFinite(parsedIndex) ? parsedIndex : undefined;
            // Mirror desktop's getHoverActionFromPointer: when the pointer sits
            // inside the slot's central band on both axes the consumer treats
            // this as a "combine" intent (folder creation). Otherwise it's a
            // regular swap. Zero-sized rects fall back to "swap" defensively.
            const rect = candidate.getBoundingClientRect();
            let action: DropAction = "swap";
            if (rect.width > 0 && rect.height > 0) {
              const xRatio = (x - rect.left) / rect.width;
              const yRatio = (y - rect.top) / rect.height;
              const isCenteredX =
                xRatio >= FOLDER_HOVER_CENTER_MIN &&
                xRatio <= FOLDER_HOVER_CENTER_MAX;
              const isCenteredY =
                yRatio >= FOLDER_HOVER_CENTER_MIN &&
                yRatio <= FOLDER_HOVER_CENTER_MAX;
              if (isCenteredX && isCenteredY) {
                action = "combine";
              }
            }
            resolved = { layerId, area: "visible", index, action };
          }

          if (!resolved) {
            continue;
          }

          // Let the consumer veto a candidate (e.g., the folder-drag path
          // skips family-me's own slot and its visible neighbors so a folder
          // member cannot accidentally land on / next to "나" on a small
          // viewport). We continue scanning the remaining elementsFromPoint
          // results so a deeper, valid drop zone underneath still wins.
          if (skip && skip(resolved)) {
            continue;
          }

          return resolved;
        }

        // Rail-level fallback: when no slot/more candidate matched the touch
        // (finger landed on the rail's padding, between slots, or on the
        // right meta-column gutter), accept the enclosing rail wrapper with
        // index=undefined so the consumer can fall back to the layer's first
        // free slot. Slots and the "+N more" zone still take priority because
        // they were attempted in the loop above.
        for (const element of elements) {
          if (!(element instanceof HTMLElement)) {
            continue;
          }

          const rail = element.closest<HTMLElement>(
            "[data-layer-rail][data-layer-id]",
          );

          if (!rail) {
            continue;
          }

          const layerId = rail.getAttribute("data-layer-id");
          if (!layerId) {
            continue;
          }

          const resolved: DropCandidate = {
            layerId,
            area: "visible",
            index: undefined,
            // Rail fallback is a coarse hit (finger on padding/between slots);
            // never treat it as a combine intent — consumers should fall back
            // to the layer's first empty slot via swap semantics.
            action: "swap",
          };

          if (skip && skip(resolved)) {
            continue;
          }

          return resolved;
        }

        return null;
      }

      function handleMove(event: PointerEvent) {
        resetInactivityTimer();
        event.preventDefault();
        setState((prev) =>
          prev ? { ...prev, x: event.clientX, y: event.clientY } : prev,
        );
        // Emit the current hit-test result so a consumer can mirror it into
        // dragOverState and reuse the home "놓기" highlight. Skipped slots
        // (e.g., family-me own slot) come back as null and the highlight
        // naturally hides — same shape as the eventual drop target.
        const hover = onHoverChangeRef.current;
        if (hover) {
          hover(findDropTarget(event.clientX, event.clientY));
        }
      }

      function handleUp(event: PointerEvent) {
        const current = stateRef.current;
        const target = current
          ? findDropTarget(event.clientX, event.clientY)
          : null;
        if (current && target) {
          onDropRef.current({
            folderId: current.sourceFolderId,
            entityId: current.entityId,
            layerId: target.layerId,
            area: target.area,
            index: target.index,
            action: target.action,
          });
        }
        // Sync teardown so body styles restore and listeners detach
        // immediately, before React commits the setState(null) below.
        cleanup();
        setState(null);
      }

      function handleCancel() {
        const elapsed = Date.now() - activatedAt;
        // Spurious pointercancel may fire shortly after the drag starts when
        // the source overlay (folder sheet / +N sheet) unmounts and removes
        // the captured target element. Ignore cancels inside the grace window
        // so the ghost drag survives the overlay teardown. Normal pointerup
        // completes drops as before.
        if (elapsed < cancelGraceMs) {
          return;
        }
        cleanup();
        setState(null);
      }

      function handleKey(event: KeyboardEvent) {
        if (event.key === "Escape") {
          cleanup();
          setState(null);
        }
      }

      function cleanup() {
        if (inactivityTimer !== null) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
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
        cleanupRef.current = null;
        // Clear any external hover-highlight mirror tied to this drag.
        const hover = onHoverChangeRef.current;
        if (hover) {
          hover(null);
        }
      }

      // Attach window listeners SYNCHRONOUSLY before any new pointer event is
      // dispatched by the browser. This closes the previous React render-gap
      // window where the listener was attached only after useEffect, by which
      // point the mobile gesture classifier had already taken touch ownership.
      window.addEventListener("pointermove", handleMove, { passive: false });
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      window.addEventListener("keydown", handleKey);

      // Arm the inactivity safety timer once at activation. It is reset by
      // every handleMove and cleared by handleUp/handleCancel/handleKey via
      // cleanup(). If iOS/Safari silently hands the gesture to native scroll
      // (no further pointer events reach us), this is the only guarantee
      // that the ghost won't linger on screen.
      resetInactivityTimer();

      cleanupRef.current = cleanup;

      setState(input);
    },
    [runCleanup],
  );

  const cancelDrag = useCallback(() => {
    runCleanup();
    setState(null);
  }, [runCleanup]);

  // Defensive: if state ever transitions to null through a path that did not
  // directly call cleanup, make sure we still tear down. Idempotent because
  // runCleanup is a no-op once cleanupRef.current is null.
  useEffect(() => {
    if (state === null) {
      runCleanup();
    }
  }, [state, runCleanup]);

  // Defensive: cleanup on unmount in case a drag is still active.
  useEffect(() => {
    return () => {
      runCleanup();
    };
  }, [runCleanup]);

  return {
    dragState: state,
    isDragging: state !== null,
    beginDrag,
    cancelDrag,
  };
}
