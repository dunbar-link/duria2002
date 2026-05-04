"use client";

import { useCallback, useEffect, type MutableRefObject } from "react";
import { buildPathUrlForSelectedTarget } from "../_lib/path-url";
import type { DiscoverPayload, SearchPerson } from "../_lib/path-types";

type UsePathPageActionsParams = {
  autoTriggeredRef: MutableRefObject<boolean>;
  selectedPid: string;
  setSelectedPid: React.Dispatch<React.SetStateAction<string>>;
  setSelectedTarget: React.Dispatch<React.SetStateAction<SearchPerson | null>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setItems: React.Dispatch<React.SetStateAction<SearchPerson[]>>;
  setResult: React.Dispatch<React.SetStateAction<DiscoverPayload | null>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setBalanceBefore: React.Dispatch<React.SetStateAction<number | null>>;
  setBalanceAfter: React.Dispatch<React.SetStateAction<number | null>>;
  runDiscover: (targetPid: string) => Promise<void>;
  recScore: string;
  recReason: string;
  recSourceHint: string;
  previewPathHint: string;
  isFromOverlap: boolean;
  bridgeName: string;
  bridgeCity: string;
  bridgeSchool: string;
  bridgeCompany: string;
  bridgeMatchScore: string;
};

type UsePathPageActionsReturn = {
  handleSelectTarget: (item: SearchPerson) => void;
  handleResetSelection: () => void;
};

export function usePathPageActions({
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
}: UsePathPageActionsParams): UsePathPageActionsReturn {

  /**
   * ✅ 핵심: 타겟 선택 시 항상 강제 실행
   */
  const handleSelectTarget = useCallback(
    async (item: SearchPerson) => {
      setSelectedPid(item.pid);
      setSelectedTarget(item);
      setQuery(item.displayName);

      // 🔥 기존 문제 해결: 항상 실행
      autoTriggeredRef.current = true;
      await runDiscover(item.pid);

      const nextUrl = buildPathUrlForSelectedTarget({
        item,
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

      window.history.replaceState(null, "", nextUrl);
    },
    [
      autoTriggeredRef,
      setSelectedPid,
      setSelectedTarget,
      setQuery,
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
    ]
  );

  const handleResetSelection = useCallback(() => {
    setQuery("");
    setItems([]);
    setSelectedPid("");
    setSelectedTarget(null);
    setResult(null);
    setErrorMessage("");
    setBalanceBefore(null);
    setBalanceAfter(null);

    // 🔥 리셋 시 다시 자동 탐색 가능하게
    autoTriggeredRef.current = false;
  }, [
    autoTriggeredRef,
    setQuery,
    setItems,
    setSelectedPid,
    setSelectedTarget,
    setResult,
    setErrorMessage,
    setBalanceBefore,
    setBalanceAfter,
  ]);

  /**
   * ✅ 핵심: 페이지 진입 시 자동 실행 (추천 포함)
   */
  useEffect(() => {
    if (!selectedPid) return;

    // 🔥 조건 제거 → 항상 실행
    autoTriggeredRef.current = true;
    void runDiscover(selectedPid);
  }, [selectedPid, runDiscover, autoTriggeredRef]);

  return {
    handleSelectTarget,
    handleResetSelection,
  };
}