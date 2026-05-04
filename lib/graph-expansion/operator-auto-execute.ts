// C:\work\nextjs-server\lib\graph-expansion\operator-auto-execute.ts

import { createClient } from "@supabase/supabase-js";

type CandidateStatus =
  | "queued"
  | "reviewing"
  | "approved"
  | "rejected"
  | "seeded"
  | "archived";

type DuplicateRisk = "safe" | "risky";
type RiskLevel = "safe" | "review" | "dangerous";
type RecommendedAction = "approve" | "seed" | "reject" | "review";
type ExecuteMode = "dry-run" | "execute";
type ExecutionDecision =
  | "skip"
  | "reject"
  | "approve"
  | "seed"
  | "seeded"
  | "failed";

type FailureReason =
  | "seed_not_ready"
  | "not_approved"
  | "already_seeded"
  | "dangerous"
  | "risk_review"
  | "recommended_review"
  | "insufficient_balance"
  | "duplicate_edge_reused"
  | "seed_log_failed"
  | "candidate_update_failed"
  | "network_internal_api_failed"
  | "internal_api_failed"
  | "unknown";

type CandidateRow = {
  id: string;
  status: CandidateStatus;
  owner_user_id: string;
  target_pid: string | null;
  target_name: string | null;
  target_category: string | null;
  target_country: string | null;
  bridge_name: string | null;
  bridge_city: string | null;
  bridge_school: string | null;
  bridge_company: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type NormalizedCandidateMetrics = {
  qualityScore: number;
  evidenceScore: number;
  seedImpactScore: number;
  duplicateRisk: DuplicateRisk;
  dangerous: boolean;
};

type IntelligenceResult = {
  riskLevel: RiskLevel;
  recommendedAction: RecommendedAction;
  priorityScore: number;
  expectedExpansion: number;
  seedReady: boolean;
};

export type AutoExecuteDecision = {
  candidateId: string;
  targetPid: string;
  targetName: string;
  status: CandidateStatus;
  decision: ExecutionDecision;
  reason: string;
  riskLevel: RiskLevel;
  recommendedAction: RecommendedAction;
  priorityScore: number;
  seedImpactScore: number;
  expectedExpansion: number;
  seedReady: boolean;
  executed: boolean;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  seedAttempted: boolean;
  seedSuccess: boolean;
  coinCost: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  error: string | null;
  executionType: "success" | "failed" | "skipped";
  createdAt: string;
  updatedAt: string;
  metadataSnapshot: {
    qualityScore: number;
    evidenceScore: number;
    duplicateRisk: DuplicateRisk;
    dangerous: boolean;
  };
};

export type AutoExecuteSummary = {
  total: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  reasonCounts: Record<string, number>;
  decisionCounts: Record<string, number>;
  riskCounts: Record<string, number>;
};

export type AutoExecuteHistoryItem = {
  candidateId: string;
  targetName: string;
  status: CandidateStatus;
  decision: ExecutionDecision;
  reason: string;
  executionType: "success" | "failed" | "skipped";
  riskLevel: RiskLevel;
  recommendedAction: RecommendedAction;
  priorityScore: number;
  seedImpactScore: number;
  expectedExpansion: number;
  seedReady: boolean;
  seedAttempted: boolean;
  seedSuccess: boolean;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  coinCost: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  executedAt: string;
};

export type ExecuteAutoExecutePlanResult = {
  ok: boolean;
  mode: ExecuteMode;
  ownerUserId: string;
  count: number;
  summary: AutoExecuteSummary;
  recentHistory: AutoExecuteHistoryItem[];
  decisions: AutoExecuteDecision[];
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickFirst<T>(...values: Array<T | undefined | null>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function normalizeMetrics(candidate: CandidateRow): NormalizedCandidateMetrics {
  const metadata = asObject(candidate.metadata);
  const operatorIntelligence = asObject(
    pickFirst(
      metadata.operatorIntelligence,
      metadata.operator_intelligence,
    ),
  );
  const candidateQuality = asObject(
    pickFirst(
      metadata.candidateQuality,
      metadata.candidate_quality,
    ),
  );
  const autoSeed = asObject(
    pickFirst(
      metadata.autoSeed,
      metadata.auto_seed,
    ),
  );

  const qualityScore = asNumber(
    pickFirst(
      metadata.qualityScore,
      metadata.quality_score,
      candidateQuality.qualityScore,
      candidateQuality.quality_score,
      operatorIntelligence.qualityScore,
      operatorIntelligence.quality_score,
    ),
    0,
  );

  const evidenceScore = asNumber(
    pickFirst(
      metadata.evidenceScore,
      metadata.evidence_score,
      candidateQuality.evidenceScore,
      candidateQuality.evidence_score,
      operatorIntelligence.evidenceScore,
      operatorIntelligence.evidence_score,
    ),
    0,
  );

  const seedImpactScore = asNumber(
    pickFirst(
      metadata.seedImpactScore,
      metadata.seed_impact_score,
      operatorIntelligence.seedImpactScore,
      operatorIntelligence.seed_impact_score,
    ),
    0,
  );

  const duplicateRiskRaw = asString(
    pickFirst(
      metadata.duplicateRisk,
      metadata.duplicate_risk,
      candidateQuality.duplicateRisk,
      candidateQuality.duplicate_risk,
      autoSeed.duplicateRisk,
      autoSeed.duplicate_risk,
    ),
    "safe",
  );

  const duplicateRisk: DuplicateRisk =
    duplicateRiskRaw === "risky" ? "risky" : "safe";

  const dangerous = asBoolean(
    pickFirst(
      metadata.dangerous,
      candidateQuality.dangerous,
      operatorIntelligence.dangerous,
      autoSeed.dangerous,
    ),
    false,
  );

  return {
    qualityScore,
    evidenceScore,
    seedImpactScore,
    duplicateRisk,
    dangerous,
  };
}

function computeIntelligence(
  status: CandidateStatus,
  metrics: NormalizedCandidateMetrics,
): IntelligenceResult {
  const basePriority =
    metrics.qualityScore * 0.35 +
    metrics.evidenceScore * 0.25 +
    metrics.seedImpactScore * 0.4;

  const duplicatePenalty = metrics.duplicateRisk === "risky" ? 18 : 0;
  const dangerousPenalty = metrics.dangerous ? 35 : 0;

  const priorityScore = Math.round(
    clamp(basePriority - duplicatePenalty - dangerousPenalty, 0, 100),
  );

  const expectedExpansion = Math.round(
    clamp(
      metrics.seedImpactScore * 0.7 +
        metrics.evidenceScore * 0.15 +
        metrics.qualityScore * 0.15,
      0,
      100,
    ),
  );

  let riskLevel: RiskLevel = "safe";
  let recommendedAction: RecommendedAction = "review";
  let seedReady = false;

  if (metrics.dangerous) {
    riskLevel = "dangerous";
    recommendedAction = "review";
    seedReady = false;
  } else if (metrics.duplicateRisk === "risky") {
    riskLevel = "review";
    recommendedAction = metrics.qualityScore >= 85 ? "review" : "reject";
    seedReady = false;
  } else if (
    metrics.qualityScore >= 85 &&
    metrics.evidenceScore >= 75 &&
    metrics.seedImpactScore >= 60
  ) {
    riskLevel = "safe";
    recommendedAction = "seed";
    seedReady = true;
  } else if (
    metrics.qualityScore >= 65 &&
    metrics.evidenceScore >= 60 &&
    metrics.seedImpactScore >= 40
  ) {
    riskLevel = "safe";
    recommendedAction = "approve";
    seedReady = false;
  } else if (
    metrics.qualityScore <= 40 &&
    metrics.evidenceScore <= 40 &&
    metrics.seedImpactScore <= 35
  ) {
    riskLevel = "review";
    recommendedAction = "reject";
    seedReady = false;
  } else {
    riskLevel = "review";
    recommendedAction = "review";
    seedReady = false;
  }

  if (status === "seeded") {
    recommendedAction = "review";
    seedReady = false;
  }

  return {
    riskLevel,
    recommendedAction,
    priorityScore,
    expectedExpansion,
    seedReady,
  };
}

function buildExecutionType(
  executed: boolean,
  seedSuccess: boolean,
  error: string | null,
): "success" | "failed" | "skipped" {
  if (executed && seedSuccess && !error) {
    return "success";
  }

  if (executed && (!seedSuccess || error)) {
    return "failed";
  }

  return "skipped";
}

function pushCount(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function buildSummary(decisions: AutoExecuteDecision[]): AutoExecuteSummary {
  const summary: AutoExecuteSummary = {
    total: decisions.length,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    reasonCounts: {},
    decisionCounts: {},
    riskCounts: {},
  };

  for (const item of decisions) {
    if (item.executionType === "success") {
      summary.successCount += 1;
    } else if (item.executionType === "failed") {
      summary.failedCount += 1;
    } else {
      summary.skippedCount += 1;
    }

    pushCount(summary.reasonCounts, item.reason || "unknown");
    pushCount(summary.decisionCounts, item.decision || "unknown");
    pushCount(summary.riskCounts, item.riskLevel || "unknown");
  }

  return summary;
}

function buildRecentHistory(decisions: AutoExecuteDecision[]): AutoExecuteHistoryItem[] {
  return decisions
    .slice()
    .sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, 20)
    .map((item) => ({
      candidateId: item.candidateId,
      targetName: item.targetName,
      status: item.status,
      decision: item.decision,
      reason: item.reason,
      executionType: item.executionType,
      riskLevel: item.riskLevel,
      recommendedAction: item.recommendedAction,
      priorityScore: item.priorityScore,
      seedImpactScore: item.seedImpactScore,
      expectedExpansion: item.expectedExpansion,
      seedReady: item.seedReady,
      seedAttempted: item.seedAttempted,
      seedSuccess: item.seedSuccess,
      chargeAttempted: item.chargeAttempted,
      chargeSuccess: item.chargeSuccess,
      coinCost: item.coinCost,
      balanceBefore: item.balanceBefore,
      balanceAfter: item.balanceAfter,
      executedAt: item.updatedAt,
    }));
}

function toFailureReasonFromSeedResponse(
  reason: string,
  responseJson: Record<string, unknown>,
): FailureReason {
  const normalizedReason = reason.trim();

  if (
    normalizedReason === "insufficient_balance" ||
    normalizedReason === "duplicate_edge_reused" ||
    normalizedReason === "seed_log_failed" ||
    normalizedReason === "candidate_update_failed" ||
    normalizedReason === "network_internal_api_failed" ||
    normalizedReason === "internal_api_failed"
  ) {
    return normalizedReason;
  }

  const message = JSON.stringify(responseJson).toLowerCase();

  if (message.includes("insufficient_balance")) {
    return "insufficient_balance";
  }

  if (message.includes("duplicate_edge_reused")) {
    return "duplicate_edge_reused";
  }

  if (message.includes("seed_log_failed")) {
    return "seed_log_failed";
  }

  if (message.includes("candidate_update_failed")) {
    return "candidate_update_failed";
  }

  if (message.includes("network_internal_api_failed")) {
    return "network_internal_api_failed";
  }

  if (message.includes("internal_api_failed")) {
    return "internal_api_failed";
  }

  return "unknown";
}

async function persistExecutionLog(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  candidate: CandidateRow;
  decision: AutoExecuteDecision;
  intelligence: IntelligenceResult;
  metrics: NormalizedCandidateMetrics;
}) {
  const metadata = asObject(params.candidate.metadata);
  const executionLog = Array.isArray(metadata.execution_log)
    ? [...metadata.execution_log]
    : [];

  const logEntry = {
    source: "operator_auto_execute_api",
    mode: params.decision.executed ? "execute" : "dry-run",
    decision: params.decision.reason,
    status: params.decision.executionType,
    executedAt: params.decision.updatedAt,
    candidateId: params.decision.candidateId,
    targetPid: params.decision.targetPid,
    targetName: params.decision.targetName,
    riskLevel: params.decision.riskLevel,
    recommendedAction: params.decision.recommendedAction,
    priorityScore: params.decision.priorityScore,
    seedImpactScore: params.decision.seedImpactScore,
    expectedExpansion: params.decision.expectedExpansion,
    seedReady: params.decision.seedReady,
    seedAttempted: params.decision.seedAttempted,
    seedSuccess: params.decision.seedSuccess,
    chargeAttempted: params.decision.chargeAttempted,
    chargeSuccess: params.decision.chargeSuccess,
    coinCost: params.decision.coinCost,
    balanceBefore: params.decision.balanceBefore,
    balanceAfter: params.decision.balanceAfter,
    error: params.decision.error,
    qualityScore: params.metrics.qualityScore,
    evidenceScore: params.metrics.evidenceScore,
    duplicateRisk: params.metrics.duplicateRisk,
    dangerous: params.metrics.dangerous,
  };

  executionLog.unshift(logEntry);

  const nextMetadata = {
    ...metadata,
    qualityScore: params.metrics.qualityScore,
    evidenceScore: params.metrics.evidenceScore,
    seedImpactScore: params.metrics.seedImpactScore,
    duplicateRisk: params.metrics.duplicateRisk,
    dangerous: params.metrics.dangerous,

    operatorIntelligence: {
      riskLevel: params.intelligence.riskLevel,
      recommendedAction: params.intelligence.recommendedAction,
      priorityScore: params.intelligence.priorityScore,
      expectedExpansion: params.intelligence.expectedExpansion,
      seedReady: params.intelligence.seedReady,
    },

    operator_intelligence: {
      riskLevel: params.intelligence.riskLevel,
      recommendedAction: params.intelligence.recommendedAction,
      priorityScore: params.intelligence.priorityScore,
      expectedExpansion: params.intelligence.expectedExpansion,
      seedReady: params.intelligence.seedReady,
    },

    autoSeed: {
      lastReason: params.decision.reason,
      lastStatus: params.decision.executionType,
      lastAttemptedAt: params.decision.updatedAt,
      seedAttempted: params.decision.seedAttempted,
      seedSuccess: params.decision.seedSuccess,
      chargeAttempted: params.decision.chargeAttempted,
      chargeSuccess: params.decision.chargeSuccess,
      coinCost: params.decision.coinCost,
      balanceBefore: params.decision.balanceBefore,
      balanceAfter: params.decision.balanceAfter,
    },

    auto_seed: {
      lastReason: params.decision.reason,
      lastStatus: params.decision.executionType,
      lastAttemptedAt: params.decision.updatedAt,
      seedAttempted: params.decision.seedAttempted,
      seedSuccess: params.decision.seedSuccess,
      chargeAttempted: params.decision.chargeAttempted,
      chargeSuccess: params.decision.chargeSuccess,
      coinCost: params.decision.coinCost,
      balanceBefore: params.decision.balanceBefore,
      balanceAfter: params.decision.balanceAfter,
    },

    last_execution_log: logEntry,
    execution_log: executionLog.slice(0, 20),
  };

  const updatePayload = {
    metadata: nextMetadata,
    updated_at: params.decision.updatedAt,
  };

  const { error } = await params.supabase
    .from("dl_graph_expansion_candidates")
    .update(updatePayload)
    .eq("id", params.candidate.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function executeAutoExecutePlan(params: {
  ownerUserId: string;
  mode: ExecuteMode;
  limit?: number;
  origin: string;
}): Promise<ExecuteAutoExecutePlanResult> {
  const supabase = getSupabaseAdmin();
  const safeLimit = clamp(params.limit ?? 20, 1, 100);

  const { data, error } = await supabase
    .from("dl_graph_expansion_candidates")
    .select(
      [
        "id",
        "status",
        "owner_user_id",
        "target_pid",
        "target_name",
        "target_category",
        "target_country",
        "bridge_name",
        "bridge_city",
        "bridge_school",
        "bridge_company",
        "metadata",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("owner_user_id", params.ownerUserId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  const candidates = (data ?? []) as CandidateRow[];
  const decisions: AutoExecuteDecision[] = [];

  for (const candidate of candidates) {
    const metrics = normalizeMetrics(candidate);
    const intelligence = computeIntelligence(candidate.status, metrics);
    const now = new Date().toISOString();

    let decision: AutoExecuteDecision = {
      candidateId: candidate.id,
      targetPid: candidate.target_pid ?? "",
      targetName: candidate.target_name ?? "",
      status: candidate.status,
      decision: "skip",
      reason: "seed_not_ready",
      riskLevel: intelligence.riskLevel,
      recommendedAction: intelligence.recommendedAction,
      priorityScore: intelligence.priorityScore,
      seedImpactScore: metrics.seedImpactScore,
      expectedExpansion: intelligence.expectedExpansion,
      seedReady: intelligence.seedReady,
      executed: false,
      chargeAttempted: false,
      chargeSuccess: false,
      seedAttempted: false,
      seedSuccess: false,
      coinCost: 0,
      balanceBefore: null,
      balanceAfter: null,
      error: null,
      executionType: "skipped",
      createdAt: candidate.created_at,
      updatedAt: now,
      metadataSnapshot: {
        qualityScore: metrics.qualityScore,
        evidenceScore: metrics.evidenceScore,
        duplicateRisk: metrics.duplicateRisk,
        dangerous: metrics.dangerous,
      },
    };

    if (candidate.status !== "approved") {
      decision.reason = "not_approved";
    } else if (candidate.status === "seeded") {
      decision.reason = "already_seeded";
    } else if (metrics.dangerous) {
      decision.reason = "dangerous";
    } else if (intelligence.riskLevel === "review") {
      decision.reason = "risk_review";
    } else if (intelligence.recommendedAction !== "seed") {
      decision.reason = "recommended_review";
    } else if (!intelligence.seedReady) {
      decision.reason = "seed_not_ready";
    } else if (params.mode === "execute") {
      decision.executed = true;
      decision.seedAttempted = true;
      decision.chargeAttempted = true;

      try {
        const response = await fetch(
          `${params.origin}/api/my-network/graph-expansion-candidates/${candidate.id}/seed`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestedBy: "operator_auto_execute_api",
              source: "operator_auto_execute_api",
              origin: "operator_auto_execute_api",
            }),
          },
        );

        const responseJson = (await response.json()) as Record<string, unknown>;
        const ok = asBoolean(responseJson.ok, false);

        const seedResult = asObject(
          pickFirst(
            responseJson.result,
            responseJson.seedResult,
            responseJson.seed_result,
          ),
        );

        decision.chargeSuccess = asBoolean(
          pickFirst(
            responseJson.chargeSuccess,
            responseJson.charge_success,
            seedResult.chargeSuccess,
            seedResult.charge_success,
          ),
          ok,
        );

        decision.seedSuccess = asBoolean(
          pickFirst(
            responseJson.seedSuccess,
            responseJson.seed_success,
            seedResult.seedSuccess,
            seedResult.seed_success,
          ),
          ok,
        );

        decision.coinCost = asNumber(
          pickFirst(
            responseJson.coinCost,
            responseJson.coin_cost,
            seedResult.coinCost,
            seedResult.coin_cost,
          ),
          0,
        );

        const balanceBeforeValue = pickFirst(
          responseJson.balanceBefore,
          responseJson.balance_before,
          seedResult.balanceBefore,
          seedResult.balance_before,
        );

        const balanceAfterValue = pickFirst(
          responseJson.balanceAfter,
          responseJson.balance_after,
          seedResult.balanceAfter,
          seedResult.balance_after,
        );

        decision.balanceBefore =
          balanceBeforeValue === undefined || balanceBeforeValue === null
            ? null
            : asNumber(balanceBeforeValue, 0);

        decision.balanceAfter =
          balanceAfterValue === undefined || balanceAfterValue === null
            ? null
            : asNumber(balanceAfterValue, 0);

        if (response.ok && ok && decision.seedSuccess) {
          decision.decision = "seeded";
          decision.reason = "seeded";
          decision.executionType = "success";
        } else {
          const rawReason = asString(
            pickFirst(
              responseJson.reason,
              responseJson.code,
              responseJson.error,
              seedResult.reason,
              seedResult.code,
              seedResult.error,
            ),
            "unknown",
          );

          const failureReason = toFailureReasonFromSeedResponse(
            rawReason,
            responseJson,
          );

          decision.decision = "failed";
          decision.reason = failureReason;
          decision.error = JSON.stringify(responseJson);
          decision.executionType = "failed";
        }
      } catch (error) {
        decision.decision = "failed";
        decision.reason = "network_internal_api_failed";
        decision.error =
          error instanceof Error ? error.message : "Unknown error";
        decision.executionType = "failed";
      }
    }

    decision.executionType = buildExecutionType(
      decision.executed,
      decision.seedSuccess,
      decision.error,
    );

    if (!decision.executed) {
      decision.executionType = "skipped";
      decision.decision = "skip";
    }

    try {
      await persistExecutionLog({
        supabase,
        candidate,
        decision,
        intelligence,
        metrics,
      });
    } catch (error) {
      decision.executionType = "failed";
      decision.decision = "failed";
      decision.reason = "candidate_update_failed";
      decision.error =
        error instanceof Error ? error.message : "candidate update failed";
    }

    decisions.push(decision);
  }

  const summary = buildSummary(decisions);
  const recentHistory = buildRecentHistory(decisions);

  return {
    ok: true,
    mode: params.mode,
    ownerUserId: params.ownerUserId,
    count: decisions.length,
    summary,
    recentHistory,
    decisions,
  };
}