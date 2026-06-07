"use client";

import { useEffect, useState } from "react";
import HomeRecommendationList from "../recommendation/HomeRecommendationList";
import type { ConnectableCandidateStateMap } from "./home-page-types";

// Bottom sheet that hosts the existing HomeRecommendationList unchanged.
// Goal: move the recommendation feed off the fixed home view so the home
// stops scrolling. Visuals follow the same pattern as layer-bottom-sheet
// (backdrop + rounded-top container). No drag/drop/persistence logic here.

type SheetVisibility = "hidden" | "entering" | "visible";

type JoinedConnectableCandidate = {
  pid: string;
  name: string;
  imageUrl?: string | null;
  confidence: "high" | "medium" | "low";
  badge?: string | null;
  acceptedAt?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  ownerUserId?: string;
  occupiedEntityIds?: Set<string>;
  suppressedEntityIds?: Set<string>;
  connectableStateMap?: ConnectableCandidateStateMap;
  isDraggingCandidate?: boolean;
  onOpenSearch?: () => void;
  onExploreCandidate?: (candidate: JoinedConnectableCandidate) => void;
  onDismissCandidate?: (entityId: string) => void;
  onDeferCandidate?: (entityId: string) => void;
  onDragStartCandidate?: (entityId: string) => void;
  onDragEndCandidate?: () => void;
};

const SHEET_CLOSE_MS = 200;

export default function HomeRecommendationSheet({
  open,
  onClose,
  ownerUserId,
  occupiedEntityIds,
  suppressedEntityIds,
  connectableStateMap,
  isDraggingCandidate,
  onOpenSearch,
  onExploreCandidate,
  onDismissCandidate,
  onDeferCandidate,
  onDragStartCandidate,
  onDragEndCandidate,
}: Props) {
  const [visibility, setVisibility] = useState<SheetVisibility>("hidden");

  // Mount → next frame paint as "visible" so the slide-in transition runs.
  // Close → keep mounted for one transition cycle so the slide-out plays.
  useEffect(() => {
    if (open) {
      // 이미 보이는 상태면 다시 "entering"으로 리셋하지 않는다.
      // (deps에 visibility가 있어, 리셋하면 visible↔entering 진동이 생겨
      //  시트가 떠도 즉시 사라져 "안 열리는" 것처럼 보였다.)
      if (visibility === "visible") {
        return;
      }
      setVisibility("entering");
      const id = requestAnimationFrame(() => setVisibility("visible"));
      return () => cancelAnimationFrame(id);
    }
    if (visibility === "hidden") {
      return;
    }
    setVisibility("entering");
    const timer = window.setTimeout(() => setVisibility("hidden"), SHEET_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open, visibility]);

  // Auto-close when a drag from a candidate begins. The ghost needs the
  // home tiles below as drop targets, so the sheet must yield. The owning
  // page also lowers `open` via the same trigger; this is a safety guard.
  useEffect(() => {
    if (open && isDraggingCandidate) {
      onClose();
    }
  }, [open, isDraggingCandidate, onClose]);

  if (visibility === "hidden" && !open) {
    return null;
  }

  const isOnScreen = open && visibility === "visible";

  return (
    <>
      {/* Backdrop: click closes the sheet. z-index sits below folder/layer
         sheets so an opened folder/+N stays in front if both are mounted. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 z-[55] bg-slate-900/30 backdrop-blur-[1px] transition-opacity duration-200",
          isOnScreen ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />
      <div
        role="dialog"
        aria-label="추천 보기"
        className={[
          "fixed inset-x-[10px] bottom-0 z-[58] mx-auto rounded-t-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] px-[16px] pb-4 pt-3 shadow-[0_-12px_30px_rgba(15,23,42,0.16)] transition-all duration-200 ease-out",
          isOnScreen
            ? "translate-y-0 opacity-100"
            : "translate-y-[16px] opacity-0 pointer-events-none",
        ].join(" ")}
        style={{ maxWidth: 520 }}
      >
        {/* Grab handle. Purely visual; close gestures use the backdrop. */}
        <div className="mx-auto mb-2 h-[4px] w-[44px] rounded-full bg-slate-300/70" />

        <div className="max-h-[68vh] overflow-y-auto hide-scrollbar pb-2">
          <HomeRecommendationList
            ownerUserId={ownerUserId}
            occupiedEntityIds={occupiedEntityIds}
            suppressedEntityIds={suppressedEntityIds}
            connectableStateMap={connectableStateMap}
            isDraggingCandidate={isDraggingCandidate}
            onOpenSearch={onOpenSearch}
            onExploreCandidate={onExploreCandidate}
            onDismissCandidate={onDismissCandidate}
            onDeferCandidate={onDeferCandidate}
            onDragStartCandidate={onDragStartCandidate}
            onDragEndCandidate={onDragEndCandidate}
          />
        </div>
      </div>
    </>
  );
}
