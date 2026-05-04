"use client";

import { useEffect, useState } from "react";
import type { SearchPerson } from "../_lib/path-types";
import { buildInitialSelectedTarget } from "../_lib/path-view-model";

type InitialPathPageState = {
  initialTargetPid: string;
  initialTargetName: string;
  initialTargetCategory: string;
  initialQuery: string;
  recScore: string;
  recReason: string;
  recSourceHint: string;
  previewPathHint: string;
};

type UsePathPageStateParams = {
  initialState: InitialPathPageState;
};

type UsePathPageStateReturn = {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  selectedPid: string;
  setSelectedPid: React.Dispatch<React.SetStateAction<string>>;
  selectedTarget: SearchPerson | null;
  setSelectedTarget: React.Dispatch<React.SetStateAction<SearchPerson | null>>;
  recScore: string;
  setRecScore: React.Dispatch<React.SetStateAction<string>>;
  recReason: string;
  setRecReason: React.Dispatch<React.SetStateAction<string>>;
  recSourceHint: string;
  setRecSourceHint: React.Dispatch<React.SetStateAction<string>>;
  previewPathHint: string;
  setPreviewPathHint: React.Dispatch<React.SetStateAction<string>>;
};

export function usePathPageState({
  initialState,
}: UsePathPageStateParams): UsePathPageStateReturn {
  const {
    initialTargetPid,
    initialTargetName,
    initialTargetCategory,
    initialQuery,
    recScore: initialRecScore,
    recReason: initialRecReason,
    recSourceHint: initialRecSourceHint,
    previewPathHint: initialPreviewPathHint,
  } = initialState;

  const [query, setQuery] = useState(initialTargetName || initialQuery);
  const [selectedPid, setSelectedPid] = useState(initialTargetPid);
  const [selectedTarget, setSelectedTarget] = useState<SearchPerson | null>(
    buildInitialSelectedTarget({
      initialTargetPid,
      initialTargetName,
      initialTargetCategory,
    })
  );

  const [recScore, setRecScore] = useState(initialRecScore);
  const [recReason, setRecReason] = useState(initialRecReason);
  const [recSourceHint, setRecSourceHint] = useState(initialRecSourceHint);
  const [previewPathHint, setPreviewPathHint] = useState(initialPreviewPathHint);

  useEffect(() => {
    setRecScore(initialRecScore);
    setRecReason(initialRecReason);
    setRecSourceHint(initialRecSourceHint);
    setPreviewPathHint(initialPreviewPathHint);
  }, [
    initialRecScore,
    initialRecReason,
    initialRecSourceHint,
    initialPreviewPathHint,
  ]);

  return {
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
  };
}