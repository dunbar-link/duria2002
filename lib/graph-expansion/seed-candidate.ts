// C:\work\nextjs-server\lib\graph-expansion\seed-candidate.ts

import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  classifySeedFailure,
  type SeedFailureReason,
  type SeedOutcomeStatus,
} from "@/lib/graph-expansion/seed-failure-taxonomy";

type GraphExpansionCandidateRow = {
  id: string;
  status: string;
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
};

export type SeedCandidateResult = {
  ok: boolean;
  status: SeedOutcomeStatus;
  reason: SeedFailureReason;
  candidateId: string;
  bridgePid: string | null;
  targetPid: string | null;
  targetName: string | null;
  trust: number;
  tier: number;
  edgeLabel: string;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  seedAttempted: boolean;
  seedSuccess: boolean;
  coinCost: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  warning: string | null;
  message: string;
  step?: string;
  details?: unknown;
};

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
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

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mergeMetadata(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
) {
  return {
    ...(current ?? {}),
    ...patch,
  };
}

function buildBridgePid(candidate: GraphExpansionCandidateRow) {
  const metadata = asObject(candidate.metadata);
  const metadataBridgePid = asString(metadata.bridge_pid);

  if (metadataBridgePid) {
    return metadataBridgePid;
  }

  return `person:auto:${randomUUID()}`;
}

function buildBridgeDisplayName(candidate: GraphExpansionCandidateRow) {
  const name = asString(candidate.bridge_name);

  if (name) {
    return name;
  }

  return "Auto Bridge Person";
}

function buildTargetDisplayName(candidate: GraphExpansionCandidateRow) {
  const name = asString(candidate.target_name);

  if (name) {
    return name;
  }

  return asString(candidate.target_pid) || "Unknown Target";
}

function isValidTargetPid(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const text = value.trim();

  if (!text) {
    return false;
  }

  if (!text.includes(":")) {
    return false;
  }

  return true;
}

async function tryUpsertDlPeople(params: {
  supabase: SupabaseClient;
  pid: string;
  displayName: string;
  category: string;
  country: string;
  city?: string | null;
  school?: string | null;
  company?: string | null;
  logPrefix: string;
}) {
  const attempts: Array<Record<string, unknown>> = [
    {
      pid: params.pid,
      display_name: params.displayName,
      category: params.category,
      country: params.country,
      city: params.city ?? null,
      school: params.school ?? null,
      company: params.company ?? null,
      is_active: true,
    },
    {
      pid: params.pid,
      name: params.displayName,
      city: params.city ?? null,
      school: params.school ?? null,
      company: params.company ?? null,
    },
    {
      pid: params.pid,
    },
  ];

  let lastErrorMessage = "";

  for (let index = 0; index < attempts.length; index += 1) {
    const payload = attempts[index];

    console.log(`${params.logPrefix} dl_people upsert attempt`, {
      attempt: index + 1,
      payload,
    });

    const { error } = await params.supabase
      .from("dl_people")
      .upsert([payload], { onConflict: "pid" });

    if (!error) {
      console.log(`${params.logPrefix} dl_people upsert success`, {
        attempt: index + 1,
      });

      return {
        ok: true,
        warning:
          Object.keys(payload).length === 1
            ? "dl_people minimal pid-only upsert used"
            : null,
      };
    }

    console.error(`${params.logPrefix} dl_people upsert failed`, {
      attempt: index + 1,
      error: error.message,
      payload,
    });

    lastErrorMessage = error.message;
  }

  return {
    ok: false,
    warning: null,
    error: lastErrorMessage || "dl_people upsert failed",
  };
}

