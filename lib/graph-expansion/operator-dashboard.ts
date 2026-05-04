import type {
  GraphExpansionOperatorIntelligence,
  OperatorHighlightBucket,
  OperatorRecommendedAction,
  OperatorTopPriorityBucket,
} from "@/lib/graph-expansion/operator-intelligence";

type LooseStatus =
  | "queued"
  | "reviewing"
  | "approved"
  | "rejected"
  | "seeded"
  | "archived"
  | string;

export type OperatorDashboardCandidate = {
  id: string;
  status?: LooseStatus | null;
  targetPid?: string | null;
  targetName?: string | null;
  targetCategory?: string | null;
  targetCountry?: string | null;
  qualityScore?: number | null;
  qualityLabel?: string | null;
  seedPriority?: number | null;
  seedPriorityLabel?: string | null;
  dangerous?: boolean | null;
  duplicateRisk?: string | null;
  duplicateLabel?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  intelligence?: Partial<GraphExpansionOperatorIntelligence> | null;
};

export type OperatorTopPriorityItem = {
  id: string;
  targetName: string;
  targetPid: string;
  status: string;
  recommendedAction: OperatorRecommendedAction | "review";
  riskLevel: string;
  rankingScore: number;
  priorityScore: number;
  seedImpactScore: number;
  recommendationConfidence: number;
  topPriorityBucket: OperatorTopPriorityBucket;
  highlightBucket: OperatorHighlightBucket;
  dangerous: boolean;
  duplicateRisk: string;
  qualityScore: number;
  summaryLabel: string;
  summaryReason: string;
};

export type OperatorTopPrioritySummaryCard = {
  key:
    | "act-now"
    | "seed-focus"
    | "review-first"
    | "reject-first"
    | "dangerous"
    | "duplicate-risk";
  label: string;
  count: number;
  sampleTargets: string[];
};

