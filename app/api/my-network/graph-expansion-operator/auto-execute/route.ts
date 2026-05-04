import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";
const DEFAULT_SEED_COST = 10;
const DEFAULT_LIMIT = 20;

type CandidateRow = {
  id: string;
  owner_user_id: string;
  status: string | null;
  target_pid: string | null;
  target_name: string | null;
  bridge_pid: string | null;
  metadata: Record<string, unknown> | null;
  last_execution_log: Record<string, unknown> | null;
};

type SeedRpcResult = {
  ok: boolean;
  status: "success" | "failed";
  reason: string;
  candidateId: string;
  bridgePid?: string | null;
  targetPid?: string | null;
  targetName?: string | null;
  trust?: number | null;
  tier?: number | null;
  edgeLabel?: string | null;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  seedAttempted: boolean;
  seedSuccess: boolean;
  coinCost: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  error: string | null;
};

type AutoDecision = {
  candidateId: string;
  targetPid: string | null;
  targetName: string | null;
  status: string | null;
  decision: "seed" | "skip";
  reason:
    | "ready"
    | "seeded"
    | "duplicate_edge_reused"
    | "seed_rpc_error"
    | "seed_transaction_failed"
    | "insufficient_funds"
    | "seed_not_ready"
    | "risk_review"
    | "dangerous"
    | "missing_target"
    | "missing_bridge"
    | "already_seeded";
  riskLevel: string;
  recommendedAction: string;
  priorityScore: number;
  seedImpactScore: number;
  seedReady: boolean;
  dangerous: boolean;
  duplicateRisk: string;
  coinCost: number;
  executed: boolean;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  seedAttempted: boolean;
  seedSuccess: boolean;
  balanceBefore: number | null;
  balanceAfter: number | null;
  error: string | null;
  bridgePid?: string | null;
  edgeLabel?: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function buildDecision(candidate: CandidateRow, coinCost: number): AutoDecision {
  const metadata = asObject(candidate.metadata);
  const autoSeed = asObject(metadata.autoSeed);
  const auto_seed = asObject(metadata.auto_seed);
  const safety = asObject(metadata.safety);
  const operatorIntelligence = asObject(metadata.operatorIntelligence);
  const operator_intelligence = asObject(metadata.operator_intelligence);

  const riskLevel =
    asString(metadata.riskLevel) ||
    asString(metadata.risk_level) ||
    asString(operatorIntelligence.riskLevel) ||
    asString(operator_intelligence.riskLevel) ||
    "review";

  const recommendedAction =
    asString(metadata.recommendedAction) ||
    asString(metadata.recommended_action) ||
    asString(operatorIntelligence.recommendedAction) ||
    asString(operator_intelligence.recommendedAction) ||
    "review";

  const seedReady =
    asBoolean(metadata.seedReady) ||
    asBoolean(metadata.seed_ready) ||
    asBoolean(operatorIntelligence.seedReady) ||
    asBoolean(operator_intelligence.seedReady);

  const dangerous =
    asBoolean(metadata.dangerous) ||
    asBoolean(metadata.dangerous_flag) ||
    asBoolean(safety.dangerous) ||
    asBoolean(safety.dangerous_flag);

  const duplicateRisk =
    asString(metadata.duplicateRisk) ||
    asString(metadata.duplicate_risk) ||
    "safe";

  const priorityScore =
    asNumber(metadata.priorityScore) ||
    asNumber(metadata.priority_score) ||
    asNumber(operatorIntelligence.priorityScore) ||
    asNumber(operator_intelligence.priorityScore) ||
    0;

  const seedImpactScore =
    asNumber(metadata.seedImpactScore) ||
    asNumber(metadata.seed_impact_score) ||
    asNumber(metadata.expectedExpansion) ||
    asNumber(metadata.expected_expansion) ||
    0;

  if (candidate.status === "seeded") {
    return {
      candidateId: candidate.id,
      targetPid: candidate.target_pid,
      targetName: candidate.target_name,
      status: candidate.status,
      decision: "skip",
      reason: "already_seeded",
      riskLevel,
      recommendedAction,
      priorityScore,
      seedImpactScore,
      seedReady,
      dangerous,
      duplicateRisk,
      coinCost: 0,
      executed: false,
      chargeAttempted: false,
      chargeSuccess: false,
      seedAttempted: false,
      seedSuccess: false,
      balanceBefore: null,
      balanceAfter: null,
      error: null,
      bridgePid: candidate.bridge_pid,
      edgeLabel: null,
    };
  }

  if (!candidate.target_pid) {
    return {
      candidateId: candidate.id,
      targetPid: candidate.target_pid,
      targetName: candidate.target_name,
      status: candidate.status,
      decision: "skip",
      reason: "missing_target",
      riskLevel,
      recommendedAction,
      priorityScore,
      seedImpactScore,
      seedReady,
      dangerous,
      duplicateRisk,
      coinCost: 0,
      executed: false,
      chargeAttempted: false,
      chargeSuccess: false,
      seedAttempted: false,
      seedSuccess: false,
      balanceBefore: null,
      balanceAfter: null,
      error: null,
      bridgePid: candidate.bridge_pid,
      edgeLabel: null,
    };
  }

  const metadataBridgePid =
    asString(metadata.bridgePid) || asString(metadata.bridge_pid);
  const bridgePid = candidate.bridge_pid || metadataBridgePid || null;

  if (!bridgePid) {
    return {
      candidateId: candidate.id,
      targetPid: candidate.target_pid,
      targetName: candidate.target_name,
      status: candidate.status,
      decision: "skip",
      reason: "missing_bridge",
      riskLevel,
      recommendedAction,
      priorityScore,
      seedImpactScore,
      seedReady,
      dangerous,
      duplicateRisk,
      coinCost: 0,
      executed: false,
      chargeAttempted: false,
      chargeSuccess: false,
      seedAttempted: false,
      seedSuccess: false,
      balanceBefore: null,
      balanceAfter: null,
      error: null,
      bridgePid: null,
      edgeLabel: null,
    };
  }

  if (dangerous) {
    return {
      candidateId: candidate.id,
      targetPid: candidate.target_pid,
      targetName: candidate.target_name,
      status: candidate.status,
      decision: "skip",
      reason: "dangerous",
      riskLevel,
      recommendedAction,
      priorityScore,
      seedImpactScore,
      seedReady,
      dangerous,
      duplicateRisk,
      coinCost: 0,
      executed: false,
      chargeAttempted: false,
      chargeSuccess: false,
      seedAttempted: false,
      seedSuccess: false,
      balanceBefore: null,
      balanceAfter: null,
      error: null,
      bridgePid,
      edgeLabel: null,
    };
  }

  if (!seedReady || recommendedAction !== "seed") {
    return {
      candidateId: candidate.id,
      targetPid: candidate.target_pid,
      targetName: candidate.target_name,
      status: candidate.status,
      decision: "skip",
      reason: riskLevel === "review" ? "risk_review" : "seed_not_ready",
      riskLevel,
      recommendedAction,
      priorityScore,
      seedImpactScore,
      seedReady,
      dangerous,
      duplicateRisk,
      coinCost: 0,
      executed: false,
      chargeAttempted: false,
      chargeSuccess: false,
      seedAttempted: false,
      seedSuccess: false,
      balanceBefore:
        typeof autoSeed.balanceBefore === "number"
          ? (autoSeed.balanceBefore as number)
          : typeof auto_seed.balanceBefore === "number"
          ? (auto_seed.balanceBefore as number)
          : null,
      balanceAfter:
        typeof autoSeed.balanceAfter === "number"
          ? (autoSeed.balanceAfter as number)
          : typeof auto_seed.balanceAfter === "number"
          ? (auto_seed.balanceAfter as number)
          : null,
      error: null,
      bridgePid,
      edgeLabel: null,
    };
  }

  return {
    candidateId: candidate.id,
    targetPid: candidate.target_pid,
    targetName: candidate.target_name,
    status: candidate.status,
    decision: "seed",
    reason: "ready",
    riskLevel,
    recommendedAction,
    priorityScore,
    seedImpactScore,
    seedReady,
    dangerous,
    duplicateRisk,
    coinCost,
    executed: false,
    chargeAttempted: false,
    chargeSuccess: false,
    seedAttempted: false,
    seedSuccess: false,
    balanceBefore: null,
    balanceAfter: null,
    error: null,
    bridgePid,
    edgeLabel: null,
  };
}

async function appendAutoExecuteLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  candidate: CandidateRow,
  payload: Record<string, unknown>
) {
  const metadata = asObject(candidate.metadata);
  const currentLog = Array.isArray(metadata.execution_log) ? metadata.execution_log : [];
  const nextLog = [payload, ...currentLog].slice(0, 30);

  const autoSeedState = {
    lastStatus: payload.status ?? ((payload.seedSuccess as boolean) ? "success" : "failed"),
    lastReason: payload.reason ?? payload.decision ?? "",
    lastAttemptedAt: payload.executedAt ?? new Date().toISOString(),
    coinCost: payload.coinCost ?? 0,
    seedSuccess: payload.seedSuccess ?? false,
    balanceBefore: payload.balanceBefore ?? null,
    balanceAfter: payload.balanceAfter ?? null,
    chargeAttempted: payload.chargeAttempted ?? false,
    chargeSuccess: payload.chargeSuccess ?? false,
    seedAttempted: payload.seedAttempted ?? false,
  };

  const nextMetadata = {
    ...metadata,
    autoSeed: autoSeedState,
    auto_seed: autoSeedState,
    lastAutoExecuteAt: payload.executedAt ?? new Date().toISOString(),
    lastAutoExecuteMode: payload.mode ?? "",
    lastAutoExecuteSource: payload.source ?? "operator_auto_execute_api",
    lastAutoExecuteDecision: payload.reason ?? payload.decision ?? "",
    execution_log: nextLog,
    last_execution_log: payload,
  };

  await supabase
    .from("dl_graph_expansion_candidates")
    .update({
      metadata: nextMetadata,
      last_execution_log: payload,
    })
    .eq("id", candidate.id);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const ownerUserId =
      body?.ownerUserId ??
      body?.owner_user_id ??
      DEFAULT_OWNER_USER_ID;

    const mode = body?.mode === "execute" ? "execute" : "dry-run";
    const limit =
      typeof body?.limit === "number" && body.limit > 0
        ? body.limit
        : DEFAULT_LIMIT;

    const seedCost =
      typeof body?.seedCost === "number"
        ? body.seedCost
        : typeof body?.coinCost === "number"
        ? body.coinCost
        : DEFAULT_SEED_COST;

    const requestedBy = body?.requestedBy ?? "api";

    const supabase = getSupabaseAdmin();

    const { data: walletRow } = await supabase
      .from("dl_wallet_balances")
      .select("balance")
      .eq("user_id", ownerUserId)
      .maybeSingle();

    const startingBalance = walletRow?.balance ?? 0;

    const { data: candidates, error: candidatesError } = await supabase
      .from("dl_graph_expansion_candidates")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .in("status", ["approved", "queued", "reviewing", "seeded"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (candidatesError) {
      return NextResponse.json(
        {
          ok: false,
          mode,
          ownerUserId,
          count: 0,
          decisions: [],
          error: candidatesError.message,
        },
        { status: 500 }
      );
    }

    const candidateRows = (candidates ?? []) as CandidateRow[];
    const decisions = candidateRows.map((candidate) => buildDecision(candidate, seedCost));

    if (mode === "dry-run") {
      return NextResponse.json({
        ok: true,
        mode,
        ownerUserId,
        count: decisions.length,
        balance: {
          current: startingBalance,
        },
        decisions,
      });
    }

    const executedDecisions: AutoDecision[] = [];
    let balanceCursor = startingBalance;

    for (const candidate of candidateRows) {
      const baseDecision = buildDecision(candidate, seedCost);

      if (baseDecision.decision === "skip") {
        const logPayload = {
          mode: "execute",
          source: "operator_auto_execute_api",
          status: "skipped",
          decision: "skip",
          reason: baseDecision.reason,
          requestedBy,
          ownerUserId,
          candidateId: candidate.id,
          targetPid: candidate.target_pid,
          targetName: candidate.target_name,
          bridgePid: baseDecision.bridgePid ?? null,
          edgeLabel: baseDecision.edgeLabel ?? null,
          riskLevel: baseDecision.riskLevel,
          recommendedAction: baseDecision.recommendedAction,
          priorityScore: baseDecision.priorityScore,
          seedImpactScore: baseDecision.seedImpactScore,
          seedReady: baseDecision.seedReady,
          dangerous: baseDecision.dangerous,
          duplicateRisk: baseDecision.duplicateRisk,
          coinCost: 0,
          chargeAttempted: false,
          chargeSuccess: false,
          seedAttempted: false,
          seedSuccess: false,
          balanceBefore: balanceCursor,
          balanceAfter: balanceCursor,
          error: null,
          executedAt: new Date().toISOString(),
        };

        await appendAutoExecuteLog(supabase, candidate, logPayload);

        executedDecisions.push({
          ...baseDecision,
          balanceBefore: balanceCursor,
          balanceAfter: balanceCursor,
        });
        continue;
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc("dl_execute_graph_expansion_seed", {
        p_candidate_id: candidate.id,
        p_owner_user_id: ownerUserId,
        p_seed_cost: seedCost,
      });

      if (rpcError) {
        const failedDecision: AutoDecision = {
          ...baseDecision,
          reason: "seed_rpc_error",
          executed: true,
          chargeAttempted: true,
          chargeSuccess: false,
          seedAttempted: true,
          seedSuccess: false,
          balanceBefore: balanceCursor,
          balanceAfter: balanceCursor,
          error: rpcError.message,
        };

        const logPayload = {
          mode: "execute",
          source: "operator_auto_execute_api",
          status: "failed",
          decision: "seed",
          reason: "seed_rpc_error",
          requestedBy,
          ownerUserId,
          candidateId: candidate.id,
          targetPid: candidate.target_pid,
          targetName: candidate.target_name,
          bridgePid: baseDecision.bridgePid ?? null,
          edgeLabel: baseDecision.edgeLabel ?? null,
          riskLevel: baseDecision.riskLevel,
          recommendedAction: baseDecision.recommendedAction,
          priorityScore: baseDecision.priorityScore,
          seedImpactScore: baseDecision.seedImpactScore,
          seedReady: baseDecision.seedReady,
          dangerous: baseDecision.dangerous,
          duplicateRisk: baseDecision.duplicateRisk,
          coinCost: seedCost,
          chargeAttempted: true,
          chargeSuccess: false,
          seedAttempted: true,
          seedSuccess: false,
          balanceBefore: balanceCursor,
          balanceAfter: balanceCursor,
          error: rpcError.message,
          executedAt: new Date().toISOString(),
        };

        await appendAutoExecuteLog(supabase, candidate, logPayload);
        executedDecisions.push(failedDecision);
        continue;
      }

      const result = rpcData as SeedRpcResult;

      balanceCursor =
        typeof result.balanceAfter === "number" ? result.balanceAfter : balanceCursor;

      const executedDecision: AutoDecision = {
        ...baseDecision,
        reason: (result.reason as AutoDecision["reason"]) ?? baseDecision.reason,
        targetPid: result.targetPid ?? candidate.target_pid,
        targetName: result.targetName ?? candidate.target_name,
        bridgePid: result.bridgePid ?? baseDecision.bridgePid ?? null,
        edgeLabel: result.edgeLabel ?? null,
        executed: true,
        chargeAttempted: result.chargeAttempted,
        chargeSuccess: result.chargeSuccess,
        seedAttempted: result.seedAttempted,
        seedSuccess: result.seedSuccess,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        coinCost: result.coinCost,
        error: result.error,
      };

      const logPayload = {
        mode: "execute",
        source: "operator_auto_execute_api",
        status: result.ok ? "success" : "failed",
        decision: "seed",
        reason: result.reason,
        requestedBy,
        ownerUserId,
        candidateId: candidate.id,
        targetPid: result.targetPid ?? candidate.target_pid,
        targetName: result.targetName ?? candidate.target_name,
        bridgePid: result.bridgePid ?? baseDecision.bridgePid ?? null,
        edgeLabel: result.edgeLabel ?? null,
        riskLevel: baseDecision.riskLevel,
        recommendedAction: baseDecision.recommendedAction,
        priorityScore: baseDecision.priorityScore,
        seedImpactScore: baseDecision.seedImpactScore,
        seedReady: baseDecision.seedReady,
        dangerous: baseDecision.dangerous,
        duplicateRisk: baseDecision.duplicateRisk,
        coinCost: result.coinCost,
        chargeAttempted: result.chargeAttempted,
        chargeSuccess: result.chargeSuccess,
        seedAttempted: result.seedAttempted,
        seedSuccess: result.seedSuccess,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        error: result.error,
        executedAt: new Date().toISOString(),
      };

      await appendAutoExecuteLog(supabase, candidate, logPayload);
      executedDecisions.push(executedDecision);
    }

    const successCount = executedDecisions.filter((item) => item.seedSuccess).length;
    const failureCount = executedDecisions.filter(
      (item) => item.executed && !item.seedSuccess
    ).length;
    const skippedCount = executedDecisions.filter((item) => !item.executed).length;

    return NextResponse.json({
      ok: true,
      mode,
      ownerUserId,
      count: executedDecisions.length,
      successCount,
      failureCount,
      skippedCount,
      balance: {
        before: startingBalance,
        after: balanceCursor,
      },
      decisions: executedDecisions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    return NextResponse.json(
      {
        ok: false,
        mode: "execute",
        count: 0,
        decisions: [],
        error: message,
      },
      { status: 500 }
    );
  }
}