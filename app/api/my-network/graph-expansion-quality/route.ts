import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  GraphExpansionCandidateRow,
  scoreCandidates,
} from "@/lib/graph-expansion/candidate-quality";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type LooseObject = Record<string, unknown>;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getOwnerUserIdFromUrl(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("ownerUserId");

  if (!raw || raw.trim().length === 0) {
    return FIXED_OWNER_USER_ID;
  }

  return raw.trim();
}

function asObject(value: unknown): LooseObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as LooseObject;
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
    const lower = value.toLowerCase();

    if (lower === "true") {
      return true;
    }

    if (lower === "false") {
      return false;
    }
  }

  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return fallback;
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

function firstDefined(values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function readNested(source: LooseObject, path: string[]): unknown {
  let current: unknown = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as LooseObject)[key];
  }

  return current;
}

function normalizeRows(data: unknown): GraphExpansionCandidateRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;

    return {
      id: typeof item.id === "string" ? item.id : "",
      status: typeof item.status === "string" ? item.status : "",
      source_type: typeof item.source_type === "string" ? item.source_type : "",
      owner_user_id:
        typeof item.owner_user_id === "string" ? item.owner_user_id : "",

      bridge_candidate_id:
        typeof item.bridge_candidate_id === "string"
          ? item.bridge_candidate_id
          : null,

      bridge_candidate_id_key:
        typeof item.bridge_candidate_id_key === "string"
          ? item.bridge_candidate_id_key
          : null,

      target_pid:
        typeof item.target_pid === "string" ? item.target_pid : null,

      target_name:
        typeof item.target_name === "string" ? item.target_name : null,

      target_category:
        typeof item.target_category === "string" ? item.target_category : null,

      target_country:
        typeof item.target_country === "string" ? item.target_country : null,

      bridge_name:
        typeof item.bridge_name === "string" ? item.bridge_name : null,

      bridge_city:
        typeof item.bridge_city === "string" ? item.bridge_city : null,

      bridge_school:
        typeof item.bridge_school === "string" ? item.bridge_school : null,

      bridge_company:
        typeof item.bridge_company === "string" ? item.bridge_company : null,

      match_score:
        typeof item.match_score === "number" ? item.match_score : null,

      match_label:
        typeof item.match_label === "string" ? item.match_label : null,

      preview_path_hint:
        typeof item.preview_path_hint === "string"
          ? item.preview_path_hint
          : null,

      expansion_reason:
        typeof item.expansion_reason === "string" ? item.expansion_reason : null,

      metadata:
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : {},

      created_at:
        typeof item.created_at === "string" ? item.created_at : null,
    };
  });
}

function deriveDuplicateRisk(params: {
  scoreItem: LooseObject;
  originalMetadata: LooseObject;
}): "safe" | "risky" {
  const { scoreItem, originalMetadata } = params;

  const quality = asObject(originalMetadata.quality);
  const duplicate = asObject(originalMetadata.duplicate);
  const operatorIntelligence = asObject(originalMetadata.operator_intelligence);

  const duplicateRisk = asString(
    firstDefined([
      scoreItem.duplicateRisk,
      scoreItem.duplicate_risk,
      readNested(scoreItem, ["duplicate", "risk"]),
      readNested(scoreItem, ["quality", "duplicateRisk"]),
      readNested(scoreItem, ["quality", "duplicate_risk"]),
      duplicate.risk,
      quality.duplicateRisk,
      quality.duplicate_risk,
      operatorIntelligence.duplicateRisk,
    ]),
    "",
  );

  if (duplicateRisk === "risky") {
    return "risky";
  }

  const duplicateGroupSize = asNumber(
    firstDefined([
      scoreItem.duplicateGroupSize,
      scoreItem.duplicate_group_size,
      quality.duplicateGroupSize,
      quality.duplicate_group_size,
    ]),
    1,
  );

  return duplicateGroupSize > 1 ? "risky" : "safe";
}