export type OperatorDashboardSummary = {
  totalActiveCount: number;
  actNowCount: number;
  seedFocusCount: number;
  reviewFirstCount: number;
  rejectFirstCount: number;
  dangerousCount: number;
  duplicateRiskCount: number;
  topPriorityItems: OperatorTopPriorityItem[];
  seedCandidates: OperatorTopPriorityItem[];
  reviewCandidates: OperatorTopPriorityItem[];
  rejectCandidates: OperatorTopPriorityItem[];
  summaryCards: OperatorTopPrioritySummaryCard[];
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toBoolean(value: unknown) {
  return value === true;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStatus(candidate: OperatorDashboardCandidate) {
  return normalizeText(candidate.status);
}

function isActiveStatus(status: string) {
  return status !== "seeded" && status !== "archived" && status !== "rejected";
}

function readCreatedAt(candidate: OperatorDashboardCandidate) {
  return (
    candidate.createdAt ||
    candidate.created_at ||
    "1970-01-01T00:00:00.000Z"
  );
}

function readTargetName(candidate: OperatorDashboardCandidate) {
  return (
    candidate.targetName?.trim() ||
    candidate.targetPid?.trim() ||
    candidate.id
  );
}

function readTargetPid(candidate: OperatorDashboardCandidate) {
  return candidate.targetPid?.trim() || "";
}

function readDangerous(candidate: OperatorDashboardCandidate) {
  return toBoolean(candidate.dangerous);
}

function readDuplicateRisk(candidate: OperatorDashboardCandidate) {
  const direct = normalizeText(candidate.duplicateRisk || candidate.duplicateLabel);

  if (direct === "risky" || direct === "high") {
    return "risky";
  }

  return "safe";
}

function readQualityScore(candidate: OperatorDashboardCandidate) {
  return clamp(toNumber(candidate.qualityScore, 0), 0, 100);
}

function readRankingScore(candidate: OperatorDashboardCandidate) {
  return clamp(toNumber(candidate.intelligence?.rankingScore, 0), 0, 100);
}

function readPriorityScore(candidate: OperatorDashboardCandidate) {
  return clamp(toNumber(candidate.intelligence?.priorityScore, 0), 0, 100);
}

function readSeedImpactScore(candidate: OperatorDashboardCandidate) {
  return clamp(toNumber(candidate.intelligence?.seedImpactScore, 0), 0, 100);
}

function readRecommendationConfidence(candidate: OperatorDashboardCandidate) {
  return clamp(
    toNumber(candidate.intelligence?.recommendationConfidence, 0),
    0,
    100,
  );
}

function readRiskLevel(candidate: OperatorDashboardCandidate) {
  const value = normalizeText(candidate.intelligence?.riskLevel);

  if (value === "safe" || value === "review" || value === "dangerous") {
    return value;
  }

  return "review";
}

function readRecommendedAction(
  candidate: OperatorDashboardCandidate,
): OperatorRecommendedAction | "review" {
  const value = normalizeText(candidate.intelligence?.recommendedAction);

  if (
    value === "approve" ||
    value === "seed" ||
    value === "reject" ||
    value === "review"
  ) {
    return value;
  }

  return "review";
}

function readTopPriorityBucket(
  candidate: OperatorDashboardCandidate,
): OperatorTopPriorityBucket {
  const value = normalizeText(candidate.intelligence?.topPriorityBucket);

  if (
    value === "act-now" ||
    value === "seed-focus" ||
    value === "review-first" ||
    value === "reject-first" ||
    value === "normal"
  ) {
    return value;
  }

  return "normal";
}

function readHighlightBucket(
  candidate: OperatorDashboardCandidate,
): OperatorHighlightBucket {
  const value = normalizeText(candidate.intelligence?.highlightBucket);

  if (
    value === "top-priority" ||
    value === "seed-candidate" ||
    value === "review-candidate" ||
    value === "reject-candidate" ||
    value === "normal"
  ) {
    return value;
  }

  return "normal";
}

function buildSummaryReason(candidate: OperatorDashboardCandidate) {
  const reasons = candidate.intelligence?.decisionReasons;

  if (Array.isArray(reasons) && reasons.length > 0) {
    const first = reasons.find((item) => typeof item === "string" && item.trim());

    if (first && typeof first === "string") {
      return first;
    }
  }

  return "AI decision reason 없음";
}

function buildSummaryLabel(params: {
  recommendedAction: OperatorRecommendedAction | "review";
  topPriorityBucket: OperatorTopPriorityBucket;
  dangerous: boolean;
  duplicateRisk: string;
}) {
  if (params.dangerous) {
    return "Dangerous review";
  }

  if (params.topPriorityBucket === "act-now") {
    return "Act now";
  }

  if (params.topPriorityBucket === "seed-focus") {
    return "Seed focus";
  }

  if (params.topPriorityBucket === "review-first") {
    return "Review first";
  }

  if (params.topPriorityBucket === "reject-first") {
    return "Reject first";
  }

  if (params.duplicateRisk === "risky") {
    return "Duplicate risk";
  }

  if (params.recommendedAction === "seed") {
    return "Seed candidate";
  }

  if (params.recommendedAction === "approve") {
    return "Approve candidate";
  }

  if (params.recommendedAction === "reject") {
    return "Reject candidate";
  }

  return "Review candidate";
}

function toTopPriorityItem(
  candidate: OperatorDashboardCandidate,
): OperatorTopPriorityItem {
  const status = readStatus(candidate);
  const dangerous = readDangerous(candidate);
  const duplicateRisk = readDuplicateRisk(candidate);
  const qualityScore = readQualityScore(candidate);
  const recommendedAction = readRecommendedAction(candidate);
  const topPriorityBucket = readTopPriorityBucket(candidate);
  const highlightBucket = readHighlightBucket(candidate);

  return {
    id: candidate.id,
    targetName: readTargetName(candidate),
    targetPid: readTargetPid(candidate),
    status,
    recommendedAction,
    riskLevel: readRiskLevel(candidate),
    rankingScore: readRankingScore(candidate),
    priorityScore: readPriorityScore(candidate),
    seedImpactScore: readSeedImpactScore(candidate),
    recommendationConfidence: readRecommendationConfidence(candidate),
    topPriorityBucket,
    highlightBucket,
    dangerous,
    duplicateRisk,
    qualityScore,
    summaryLabel: buildSummaryLabel({
      recommendedAction,
      topPriorityBucket,
      dangerous,
      duplicateRisk,
    }),
    summaryReason: buildSummaryReason(candidate),
  };
}

function comparePriorityItems(
  a: OperatorTopPriorityItem,
  b: OperatorTopPriorityItem,
) {
  if (b.rankingScore !== a.rankingScore) {
    return b.rankingScore - a.rankingScore;
  }

  if (b.priorityScore !== a.priorityScore) {
    return b.priorityScore - a.priorityScore;
  }

  if (b.seedImpactScore !== a.seedImpactScore) {
    return b.seedImpactScore - a.seedImpactScore;
  }

  if (b.recommendationConfidence !== a.recommendationConfidence) {
    return b.recommendationConfidence - a.recommendationConfidence;
  }

  return 0;
}

function sampleTargets(items: OperatorTopPriorityItem[], limit = 3) {
  return items.slice(0, limit).map((item) => item.targetName);
}

export function buildOperatorDashboardSummary(
  candidates: OperatorDashboardCandidate[],
): OperatorDashboardSummary {
  const activeCandidates = candidates.filter((candidate) =>
    isActiveStatus(readStatus(candidate)),
  );

  const activeItems = activeCandidates
    .map((candidate) => ({
      candidate,
      item: toTopPriorityItem(candidate),
      createdAt: new Date(readCreatedAt(candidate)).getTime(),
    }))
    .sort((a, b) => {
      const scoreDiff = comparePriorityItems(a.item, b.item);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return b.createdAt - a.createdAt;
    })
    .map((entry) => entry.item);

  const topPriorityItems = activeItems.filter(
    (item) => item.topPriorityBucket === "act-now",
  );

  const seedCandidates = activeItems.filter(
    (item) =>
      item.highlightBucket === "seed-candidate" ||
      item.topPriorityBucket === "seed-focus",
  );

  const reviewCandidates = activeItems.filter(
    (item) =>
      item.highlightBucket === "review-candidate" ||
      item.topPriorityBucket === "review-first",
  );

  const rejectCandidates = activeItems.filter(
    (item) =>
      item.highlightBucket === "reject-candidate" ||
      item.topPriorityBucket === "reject-first",
  );

  const dangerousItems = activeItems.filter((item) => item.dangerous);

  const duplicateRiskItems = activeItems.filter(
    (item) => item.duplicateRisk === "risky",
  );

  const summaryCards: OperatorTopPrioritySummaryCard[] = [
    {
      key: "act-now",
      label: "Act Now",
      count: topPriorityItems.length,
      sampleTargets: sampleTargets(topPriorityItems),
    },
    {
      key: "seed-focus",
      label: "Seed Focus",
      count: seedCandidates.length,
      sampleTargets: sampleTargets(seedCandidates),
    },
    {
      key: "review-first",
      label: "Review First",
      count: reviewCandidates.length,
      sampleTargets: sampleTargets(reviewCandidates),
    },
    {
      key: "reject-first",
      label: "Reject First",
      count: rejectCandidates.length,
      sampleTargets: sampleTargets(rejectCandidates),
    },
    {
      key: "dangerous",
      label: "Dangerous",
      count: dangerousItems.length,
      sampleTargets: sampleTargets(dangerousItems),
    },
    {
      key: "duplicate-risk",
      label: "Duplicate Risk",
      count: duplicateRiskItems.length,
      sampleTargets: sampleTargets(duplicateRiskItems),
    },
  ];

  return {
    totalActiveCount: activeItems.length,
    actNowCount: topPriorityItems.length,
    seedFocusCount: seedCandidates.length,
    reviewFirstCount: reviewCandidates.length,
    rejectFirstCount: rejectCandidates.length,
    dangerousCount: dangerousItems.length,
    duplicateRiskCount: duplicateRiskItems.length,
    topPriorityItems: topPriorityItems.slice(0, 8),
    seedCandidates: seedCandidates.slice(0, 8),
    reviewCandidates: reviewCandidates.slice(0, 8),
    rejectCandidates: rejectCandidates.slice(0, 8),
    summaryCards,
  };
}