async function ensureEdge(params: {
  supabase: SupabaseClient;
  edgeRow: {
    from_pid: string;
    to_pid: string;
    trust: number;
    tier: number;
    label: string;
    status: string;
  };
  logPrefix: string;
}) {
  console.log(`${params.logPrefix} edge lookup start`, {
    from_pid: params.edgeRow.from_pid,
    to_pid: params.edgeRow.to_pid,
    label: params.edgeRow.label,
  });

  const { data: existingEdge, error: existingEdgeError } = await params.supabase
    .from("dl_edges")
    .select("id, from_pid, to_pid, label")
    .eq("from_pid", params.edgeRow.from_pid)
    .eq("to_pid", params.edgeRow.to_pid)
    .eq("label", params.edgeRow.label)
    .maybeSingle();

  if (existingEdgeError) {
    console.error(`${params.logPrefix} edge lookup failed`, {
      error: existingEdgeError.message,
    });

    return {
      ok: false,
      step: "lookup_edge",
      error: existingEdgeError.message,
    };
  }

  if (existingEdge) {
    console.log(`${params.logPrefix} edge already exists`, {
      existingEdge,
    });

    return {
      ok: true,
      inserted: false,
    };
  }

  console.log(`${params.logPrefix} edge insert start`, {
    edgeRow: params.edgeRow,
  });

  const { error: insertEdgeError } = await params.supabase
    .from("dl_edges")
    .insert(params.edgeRow);

  if (insertEdgeError) {
    console.error(`${params.logPrefix} edge insert failed`, {
      error: insertEdgeError.message,
      edgeRow: params.edgeRow,
    });

    return {
      ok: false,
      step: "insert_edge",
      error: insertEdgeError.message,
    };
  }

  console.log(`${params.logPrefix} edge insert success`);

  return {
    ok: true,
    inserted: true,
  };
}

