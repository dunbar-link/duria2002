import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeOperatorIntelligence } from "@/lib/graph-expansion/operator-intelligence";

type CandidateStatus =
  | "queued"
  | "reviewing"
  | "approved"
  | "rejected"
  | "seeded"
  | "archived";

type AutoExecuteDecision = "seed" | "skip" | "fail" | "none";

type AutoExecuteFlat = {
  autoExecuteDecision: AutoExecuteDecision;
  autoExecuteReason: string | null;
  autoExecuteCoinCost: number;
  autoExecuteBalanceBefore: number | null;
  autoExecuteBalanceAfter: number | null;
  autoExecuteSeedSuccess: boolean | null;
  autoExecuteExecutedAt: string | null;
};

type OperatorAction = "approve" | "reject" | "archive" | "seed";

type OperatorMode = "selected" | "filtered";

type QualityFilter = "all" | "high" | "medium" | "low";

type DuplicateFilter = "all" | "risky" | "safe";

type SortKey =
  | "created_desc"
  | "created_asc"
  | "quality_desc"
  | "quality_asc"
  | "seed_priority_desc"
  | "seed_priority_asc"
  | "duplicate_desc"
  | "duplicate_asc";

type GraphExpansionCandidateRow = {
  id: string;
  owner_user_id: string;
  status: CandidateStatus;
  source_type: string | null;
  bridge_candidate_id: string | null;
  bridge_candidate_id_key: string | null;
  target_pid: string | null;
  target_name: string | null;
  target_category: string | null;
  target_country: string | null;
  bridge_name: string | null;
  bridge_city: string | null;
  bridge_school: string | null;
  bridge_company: string | null;
  match_score: number | null;
  match_label: string | null;
  preview_path_hint: string | null;
  expansion_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
};

type OperatorItem = {
  id: string;
  ownerUserId: string;
  status: CandidateStatus;
  targetPid: string;
  targetName: string;
  targetCategory: string;
  targetCountry: string;
  bridgeName: string;
  bridgeCity: string;
  bridgeSchool: string;
  bridgeCompany: string;
  qualityScore: number;
  qualityLabel: "high" | "medium" | "low";
  evidenceStrength: number;
  duplicateRisk: boolean;
  duplicateLabel: "risky" | "safe";
  seedPriority: number;
  seedPriorityLabel: "high" | "medium" | "low";
  dangerous: boolean;
  dangerousReasons: string[];
  previewPathHint: string;
  expansionReason: string;
  matchScore: number;
  matchLabel: string;
  sourceType: string;
    createdAt: string;
  metadata: Record<string, unknown>;
  intelligence: ReturnType<typeof computeOperatorIntelligence>;
};

type MetricsBucket = {
  high: number;
  medium: number;
  low: number;
};

type StatusCounts = Record<CandidateStatus, number>;

type SeedPriorityCounts = {
  high: number;
  medium: number;
  low: number;
};

type DuplicateCounts = {
  risky: number;
  safe: number;
};

type OperatorMetrics = {
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  dangerousCount: number;
  duplicateRiskCount: number;
  safeCount: number;
  dangerousRatio: number;
  safeRatio: number;
  statusCounts: StatusCounts;
  qualityCounts: MetricsBucket;
  seedPriorityCounts: SeedPriorityCounts;
  duplicateCounts: DuplicateCounts;
};

type ActionResult = {
  id: string;
  executedAt: string;
  action: OperatorAction;
  mode: OperatorMode;
  processedCount: number;
  dangerousCount: number;
  safeCount: number;
  duplicateRiskCount: number;
  sampleTargets: string[];
  qualityCounts: MetricsBucket;
  statusCounts: StatusCounts;
  seedPriorityCounts: SeedPriorityCounts;
};

type GetResponse = {
  ok: true;
  items: OperatorItem[];
  metrics: OperatorMetrics;
};

