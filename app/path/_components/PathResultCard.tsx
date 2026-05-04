"use client";

import Link from "next/link";
import type { ReactNode, RefObject } from "react";

type DiscoverPathNode = {
  pid: string;
  name: string;
  city?: string | null;
  school?: string | null;
  company?: string | null;
  isCelebrity?: boolean;
};

type BridgeEvidence = {
  type: "school" | "company" | "city" | "unknown";
  label: string;
};

type RecommendationType =
  | "PRIMARY"
  | "FASTEST"
  | "STRONGEST"
  | "BALANCED"
  | "BACKUP";

type DiscoverPathCandidate = {
  people?: DiscoverPathNode[];
  stepCount?: number | null;
  firstConnectorPid?: string | null;
  firstConnectorName?: string | null;
  firstConnectorEvidence?: BridgeEvidence | null;
  tierAverage?: number | null;
  score?: number | null;
  presentedPath?: string;
  recommendationType?: RecommendationType;
};

type DiscoverPayload = {
  ok?: boolean;
  found?: boolean;
  hops?: number;
  avgTrust?: number;
  bottleneckTrust?: number;
  confidence?: number;
  confidenceLabel?: string;
  cost?: number;
  error?: string;
  errorCode?: string;
  userMessage?: string;
  path?: DiscoverPathNode[];
  firstConnectorName?: string;
  firstConnectorEvidence?: BridgeEvidence | null;
  presentedPathText?: string;
  bestPath?: DiscoverPathCandidate | null;
  allPaths?: DiscoverPathCandidate[];
};

