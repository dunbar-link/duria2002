// C:\work\nextjs-server\lib\graph-expansion\seed-failure-taxonomy.ts

export type SeedFailureReason =
  | "success"
  | "partial"
  | "insufficient_balance"
  | "duplicate_edge_reused"
  | "seed_log_failed"
  | "candidate_update_failed"
  | "internal_api_failed"
  | "network_timeout"
  | "invalid_target_pid"
  | "bridge_not_found"
  | "unknown_failure";

export type SeedOutcomeStatus =
  | "success"
  | "partial"
  | "failed";

export type NormalizedSeedResult = {
  ok: boolean;
  status: SeedOutcomeStatus;
  reason: SeedFailureReason;
  httpStatus: number;
};

function lower(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function hasAny(value: unknown, keywords: string[]) {
  const text = lower(value);

  return keywords.some((keyword) => text.includes(keyword));
}

export function deriveHttpStatusFromReason(reason: SeedFailureReason) {
  switch (reason) {
    case "success":
    case "duplicate_edge_reused":
      return 200;

    case "partial":
      return 207;

    case "insufficient_balance":
      return 402;

    case "invalid_target_pid":
      return 400;

    case "bridge_not_found":
      return 404;

    case "network_timeout":
      return 504;

    case "seed_log_failed":
    case "candidate_update_failed":
    case "internal_api_failed":
    case "unknown_failure":
    default:
      return 500;
  }
}

export function deriveStatusFromReason(
  reason: SeedFailureReason,
): SeedOutcomeStatus {
  switch (reason) {
    case "success":
    case "duplicate_edge_reused":
      return "success";

    case "partial":
      return "partial";

    default:
      return "failed";
  }
}

export function makeResult(reason: SeedFailureReason): NormalizedSeedResult {
  return {
    ok: reason === "success" || reason === "duplicate_edge_reused",
    status: deriveStatusFromReason(reason),
    reason,
    httpStatus: deriveHttpStatusFromReason(reason),
  };
}

export function classifySeedFailure(params: {
  ok?: boolean | null;
  status?: unknown;
  error?: unknown;
  reason?: unknown;
  message?: unknown;
  raw?: unknown;
  chargeAttempted?: boolean | null;
  chargeSuccess?: boolean | null;
  seedAttempted?: boolean | null;
  seedSuccess?: boolean | null;
}) {
  const ok = params.ok === true;
  const seedSuccess = params.seedSuccess === true;
  const chargeSuccess = params.chargeSuccess === true;

  const joined = [
    params.status,
    params.error,
    params.reason,
    params.message,
    JSON.stringify(params.raw ?? {}),
  ]
    .map((item) => lower(item))
    .join(" ");

  if (
    ok &&
    seedSuccess &&
    !hasAny(joined, ["duplicate", "already exists", "reused"])
  ) {
    return makeResult("success");
  }

  if (
    hasAny(joined, [
      "insufficient_balance",
      "insufficient balance",
      "balance too low",
      "not enough balance",
      "coin balance",
    ])
  ) {
    return makeResult("insufficient_balance");
  }

  if (
    hasAny(joined, [
      "duplicate_edge_reused",
      "duplicate edge reused",
      "edge already exists",
      "already exists",
      "duplicate edge",
      "reused existing edge",
    ])
  ) {
    return makeResult("duplicate_edge_reused");
  }

  if (
    hasAny(joined, [
      "seed_log_failed",
      "failed to write seed log",
      "log insert failed",
      "execution log failed",
      "seed log failed",
    ])
  ) {
    return makeResult("seed_log_failed");
  }

  if (
    hasAny(joined, [
      "candidate_update_failed",
      "candidate update failed",
      "failed to update candidate",
      "candidate status update failed",
    ])
  ) {
    return makeResult("candidate_update_failed");
  }

  if (
    hasAny(joined, [
      "network_timeout",
      "timeout",
      "timed out",
      "aborted",
      "aborterror",
    ])
  ) {
    return makeResult("network_timeout");
  }

  if (
    hasAny(joined, [
      "invalid_target_pid",
      "invalid target pid",
      "target pid is invalid",
      "missing target pid",
      "target_pid",
    ])
  ) {
    return makeResult("invalid_target_pid");
  }

  if (
    hasAny(joined, [
      "bridge_not_found",
      "bridge not found",
      "missing bridge",
      "source bridge not found",
      "bridge_candidate_id",
    ])
  ) {
    return makeResult("bridge_not_found");
  }

  if (
    hasAny(joined, [
      "internal_api_failed",
      "internal api failed",
      "upstream api failed",
      "fetch failed",
      "unexpected response",
      "batch seed failed",
    ])
  ) {
    return makeResult("internal_api_failed");
  }

  if (chargeSuccess && !seedSuccess) {
    return makeResult("partial");
  }

  if (ok && seedSuccess) {
    return makeResult("success");
  }

  return makeResult("unknown_failure");
}