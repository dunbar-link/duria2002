export type GraphExpansionCandidateRow = {
  id: string;
  status: string;
  source_type: string;
  owner_user_id: string;

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

  created_at: string | null;
};

export type CandidateQualityResult = {
  candidateId: string;
  score: number;
  label: "high" | "medium" | "low";

  evidenceScore: number;
  seedImpactScore: number;
  duplicateRisk: "safe" | "risky";
  dangerous: boolean;

  normalizedTargetName: string;
  normalizedBridgeName: string;
  aliasKeys: string[];
  dedupKey: string;
  duplicateGroupSize: number;
  duplicateIds: string[];

  evidence: {
    hasTargetPid: boolean;
    hasTargetName: boolean;
    hasBridgeName: boolean;
    hasBridgeCity: boolean;
    hasBridgeSchool: boolean;
    hasBridgeCompany: boolean;
    hasPreviewPathHint: boolean;
    hasExpansionReason: boolean;
    sourceTypeBoost: number;
    statusPenalty: number;
    duplicatePenalty: number;
    aliasStrength: number;
  };
};

const PERSON_ALIAS_MAP: Record<string, string[]> = {
  robert: ["rob", "bob", "bobby"],
  william: ["will", "bill", "billy"],
  richard: ["rich", "rick", "dick"],
  james: ["jim", "jimmy"],
  michael: ["mike", "mikey"],
  joseph: ["joe", "joey"],
  thomas: ["tom", "tommy"],
  daniel: ["dan", "danny"],
  anthony: ["tony"],
  christopher: ["chris"],
  alexander: ["alex"],
  benjamin: ["ben", "benny"],
  elizabeth: ["liz", "beth", "lizzy", "eliza"],
  katherine: ["kate", "katie", "kathy"],
  jennifer: ["jen", "jenny"],
  margaret: ["maggie", "meg", "peggy"],
  steven: ["steve"],
  stephen: ["steve"],
};

const ORG_STOP_WORDS = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "plc",
  "group",
  "holdings",
  "holding",
  "the",
]);