type PostResponse = {
  ok: true;
  items: OperatorItem[];
  metrics: OperatorMetrics;
  actionResult: ActionResult;
  message: string;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

const DEFAULT_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asNumber(value: unknown, fallback = 0) {
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

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getEvidenceStrength(row: GraphExpansionCandidateRow) {
  const metadata = asObject(row.metadata);
  const raw =
    metadata.evidence_strength ??
    metadata.evidenceStrength ??
    metadata.evidence_score ??
    metadata.evidenceScore ??
    row.match_score;

  return clamp(asNumber(raw, row.match_score ?? 0));
}

function getDuplicateRisk(row: GraphExpansionCandidateRow) {
  const metadata = asObject(row.metadata);

  const duplicateScore = asNumber(
    metadata.duplicate_score ?? metadata.duplicateScore,
    0,
  );

  const duplicateFlag =
    metadata.duplicate_risk === true ||
    metadata.duplicateRisk === true ||
    metadata.is_duplicate === true ||
    metadata.isDuplicate === true;

  return duplicateFlag || duplicateScore >= 60;
}

function getSeedPriority(row: GraphExpansionCandidateRow) {
  const metadata = asObject(row.metadata);
  const raw =
    metadata.seed_priority ??
    metadata.seedPriority ??
    metadata.seed_score ??
    metadata.seedScore ??
    row.match_score;

  return clamp(asNumber(raw, row.match_score ?? 0));
}

function getQualityScore(row: GraphExpansionCandidateRow) {
  const metadata = asObject(row.metadata);

  const explicitQuality = asNumber(
    metadata.quality_score ?? metadata.qualityScore,
    -1,
  );

  if (explicitQuality >= 0) {
    return clamp(explicitQuality);
  }

  const evidenceStrength = getEvidenceStrength(row);
  const seedPriority = getSeedPriority(row);
  const duplicatePenalty = getDuplicateRisk(row) ? 18 : 0;

  return clamp(Math.round(evidenceStrength * 0.65 + seedPriority * 0.35 - duplicatePenalty));
}

function getQualityLabel(score: number): "high" | "medium" | "low" {
  if (score >= 80) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

function getSeedPriorityLabel(score: number): "high" | "medium" | "low" {
  if (score >= 80) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

function extractAutoExecute(row: any): AutoExecuteFlat {
  const metadata = row.metadata ?? {};

  const lastLog =
    row.last_execution_log ??
    metadata.last_execution_log ??
    metadata.autoSeed?.lastExecutionLog ??
    null;

  const decision =
    lastLog?.decision ??
    metadata.autoSeed?.lastStatus ??
    null;

  let mappedDecision: AutoExecuteDecision = "none";

  if (decision === "seed") mappedDecision = "seed";
  else if (decision === "skip") mappedDecision = "skip";
  else if (decision === "fail") mappedDecision = "fail";

  if (!decision && row.status === "seeded") {
    mappedDecision = "seed";
  }

  return {
    autoExecuteDecision: mappedDecision,
    autoExecuteReason:
      lastLog?.reason ??
      metadata.autoSeed?.lastReason ??
      null,
    autoExecuteCoinCost:
      lastLog?.coinCost ??
      lastLog?.cost ??
      0,
    autoExecuteBalanceBefore:
      lastLog?.balanceBefore ?? null,
    autoExecuteBalanceAfter:
      lastLog?.balanceAfter ?? null,
    autoExecuteSeedSuccess:
      lastLog?.seedSuccess ?? null,
    autoExecuteExecutedAt:
      lastLog?.executedAt ??
      metadata.autoSeed?.lastAttemptedAt ??
      null,
  };
}


function getDangerousReasons(row: GraphExpansionCandidateRow) {
  const reasons: string[] = [];
  const qualityScore = getQualityScore(row);
  const duplicateRisk = getDuplicateRisk(row);
  const seedPriority = getSeedPriority(row);

  if (qualityScore < 55) {
    reasons.push("low_quality");
  }

  if (duplicateRisk) {
    reasons.push("duplicate_risk");
  }

  if (row.status === "archived" || row.status === "rejected") {
    reasons.push("already_closed_status");
  }

  if (seedPriority < 40) {
    reasons.push("weak_seed_priority");
  }

  return reasons;
}

function toOperatorItem(row: GraphExpansionCandidateRow): OperatorItem & {
  autoExecuteDecision: "seed" | "skip" | "fail" | "none";
  autoExecuteReason: string | null;
  autoExecuteCoinCost: number;
  autoExecuteBalanceBefore: number | null;
  autoExecuteBalanceAfter: number | null;
  autoExecuteSeedSuccess: boolean | null;
  autoExecuteExecutedAt: string | null;
} {
  const metadata = asObject(row.metadata);
  const qualityScore = getQualityScore(row);
  const qualityLabel = getQualityLabel(qualityScore);
  const evidenceStrength = getEvidenceStrength(row);
  const duplicateRisk = getDuplicateRisk(row);
  const seedPriority = getSeedPriority(row);
  const dangerousReasons = getDangerousReasons(row);

  const intelligence = computeOperatorIntelligence({
    qualityScore,
    evidenceStrength,
    duplicateRisk,
    dangerous: dangerousReasons.length > 0,
    seedPriority,
  });

  // 🔥 Auto Execute 추출
  const lastLog =
    (row as any).last_execution_log ??
    metadata.last_execution_log ??
    (metadata as any)?.autoSeed?.lastExecutionLog ??
    null;

  const decision =
    lastLog?.decision ??
    (metadata as any)?.autoSeed?.lastStatus ??
    null;

  let autoExecuteDecision: "seed" | "skip" | "fail" | "none" = "none";

  if (decision === "seed") autoExecuteDecision = "seed";
  else if (decision === "skip") autoExecuteDecision = "skip";
  else if (decision === "fail") autoExecuteDecision = "fail";

  if (!decision && row.status === "seeded") {
    autoExecuteDecision = "seed";
  }

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    targetPid: row.target_pid ?? "",
    targetName: row.target_name ?? "(no target name)",
    targetCategory: row.target_category ?? "",
    targetCountry: row.target_country ?? "",
    bridgeName: row.bridge_name ?? "",
    bridgeCity: row.bridge_city ?? "",
    bridgeSchool: row.bridge_school ?? "",
    bridgeCompany: row.bridge_company ?? "",
    qualityScore,
    qualityLabel,
    evidenceStrength,
    duplicateRisk,
    duplicateLabel: duplicateRisk ? "risky" : "safe",
    seedPriority,
    seedPriorityLabel: getSeedPriorityLabel(seedPriority),
    dangerous: dangerousReasons.length > 0,
    dangerousReasons,
    previewPathHint: row.preview_path_hint ?? "",
    expansionReason: row.expansion_reason ?? "",
    matchScore: row.match_score ?? 0,
    matchLabel: row.match_label ?? "",
    sourceType: row.source_type ?? "",
    createdAt: row.created_at,
    metadata,
    intelligence,

    // 🔥 여기 추가된 부분
    autoExecuteDecision,
    autoExecuteReason:
      lastLog?.reason ??
      (metadata as any)?.autoSeed?.lastReason ??
      null,
    autoExecuteCoinCost:
      lastLog?.coinCost ??
      lastLog?.cost ??
      0,
    autoExecuteBalanceBefore:
      lastLog?.balanceBefore ?? null,
    autoExecuteBalanceAfter:
      lastLog?.balanceAfter ?? null,
    autoExecuteSeedSuccess:
      lastLog?.seedSuccess ?? null,
    autoExecuteExecutedAt:
      lastLog?.executedAt ??
      (metadata as any)?.autoSeed?.lastAttemptedAt ??
      null,
  };
}
function emptyStatusCounts(): StatusCounts {
  return {
    queued: 0,
    reviewing: 0,
    approved: 0,
    rejected: 0,
    seeded: 0,
    archived: 0,
  };
}

function emptyMetricsBucket(): MetricsBucket {
  return {
    high: 0,
    medium: 0,
    low: 0,
  };
}

function emptySeedPriorityCounts(): SeedPriorityCounts {
  return {
    high: 0,
    medium: 0,
    low: 0,
  };
}

function emptyDuplicateCounts(): DuplicateCounts {
  return {
    risky: 0,
    safe: 0,
  };
}

function applyFilters(
  items: OperatorItem[],
  statusFilter: string,
  qualityFilter: QualityFilter,
  duplicateFilter: DuplicateFilter,
) {
  return items.filter((item) => {
    const statusOk = statusFilter === "all" ? true : item.status === statusFilter;
    const qualityOk = qualityFilter === "all" ? true : item.qualityLabel === qualityFilter;
    const duplicateOk =
      duplicateFilter === "all" ? true : item.duplicateLabel === duplicateFilter;

    return statusOk && qualityOk && duplicateOk;
  });
}

function applySort(items: OperatorItem[], sortKey: SortKey) {
  const cloned = [...items];

  cloned.sort((a, b) => {
    if (sortKey === "created_desc") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }

    if (sortKey === "created_asc") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }

    if (sortKey === "quality_desc") {
      return b.qualityScore - a.qualityScore;
    }

    if (sortKey === "quality_asc") {
      return a.qualityScore - b.qualityScore;
    }

    if (sortKey === "seed_priority_desc") {
      return b.seedPriority - a.seedPriority;
    }

    if (sortKey === "seed_priority_asc") {
      return a.seedPriority - b.seedPriority;
    }

    if (sortKey === "duplicate_desc") {
      return Number(b.duplicateRisk) - Number(a.duplicateRisk);
    }

    if (sortKey === "duplicate_asc") {
      return Number(a.duplicateRisk) - Number(b.duplicateRisk);
    }

    return 0;
  });

  return cloned;
}

function buildMetrics(items: OperatorItem[], selectedIds: string[] = []): OperatorMetrics {
  const metrics: OperatorMetrics = {
    totalCount: items.length,
    filteredCount: items.length,
    selectedCount: 0,
    dangerousCount: 0,
    duplicateRiskCount: 0,
    safeCount: 0,
    dangerousRatio: 0,
    safeRatio: 0,
    statusCounts: emptyStatusCounts(),
    qualityCounts: emptyMetricsBucket(),
    seedPriorityCounts: emptySeedPriorityCounts(),
    duplicateCounts: emptyDuplicateCounts(),
  };

  const selectedSet = new Set(selectedIds);

  for (const item of items) {
    metrics.statusCounts[item.status] += 1;
    metrics.qualityCounts[item.qualityLabel] += 1;
    metrics.seedPriorityCounts[item.seedPriorityLabel] += 1;
    metrics.duplicateCounts[item.duplicateLabel] += 1;

    if (item.duplicateRisk) {
      metrics.duplicateRiskCount += 1;
    }

    if (item.dangerous) {
      metrics.dangerousCount += 1;
    } else {
      metrics.safeCount += 1;
    }

    if (selectedSet.has(item.id)) {
      metrics.selectedCount += 1;
    }
  }

  if (items.length > 0) {
    metrics.dangerousRatio = Math.round((metrics.dangerousCount / items.length) * 100);
    metrics.safeRatio = Math.round((metrics.safeCount / items.length) * 100);
  }

  return metrics;
}

function buildActionResult(
  action: OperatorAction,
  mode: OperatorMode,
  processedItems: OperatorItem[],
): ActionResult {
  const qualityCounts = emptyMetricsBucket();
  const statusCounts = emptyStatusCounts();
  const seedPriorityCounts = emptySeedPriorityCounts();

  let dangerousCount = 0;
  let safeCount = 0;
  let duplicateRiskCount = 0;

  for (const item of processedItems) {
    qualityCounts[item.qualityLabel] += 1;
    statusCounts[item.status] += 1;
    seedPriorityCounts[item.seedPriorityLabel] += 1;

    if (item.dangerous) {
      dangerousCount += 1;
    } else {
      safeCount += 1;
    }

    if (item.duplicateRisk) {
      duplicateRiskCount += 1;
    }
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    executedAt: new Date().toISOString(),
    action,
    mode,
    processedCount: processedItems.length,
    dangerousCount,
    safeCount,
    duplicateRiskCount,
    sampleTargets: processedItems.slice(0, 5).map((item) => item.targetName),
    qualityCounts,
    statusCounts,
    seedPriorityCounts,
  };
}

async function fetchAllRows(ownerUserId: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("dl_graph_expansion_candidates")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as GraphExpansionCandidateRow[]).map(toOperatorItem);
}

