import type { DiscoverPathNode, SearchPerson } from "./path-types";
import { normalizeText } from "./path-helpers";

type BuildInitialSelectedTargetParams = {
  initialTargetPid: string;
  initialTargetName: string;
  initialTargetCategory: string;
};

type ResolveTargetNameParams = {
  selectedTarget: SearchPerson | null;
  initialTargetName: string;
  lastNode: DiscoverPathNode | null;
};

type ResolveTargetCategoryParams = {
  selectedTarget: SearchPerson | null;
  initialTargetCategory: string;
  lastNode: DiscoverPathNode | null;
};

type BuildOverlapMetaLineParams = {
  bridgeCity: string;
  bridgeSchool: string;
  bridgeCompany: string;
};

export function buildInitialSelectedTarget({
  initialTargetPid,
  initialTargetName,
  initialTargetCategory,
}: BuildInitialSelectedTargetParams): SearchPerson | null {
  if (!initialTargetPid) {
    return null;
  }

  return {
    pid: initialTargetPid,
    displayName: initialTargetName || "Unknown Target",
    category: initialTargetCategory || "person",
    country: "",
  };
}

export function resolveTargetName({
  selectedTarget,
  initialTargetName,
  lastNode,
}: ResolveTargetNameParams) {
  if (normalizeText(selectedTarget?.displayName)) {
    return normalizeText(selectedTarget?.displayName);
  }

  if (normalizeText(initialTargetName)) {
    return initialTargetName;
  }

  if (normalizeText(lastNode?.name)) {
    return normalizeText(lastNode?.name);
  }

  return "Unknown Target";
}

export function resolveTargetCategory({
  selectedTarget,
  initialTargetCategory,
  lastNode,
}: ResolveTargetCategoryParams) {
  if (normalizeText(selectedTarget?.category)) {
    return normalizeText(selectedTarget?.category);
  }

  if (normalizeText(initialTargetCategory)) {
    return initialTargetCategory;
  }

  if (lastNode?.isCelebrity) {
    return "celebrity";
  }

  return "person";
}

export function getQuickTargets(): SearchPerson[] {
  return [
    {
      pid: "celeb:elon-musk",
      displayName: "Elon Musk",
      category: "celebrity",
      country: "US",
    },
    {
      pid: "celeb:lee-jae-yong",
      displayName: "이재용",
      category: "public_figure",
      country: "KR",
    },
  ];
}

export function buildOverlapMetaLine({
  bridgeCity,
  bridgeSchool,
  bridgeCompany,
}: BuildOverlapMetaLineParams) {
  const values = [bridgeCity, bridgeSchool, bridgeCompany].filter(Boolean);
  return values.length > 0 ? values.join(" · ") : "";
}