function safeString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeBase(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePersonName(value: string): string {
  return normalizeBase(value);
}

function normalizeOrgName(value: string): string {
  const parts = normalizeBase(value)
    .split(" ")
    .filter(Boolean)
    .filter((part) => !ORG_STOP_WORDS.has(part));

  return parts.join(" ");
}

function splitWords(value: string): string[] {
  return value
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildPersonAliasKeys(name: string): string[] {
  const normalized = normalizePersonName(name);

  if (!normalized) {
    return [];
  }

  const words = splitWords(normalized);

  if (words.length === 0) {
    return [];
  }

  const first = words[0];
  const remain = words.slice(1).join(" ");
  const aliasCandidates = new Set<string>();

  aliasCandidates.add(normalized);

  const mappedAliases = PERSON_ALIAS_MAP[first] ?? [];

  for (const alias of mappedAliases) {
    aliasCandidates.add([alias, remain].filter(Boolean).join(" ").trim());
  }

  for (const [formal, aliases] of Object.entries(PERSON_ALIAS_MAP)) {
    if (aliases.includes(first)) {
      aliasCandidates.add([formal, remain].filter(Boolean).join(" ").trim());
    }
  }

  return Array.from(aliasCandidates).filter(Boolean);
}

function buildAliasKeys(name: string, category?: string | null): string[] {
  const cleanCategory = safeString(category).toLowerCase();

  if (
    cleanCategory.includes("org") ||
    cleanCategory.includes("company") ||
    cleanCategory.includes("brand")
  ) {
    const orgName = normalizeOrgName(name);
    return orgName ? [orgName] : [];
  }

  return buildPersonAliasKeys(name);
}

function pickPrimaryNormalizedName(
  name: string,
  category?: string | null,
): string {
  const cleanCategory = safeString(category).toLowerCase();

  if (
    cleanCategory.includes("org") ||
    cleanCategory.includes("company") ||
    cleanCategory.includes("brand")
  ) {
    return normalizeOrgName(name);
  }

  return normalizePersonName(name);
}

function scoreToLabel(score: number): "high" | "medium" | "low" {
  if (score >= 80) {
    return "high";
  }

  if (score >= 50) {
    return "medium";
  }

  return "low";
}

function getSourceTypeBoost(sourceType: string): number {
  switch (safeString(sourceType)) {
    case "approved_bridge":
      return 16;
    case "operator":
      return 12;
    case "manual":
      return 8;
    default:
      return 4;
  }
}

function getStatusPenalty(status: string): number {
  switch (safeString(status)) {
    case "approved":
      return 0;
    case "reviewing":
      return 4;
    case "queued":
      return 8;
    case "seeded":
      return 0;
    case "rejected":
      return 30;
    case "archived":
      return 20;
    default:
      return 10;
  }
}

function buildDedupKey(row: GraphExpansionCandidateRow): {
  dedupKey: string;
  normalizedTargetName: string;
  normalizedBridgeName: string;
  aliasKeys: string[];
} {
  const targetName = safeString(row.target_name);
  const bridgeName = safeString(row.bridge_name);
  const targetCategory = safeString(row.target_category);
  const targetCountry = safeString(row.target_country);
  const targetPid = safeString(row.target_pid);
  const bridgeCity = safeString(row.bridge_city);
  const bridgeSchool = safeString(row.bridge_school);
  const bridgeCompany = safeString(row.bridge_company);

  const normalizedTargetName = pickPrimaryNormalizedName(
    targetName,
    targetCategory,
  );

  const normalizedBridgeName = normalizePersonName(bridgeName);
  const aliasKeys = buildAliasKeys(targetName, targetCategory);

  const identityPart =
    targetPid || aliasKeys[0] || normalizedTargetName || "unknown-target";

  const bridgeContext = [
    normalizedBridgeName || "unknown-bridge",
    normalizeBase(bridgeCity) || "-",
    normalizeBase(bridgeSchool) || "-",
    normalizeBase(bridgeCompany) || "-",
  ].join("|");

  const dedupKey = [
    identityPart,
    normalizeBase(targetCountry) || "-",
    bridgeContext,
  ].join("::");

  return {
    dedupKey,
    normalizedTargetName,
    normalizedBridgeName,
    aliasKeys,
  };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Math.round(value);
}

function computeEvidenceScore(params: {
  hasTargetPid: boolean;
  hasTargetName: boolean;
  hasBridgeName: boolean;
  hasBridgeCity: boolean;
  hasBridgeSchool: boolean;
  hasBridgeCompany: boolean;
  hasPreviewPathHint: boolean;
  hasExpansionReason: boolean;
  sourceTypeBoost: number;
  aliasStrength: number;
}): number {
  let score = 0;

  if (params.hasTargetPid) score += 28;
  if (params.hasTargetName) score += 14;
  if (params.hasBridgeName) score += 10;
  if (params.hasBridgeCity) score += 8;
  if (params.hasBridgeSchool) score += 10;
  if (params.hasBridgeCompany) score += 10;
  if (params.hasPreviewPathHint) score += 8;
  if (params.hasExpansionReason) score += 6;

  score += params.sourceTypeBoost;
  score += params.aliasStrength;

  return clampScore(score);
}

function computeSeedImpactScore(params: {
  hasTargetPid: boolean;
  hasBridgeName: boolean;
  hasBridgeCity: boolean;
  hasBridgeSchool: boolean;
  hasBridgeCompany: boolean;
  hasPreviewPathHint: boolean;
  hasExpansionReason: boolean;
  sourceTypeBoost: number;
  duplicateGroupSize: number;
  status: string;
}): number {
  let score = 0;

  if (params.hasTargetPid) score += 10;
  if (params.hasBridgeName) score += 12;
  if (params.hasBridgeCity) score += 12;
  if (params.hasBridgeSchool) score += 18;
  if (params.hasBridgeCompany) score += 18;
  if (params.hasPreviewPathHint) score += 10;
  if (params.hasExpansionReason) score += 8;

  score += Math.min(params.sourceTypeBoost, 16);

  if (params.duplicateGroupSize > 1) {
    score -= Math.min((params.duplicateGroupSize - 1) * 8, 24);
  }

  switch (safeString(params.status)) {
    case "approved":
      score += 8;
      break;
    case "reviewing":
      score += 2;
      break;
    case "queued":
      score += 0;
      break;
    case "seeded":
      score += 4;
      break;
    case "archived":
      score -= 8;
      break;
    case "rejected":
      score -= 12;
      break;
    default:
      score -= 4;
      break;
  }

  return clampScore(score);
}

function computeDuplicateRisk(duplicateGroupSize: number): "safe" | "risky" {
  return duplicateGroupSize > 1 ? "risky" : "safe";
}

function computeDangerous(params: {
  qualityScore: number;
  evidenceScore: number;
  duplicateRisk: "safe" | "risky";
}): boolean {
  if (
    params.duplicateRisk === "risky" &&
    params.qualityScore <= 55 &&
    params.evidenceScore <= 55
  ) {
    return true;
  }

  return false;
}

export function scoreCandidate(
  row: GraphExpansionCandidateRow,
  duplicateGroupSize: number,
  duplicateIds: string[],
): CandidateQualityResult {
  const { dedupKey, normalizedTargetName, normalizedBridgeName, aliasKeys } =
    buildDedupKey(row);

  const hasTargetPid = safeString(row.target_pid).length > 0;
  const hasTargetName = safeString(row.target_name).length > 0;
  const hasBridgeName = safeString(row.bridge_name).length > 0;
  const hasBridgeCity = safeString(row.bridge_city).length > 0;
  const hasBridgeSchool = safeString(row.bridge_school).length > 0;
  const hasBridgeCompany = safeString(row.bridge_company).length > 0;
  const hasPreviewPathHint = safeString(row.preview_path_hint).length > 0;
  const hasExpansionReason = safeString(row.expansion_reason).length > 0;

  const sourceTypeBoost = getSourceTypeBoost(row.source_type);
  const statusPenalty = getStatusPenalty(row.status);
  const duplicatePenalty =
    duplicateGroupSize > 1 ? (duplicateGroupSize - 1) * 12 : 0;

  let aliasStrength = 0;

  if (aliasKeys.length >= 2) {
    aliasStrength = 10;
  } else if (aliasKeys.length === 1 && aliasKeys[0].length > 0) {
    aliasStrength = 6;
  }

  let score = 0;

  if (hasTargetPid) score += 28;
  if (hasTargetName) score += 16;
  if (hasBridgeName) score += 10;
  if (hasBridgeCity) score += 7;
  if (hasBridgeSchool) score += 10;
  if (hasBridgeCompany) score += 10;
  if (hasPreviewPathHint) score += 8;
  if (hasExpansionReason) score += 5;

  score += sourceTypeBoost;
  score += aliasStrength;
  score -= statusPenalty;
  score -= duplicatePenalty;

  const finalScore = clampScore(score);
  const label = scoreToLabel(finalScore);

  const evidenceScore = computeEvidenceScore({
    hasTargetPid,
    hasTargetName,
    hasBridgeName,
    hasBridgeCity,
    hasBridgeSchool,
    hasBridgeCompany,
    hasPreviewPathHint,
    hasExpansionReason,
    sourceTypeBoost,
    aliasStrength,
  });

  const seedImpactScore = computeSeedImpactScore({
    hasTargetPid,
    hasBridgeName,
    hasBridgeCity,
    hasBridgeSchool,
    hasBridgeCompany,
    hasPreviewPathHint,
    hasExpansionReason,
    sourceTypeBoost,
    duplicateGroupSize,
    status: row.status,
  });

  const duplicateRisk = computeDuplicateRisk(duplicateGroupSize);

  const dangerous = computeDangerous({
    qualityScore: finalScore,
    evidenceScore,
    duplicateRisk,
  });

  return {
    candidateId: row.id,
    score: finalScore,
    label,

    evidenceScore,
    seedImpactScore,
    duplicateRisk,
    dangerous,

    normalizedTargetName,
    normalizedBridgeName,
    aliasKeys,
    dedupKey,
    duplicateGroupSize,
    duplicateIds,

    evidence: {
      hasTargetPid,
      hasTargetName,
      hasBridgeName,
      hasBridgeCity,
      hasBridgeSchool,
      hasBridgeCompany,
      hasPreviewPathHint,
      hasExpansionReason,
      sourceTypeBoost,
      statusPenalty,
      duplicatePenalty,
      aliasStrength,
    },
  };
}

export function scoreCandidates(
  rows: GraphExpansionCandidateRow[],
): CandidateQualityResult[] {
  const dedupMap = new Map<string, string[]>();

  for (const row of rows) {
    const { dedupKey } = buildDedupKey(row);
    const ids = dedupMap.get(dedupKey) ?? [];
    ids.push(row.id);
    dedupMap.set(dedupKey, ids);
  }

  return rows.map((row) => {
    const { dedupKey } = buildDedupKey(row);
    const duplicateIds = dedupMap.get(dedupKey) ?? [row.id];

    return scoreCandidate(row, duplicateIds.length, duplicateIds);
  });
}