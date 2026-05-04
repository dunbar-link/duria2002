"use client";

import { useCallback, useState } from "react";
import type {
  DiscoverPayload,
  DiscoverResponse,
} from "../_lib/path-types";
import {
  getErrorGuide,
  normalizeText,
  safeNumber,
} from "../_lib/path-helpers";

type UsePathDiscoverParams = {
  ownerUserId: string;
};

type UsePathDiscoverReturn = {
  loadingDiscover: boolean;
  errorMessage: string;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  result: DiscoverPayload | null;
  setResult: React.Dispatch<React.SetStateAction<DiscoverPayload | null>>;
  balanceBefore: number | null;
  setBalanceBefore: React.Dispatch<React.SetStateAction<number | null>>;
  balanceAfter: number | null;
  setBalanceAfter: React.Dispatch<React.SetStateAction<number | null>>;
  runDiscover: (targetPid: string) => Promise<void>;
};

export function usePathDiscover({
  ownerUserId,
}: UsePathDiscoverParams): UsePathDiscoverReturn {
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<DiscoverPayload | null>(null);
  const [balanceBefore, setBalanceBefore] = useState<number | null>(null);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);

  const runDiscover = useCallback(
    async (targetPid: string) => {
      if (!targetPid) {
        setErrorMessage("타겟을 먼저 선택해주세요.");
        return;
      }

      setLoadingDiscover(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/path/discover", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerUserId,
            targetPid,
          }),
        });

        const data = (await response.json()) as DiscoverResponse;

        if (!response.ok || !data.ok) {
          const message =
            "error" in data && data.error
              ? data.error
              : "경로 탐색 중 오류가 발생했습니다.";

          const userMessage =
            "userMessage" in data ? normalizeText(data.userMessage) : "";

          setResult(null);
          setBalanceBefore(null);
          setBalanceAfter(null);
          setErrorMessage(getErrorGuide(message, userMessage));
          setLoadingDiscover(false);
          return;
        }

        setResult(data.result);
        setBalanceBefore(safeNumber(data.balance_before));
        setBalanceAfter(safeNumber(data.balance_after));

        if (data.result?.ok === false || data.result?.found === false) {
          setErrorMessage(
            getErrorGuide(
              data.result?.error || "경로를 찾지 못했습니다.",
              data.result?.userMessage
            )
          );
        } else {
          setErrorMessage("");
        }

        setLoadingDiscover(false);
      } catch (error) {
        setResult(null);
        setBalanceBefore(null);
        setBalanceAfter(null);
        setErrorMessage(
          getErrorGuide(
            error instanceof Error
              ? error.message
              : "경로 탐색 중 알 수 없는 오류가 발생했습니다."
          )
        );
        setLoadingDiscover(false);
      }
    },
    [ownerUserId]
  );

  return {
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
  };
}