"use client";

import { useEffect, useState } from "react";
import {
  buildHomeRecommendationCandidates,
} from "../utils/homeRecommendationUtils";


const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

export function useHomeRecommendations() {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const candidates = buildHomeRecommendationCandidates();

        const results = await Promise.all(
          candidates.map(async (c) => {
            const res = await fetch("/api/path/discover", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ownerUserId: FIXED_OWNER_USER_ID,
                targetPid: c.targetPid,
              }),
            });

            const json = await res.json();

            return {
              ...c,
              reachable: json?.ok,
                            raw: json,
            };
          })
        );

        setData(results.filter((r) => r.reachable));
      } catch (e: any) {
        setError("추천 경로를 불러오지 못했어요.");
      }
    }

    load();
  }, []);

  return { data, error };
}