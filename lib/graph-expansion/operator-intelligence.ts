export type OperatorRiskLevel = "safe" | "review" | "dangerous";

export type OperatorRecommendedAction =
  | "approve"
  | "seed"
  | "reject"
  | "review";

export type OperatorTopPriorityBucket =
  | "act-now"
  | "seed-focus"
  | "review-first"
  | "reject-first"
  | "normal";

export type OperatorHighlightBucket =
  | "top-priority"
  | "seed-candidate"
  | "review-candidate"
  | "reject-candidate"
  | "normal";

export type GraphExpansionOperatorCandidateInput = {
  id: string;
  status?: string | null;

  targetPid?: string | null;
  targetName?: string | null;
  targetCategory?: string | null;
  targetCountry?: string | null;

  matchScore?: number | null;
  matchLabel?: string | null;

  qualityScore?: number | null;
  qualityLabel?: string | null;

  evidenceScore?: number | null;
  evidenceStrength?: number | null;
  evidenceCount?: number | null;

  duplicateRisk?: string | null;
  duplicateLabel?: string | null;

  seedPriority?: number | null;
  seedPriorityLabel?: string | null;

  dangerous?: boolean | null;
  isDangerous?: boolean | null;

  previewPathCount?: number | null;
  previewConnectionCount?: number | null;
  expectedNewEdges?: number | null;
  expectedPathUnlocks?: number | null;
  expectedCelebrityUnlocks?: number | null;

  metadata?: Record<string, unknown> | null;
};

