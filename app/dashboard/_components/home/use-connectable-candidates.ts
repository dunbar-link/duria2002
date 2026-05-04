"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildFallbackConnectableCandidates,
  rankConnectableCandidates,
} from "./connectable-candidate-engine";
import type {
  ConnectableCandidate,
  ConnectableRecommendationApiResponse,
  UseConnectableCandidatesParams,
  UseConnectableCandidatesResult,
} from "./connectable-candidate-types";
import { readConnectableCandidateStateMap } from "./home-page-utils";

const DEFAULT_LIMIT = 8;

export function useConnectableCandidates(
  params: UseConnectableCandidatesParams
): UseConnectableCandidatesResult {
  const ownerUserId = params.ownerUserId;
  const limit = params.limit ?? DEFAULT_LIMIT;
  const enabled = params.enabled ?? true;

  const [candidates, setCandidates] = useState<ConnectableCandidate[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const requestUrl = useMemo(() => {
    const searchParams = new URLSearchParams();
    searchParams.set("ownerUserId", ownerUserId);
    searchParams.set("limit", String(limit));

    return `/api/connectable-recommendations?${searchParams.toString()}`;
  }, [ownerUserId, limit]);

  const fetchCandidates = useCallback(async () => {
    if (!enabled) {
      setCandidates([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (!ownerUserId?.trim()) {
      setCandidates([]);
      setLoading(false);
      setError("ownerUserId가 필요합니다.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(requestUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`추천 API 호출 실패: ${response.status}`);
      }

      const data =
        (await response.json()) as ConnectableRecommendationApiResponse;

      const rawItems =
        Array.isArray(data.items) && data.items.length > 0
          ? data.items
          : buildFallbackConnectableCandidates();

      const stateMap = readConnectableCandidateStateMap();
      const ranked = rankConnectableCandidates(rawItems, limit, stateMap);

      setCandidates(ranked);
      setError(null);
    } catch (err) {
      console.error("[useConnectableCandidates] fetch failed", err);

      const fallbackStateMap = readConnectableCandidateStateMap();
      const fallbackRanked = rankConnectableCandidates(
        buildFallbackConnectableCandidates(),
        limit,
        fallbackStateMap
      );

      setCandidates(fallbackRanked);
      setError("추천 데이터를 불러오지 못해 기본 후보를 표시합니다.");
    } finally {
      setLoading(false);
    }
  }, [enabled, ownerUserId, requestUrl, limit]);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  return {
    candidates,
    loading,
    error,
    refetch: fetchCandidates,
  };
}