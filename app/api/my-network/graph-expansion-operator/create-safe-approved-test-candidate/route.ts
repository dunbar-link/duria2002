import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type CreatePayload = {
  ownerUserId?: string;
  targetName?: string;
  targetCountry?: string;
  bridgeName?: string;
  bridgeCity?: string;
  bridgeSchool?: string;
  bridgeCompany?: string;
};

function buildSafeMetadata(targetPid: string) {
  const now = new Date().toISOString();

  return {
    source: "operator_safe_seed_test",
    test: true,
    createdBy: "create-safe-approved-test-candidate",
    requestedBy: "operator-test-page",
    qualityScore: 96,
    evidenceScore: 91,
    seedImpactScore: 88,
    duplicateRisk: "safe",
    dangerous: false,
    riskLevel: "safe",
    recommendedAction: "seed",
    priorityScore: 94,
    expectedExpansion: "high",
    seedReady: true,
    candidateQuality: { score: 96, label: "high" },
    candidateEvidence: { score: 91, label: "high" },
    operatorIntelligence: {
      id: targetPid,
      qualityScore: 96,
      evidenceScore: 91,
      duplicateRisk: "safe",
      dangerous: false,
      riskLevel: "safe",
      recommendedAction: "seed",
      priorityScore: 94,
      expectedExpansion: "high",
      seedImpactScore: 88,
      seedReady: true,
    },
    autoSeed: {
      eligible: true,
      seedReady: true,
      riskLevel: "safe",
      recommendedAction: "seed",
      duplicateRisk: "safe",
      dangerous: false,
      reason: "forced_safe_test_candidate",
      lastPreparedAt: now,
    },
    preview: { targetPid, purpose: "execute_mode_validation" },
    testScenario: {
      mode: "safe-approved-seed-ready",
      createdAt: now,
      note: "This row is intentionally created to validate execute mode auto seed flow.",
    },
  };
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as CreatePayload;
    const ownerUserId = body.ownerUserId || FIXED_OWNER_USER_ID;
    const createdAtKey = Date.now().toString();
    const targetSlug = `safe-auto-seed-test-${createdAtKey}`;
    const targetPid = `celeb:${targetSlug}`;

    const insertPayload = {
      status: "approved",
      source_type: "operator",
      owner_user_id: ownerUserId,
      bridge_candidate_id: null,
      bridge_candidate_id_key: `safe-seed-test-${createdAtKey}`,
      target_pid: targetPid,
      target_name: body.targetName || `Safe Auto Seed Test ${createdAtKey}`,
      target_category: "public_figure",
      target_country: body.targetCountry || "KR",
      bridge_name: body.bridgeName || "Operator Safe Test Bridge",
      bridge_city: body.bridgeCity || "Busan",
      bridge_school: body.bridgeSchool || "Test University",
      bridge_company: body.bridgeCompany || "Dunbar Link Test Company",
      match_score: 98,
      match_label: "high",
      preview_path_hint: `/my-network/graph-expansion-operator/auto-execute?targetPid=${encodeURIComponent(targetPid)}`,
      expansion_reason: "safe approved seedReady=true execute verification row",
      metadata: buildSafeMetadata(targetPid),
    };

    const { data, error } = await supabase
      .from("dl_graph_expansion_candidates")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, step: "insert_test_candidate" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "safe approved seedReady=true test candidate created", candidate: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
