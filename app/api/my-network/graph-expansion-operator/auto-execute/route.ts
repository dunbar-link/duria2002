import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";
const DEFAULT_SEED_COST = 10;
const DEFAULT_LIMIT = 20;

type CandidateRow = {
  id: string;
  owner_user_id: string;
  status: string | null;
  target_pid: string | null;
  target_name: string | null;
  bridge_pid?: string | null;
  metadata: Record<string, unknown> | null;
  last_execution_log?: Record<string, unknown> | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function buildDecision(candidate: CandidateRow, coinCost: number) {
  const metadata = asObject(candidate.metadata);
  const safety = asObject(metadata.safety);
  const intelligence = asObject(metadata.operatorIntelligence) || asObject(metadata.operator_intelligence);
  const riskLevel = asString(metadata.riskLevel) || asString(metadata.risk_level) || asString(intelligence.riskLevel) || "review";
  const recommendedAction = asString(metadata.recommendedAction) || asString(metadata.recommended_action) || asString(intelligence.recommendedAction) || "review";
  const seedReady = asBoolean(metadata.seedReady) || asBoolean(metadata.seed_ready) || asBoolean(intelligence.seedReady);
  const dangerous = asBoolean(metadata.dangerous) || asBoolean(safety.dangerous);
  const duplicateRisk = asString(metadata.duplicateRisk) || asString(metadata.duplicate_risk) || "safe";
  const priorityScore = asNumber(metadata.priorityScore) || asNumber(metadata.priority_score) || asNumber(intelligence.priorityScore);
  const seedImpactScore = asNumber(metadata.seedImpactScore) || asNumber(metadata.seed_impact_score) || asNumber(metadata.expectedExpansion);
  const bridgePid = candidate.bridge_pid || asString(metadata.bridgePid) || asString(metadata.bridge_pid) || null;

  if (candidate.status === "seeded") {
    return { candidateId: candidate.id, decision: "skip", reason: "already_seeded", targetPid: candidate.target_pid, targetName: candidate.target_name, status: candidate.status, riskLevel, recommendedAction, priorityScore, seedImpactScore, seedReady, dangerous, duplicateRisk, coinCost: 0, executed: false, chargeAttempted: false, chargeSuccess: false, seedAttempted: false, seedSuccess: false, balanceBefore: null, balanceAfter: null, error: null, bridgePid, edgeLabel: null };
  }

  if (!candidate.target_pid) {
    return { candidateId: candidate.id, decision: "skip", reason: "missing_target", targetPid: candidate.target_pid, targetName: candidate.target_name, status: candidate.status, riskLevel, recommendedAction, priorityScore, seedImpactScore, seedReady, dangerous, duplicateRisk, coinCost: 0, executed: false, chargeAttempted: false, chargeSuccess: false, seedAttempted: false, seedSuccess: false, balanceBefore: null, balanceAfter: null, error: null, bridgePid, edgeLabel: null };
  }

  if (!bridgePid) {
    return { candidateId: candidate.id, decision: "skip", reason: "missing_bridge", targetPid: candidate.target_pid, targetName: candidate.target_name, status: candidate.status, riskLevel, recommendedAction, priorityScore, seedImpactScore, seedReady, dangerous, duplicateRisk, coinCost: 0, executed: false, chargeAttempted: false, chargeSuccess: false, seedAttempted: false, seedSuccess: false, balanceBefore: null, balanceAfter: null, error: null, bridgePid: null, edgeLabel: null };
  }

  if (dangerous || !seedReady || recommendedAction !== "seed") {
    return { candidateId: candidate.id, decision: "skip", reason: dangerous ? "dangerous" : "seed_not_ready", targetPid: candidate.target_pid, targetName: candidate.target_name, status: candidate.status, riskLevel, recommendedAction, priorityScore, seedImpactScore, seedReady, dangerous, duplicateRisk, coinCost: 0, executed: false, chargeAttempted: false, chargeSuccess: false, seedAttempted: false, seedSuccess: false, balanceBefore: null, balanceAfter: null, error: null, bridgePid, edgeLabel: null };
  }

  return { candidateId: candidate.id, decision: "seed", reason: "ready", targetPid: candidate.target_pid, targetName: candidate.target_name, status: candidate.status, riskLevel, recommendedAction, priorityScore, seedImpactScore, seedReady, dangerous, duplicateRisk, coinCost, executed: false, chargeAttempted: false, chargeSuccess: false, seedAttempted: false, seedSuccess: false, balanceBefore: null, balanceAfter: null, error: null, bridgePid, edgeLabel: null };
}

async function appendAutoExecuteLog(supabase: ReturnType<typeof getSupabaseAdmin>, candidate: CandidateRow, payload: Record<string, unknown>) {
  const metadata = asObject(candidate.metadata);
  const currentLog = Array.isArray(metadata.execution_log) ? metadata.execution_log : [];
  const nextLog = [payload, ...currentLog].slice(0, 30);
  const autoSeedState = {
    lastStatus: payload.status ?? "unknown",
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

  await supabase
    .from("dl_graph_expansion_candidates")
    .update({
      metadata: {
        ...metadata,
        autoSeed: autoSeedState,
        auto_seed: autoSeedState,
        lastAutoExecuteAt: payload.executedAt ?? new Date().toISOString(),
        lastAutoExecuteSource: payload.source ?? "operator_auto_execute_api",
        execution_log: nextLog,
        last_execution_log: payload,
      },
      last_execution_log: payload,
    })
    .eq("id", candidate.id);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => ({}));
    const ownerUserId = body?.ownerUserId ?? body?.owner_user_id ?? DEFAULT_OWNER_USER_ID;
    const mode = body?.mode === "execute" ? "execute" : "dry-run";
    const limit = typeof body?.limit === "number" && body.limit > 0 ? body.limit : DEFAULT_LIMIT;
    const seedCost = typeof body?.seedCost === "number" ? body.seedCost : typeof body?.coinCost === "number" ? body.coinCost : DEFAULT_SEED_COST;
    const requestedBy = body?.requestedBy ?? "api";

    const { data: walletRow } = await supabase.from("dl_wallet_balances").select("balance").eq("user_id", ownerUserId).maybeSingle();
    const startingBalance = (walletRow as { balance?: number } | null)?.balance ?? 0;

    const { data: candidates, error: candidatesError } = await supabase
      .from("dl_graph_expansion_candidates")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .in("status", ["approved", "queued", "reviewing", "seeded"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (candidatesError) return NextResponse.json({ ok: false, mode, ownerUserId, count: 0, decisions: [], error: candidatesError.message }, { status: 500 });

    const candidateRows = (candidates ?? []) as CandidateRow[];
    const decisions = candidateRows.map((candidate) => buildDecision(candidate, seedCost));

    if (mode === "dry-run") {
      return NextResponse.json({ ok: true, mode, ownerUserId, count: decisions.length, balance: { current: startingBalance }, decisions });
    }

    const executedDecisions: any[] = [];
    let balanceCursor = startingBalance;

    for (const candidate of candidateRows) {
      const baseDecision = buildDecision(candidate, seedCost);
      const executedAt = new Date().toISOString();

      if (baseDecision.decision === "skip") {
        const logPayload = { ...baseDecision, mode: "execute", source: "operator_auto_execute_api", status: "skipped", requestedBy, ownerUserId, balanceBefore: balanceCursor, balanceAfter: balanceCursor, executedAt };
        await appendAutoExecuteLog(supabase, candidate, logPayload);
        executedDecisions.push({ ...baseDecision, balanceBefore: balanceCursor, balanceAfter: balanceCursor });
        continue;
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc("dl_execute_graph_expansion_seed", {
        p_candidate_id: candidate.id,
        p_owner_user_id: ownerUserId,
        p_seed_cost: seedCost,
      });

      if (rpcError) {
        const failedDecision = { ...baseDecision, reason: "seed_rpc_error", executed: true, chargeAttempted: true, chargeSuccess: false, seedAttempted: true, seedSuccess: false, balanceBefore: balanceCursor, balanceAfter: balanceCursor, error: rpcError.message };
        await appendAutoExecuteLog(supabase, candidate, { ...failedDecision, mode: "execute", source: "operator_auto_execute_api", status: "failed", requestedBy, ownerUserId, executedAt });
        executedDecisions.push(failedDecision);
        continue;
      }

      const result = rpcData as any;
      balanceCursor = typeof result?.balanceAfter === "number" ? result.balanceAfter : balanceCursor;
      const executedDecision = { ...baseDecision, reason: result?.reason ?? baseDecision.reason, executed: true, chargeAttempted: Boolean(result?.chargeAttempted), chargeSuccess: Boolean(result?.chargeSuccess), seedAttempted: Boolean(result?.seedAttempted), seedSuccess: Boolean(result?.seedSuccess), balanceBefore: result?.balanceBefore ?? null, balanceAfter: result?.balanceAfter ?? null, coinCost: result?.coinCost ?? seedCost, error: result?.error ?? null };
      await appendAutoExecuteLog(supabase, candidate, { ...executedDecision, mode: "execute", source: "operator_auto_execute_api", status: result?.ok ? "success" : "failed", requestedBy, ownerUserId, executedAt });
      executedDecisions.push(executedDecision);
    }

    const successCount = executedDecisions.filter((item) => item.seedSuccess).length;
    const failureCount = executedDecisions.filter((item) => item.executed && !item.seedSuccess).length;
    const skippedCount = executedDecisions.filter((item) => !item.executed).length;

    return NextResponse.json({ ok: true, mode, ownerUserId, count: executedDecisions.length, successCount, failureCount, skippedCount, balance: { before: startingBalance, after: balanceCursor }, decisions: executedDecisions });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "execute", count: 0, decisions: [], error: error instanceof Error ? error.message : "unknown_error" }, { status: 500 });
  }
}