async function readCandidate(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<GraphExpansionCandidateRow | null> {
  const { data, error } = await supabase
    .from("dl_graph_expansion_candidates")
    .select(
      `
        id,
        status,
        owner_user_id,
        target_pid,
        target_name,
        target_category,
        target_country,
        bridge_name,
        bridge_city,
        bridge_school,
        bridge_company,
        metadata
      `,
    )
    .eq("id", candidateId)
    .maybeSingle<GraphExpansionCandidateRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function buildFailureResult(params: {
  candidateId: string;
  targetPid?: string | null;
  targetName?: string | null;
  reason: SeedFailureReason;
  message: string;
  step?: string;
  details?: unknown;
  chargeAttempted?: boolean;
  chargeSuccess?: boolean;
  seedAttempted?: boolean;
  seedSuccess?: boolean;
  coinCost?: number;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  bridgePid?: string | null;
}) {
  const normalized = classifySeedFailure({
    ok: false,
    reason: params.reason,
    message: params.message,
    raw: params.details,
    chargeAttempted: params.chargeAttempted ?? false,
    chargeSuccess: params.chargeSuccess ?? false,
    seedAttempted: params.seedAttempted ?? false,
    seedSuccess: params.seedSuccess ?? false,
  });

  return {
    ok: normalized.ok,
    status: normalized.status,
    reason: normalized.reason,
    candidateId: params.candidateId,
    bridgePid: params.bridgePid ?? null,
    targetPid: params.targetPid ?? null,
    targetName: params.targetName ?? null,
    trust: 70,
    tier: 50,
    edgeLabel: "graph_expansion_bridge",
    chargeAttempted: params.chargeAttempted ?? false,
    chargeSuccess: params.chargeSuccess ?? false,
    seedAttempted: params.seedAttempted ?? false,
    seedSuccess: params.seedSuccess ?? false,
    coinCost: params.coinCost ?? 0,
    balanceBefore: params.balanceBefore ?? null,
    balanceAfter: params.balanceAfter ?? null,
    warning: null,
    message: params.message,
    step: params.step,
    details: params.details,
  } satisfies SeedCandidateResult;
}

export async function seedGraphExpansionCandidate(
  candidateId: string,
): Promise<SeedCandidateResult> {
  const safeCandidateId = String(candidateId ?? "").trim();
  const logPrefix = `[graph-expansion-seed][${safeCandidateId}]`;
  const supabase = getSupabase();

  if (!safeCandidateId) {
    return buildFailureResult({
      candidateId: safeCandidateId,
      reason: "unknown_failure",
      message: "candidateId is required.",
      step: "validate_candidate_id",
    });
  }

  try {
    const candidate = await readCandidate(supabase, safeCandidateId);

    if (!candidate) {
      return buildFailureResult({
        candidateId: safeCandidateId,
        reason: "unknown_failure",
        message: "candidate not found",
        step: "fetch_candidate",
      });
    }

    if (candidate.status === "seeded") {
      const normalized = classifySeedFailure({
        ok: true,
        reason: "duplicate_edge_reused",
        message: "Candidate already seeded.",
        chargeAttempted: true,
        chargeSuccess: true,
        seedAttempted: true,
        seedSuccess: true,
      });

      return {
        ok: normalized.ok,
        status: normalized.status,
        reason: normalized.reason,
        candidateId: candidate.id,
        bridgePid: asString(asObject(candidate.metadata).bridge_pid) || null,
        targetPid: candidate.target_pid,
        targetName: candidate.target_name,
        trust: 70,
        tier: 50,
        edgeLabel: "graph_expansion_bridge",
        chargeAttempted: true,
        chargeSuccess: true,
        seedAttempted: true,
        seedSuccess: true,
        coinCost: 0,
        balanceBefore: null,
        balanceAfter: null,
        warning: "candidate already seeded",
        message: "Candidate already seeded.",
      };
    }

    if (candidate.status === "archived") {
      return buildFailureResult({
        candidateId: candidate.id,
        targetPid: candidate.target_pid,
        targetName: candidate.target_name,
        reason: "unknown_failure",
        message: "Archived candidate cannot be seeded.",
        step: "validate_candidate_status",
      });
    }

    const targetPid = asString(candidate.target_pid);

    if (!isValidTargetPid(targetPid)) {
      return buildFailureResult({
        candidateId: candidate.id,
        targetPid: candidate.target_pid,
        targetName: candidate.target_name,
        reason: "invalid_target_pid",
        message: "target pid missing or invalid",
        step: "validate_target_pid",
      });
    }

    const bridgePid = buildBridgePid(candidate);
    const bridgeDisplayName = buildBridgeDisplayName(candidate);
    const targetDisplayName = buildTargetDisplayName(candidate);

    const trust = 70;
    const tier = 50;
    const edgeLabel = "graph_expansion_bridge";

    console.log(`${logPrefix} resolved values`, {
      bridgePid,
      bridgeDisplayName,
      targetPid,
      targetDisplayName,
      trust,
      tier,
      edgeLabel,
    });

    const bridgeUpsertResult = await tryUpsertDlPeople({
      supabase,
      pid: bridgePid,
      displayName: bridgeDisplayName,
      category: "person",
      country: "unknown",
      city: candidate.bridge_city ?? null,
      school: candidate.bridge_school ?? null,
      company: candidate.bridge_company ?? null,
      logPrefix: `${logPrefix}[bridge]`,
    });

    if (!bridgeUpsertResult.ok) {
      return buildFailureResult({
        candidateId: candidate.id,
        bridgePid,
        targetPid,
        targetName: candidate.target_name,
        reason: "internal_api_failed",
        message: `bridge upsert failed: ${bridgeUpsertResult.error}`,
        step: "upsert_bridge_person",
      });
    }

    const targetUpsertResult = await tryUpsertDlPeople({
      supabase,
      pid: targetPid,
      displayName: targetDisplayName,
      category: asString(candidate.target_category) || "unknown",
      country: asString(candidate.target_country) || "unknown",
      city: null,
      school: null,
      company: null,
      logPrefix: `${logPrefix}[target]`,
    });

    if (!targetUpsertResult.ok) {
      return buildFailureResult({
        candidateId: candidate.id,
        bridgePid,
        targetPid,
        targetName: candidate.target_name,
        reason: "internal_api_failed",
        message: `target upsert failed: ${targetUpsertResult.error}`,
        step: "upsert_target_person",
      });
    }

    const edgeRow = {
      from_pid: bridgePid,
      to_pid: targetPid,
      trust,
      tier,
      label: edgeLabel,
      status: "accepted",
    };

    const edgeResult = await ensureEdge({
      supabase,
      edgeRow,
      logPrefix,
    });

    if (!edgeResult.ok) {
      return buildFailureResult({
        candidateId: candidate.id,
        bridgePid,
        targetPid,
        targetName: candidate.target_name,
        reason: "internal_api_failed",
        message: `edge insert failed: ${edgeResult.error}`,
        step: edgeResult.step,
        details: edgeRow,
      });
    }

    const duplicateReused = !edgeResult.inserted;

    console.log(`${logPrefix} seed log insert start`);

    const seedLogRow = {
      owner_user_id: candidate.owner_user_id,
      candidate_id: candidate.id,
      bridge_pid: bridgePid,
      target_pid: targetPid,
      trust,
      tier,
      edge_label: edgeLabel,
      result: duplicateReused ? "duplicate_edge_reused" : "success",
      error_message: null,
    };

    const { error: seedLogError } = await supabase
      .from("dl_graph_seed_logs")
      .insert(seedLogRow);

    if (seedLogError) {
      return buildFailureResult({
        candidateId: candidate.id,
        bridgePid,
        targetPid,
        targetName: candidate.target_name,
        reason: "seed_log_failed",
        message: `seed log insert failed: ${seedLogError.message}`,
        step: "insert_seed_log",
        details: seedLogRow,
        chargeAttempted: true,
        chargeSuccess: true,
        seedAttempted: true,
        seedSuccess: true,
      });
    }

    const warningMessages = [
      bridgeUpsertResult.warning,
      targetUpsertResult.warning,
      duplicateReused ? "dl_edges existing edge reused" : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const reason: SeedFailureReason = duplicateReused
      ? "duplicate_edge_reused"
      : "success";

    const normalized = classifySeedFailure({
      ok: true,
      reason,
      message: duplicateReused ? "existing edge reused" : "seed success",
      chargeAttempted: true,
      chargeSuccess: true,
      seedAttempted: true,
      seedSuccess: true,
    });

    const nextMetadata = mergeMetadata(candidate.metadata, {
      bridge_pid: bridgePid,
      seed_result: {
        seeded_at: new Date().toISOString(),
        bridge_pid: bridgePid,
        target_pid: targetPid,
        trust,
        tier,
        edge_label: edgeLabel,
        result: reason,
        chargeAttempted: true,
        chargeSuccess: true,
        seedAttempted: true,
        seedSuccess: true,
        coinCost: 0,
        balanceBefore: null,
        balanceAfter: null,
        warning: warningMessages || null,
        status: normalized.status,
        reason: normalized.reason,
      },
    });

    const { error: candidateUpdateError } = await supabase
      .from("dl_graph_expansion_candidates")
      .update({
        status: "seeded",
        metadata: nextMetadata,
      })
      .eq("id", candidate.id);

    if (candidateUpdateError) {
      return buildFailureResult({
        candidateId: candidate.id,
        bridgePid,
        targetPid,
        targetName: candidate.target_name,
        reason: "candidate_update_failed",
        message: `candidate update failed: ${candidateUpdateError.message}`,
        step: "update_candidate_status",
        chargeAttempted: true,
        chargeSuccess: true,
        seedAttempted: true,
        seedSuccess: true,
      });
    }

    return {
      ok: normalized.ok,
      status: normalized.status,
      reason: normalized.reason,
      candidateId: candidate.id,
      bridgePid,
      targetPid,
      targetName: candidate.target_name,
      trust,
      tier,
      edgeLabel,
      chargeAttempted: true,
      chargeSuccess: true,
      seedAttempted: true,
      seedSuccess: true,
      coinCost: 0,
      balanceBefore: null,
      balanceAfter: null,
      warning: warningMessages || null,
      message: duplicateReused ? "existing edge reused" : "seed success",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown server error";

    return buildFailureResult({
      candidateId: safeCandidateId,
      reason: "internal_api_failed",
      message,
      step: "catch",
    });
  }
}