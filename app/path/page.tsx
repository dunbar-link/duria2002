"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PathHeader from "./_components/PathHeader";
import OverlapSourceSection from "./_components/OverlapSourceSection";
import TargetSearchPanel from "./_components/TargetSearchPanel";
import PathResultCard from "./_components/PathResultCard";
import NoPathState from "./_components/NoPathState";
import SystemErrorState from "./_components/SystemErrorState";
import type { DiscoverPayload } from "./_lib/path-types";
import {
  buildPathLine,
  getConfidenceTone,
  getLastPathNode,
  getTargetBadge,
  isNoPathMessage,
} from "./_lib/path-helpers";
import {
  buildBridgeActionHref,
  buildShareHref,
  getInitialPathPageState,
} from "./_lib/path-url";
import {
  buildOverlapMetaLine,
  getQuickTargets,
  resolveTargetCategory,
  resolveTargetName,
} from "./_lib/path-view-model";
import { usePathSearch } from "./_hooks/usePathSearch";
import { usePathDiscover } from "./_hooks/usePathDiscover";
import { usePathShare } from "./_hooks/usePathShare";
import { usePathPageActions } from "./_hooks/usePathPageActions";
import { usePathPageState } from "./_hooks/usePathPageState";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

const PENDING_EXPLORE_STORAGE_KEY = "dunbar-link-pending-explore-v1";

type PendingExplorePayload = {
  targetId?: string;
  targetPid?: string;
  targetName?: string;
  source?: string;
  requestedAt?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function readPendingExploreFromSession(): PendingExplorePayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_EXPLORE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as PendingExplorePayload;
  } catch {
    return null;
  }
}