function deriveDangerous(params: {
  scoreItem: LooseObject;
  originalMetadata: LooseObject;
  duplicateRisk: "safe" | "risky";
  qualityScore: number;
  evidenceScore: number;
}): boolean {
  const {
    scoreItem,
    originalMetadata,
    duplicateRisk,
    qualityScore,
    evidenceScore,
  } = params;

  const safety = asObject(originalMetadata.safety);
  const operatorIntelligence = asObject(originalMetadata.operator_intelligence);

  const explicitDangerous = firstDefined([
    scoreItem.dangerous,
    scoreItem.dangerousFlag,
    scoreItem.dangerous_flag,
    readNested(scoreItem, ["safety", "dangerous"]),
    originalMetadata.dangerous,
    originalMetadata.dangerousFlag,
    originalMetadata.dangerous_flag,
    safety.dangerous,
    operatorIntelligence.dangerous,
  ]);

  if (explicitDangerous !== undefined) {
    return asBoolean(explicitDangerous, false);
  }

  if (
    duplicateRisk === "risky" &&
    qualityScore <= 55 &&
    evidenceScore <= 55
  ) {
    return true;
  }

  return false;
}

function deriveEvidenceScore(params: {
  scoreItem: LooseObject;
  originalMetadata: LooseObject;
  qualityScore: number;
}): number {
  const { scoreItem, originalMetadata, qualityScore } = params;

  const evidence = asObject(originalMetadata.evidence);
  const quality = asObject(originalMetadata.quality);
  const operatorIntelligence = asObject(originalMetadata.operator_intelligence);

  return clampScore(
    asNumber(
      firstDefined([
        scoreItem.evidenceScore,
        scoreItem.evidence_score,
        readNested(scoreItem, ["evidence", "score"]),
        readNested(scoreItem, ["evidence", "confidence"]),
        readNested(scoreItem, ["quality", "evidenceScore"]),
        readNested(scoreItem, ["quality", "evidence_score"]),
        evidence.score,
        evidence.evidenceScore,
        quality.evidenceScore,
        quality.evidence_score,
        operatorIntelligence.evidenceScore,
        qualityScore,
      ]),
      0,
    ),
  );
}

function deriveSeedImpactScore(params: {
  scoreItem: LooseObject;
  originalMetadata: LooseObject;
}): number {
  const { scoreItem, originalMetadata } = params;

  const seed = asObject(originalMetadata.seed);
  const scores = asObject(originalMetadata.scores);
  const operatorIntelligence = asObject(originalMetadata.operator_intelligence);

  return clampScore(
    asNumber(
      firstDefined([
        scoreItem.seedImpactScore,
        scoreItem.seed_impact_score,
        scoreItem.expectedExpansion,
        scoreItem.expected_expansion,
        readNested(scoreItem, ["seed", "impactScore"]),
        readNested(scoreItem, ["seed", "impact_score"]),
        readNested(scoreItem, ["operatorIntelligence", "seedImpactScore"]),
        originalMetadata.seedImpactScore,
        originalMetadata.seed_impact_score,
        originalMetadata.expectedExpansion,
        originalMetadata.expected_expansion,
        seed.impactScore,
        seed.impact_score,
        seed.expectedExpansion,
        scores.seedImpactScore,
        scores.seed_impact_score,
        operatorIntelligence.seedImpactScore,
        operatorIntelligence.expectedExpansion,
      ]),
      0,
    ),
  );
}

