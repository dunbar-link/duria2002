"use client";

import { useEffect, useState } from "react";
import type {
  SearchApiItem,
  SearchPerson,
  SearchResponse,
} from "../_lib/path-types";
import { mapSearchItem } from "../_lib/path-helpers";

type UsePathSearchParams = {
  query: string;
  selectedPid: string;
  selectedTarget: SearchPerson | null;
  onHydrateSelectedTarget: (target: SearchPerson | null) => void;
};

type UsePathSearchReturn = {
  items: SearchPerson[];
  setItems: React.Dispatch<React.SetStateAction<SearchPerson[]>>;
  loadingSearch: boolean;
};

export function usePathSearch({
  query,
  selectedPid,
  selectedTarget,
  onHydrateSelectedTarget,
}: UsePathSearchParams): UsePathSearchReturn {
  const [items, setItems] = useState<SearchPerson[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    let active = true;

    async function searchPeople() {
      if (!query.trim()) {
        setItems([]);
        return;
      }

      setLoadingSearch(true);

      try {
        const response = await fetch(
          `/api/people/search?q=${encodeURIComponent(query.trim())}`
        );

        const data = (await response.json()) as SearchResponse;

        if (!active) return;

        if (!response.ok || !data.ok) {
          setItems([]);
          setLoadingSearch(false);
          return;
        }

        const normalizedItems = Array.isArray(data.items)
          ? data.items
              .map((item: SearchApiItem) => mapSearchItem(item))
              .filter((item): item is SearchPerson => Boolean(item))
          : [];

        setItems(normalizedItems);
        setLoadingSearch(false);
      } catch {
        if (!active) return;
        setItems([]);
        setLoadingSearch(false);
      }
    }

    const timer = setTimeout(searchPeople, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    let active = true;

    async function hydrateSelectedTarget() {
      if (!selectedPid) {
        onHydrateSelectedTarget(null);
        return;
      }

      const existing =
        items.find((item) => item.pid === selectedPid) ?? selectedTarget;

      if (existing && existing.pid === selectedPid) {
        return;
      }

      try {
        const response = await fetch(
          `/api/people/search?q=${encodeURIComponent(selectedPid)}`
        );

        const data = (await response.json()) as SearchResponse;

        if (!active) return;
        if (!response.ok || !data.ok) return;

        const normalizedItems = Array.isArray(data.items)
          ? data.items
              .map((item: SearchApiItem) => mapSearchItem(item))
              .filter((item): item is SearchPerson => Boolean(item))
          : [];

        const matched =
          normalizedItems.find((item) => item.pid === selectedPid) ?? null;

        if (matched) {
          onHydrateSelectedTarget(matched);
        }
      } catch {
        // ignore
      }
    }

    hydrateSelectedTarget();

    return () => {
      active = false;
    };
  }, [selectedPid, items, selectedTarget, onHydrateSelectedTarget]);

  return {
    items,
    setItems,
    loadingSearch,
  };
}