function parseSelectedIds(param: string | null) {
  if (!param) {
    return [];
  }

  return param
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function resolveFilteredItemsFromQuery(searchParams: URLSearchParams, ownerUserId: string) {
  const statusFilter = searchParams.get("status") ?? "all";
  const qualityFilter = (searchParams.get("quality") ?? "all") as QualityFilter;
  const duplicateFilter = (searchParams.get("duplicate") ?? "all") as DuplicateFilter;
  const sortKey = (searchParams.get("sort") ?? "created_desc") as SortKey;
  const selectedIds = parseSelectedIds(searchParams.get("selectedIds"));

  const allItems = await fetchAllRows(ownerUserId);
  const filteredItems = applySort(
    applyFilters(allItems, statusFilter, qualityFilter, duplicateFilter),
    sortKey,
  );
  const metrics = buildMetrics(filteredItems, selectedIds);

  return {
    filteredItems,
    metrics,
  };
}

export async function GET(req: NextRequest) {
  try {
    const ownerUserId =
      req.nextUrl.searchParams.get("ownerUserId") ?? DEFAULT_OWNER_USER_ID;

    const { filteredItems, metrics } = await resolveFilteredItemsFromQuery(
      req.nextUrl.searchParams,
      ownerUserId,
    );

    const response: GetResponse = {
      ok: true,
      items: filteredItems,
      metrics,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load operator data.";

    const response: ErrorResponse = {
      ok: false,
      error: message,
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      ownerUserId?: string;
      action?: OperatorAction;
      mode?: OperatorMode;
      selectedIds?: string[];
      filters?: {
        status?: string;
        quality?: QualityFilter;
        duplicate?: DuplicateFilter;
        sort?: SortKey;
      };
      safetyConfirmed?: boolean;
    };

    const ownerUserId = body.ownerUserId ?? DEFAULT_OWNER_USER_ID;
    const action = body.action;
    const mode = body.mode ?? "selected";
    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
    const statusFilter = body.filters?.status ?? "all";
    const qualityFilter = body.filters?.quality ?? "all";
    const duplicateFilter = body.filters?.duplicate ?? "all";
    const sortKey = body.filters?.sort ?? "created_desc";
    const safetyConfirmed = body.safetyConfirmed === true;

    if (!action) {
      return NextResponse.json<ErrorResponse>(
        {
          ok: false,
          error: "Action is required.",
        },
        { status: 400 },
      );
    }

    if (mode === "selected" && selectedIds.length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          ok: false,
          error: "No selected rows.",
        },
        { status: 400 },
      );
    }

    const allItems = await fetchAllRows(ownerUserId);

    const targetItems =
      mode === "selected"
        ? allItems.filter((item) => selectedIds.includes(item.id))
        : applySort(
            applyFilters(allItems, statusFilter, qualityFilter, duplicateFilter),
            sortKey,
          );

    if (targetItems.length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          ok: false,
          error: "No target rows matched the requested action.",
        },
        { status: 400 },
      );
    }

    const dangerousCount = targetItems.filter((item) => item.dangerous).length;

    if (dangerousCount > 0 && !safetyConfirmed) {
      return NextResponse.json<ErrorResponse>(
        {
          ok: false,
          error:
            "Dangerous rows are included. Please enable safety confirmation and retry.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const nextStatusByAction: Record<OperatorAction, CandidateStatus> = {
      approve: "approved",
      reject: "rejected",
      archive: "archived",
      seed: "seeded",
    };

    const nextStatus = nextStatusByAction[action];

    for (const item of targetItems) {
      const metadata = asObject(item.metadata);
      const actionHistory = Array.isArray(metadata.action_history)
        ? [...metadata.action_history]
        : [];

      actionHistory.unshift({
        action,
        mode,
        executed_at: new Date().toISOString(),
        dangerous: item.dangerous,
        target_name: item.targetName,
      });

      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        last_operator_action: action,
        last_operator_mode: mode,
        last_operator_at: new Date().toISOString(),
        last_dangerous: item.dangerous,
        action_history: actionHistory.slice(0, 20),
      };

      if (action === "seed") {
        nextMetadata.seed_result = {
          seeded_at: new Date().toISOString(),
          source: "operator_console",
          status: "success",
          target_pid: item.targetPid,
          target_name: item.targetName,
          seed_priority: item.seedPriority,
        };
      }

      const { error } = await supabase
        .from("dl_graph_expansion_candidates")
        .update({
          status: nextStatus,
          metadata: nextMetadata,
        })
        .eq("id", item.id)
        .eq("owner_user_id", ownerUserId);

      if (error) {
        throw error;
      }
    }

    const refreshedAllItems = await fetchAllRows(ownerUserId);
    const refreshedFilteredItems = applySort(
      applyFilters(refreshedAllItems, statusFilter, qualityFilter, duplicateFilter),
      sortKey,
    );
    const refreshedMetrics = buildMetrics(refreshedFilteredItems, selectedIds);

    const processedItemsAfterUpdate = refreshedAllItems.filter((item) =>
      targetItems.some((target) => target.id === item.id),
    );

    const actionResult = buildActionResult(
      action,
      mode,
      processedItemsAfterUpdate,
    );

    const response: PostResponse = {
      ok: true,
      items: refreshedFilteredItems,
      metrics: refreshedMetrics,
      actionResult,
      message: `${action} action completed for ${processedItemsAfterUpdate.length} rows.`,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to execute operator action.";

    const response: ErrorResponse = {
      ok: false,
      error: message,
    };

    return NextResponse.json(response, { status: 500 });
  }
}