function buildPersistedMetadata(params: {
  originalRow: GraphExpansionCandidateRow;
  qualityItem: unknown;
}) {
  const scoreItem = asObject(params.qualityItem);
  const originalMetadata = asObject(params.originalRow.metadata);
  const qualityMetadata = asObject(originalMetadata.quality);
  const scoresMetadata = asObject(originalMetadata.scores);
  const evidenceMetadata = asObject(originalMetadata.evidence);
  const duplicateMetadata = asObject(originalMetadata.duplicate);
  const safetyMetadata = asObject(originalMetadata.safety);
  const seedMetadata = asObject(originalMetadata.seed);
  const operatorIntelligence = asObject(originalMetadata.operator_intelligence);

  const qualityScore = clampScore(
    asNumber(
      firstDefined([
        scoreItem.score,
        scoreItem.qualityScore,
        scoreItem.quality_score,
        qualityMetadata.score,
        originalMetadata.qualityScore,
        originalMetadata.quality_score,
        operatorIntelligence.qualityScore,
        params.originalRow.match_score,
      ]),
      0,
    ),
  );

  const evidenceScore = deriveEvidenceScore({
    scoreItem,
    originalMetadata,
    qualityScore,
  });

  const seedImpactScore = deriveSeedImpactScore({
    scoreItem,
    originalMetadata,
  });

  const duplicateRisk = deriveDuplicateRisk({
    scoreItem,
    originalMetadata,
  });

  const dangerous = deriveDangerous({
    scoreItem,
    originalMetadata,
    duplicateRisk,
    qualityScore,
    evidenceScore,
  });

  const now = new Date().toISOString();

  return {
    ...originalMetadata,

    qualityScore,
    evidenceScore,
    seedImpactScore,
    duplicateRisk,
    dangerous,

    quality_score: qualityScore,
    evidence_score: evidenceScore,
    seed_impact_score: seedImpactScore,
    duplicate_risk: duplicateRisk,
    dangerous_flag: dangerous,

    scores: {
      ...scoresMetadata,
      qualityScore,
      quality_score: qualityScore,
      evidenceScore,
      evidence_score: evidenceScore,
      seedImpactScore,
      seed_impact_score: seedImpactScore,
      persisted_at: now,
    },

    quality: {
      ...qualityMetadata,
      score: qualityScore,
      label: asString(
        firstDefined([scoreItem.label, qualityMetadata.label]),
        "",
      ),
      normalizedTargetName: firstDefined([
        scoreItem.normalizedTargetName,
        qualityMetadata.normalizedTargetName,
      ]),
      normalizedBridgeName: firstDefined([
        scoreItem.normalizedBridgeName,
        qualityMetadata.normalizedBridgeName,
      ]),
      aliasKeys: firstDefined([scoreItem.aliasKeys, qualityMetadata.aliasKeys]),
      dedupKey: firstDefined([scoreItem.dedupKey, qualityMetadata.dedupKey]),
      duplicateGroupSize: asNumber(
        firstDefined([
          scoreItem.duplicateGroupSize,
          qualityMetadata.duplicateGroupSize,
        ]),
        1,
      ),
      duplicateIds: firstDefined([
        scoreItem.duplicateIds,
        qualityMetadata.duplicateIds,
      ]),
      evidence: firstDefined([scoreItem.evidence, qualityMetadata.evidence]),
      evidenceScore,
      evidence_score: evidenceScore,
      duplicateRisk,
      duplicate_risk: duplicateRisk,
      scored_at: now,
    },

    evidence: {
      ...evidenceMetadata,
      score: evidenceScore,
      evidenceScore,
      evidence_score: evidenceScore,
      updated_at: now,
    },

    duplicate: {
      ...duplicateMetadata,
      risk: duplicateRisk,
      duplicateRisk,
      duplicate_risk: duplicateRisk,
      updated_at: now,
    },

    safety: {
      ...safetyMetadata,
      dangerous,
      dangerous_flag: dangerous,
      updated_at: now,
    },

    seed: {
      ...seedMetadata,
      impactScore: seedImpactScore,
      impact_score: seedImpactScore,
      expectedExpansion: seedImpactScore,
      expected_expansion: seedImpactScore,
      updated_at: now,
    },

    operator_intelligence: {
      ...operatorIntelligence,
      qualityScore,
      evidenceScore,
      seedImpactScore,
      duplicateRisk,
      dangerous,
      persistedAt: now,
    },
  };
}