export type GraphExpansionOperatorIntelligence = {
  riskLevel: OperatorRiskLevel;
  recommendedAction: OperatorRecommendedAction;

  priorityScore: number;
  seedImpactScore: number;

  expectedNewEdges: number;
  expectedPathUnlocks: number;
  expectedCelebrityUnlocks: number;

  rankingScore: number;
  recommendationConfidence: number;

  topPriorityBucket: OperatorTopPriorityBucket;
  highlightBucket: OperatorHighlightBucket;

  explanationTags: string[];
  decisionReasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function readMetadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
  fallback = 0,
) {
  if (!metadata) {
    return fallback;
  }

  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function readMetadataBoolean(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
  fallback = false,
) {
  if (!metadata) {
    return fallback;
  }

  for (const key of keys) {
    if (metadata[key] === true) {
      return true;
    }

    if (metadata[key] === false) {
      return false;
    }
  }

  return fallback;
}

function readStatus(candidate: GraphExpansionOperatorCandidateInput) {
  return normalizeText(candidate.status);
}

function readDangerous(candidate: GraphExpansionOperatorCandidateInput) {
  return (
    toBoolean(candidate.dangerous) ||
    toBoolean(candidate.isDangerous) ||
    readMetadataBoolean(candidate.metadata, ["dangerous", "isDangerous"], false)
  );
}

function readQualityScore(candidate: GraphExpansionOperatorCandidateInput) {
  const metadataScore = readMetadataNumber(candidate.metadata, [
    "qualityScore",
    "quality_score",
    "aiQualityScore",
  ]);

  return clamp(
    toNumber(candidate.qualityScore, metadataScore || candidate.matchScore || 0),
    0,
    100,
  );
}

function readEvidenceScore(candidate: GraphExpansionOperatorCandidateInput) {
  const metadataScore = readMetadataNumber(candidate.metadata, [
    "evidenceScore",
    "evidence_score",
    "evidenceStrength",
  ]);

  const direct =
    candidate.evidenceScore ??
    candidate.evidenceStrength ??
    metadataScore ??
    candidate.matchScore ??
    0;

  return clamp(toNumber(direct, 0), 0, 100);
}

function readDuplicateRisk(candidate: GraphExpansionOperatorCandidateInput) {
  const direct = normalizeText(candidate.duplicateRisk || candidate.duplicateLabel);

  if (direct === "risky" || direct === "high") {
    return "risky";
  }

  if (direct === "safe" || direct === "low") {
    return "safe";
  }

  const metadataRisk = normalizeText(
    candidate.metadata?.duplicateRisk ?? candidate.metadata?.duplicateLabel,
  );

  if (metadataRisk === "risky" || metadataRisk === "high") {
    return "risky";
  }

  return "safe";
}

function readSeedPriorityScore(candidate: GraphExpansionOperatorCandidateInput) {
  const label = normalizeText(candidate.seedPriorityLabel);

  if (typeof candidate.seedPriority === "number") {
    return clamp(candidate.seedPriority, 0, 100);
  }

  if (label === "high") {
    return 90;
  }

  if (label === "medium") {
    return 60;
  }

  if (label === "low") {
    return 25;
  }

  const metadataPriority = readMetadataNumber(candidate.metadata, [
    "seedPriority",
    "seed_priority",
    "seedPriorityScore",
  ]);

  return clamp(metadataPriority, 0, 100);
}

function readExpectedNewEdges(candidate: GraphExpansionOperatorCandidateInput) {
  return clamp(
    Math.round(
      toNumber(
        candidate.expectedNewEdges,
        readMetadataNumber(candidate.metadata, ["expectedNewEdges", "expected_new_edges"]),
      ),
    ),
    0,
    999,
  );
}

function readExpectedPathUnlocks(candidate: GraphExpansionOperatorCandidateInput) {
  const fallback = Math.max(
    0,
    Math.round(
      toNumber(
        candidate.previewPathCount,
        readMetadataNumber(candidate.metadata, [
          "expectedPathUnlocks",
          "expected_path_unlocks",
          "previewPathCount",
          "preview_path_count",
        ]),
      ),
    ),
  );

  return clamp(
    Math.round(
      toNumber(
        candidate.expectedPathUnlocks,
        readMetadataNumber(
          candidate.metadata,
          ["expectedPathUnlocks", "expected_path_unlocks"],
          fallback,
        ),
      ),
    ),
    0,
    999,
  );
}

function readExpectedCelebrityUnlocks(
  candidate: GraphExpansionOperatorCandidateInput,
) {
  const fallback = Math.max(
    0,
    Math.round(
      readMetadataNumber(candidate.metadata, [
        "expectedCelebrityUnlocks",
        "expected_celebrity_unlocks",
        "celebrityUnlocks",
      ]),
    ),
  );

  return clamp(
    Math.round(toNumber(candidate.expectedCelebrityUnlocks, fallback)),
    0,
    999,
  );
}

function detectAlreadyProcessed(status: string) {
  return status === "seeded" || status === "archived" || status === "rejected";
}

function buildExplanationTags(params: {
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
  qualityScore: number;
  evidenceScore: number;
  seedPriorityScore: number;
  expectedNewEdges: number;
  expectedPathUnlocks: number;
  expectedCelebrityUnlocks: number;
  status: string;
}) {
  const tags: string[] = [];

  if (params.dangerous) {
    tags.push("dangerous");
  }

  if (params.duplicateRisk === "risky") {
    tags.push("duplicate-risk");
  }

  if (params.qualityScore >= 85) {
    tags.push("high-quality");
  } else if (params.qualityScore <= 45) {
    tags.push("low-quality");
  }

  if (params.evidenceScore >= 80) {
    tags.push("strong-evidence");
  } else if (params.evidenceScore <= 40) {
    tags.push("weak-evidence");
  }

  if (params.seedPriorityScore >= 80) {
    tags.push("seed-priority-high");
  }

  if (params.expectedPathUnlocks >= 3) {
    tags.push("path-unlock-strong");
  } else if (params.expectedPathUnlocks >= 1) {
    tags.push("path-unlock");
  }

  if (params.expectedCelebrityUnlocks >= 1) {
    tags.push("celebrity-unlock");
  }

  if (params.expectedNewEdges >= 3) {
    tags.push("multi-edge-impact");
  }

  if (params.status === "approved") {
    tags.push("already-approved");
  }

  if (params.status === "reviewing") {
    tags.push("under-review");
  }

  return tags;
}

function buildDecisionReasons(params: {
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
  qualityScore: number;
  evidenceScore: number;
  seedPriorityScore: number;
  expectedNewEdges: number;
  expectedPathUnlocks: number;
  expectedCelebrityUnlocks: number;
  status: string;
  recommendedAction: OperatorRecommendedAction;
}) {
  const reasons: string[] = [];

  if (params.dangerous) {
    reasons.push("Dangerous candidate라서 자동 실행보다 사람 검토가 우선입니다.");
  }

  if (params.duplicateRisk === "risky") {
    reasons.push("중복 가능성이 높아서 seed 전에 review 또는 reject 검토가 필요합니다.");
  }

  if (params.qualityScore >= 85) {
    reasons.push("품질 점수가 높아서 승인 또는 seed 우선 후보입니다.");
  } else if (params.qualityScore <= 45) {
    reasons.push("품질 점수가 낮아서 바로 seed 하기에는 위험합니다.");
  }

  if (params.evidenceScore >= 80) {
    reasons.push("근거 강도가 높아 운영자 승인 신뢰도가 높습니다.");
  } else if (params.evidenceScore <= 40) {
    reasons.push("근거 강도가 약해 추가 검토가 필요합니다.");
  }

  if (params.seedPriorityScore >= 80) {
    reasons.push("Seed priority가 높아서 연결 확장 후보로 우선 처리할 가치가 큽니다.");
  }

  if (params.expectedPathUnlocks >= 3) {
    reasons.push("예상 path unlock 수가 높아 네트워크 확장 효과가 큽니다.");
  } else if (params.expectedPathUnlocks >= 1) {
    reasons.push("새로운 path unlock 가능성이 있습니다.");
  }

  if (params.expectedCelebrityUnlocks >= 1) {
    reasons.push("celebrity unlock 가능성이 있어 확장 파급력이 큽니다.");
  }

  if (params.expectedNewEdges >= 3) {
    reasons.push("예상 신규 edge 수가 높아 seed impact가 좋습니다.");
  }

  if (params.status === "approved") {
    reasons.push("이미 approved 상태라면 다음 액션은 seed 여부 판단이 핵심입니다.");
  }

  if (params.recommendedAction === "reject") {
    reasons.push("중복 위험 또는 낮은 품질 때문에 reject 후보로 분류되었습니다.");
  }

  if (params.recommendedAction === "review") {
    reasons.push("자동 처리보다 운영자 확인이 더 안전한 후보입니다.");
  }

  if (params.recommendedAction === "seed") {
    reasons.push("영향 대비 위험이 낮아 바로 seed할 가치가 높습니다.");
  }

  if (params.recommendedAction === "approve") {
    reasons.push("바로 seed보다 먼저 approve 후 큐 관리하는 편이 안정적입니다.");
  }

  return reasons.slice(0, 6);
}

function computeRiskLevel(params: {
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
  qualityScore: number;
  evidenceScore: number;
}) {
  if (params.dangerous) {
    return "dangerous" as const;
  }

  if (params.duplicateRisk === "risky" && params.qualityScore < 70) {
    return "dangerous" as const;
  }

  if (params.qualityScore < 45 || params.evidenceScore < 40) {
    return "review" as const;
  }

  if (params.duplicateRisk === "risky") {
    return "review" as const;
  }

  return "safe" as const;
}

function computeSeedImpactScore(params: {
  seedPriorityScore: number;
  expectedNewEdges: number;
  expectedPathUnlocks: number;
  expectedCelebrityUnlocks: number;
  qualityScore: number;
}) {
  const impact =
    params.seedPriorityScore * 0.4 +
    clamp(params.expectedNewEdges * 12, 0, 36) +
    clamp(params.expectedPathUnlocks * 16, 0, 32) +
    clamp(params.expectedCelebrityUnlocks * 18, 0, 18) +
    params.qualityScore * 0.1;

  return clamp(Math.round(impact), 0, 100);
}

function computePriorityScore(params: {
  qualityScore: number;
  evidenceScore: number;
  seedImpactScore: number;
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
  status: string;
}) {
  let score =
    params.qualityScore * 0.32 +
    params.evidenceScore * 0.22 +
    params.seedImpactScore * 0.46;

  if (params.dangerous) {
    score -= 28;
  }

  if (params.duplicateRisk === "risky") {
    score -= 14;
  }

  if (params.status === "approved") {
    score += 8;
  }

  if (params.status === "reviewing") {
    score += 2;
  }

  if (detectAlreadyProcessed(params.status)) {
    score -= 40;
  }

  return clamp(Math.round(score), 0, 100);
}

function computeRankingScore(params: {
  priorityScore: number;
  seedImpactScore: number;
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
  qualityScore: number;
  evidenceScore: number;
  status: string;
}) {
  let score =
    params.priorityScore * 0.55 +
    params.seedImpactScore * 0.25 +
    params.qualityScore * 0.1 +
    params.evidenceScore * 0.1;

  if (params.dangerous) {
    score -= 22;
  }

  if (params.duplicateRisk === "risky") {
    score -= 10;
  }

  if (params.status === "approved") {
    score += 10;
  }

  if (detectAlreadyProcessed(params.status)) {
    score -= 50;
  }

  return clamp(Math.round(score), 0, 100);
}

function computeRecommendedAction(params: {
  riskLevel: OperatorRiskLevel;
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
  qualityScore: number;
  evidenceScore: number;
  seedImpactScore: number;
  status: string;
}) {
  if (params.status === "seeded") {
    return "review" as const;
  }

  if (params.status === "archived" || params.status === "rejected") {
    return "review" as const;
  }

  if (params.dangerous) {
    return "review" as const;
  }

if (
  params.duplicateRisk === "risky" &&
  params.qualityScore <= 55 &&
  params.evidenceScore <= 55
) {
  return "reject" as const;
}

// 🔥 TEMP: force seed for testing
if (
  params.qualityScore >= 90 &&
  params.evidenceScore >= 80 &&
  params.seedImpactScore >= 40 &&
  params.duplicateRisk === "safe"
) {
  return "seed" as const;
}
  if (
    params.riskLevel === "safe" &&
    params.seedImpactScore >= 75 &&
    params.qualityScore >= 75 &&
    params.evidenceScore >= 70
  ) {
    return "seed" as const;
  }

  if (
    params.riskLevel === "safe" &&
    params.qualityScore >= 65 &&
    params.evidenceScore >= 60
  ) {
    return "approve" as const;
  }

  if (
    params.duplicateRisk === "risky" ||
    params.qualityScore < 60 ||
    params.evidenceScore < 55
  ) {
    return "review" as const;
  }

  return "approve" as const;
}

function computeRecommendationConfidence(params: {
  recommendedAction: OperatorRecommendedAction;
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
  qualityScore: number;
  evidenceScore: number;
  seedImpactScore: number;
}) {
  let confidence = 50;

  if (params.recommendedAction === "seed") {
    confidence += 18;
  }

  if (params.recommendedAction === "approve") {
    confidence += 10;
  }

  if (params.recommendedAction === "reject") {
    confidence += 8;
  }

  confidence += Math.round(params.qualityScore * 0.12);
  confidence += Math.round(params.evidenceScore * 0.1);
  confidence += Math.round(params.seedImpactScore * 0.08);

  if (params.dangerous) {
    confidence -= 18;
  }

  if (params.duplicateRisk === "risky") {
    confidence -= 12;
  }

  return clamp(confidence, 0, 100);
}

function computeTopPriorityBucket(params: {
  recommendedAction: OperatorRecommendedAction;
  rankingScore: number;
  seedImpactScore: number;
  dangerous: boolean;
  duplicateRisk: "risky" | "safe";
}) {
  if (
    !params.dangerous &&
    params.recommendedAction === "seed" &&
    params.rankingScore >= 78
  ) {
    return "act-now" as const;
  }

  if (
    !params.dangerous &&
    params.recommendedAction === "approve" &&
    params.rankingScore >= 72
  ) {
    return "act-now" as const;
  }

  if (!params.dangerous && params.recommendedAction === "seed" && params.seedImpactScore >= 70) {
    return "seed-focus" as const;
  }

  if (params.dangerous || params.recommendedAction === "review") {
    return "review-first" as const;
  }

  if (params.recommendedAction === "reject" || params.duplicateRisk === "risky") {
    return "reject-first" as const;
  }

  return "normal" as const;
}

function computeHighlightBucket(params: {
  topPriorityBucket: OperatorTopPriorityBucket;
  recommendedAction: OperatorRecommendedAction;
}) {
  if (params.topPriorityBucket === "act-now") {
    return "top-priority" as const;
  }

  if (params.recommendedAction === "seed") {
    return "seed-candidate" as const;
  }

  if (params.recommendedAction === "reject") {
    return "reject-candidate" as const;
  }

  if (params.recommendedAction === "review") {
    return "review-candidate" as const;
  }

  return "normal" as const;
}

export function calculateOperatorIntelligence(
  candidate: GraphExpansionOperatorCandidateInput,
): GraphExpansionOperatorIntelligence {
  const status = readStatus(candidate);

  const dangerous = readDangerous(candidate);
  const qualityScore = readQualityScore(candidate);
  const evidenceScore = readEvidenceScore(candidate);
  const duplicateRisk = readDuplicateRisk(candidate);
  const seedPriorityScore = readSeedPriorityScore(candidate);

  const expectedNewEdges = readExpectedNewEdges(candidate);
  const expectedPathUnlocks = readExpectedPathUnlocks(candidate);
  const expectedCelebrityUnlocks = readExpectedCelebrityUnlocks(candidate);

  const riskLevel = computeRiskLevel({
    dangerous,
    duplicateRisk,
    qualityScore,
    evidenceScore,
  });

  const seedImpactScore = computeSeedImpactScore({
    seedPriorityScore,
    expectedNewEdges,
    expectedPathUnlocks,
    expectedCelebrityUnlocks,
    qualityScore,
  });

  const priorityScore = computePriorityScore({
    qualityScore,
    evidenceScore,
    seedImpactScore,
    dangerous,
    duplicateRisk,
    status,
  });

  const rankingScore = computeRankingScore({
    priorityScore,
    seedImpactScore,
    dangerous,
    duplicateRisk,
    qualityScore,
    evidenceScore,
    status,
  }); 

  const recommendedAction = computeRecommendedAction({
    riskLevel,
    dangerous,
    duplicateRisk,
    qualityScore,
    evidenceScore,
    seedImpactScore,
    status,
  });

  const recommendationConfidence = computeRecommendationConfidence({
    recommendedAction,
    dangerous,
    duplicateRisk,
    qualityScore,
    evidenceScore,
    seedImpactScore,
  });

  const topPriorityBucket = computeTopPriorityBucket({
    recommendedAction,
    rankingScore,
    seedImpactScore,
    dangerous,
    duplicateRisk,
  });

  const highlightBucket = computeHighlightBucket({
    topPriorityBucket,
    recommendedAction,
  });

  const explanationTags = buildExplanationTags({
    dangerous,
    duplicateRisk,
    qualityScore,
    evidenceScore,
    seedPriorityScore,
    expectedNewEdges,
    expectedPathUnlocks,
    expectedCelebrityUnlocks,
    status,
  });

  const decisionReasons = buildDecisionReasons({
    dangerous,
    duplicateRisk,
    qualityScore,
    evidenceScore,
    seedPriorityScore,
    expectedNewEdges,
    expectedPathUnlocks,
    expectedCelebrityUnlocks,
    status,
    recommendedAction,
  });

  return {
    riskLevel,
    recommendedAction,

    priorityScore,
    seedImpactScore,

    expectedNewEdges,
    expectedPathUnlocks,
    expectedCelebrityUnlocks,

    rankingScore,
    recommendationConfidence,

    topPriorityBucket,
    highlightBucket,

    explanationTags,
    decisionReasons,
  };
}

export const computeOperatorIntelligence = calculateOperatorIntelligence;

export function sortCandidatesByOperatorPriority<
  T extends {
    intelligence?: Partial<GraphExpansionOperatorIntelligence> | null;
    createdAt?: string | null;
    created_at?: string | null;
  },
>(items: T[]) {
  return [...items].sort((a, b) => {
    const aInt = a.intelligence;
    const bInt = b.intelligence;

    const rankingDiff = toNumber(bInt?.rankingScore) - toNumber(aInt?.rankingScore);

    if (rankingDiff !== 0) {
      return rankingDiff;
    }

    const priorityDiff = toNumber(bInt?.priorityScore) - toNumber(aInt?.priorityScore);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const impactDiff = toNumber(bInt?.seedImpactScore) - toNumber(aInt?.seedImpactScore);

    if (impactDiff !== 0) {
      return impactDiff;
    }

    const aCreated = new Date(
      a.createdAt || a.created_at || "1970-01-01T00:00:00.000Z",
    ).getTime();

    const bCreated = new Date(
      b.createdAt || b.created_at || "1970-01-01T00:00:00.000Z",
    ).getTime();

    return bCreated - aCreated;
  });
}

export function buildOperatorTopPrioritySummary<
  T extends {
    intelligence?: Partial<GraphExpansionOperatorIntelligence> | null;
    status?: string | null;
  },
>(items: T[]) {
  const queuedLikeItems = items.filter((item) => {
    const status = normalizeText(item.status);
    return status !== "seeded" && status !== "archived" && status !== "rejected";
  });

  const topPriorityItems = queuedLikeItems.filter(
    (item) => item.intelligence?.topPriorityBucket === "act-now",
  );

  const seedCandidates = queuedLikeItems.filter(
    (item) => item.intelligence?.highlightBucket === "seed-candidate",
  );

  const reviewCandidates = queuedLikeItems.filter(
    (item) => item.intelligence?.highlightBucket === "review-candidate",
  );

  const rejectCandidates = queuedLikeItems.filter(
    (item) => item.intelligence?.highlightBucket === "reject-candidate",
  );

  return {
    total: queuedLikeItems.length,
    actNowCount: topPriorityItems.length,
    seedCandidateCount: seedCandidates.length,
    reviewCandidateCount: reviewCandidates.length,
    rejectCandidateCount: rejectCandidates.length,
  };
}