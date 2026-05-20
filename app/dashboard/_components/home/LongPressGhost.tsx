"use client";

import { useEffect, useState } from "react";
import type { FolderLongPressDragState } from "./use-folder-long-press-drag";

type LongPressGhostProps = {
  state: FolderLongPressDragState | null;
};

// Brief spawn animation: scale 0.92 -> 1, opacity 0 -> 1 over 120ms. Only
// the inner card animates; the outer wrapper's left/top jump per pointer
// move with no CSS transition so the ghost stays locked to the finger and
// hit-test coordinates never disagree with the visible position. This
// component is mobile-only — desktop uses the browser's native drag image.
const SPAWN_TRANSITION_MS = 120;

export default function LongPressGhost({ state }: LongPressGhostProps) {
  const isActive = state !== null;
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    mq.addEventListener("change", handleChange);
    return () => {
      mq.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      setMounted(false);
      return;
    }
    // Force the pre-spawn state before the RAF flip so back-to-back drags
    // (where mounted may still be true from the prior session) still play
    // the spawn motion on the next frame.
    setMounted(false);
    const rafId = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isActive]);

  if (!state) {
    return null;
  }

  const transitionStyle = reducedMotion
    ? "none"
    : `transform ${SPAWN_TRANSITION_MS}ms ease-out, opacity ${SPAWN_TRANSITION_MS}ms ease-out`;
  const innerScale = reducedMotion || mounted ? 1 : 0.92;
  const innerOpacity = reducedMotion || mounted ? 1 : 0;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: state.x,
        top: state.y,
        // translate3d (z=0) is visually identical to translate(-50%, -50%)
        // but hints the compositor to promote this node to its own GPU
        // layer so per-frame left/top updates don't trigger sibling repaints.
        transform: "translate3d(-50%, -50%, 0)",
        pointerEvents: "none",
        zIndex: 200,
        willChange: "transform",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          background: "#FFFFFF",
          border: "2px solid #475569",
          boxShadow: "0 14px 30px rgba(15,23,42,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 600,
          color: "#334155",
          transform: `scale(${innerScale})`,
          opacity: innerOpacity,
          transition: transitionStyle,
          willChange: reducedMotion ? "auto" : "transform, opacity",
        }}
      >
        {state.label.slice(0, 2) || "?"}
      </div>
    </div>
  );
}