export async function GET(req: Request) {
  try {
    const ownerUserId = getOwnerUserIdFromUrl(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const supabase = getAdminClient();

    let query = supabase
      .from("dl_graph_expansion_candidates")
      .select(
        [
          "id",
          "status",
          "source_type",
          "owner_user_id",
          "bridge_candidate_id",
          "bridge_candidate_id_key",
          "target_pid",
          "target_name",
          "target_category",
          "target_country",
          "bridge_name",
          "bridge_city",
          "bridge_school",
          "bridge_company",
          "match_score",
          "match_label",
          "preview_path_hint",
          "expansion_reason",
          "metadata",
          "created_at",
        ].join(","),
      )
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false });

    if (status && status.trim().length > 0) {
      query = query.eq("status", status.trim());
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Supabase select failed: ${error.message}`,
        },
        { status: 500 },
      );
    }

    const rows = normalizeRows(data);
    const qualityResults = scoreCandidates(rows);

    const qualityMap = new Map(
      qualityResults.map((item) => [item.candidateId, item]),
    );

    const items = rows.map((row) => {
      return {
        ...row,
        quality: qualityMap.get(row.id) ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      ownerUserId,
      count: items.length,
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `GET graph-expansion-quality failed: ${error.message}`
            : "GET graph-expansion-quality failed: Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const ownerUserId =
      typeof body?.ownerUserId === "string" && body.ownerUserId.trim().length > 0
        ? body.ownerUserId.trim()
        : FIXED_OWNER_USER_ID;

    const candidateIds =
      Array.isArray(body?.candidateIds) && body.candidateIds.length > 0
        ? body.candidateIds.filter(
            (value: unknown): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
        : null;

    const supabase = getAdminClient();

    let query = supabase
      .from("dl_graph_expansion_candidates")
      .select(
        [
          "id",
          "status",
          "source_type",
          "owner_user_id",
          "bridge_candidate_id",
          "bridge_candidate_id_key",
          "target_pid",
          "target_name",
          "target_category",
          "target_country",
          "bridge_name",
          "bridge_city",
          "bridge_school",
          "bridge_company",
          "match_score",
          "match_label",
          "preview_path_hint",
          "expansion_reason",
          "metadata",
          "created_at",
        ].join(","),
      )
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false });

    if (candidateIds && candidateIds.length > 0) {
      query = query.in("id", candidateIds);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Supabase select failed: ${error.message}`,
        },
        { status: 500 },
      );
    }

    const rows = normalizeRows(data);
    const qualityResults = scoreCandidates(rows);

    const updatedResults: typeof qualityResults = [];

    for (const item of qualityResults) {
      const originalRow = rows.find((row) => row.id === item.candidateId);

      if (!originalRow) {
        continue;
      }

      const nextMetadata = buildPersistedMetadata({
        originalRow,
        qualityItem: item,
      });

      const nextQualityScore = clampScore(
        asNumber(
          firstDefined([
            nextMetadata.qualityScore,
            nextMetadata.quality_score,
            readNested(asObject(nextMetadata), ["quality", "score"]),
            item.score,
          ]),
          0,
        ),
      );

      const nextQualityLabel = asString(
        firstDefined([
          item.label,
          readNested(asObject(nextMetadata), ["quality", "label"]),
          originalRow.match_label,
        ]),
        "",
      );

      const { error: updateError } = await supabase
        .from("dl_graph_expansion_candidates")
        .update({
          match_score: nextQualityScore,
          match_label: nextQualityLabel,
          metadata: nextMetadata,
        })
        .eq("id", item.candidateId)
        .eq("owner_user_id", ownerUserId);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Supabase update failed for candidate ${item.candidateId}: ${updateError.message}`,
          },
          { status: 500 },
        );
      }

      updatedResults.push(item);
    }

    return NextResponse.json({
      ok: true,
      ownerUserId,
      count: updatedResults.length,
      results: updatedResults,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `POST graph-expansion-quality failed: ${error.message}`
            : "POST graph-expansion-quality failed: Unknown error",
      },
      { status: 500 },
    );
  }
}