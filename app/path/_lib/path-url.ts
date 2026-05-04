import type { ReadonlyURLSearchParams } from "next/navigation";
import type { SearchPerson } from "./path-types";
import { normalizeText } from "./path-helpers";

type InitialPathPageState = {
  ownerUserId: string;
  initialTargetPid: string;
  initialTargetName: string;
  initialTargetCategory: string;
  initialQuery: string;
  isFromOverlap: boolean;
  bridgeName: string;
  bridgeCity: string;
  bridgeSchool: string;
  bridgeCompany: string;
  bridgeMatchScore: string;
  recScore: string;
  recReason: string;
  recSourceHint: string;
  previewPathHint: string;
};

type CommonPathUrlParams = {
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

type BuildPathUrlForSelectedTargetParams = CommonPathUrlParams & {
  item: SearchPerson;
};

type BuildBridgeActionHrefParams = CommonPathUrlParams & {
  selectedPid: string;
  resolvedTargetName: string;
  resolvedTargetCategory: string;
};

type BuildShareHrefParams = {
  ownerUserId: string;
  selectedPid: string;
  resolvedTargetName: string;
  resolvedTargetCategory: string;
  recScore: string;
  recReason: string;
  recSourceHint: string;
  previewPathHint: string;
};

function applyRecommendationParams(
  params: URLSearchParams,
  values: {
    recScore: string;
    recReason: string;
    recSourceHint: string;
    previewPathHint: string;
  }
) {
  if (values.recScore) params.set("recScore", values.recScore);
  if (values.recReason) params.set("recReason", values.recReason);
  if (values.recSourceHint) params.set("recSourceHint", values.recSourceHint);
  if (values.previewPathHint) {
    params.set("previewPathHint", values.previewPathHint);
  }
}

function applyOverlapParams(
  params: URLSearchParams,
  values: {
    isFromOverlap: boolean;
    bridgeName: string;
    bridgeCity: string;
    bridgeSchool: string;
    bridgeCompany: string;
    bridgeMatchScore: string;
  }
) {
  if (values.isFromOverlap) params.set("from", "overlap");
  if (values.bridgeName) params.set("bridgeName", values.bridgeName);
  if (values.bridgeCity) params.set("bridgeCity", values.bridgeCity);
  if (values.bridgeSchool) params.set("bridgeSchool", values.bridgeSchool);
  if (values.bridgeCompany) params.set("bridgeCompany", values.bridgeCompany);
  if (values.bridgeMatchScore) {
    params.set("bridgeMatchScore", values.bridgeMatchScore);
  }
}

export function getInitialPathPageState(
  searchParams: ReadonlyURLSearchParams,
  fallbackOwnerUserId: string
): InitialPathPageState {
  const ownerUserId =
    normalizeText(searchParams.get("ownerUserId")) || fallbackOwnerUserId;

  const initialTargetPid = normalizeText(searchParams.get("targetPid"));
  const initialTargetName = normalizeText(searchParams.get("targetName"));
  const initialTargetCategory = normalizeText(
    searchParams.get("targetCategory")
  );
  const initialQuery = normalizeText(searchParams.get("query"));

  const fromSource = normalizeText(searchParams.get("from"));
  const isFromOverlap = fromSource === "overlap";

  const bridgeName = normalizeText(searchParams.get("bridgeName"));
  const bridgeCity = normalizeText(searchParams.get("bridgeCity"));
  const bridgeSchool = normalizeText(searchParams.get("bridgeSchool"));
  const bridgeCompany = normalizeText(searchParams.get("bridgeCompany"));
  const bridgeMatchScore = normalizeText(searchParams.get("bridgeMatchScore"));

  const recScore = normalizeText(searchParams.get("recScore"));
  const recReason = normalizeText(searchParams.get("recReason"));
  const recSourceHint = normalizeText(searchParams.get("recSourceHint"));
  const previewPathHint = normalizeText(searchParams.get("previewPathHint"));

  return {
    ownerUserId,
    initialTargetPid,
    initialTargetName,
    initialTargetCategory,
    initialQuery,
    isFromOverlap,
    bridgeName,
    bridgeCity,
    bridgeSchool,
    bridgeCompany,
    bridgeMatchScore,
    recScore,
    recReason,
    recSourceHint,
    previewPathHint,
  };
}

export function buildPathUrlForSelectedTarget({
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
}: BuildPathUrlForSelectedTargetParams) {
  const params = new URLSearchParams();

  params.set("targetPid", item.pid);
  params.set("targetName", item.displayName);
  params.set("targetCategory", item.category);

  applyRecommendationParams(params, {
    recScore,
    recReason,
    recSourceHint,
    previewPathHint,
  });

  applyOverlapParams(params, {
    isFromOverlap,
    bridgeName,
    bridgeCity,
    bridgeSchool,
    bridgeCompany,
    bridgeMatchScore,
  });

  return `/path?${params.toString()}`;
}

export function buildBridgeActionHref({
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
}: BuildBridgeActionHrefParams) {
  const params = new URLSearchParams();

  if (selectedPid) params.set("targetPid", selectedPid);
  if (resolvedTargetName) params.set("targetName", resolvedTargetName);
  if (resolvedTargetCategory) {
    params.set("targetCategory", resolvedTargetCategory);
  }

  applyRecommendationParams(params, {
    recScore,
    recReason,
    recSourceHint,
    previewPathHint,
  });

  applyOverlapParams(params, {
    isFromOverlap,
    bridgeName,
    bridgeCity,
    bridgeSchool,
    bridgeCompany,
    bridgeMatchScore,
  });

  const queryString = params.toString();

  return queryString
    ? `/my-network/graph-expansion-operator?${queryString}`
    : "/my-network/graph-expansion-operator";
}

export function buildShareHref({
  ownerUserId,
  selectedPid,
  resolvedTargetName,
  resolvedTargetCategory,
  recScore,
  recReason,
  recSourceHint,
  previewPathHint,
}: BuildShareHrefParams) {
  const params = new URLSearchParams();

  params.set("ownerUserId", ownerUserId);
  params.set("targetPid", selectedPid);
  params.set("targetName", resolvedTargetName);
  params.set("targetCategory", resolvedTargetCategory);

  if (recScore) params.set("recScore", recScore);
  if (recReason) params.set("recReason", recReason);
  if (recSourceHint) params.set("recSourceHint", recSourceHint);
  if (previewPathHint) params.set("previewPathHint", previewPathHint);

  return `/path/share?${params.toString()}`;
}