type PathResultCardProps = {
  cardRef: RefObject<HTMLDivElement | null>;
  isFromOverlap: boolean;
  bridgeName: string;
  overlapMetaLine: string;
  resolvedTargetName: string;
  resolvedTargetCategory: string;
  recReason: string;
  previewPathHint: string;
  result: DiscoverPayload | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  loadingDiscover: boolean;
  pathLine: string;
  found: boolean;
  sharing: boolean;
  shareHref: string;
  actionMessage: string;
  onShare: () => void;
  getTargetBadge: (category: string) => string;
  getConfidenceTone: (label: string) => string;
  children?: ReactNode;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function formatDecimal(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(2);
}

function buildCandidatePathLine(candidate: DiscoverPathCandidate) {
  const explicit = normalizeText(candidate.presentedPath);

  if (explicit) {
    return explicit;
  }

  const people = Array.isArray(candidate.people) ? candidate.people : [];

  if (people.length === 0) {
    return "";
  }

  return people.map((node) => normalizeText(node.name) || "Unknown").join(" → ");
}

function buildFoundStatusMessage(
  result: DiscoverPayload | null,
  targetName: string
) {
  const hops = result?.hops ?? 0;
  const avgTrust = result?.avgTrust ?? 0;
  const safeTargetName = normalizeText(targetName) || "이 타겟";

  if (hops > 0 && hops <= 3 && avgTrust >= 0.7) {
    return `${safeTargetName}까지 비교적 짧고 안정적인 사람 중심 경로가 확인되었습니다. 이제 중요한 것은 경로를 감상하는 것이 아니라, 첫 브리지에게 실제로 연락할 수 있는가입니다.`;
  }

  if (hops > 0 && hops <= 5 && avgTrust >= 0.4) {
    return `${safeTargetName}까지 이어지는 실행 가능한 경로는 확인되었습니다. 첫 브리지를 중심으로 현실적인 연결 시도를 설계할 수 있는 상태입니다.`;
  }

  if (hops > 0) {
    return `${safeTargetName}까지 이어지는 사람 중심 경로는 확인되었습니다. 다만 실제 실행 전에는 첫 브리지와 경로 강도를 함께 보는 것이 좋습니다.`;
  }

  return `${safeTargetName}까지 이어지는 경로가 확인되었습니다.`;
}

function buildPrimaryActionText(
  connectorName: string,
  targetName: string,
  hops?: number
) {
  const safeConnectorName = normalizeText(connectorName);
  const safeTargetName = normalizeText(targetName) || "이 타겟";

  if (!safeConnectorName) {
    return `${safeTargetName}까지 이어질 첫 브리지를 아직 특정하지 못했습니다.`;
  }

  if (typeof hops === "number" && hops <= 3) {
    return `지금은 ${safeConnectorName}님에게 먼저 연락하는 것이 가장 현실적입니다. ${safeTargetName}까지 이어지는 경로의 출발점이 이 사람입니다.`;
  }

  return `${safeConnectorName}님이 ${safeTargetName}까지 이어지는 첫 실행 브리지입니다. 실제 연결 시도는 이 사람부터 시작하는 것이 맞습니다.`;
}

function buildFirstBridgeDescription(
  connectorName: string,
  evidenceLabel: string,
  targetName: string,
  hops?: number
) {
  const safeConnectorName = normalizeText(connectorName);
  const safeEvidenceLabel = normalizeText(evidenceLabel);
  const safeTargetName = normalizeText(targetName) || "이 타겟";

  if (!safeConnectorName) {
    return "";
  }

  if (safeEvidenceLabel && typeof hops === "number" && hops <= 3) {
    return `${safeConnectorName}님은 ${safeEvidenceLabel}을 바탕으로 ${safeTargetName}까지 이어지는 첫 핵심 브리지입니다. 실제 연결 성공 가능성을 가장 먼저 좌우하는 사람입니다.`;
  }

  if (safeEvidenceLabel) {
    return `${safeConnectorName}님은 ${safeEvidenceLabel}을 바탕으로 ${safeTargetName}까지 가는 경로에서 가장 먼저 닿는 실행 브리지입니다.`;
  }

  if (typeof hops === "number" && hops <= 3) {
    return `${safeConnectorName}님은 ${safeTargetName}까지 이어지는 첫 핵심 브리지입니다. 실제 연결 시도를 가장 먼저 시작해야 할 사람입니다.`;
  }

  return `${safeConnectorName}님은 ${safeTargetName}까지 가는 경로에서 가장 먼저 닿는 브리지입니다.`;
}

function buildPresentedPathMeaning(
  result: DiscoverPayload | null,
  connectorName: string,
  targetName: string
) {
  const hops = result?.hops ?? 0;
  const avgTrust = result?.avgTrust ?? 0;
  const safeConnectorName = normalizeText(connectorName);
  const safeTargetName = normalizeText(targetName) || "이 타겟";

  if (safeConnectorName && hops > 0 && hops <= 3 && avgTrust >= 0.7) {
    return `${safeConnectorName}님을 시작점으로 보면 ${safeTargetName}까지 이어지는 흐름이 비교적 짧고 선명합니다.`;
  }

  if (safeConnectorName && hops > 0) {
    return `${safeConnectorName}님을 시작점으로 중간 브리지를 따라가며 ${safeTargetName}까지 접근하는 구조입니다.`;
  }

  if (hops > 0) {
    return `${safeTargetName}까지 이어지는 사람 중심 경로가 확인되었습니다.`;
  }

  return "";
}

function buildSummaryTags(result: DiscoverPayload | null) {
  const tags: string[] = [];
  const hops = result?.hops ?? 0;
  const avgTrust = result?.avgTrust ?? 0;
  const bottleneck = result?.bottleneckTrust ?? 0;
  const alternativeCount = Array.isArray(result?.allPaths)
    ? Math.max(result.allPaths.length - 1, 0)
    : 0;

  if (hops > 0 && hops <= 3) {
    tags.push("빠른 연결");
  } else if (hops > 3 && hops <= 5) {
    tags.push("현실적 경로");
  } else if (hops > 5) {
    tags.push("장거리 연결");
  }

  if (avgTrust >= 0.7) {
    tags.push("신뢰 높음");
  } else if (avgTrust >= 0.4) {
    tags.push("신뢰 보통");
  } else if (avgTrust > 0) {
    tags.push("신뢰 보강 필요");
  }

  if (bottleneck >= 0.7) {
    tags.push("병목 안정");
  } else if (bottleneck > 0 && bottleneck < 0.4) {
    tags.push("약한 구간 존재");
  }

  if (alternativeCount > 0) {
    tags.push(`대안 ${alternativeCount}개`);
  }

  return tags.slice(0, 4);
}

function getAlternativePaths(result: DiscoverPayload | null) {
  if (!result || !Array.isArray(result.allPaths)) {
    return [];
  }

  return result.allPaths
    .slice(1)
    .filter(
      (candidate) => normalizeText(buildCandidatePathLine(candidate)).length > 0
    )
    .slice(0, 3);
}

function getRecommendationLabel(type?: RecommendationType) {
  switch (type) {
    case "PRIMARY":
      return "메인 추천";
    case "FASTEST":
      return "가장 빠른 연결";
    case "STRONGEST":
      return "신뢰 높은 경로";
    case "BALANCED":
      return "균형 추천";
    case "BACKUP":
      return "백업 경로";
    default:
      return "대안 경로";
  }
}

function buildAlternativeReason(
  candidate: DiscoverPathCandidate,
  targetName: string
) {
  const firstConnector = normalizeText(candidate.firstConnectorName);
  const evidence = normalizeText(candidate.firstConnectorEvidence?.label);
  const stepCount =
    typeof candidate.stepCount === "number" ? candidate.stepCount : null;
  const safeTargetName = normalizeText(targetName) || "이 타겟";
  const recommendationType = candidate.recommendationType;

  if (
    recommendationType === "FASTEST" &&
    firstConnector &&
    stepCount !== null
  ) {
    return `${firstConnector}님을 시작점으로 ${safeTargetName}까지 가장 빠르게 닿을 수 있는 대안 경로입니다.`;
  }

  if (
    recommendationType === "STRONGEST" &&
    firstConnector &&
    evidence
  ) {
    return `${firstConnector}님을 시작점으로 ${evidence} 근거가 비교적 강한 안정적 대안 경로입니다.`;
  }

  if (
    recommendationType === "BALANCED" &&
    firstConnector &&
    stepCount !== null
  ) {
    return `${firstConnector}님을 시작점으로 속도와 안정성을 함께 고려한 균형형 대안 경로입니다.`;
  }

  if (
    recommendationType === "BACKUP" &&
    firstConnector
  ) {
    return `${firstConnector}님부터 시도할 수 있는 백업 경로입니다. 메인 추천이 어려울 때 다음 선택지로 적합합니다.`;
  }

  if (firstConnector && evidence && stepCount !== null) {
    return `${firstConnector}님을 시작점으로 ${evidence}을 활용해 ${safeTargetName}까지 ${stepCount}단계로 접근하는 대안입니다.`;
  }

  if (firstConnector && stepCount !== null) {
    return `${firstConnector}님을 시작점으로 ${safeTargetName}까지 ${stepCount}단계로 이어지는 대안 경로입니다.`;
  }

  if (stepCount !== null) {
    return `${safeTargetName}까지 ${stepCount}단계로 이어지는 대안 경로입니다.`;
  }

  return `${safeTargetName}까지 이어지는 다른 사람 중심 대안 경로입니다.`;
}

export default function PathResultCard({
  cardRef,
  isFromOverlap,
  bridgeName,
  overlapMetaLine,
  resolvedTargetName,
  resolvedTargetCategory,
  recReason,
  previewPathHint,
  result,
  balanceBefore,
  balanceAfter,
  loadingDiscover,
  pathLine,
  found,
  sharing,
  shareHref,
  actionMessage,
  onShare,
  getTargetBadge,
  getConfidenceTone,
  children,
}: PathResultCardProps) {
  const connectorName = normalizeText(result?.firstConnectorName);
  const evidenceLabel = normalizeText(result?.firstConnectorEvidence?.label);
  const presentedPath =
    normalizeText(result?.presentedPathText) || normalizeText(pathLine);

  const shouldShowFoundSections = !loadingDiscover && found;
  const shouldShowSearchingState = loadingDiscover;
  const shouldShowPendingState = !loadingDiscover && !found;

  const recommendationText =
    normalizeText(recReason) || "추천 기반 탐색 대상입니다.";

  const predictedBridgeText =
    normalizeText(previewPathHint) || "예측 브리지 정보가 아직 없습니다.";

  const foundStatusMessage = buildFoundStatusMessage(
    result,
    resolvedTargetName
  );

  const primaryActionText = buildPrimaryActionText(
    connectorName,
    resolvedTargetName,
    result?.hops
  );

  const firstBridgeDescription = buildFirstBridgeDescription(
    connectorName,
    evidenceLabel,
    resolvedTargetName,
    result?.hops
  );

  const presentedPathMeaning = buildPresentedPathMeaning(
    result,
    connectorName,
    resolvedTargetName
  );

  const alternativePaths = getAlternativePaths(result);
  const summaryTags = buildSummaryTags(result);

  return (
    <section
      ref={cardRef}
      className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.09)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Dunbar Link
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Actionable Bridge Recommendation
          </p>
        </div>

        <div className="flex gap-2">
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {getTargetBadge(resolvedTargetCategory)}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-[28px] font-bold leading-[1.2] text-slate-950">
          {resolvedTargetName}
          <br />
          {shouldShowSearchingState
            ? "브릿지 탐색 중"
            : shouldShowFoundSections && connectorName
            ? `${connectorName}님부터 시작`
            : shouldShowFoundSections && typeof result?.hops === "number"
            ? `${result.hops}단계 연결 확인`
            : "탐색 대상"}
        </h2>
      </div>

      {shouldShowSearchingState ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          사람 중심 브리지 경로를 탐색 중입니다...
        </div>
      ) : null}

      {shouldShowFoundSections && summaryTags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summaryTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {shouldShowFoundSections ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Execution Summary
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {foundStatusMessage}
          </p>
        </div>
      ) : null}

      {shouldShowPendingState ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current Status
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            아직 실행 가능한 브리지는 확인되지 않았지만,
            <br />
            이 타겟은 계속 탐색할 가치가 있는 대상으로 유지됩니다.
          </p>
        </div>
      ) : null}

      {shouldShowFoundSections && connectorName ? (
        <div className="mt-5 rounded-3xl border border-violet-200 bg-violet-50 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Recommended First Bridge
          </p>

          <p className="mt-3 text-[24px] font-bold leading-tight text-slate-950">
            지금은 {connectorName}님에게
            <br />
            먼저 연락하세요
          </p>

          <p className="mt-3 text-sm leading-6 text-slate-700">
            {primaryActionText}
          </p>

          {evidenceLabel ? (
            <div className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
              {evidenceLabel}
            </div>
          ) : null}
        </div>
      ) : null}

      {shouldShowFoundSections && connectorName ? (
        <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Why This Person
          </p>
          <p className="mt-2 text-base font-bold text-slate-900">
            {connectorName}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {firstBridgeDescription}
          </p>
        </div>
      ) : null}

      {isFromOverlap && bridgeName ? (
        <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Overlap Context
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {bridgeName}
          </p>
          {overlapMetaLine ? (
            <p className="mt-1 text-sm text-slate-600">{overlapMetaLine}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Why This Target
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {recommendationText}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Predicted Bridge Hint
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {predictedBridgeText}
          </p>
        </div>
      </div>

      {shouldShowFoundSections && presentedPath ? (
        <div className="mt-6 rounded-2xl bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">
              People Path
            </p>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-200">
              best route
            </span>
          </div>

          <p className="mt-2 break-words text-sm text-white">{presentedPath}</p>

          {presentedPathMeaning ? (
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {presentedPathMeaning}
            </p>
          ) : null}
        </div>
      ) : null}

      {shouldShowFoundSections && alternativePaths.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Other Reachable Bridges
            </p>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
              {alternativePaths.length}개
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {alternativePaths.map((candidate, index) => {
              const altPathLine = buildCandidatePathLine(candidate);
              const altFirstConnector = normalizeText(candidate.firstConnectorName);
              const altEvidence = normalizeText(
                candidate.firstConnectorEvidence?.label
              );
              const altStepCount =
                typeof candidate.stepCount === "number"
                  ? `${candidate.stepCount}단계`
                  : "-";
              const altScore =
                typeof candidate.score === "number"
                  ? candidate.score.toFixed(1)
                  : "-";

              const label = getRecommendationLabel(
                candidate.recommendationType
              );

              const reason = buildAlternativeReason(
                candidate,
                resolvedTargetName
              );

              return (
                <div
                  key={`${altPathLine}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {label}
                      </p>
                      {altFirstConnector ? (
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          먼저 연락할 사람: {altFirstConnector}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {altStepCount}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        점수 {altScore}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {reason}
                  </p>

                  {altEvidence ? (
                    <p className="mt-2 text-xs text-slate-500">{altEvidence}</p>
                  ) : null}

                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="break-words text-sm leading-6 text-slate-800">
                      {altPathLine}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {shouldShowFoundSections ? (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Avg Trust
            </p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {formatDecimal(result?.avgTrust)}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Bottleneck
            </p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {formatDecimal(result?.bottleneckTrust)}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Balance
            </p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {balanceAfter ?? balanceBefore ?? "-"}
            </p>
          </div>
        </div>
      ) : null}

      {shouldShowFoundSections && normalizeText(result?.confidenceLabel) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <div
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getConfidenceTone(
              normalizeText(result?.confidenceLabel)
            )}`}
          >
            {normalizeText(result?.confidenceLabel)}
            {typeof result?.confidence === "number"
              ? ` · ${Math.round(result.confidence)}%`
              : ""}
          </div>
        </div>
      ) : null}

      {shouldShowFoundSections ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            className="rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:bg-slate-300"
          >
            {sharing ? "Preparing Share..." : "Share to SNS"}
          </button>

          <Link
            href={shareHref}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Share Card
          </Link>

          <Link
            href={`${shareHref}&capture=1`}
            className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Capture Mode
          </Link>
        </div>
      ) : null}

      {shouldShowFoundSections && actionMessage ? (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
          {actionMessage}
        </div>
      ) : null}

      {children}
    </section>
  );
}