export default function PathPage() {
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const autoTriggeredRef = useRef(false);
  const initialHydrationDoneRef = useRef(false);

  const [entrySource, setEntrySource] = useState<string>("");

  const queryTargetPid = normalizeText(searchParams.get("targetPid"));
  const queryTargetId = normalizeText(searchParams.get("targetId"));
  const queryTargetName = normalizeText(searchParams.get("targetName"));
  const querySource = normalizeText(searchParams.get("source"));

  const initialState = useMemo(() => {
    return getInitialPathPageState(searchParams, FIXED_OWNER_USER_ID);
  }, [searchParams]);

  const {
    ownerUserId,
    initialTargetName,
    initialTargetCategory,
    isFromOverlap,
    bridgeName,
    bridgeCity,
    bridgeSchool,
    bridgeCompany,
    bridgeMatchScore,
  } = initialState;

  const {
    query,
    setQuery,
    selectedPid,
    setSelectedPid,
    selectedTarget,
    setSelectedTarget,
    recScore,
    setRecScore,
    recReason,
    setRecReason,
    recSourceHint,
    setRecSourceHint,
    previewPathHint,
    setPreviewPathHint,
  } = usePathPageState({
    initialState,
  });

  const { items, setItems, loadingSearch } = usePathSearch({
    query,
    selectedPid,
    selectedTarget,
    onHydrateSelectedTarget: setSelectedTarget,
  });

  const {
    loadingDiscover,
    errorMessage,
    setErrorMessage,
    result,
    setResult,
    balanceBefore,
    setBalanceBefore,
    balanceAfter,
    setBalanceAfter,
    runDiscover,
  } = usePathDiscover({
    ownerUserId,
  });

  const found = Boolean(result?.ok !== false && result?.found);
  const path = Array.isArray(result?.path) ? result.path : [];
  const pathLine = buildPathLine(path);
  const lastNode = getLastPathNode(path);

  const resolvedTargetName = useMemo(() => {
    return resolveTargetName({
      selectedTarget,
      initialTargetName,
      lastNode,
    });
  }, [selectedTarget, initialTargetName, lastNode]);

  const resolvedTargetCategory = useMemo(() => {
    return resolveTargetCategory({
      selectedTarget,
      initialTargetCategory,
      lastNode,
    });
  }, [selectedTarget, initialTargetCategory, lastNode]);

  const isNoPathState = useMemo(() => {
    return !loadingDiscover && !!errorMessage && isNoPathMessage(errorMessage);
  }, [loadingDiscover, errorMessage]);

  const isSystemErrorState = useMemo(() => {
    return !loadingDiscover && !!errorMessage && !isNoPathMessage(errorMessage);
  }, [loadingDiscover, errorMessage]);

  const bridgeActionHref = useMemo(() => {
    return buildBridgeActionHref({
      selectedPid,
      resolvedTargetName,
      resolvedTargetCategory,
      recScore,
      recReason,
      recSourceHint,
      previewPathHint,
      isFromOverlap,
      bridgeName,
      bridgeCity,
      bridgeSchool,
      bridgeCompany,
      bridgeMatchScore,
    });
  }, [
    selectedPid,
    resolvedTargetName,
    resolvedTargetCategory,
    recScore,
    recReason,
    recSourceHint,
    previewPathHint,
    isFromOverlap,
    bridgeName,
    bridgeCity,
    bridgeSchool,
    bridgeCompany,
    bridgeMatchScore,
  ]);

  const shareHref = useMemo(() => {
    return buildShareHref({
      ownerUserId,
      selectedPid,
      resolvedTargetName,
      resolvedTargetCategory,
      recScore,
      recReason,
      recSourceHint,
      previewPathHint,
    });
  }, [
    ownerUserId,
    selectedPid,
    resolvedTargetName,
    resolvedTargetCategory,
    recScore,
    recReason,
    recSourceHint,
    previewPathHint,
  ]);

  const { sharing, actionMessage, handleSmartShare } = usePathShare({
    cardRef,
    resolvedTargetName,
    hops: typeof result?.hops === "number" ? result.hops : null,
    shareHref,
  });

  const quickTargets = useMemo(() => getQuickTargets(), []);

  const overlapMetaLine = useMemo(() => {
    return buildOverlapMetaLine({
      bridgeCity,
      bridgeSchool,
      bridgeCompany,
    });
  }, [bridgeCity, bridgeSchool, bridgeCompany]);

  const { handleSelectTarget, handleResetSelection } = usePathPageActions({
    autoTriggeredRef,
    selectedPid,
    setSelectedPid,
    setSelectedTarget,
    setQuery,
    setItems,
    setResult,
    setErrorMessage,
    setBalanceBefore,
    setBalanceAfter,
    runDiscover,
    recScore,
    recReason,
    recSourceHint,
    previewPathHint,
    isFromOverlap,
    bridgeName,
    bridgeCity,
    bridgeSchool,
    bridgeCompany,
    bridgeMatchScore,
  });

  useEffect(() => {
    if (initialHydrationDoneRef.current) {
      return;
    }

    let nextTargetPid = queryTargetPid;
    let nextTargetId = queryTargetId;
    let nextTargetName = queryTargetName;
    let nextSource = querySource;

    if (!nextTargetPid && !nextTargetId && !nextTargetName) {
      const pending = readPendingExploreFromSession();

      if (pending) {
        nextTargetPid = normalizeText(pending.targetPid);
        nextTargetId = normalizeText(pending.targetId);
        nextTargetName = normalizeText(pending.targetName);
        nextSource = normalizeText(pending.source);
      }
    }

    if (nextTargetName) {
      setQuery((current) => {
        const currentText = normalizeText(current);
        return currentText ? current : nextTargetName;
      });
    }

    if (nextTargetPid) {
      setSelectedPid((current) => {
        const currentText = normalizeText(current);
        return currentText ? current : nextTargetPid;
      });
    } else if (nextTargetId) {
      setSelectedPid((current) => {
        const currentText = normalizeText(current);
        return currentText ? current : nextTargetId;
      });
    }

    if (nextSource) {
      setEntrySource(nextSource);
    }

    initialHydrationDoneRef.current = true;
  }, [
    queryTargetPid,
    queryTargetId,
    queryTargetName,
    querySource,
    setQuery,
    setSelectedPid,
  ]);

  useEffect(() => {
    if (!initialHydrationDoneRef.current) {
      return;
    }

    if (autoTriggeredRef.current) {
      return;
    }

    const effectiveSource = normalizeText(entrySource) || normalizeText(recSourceHint);

    const shouldAutoDiscover =
      effectiveSource === "home-search" ||
      effectiveSource === "home-connectable-search" ||
      effectiveSource === "home-connectable";

    if (!shouldAutoDiscover) {
      return;
    }

    const targetPid = normalizeText(selectedPid);

    if (!targetPid) {
      return;
    }

    autoTriggeredRef.current = true;

    setResult(null);
    setErrorMessage("");
    setBalanceBefore(null);
    setBalanceAfter(null);

    void runDiscover(targetPid);
  }, [
    entrySource,
    recSourceHint,
    selectedPid,
    runDiscover,
    setResult,
    setErrorMessage,
    setBalanceBefore,
    setBalanceAfter,
  ]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PathHeader />

        {isFromOverlap ? (
          <OverlapSourceSection
            bridgeName={bridgeName}
            overlapMetaLine={overlapMetaLine}
            bridgeMatchScore={bridgeMatchScore}
            resolvedTargetName={resolvedTargetName}
            selectedPid={selectedPid}
            recReason={recReason}
            previewPathHint={previewPathHint}
          />
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <TargetSearchPanel
            query={query}
            onQueryChange={setQuery}
            loadingSearch={loadingSearch}
            items={items}
            quickTargets={quickTargets}
            onSelectTarget={handleSelectTarget}
            resolvedTargetName={resolvedTargetName}
            selectedPid={selectedPid}
            resolvedTargetCategory={resolvedTargetCategory}
            recScore={recScore}
            recReason={recReason}
            recSourceHint={recSourceHint}
            previewPathHint={previewPathHint}
            isFromOverlap={isFromOverlap}
            bridgeName={bridgeName}
            overlapMetaLine={overlapMetaLine}
            loadingDiscover={loadingDiscover}
            onDiscover={() => runDiscover(selectedPid)}
            getTargetBadge={getTargetBadge}
          />

          <PathResultCard
            cardRef={cardRef}
            isFromOverlap={isFromOverlap}
            bridgeName={bridgeName}
            overlapMetaLine={overlapMetaLine}
            resolvedTargetName={resolvedTargetName}
            resolvedTargetCategory={resolvedTargetCategory}
            recReason={recReason}
            previewPathHint={previewPathHint}
            result={result as DiscoverPayload | null}
            balanceBefore={balanceBefore}
            balanceAfter={balanceAfter}
            loadingDiscover={loadingDiscover}
            pathLine={pathLine}
            found={found}
            sharing={sharing}
            shareHref={shareHref}
            actionMessage={actionMessage}
            onShare={handleSmartShare}
            getTargetBadge={getTargetBadge}
            getConfidenceTone={getConfidenceTone}
          >
            {isNoPathState ? (
              <NoPathState
                errorMessage={errorMessage}
                bridgeActionHref={bridgeActionHref}
                selectedPid={selectedPid}
                loadingDiscover={loadingDiscover}
                resolvedTargetName={resolvedTargetName}
                onRetry={() => runDiscover(selectedPid)}
              />
            ) : null}

            {isSystemErrorState ? (
              <SystemErrorState
                errorMessage={errorMessage}
                selectedPid={selectedPid}
                loadingDiscover={loadingDiscover}
                resolvedTargetName={resolvedTargetName}
                onRetry={() => runDiscover(selectedPid)}
                onReset={handleResetSelection}
              />
            ) : null}
          </PathResultCard>
        </div>
      </div>
    </main>
  );
}