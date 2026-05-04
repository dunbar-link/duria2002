// C:\work\nextjs-server\app\api\my-network\graph-expansion-operator\create-safe-approved-test-candidate\route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey);
}

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

    candidateQuality: {
      score: 96,
      label: "high",
    },

    candidateEvidence: {
      score: 91,
      label: "high",
    },

    operatorIntelligence: {
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

    preview: {
      targetPid,
      purpose: "execute_mode_validation",
    },

    testScenario: {
      mode: "safe-approved-seed-ready",
      createdAt: now,
      note: "This row is intentionally created to validate execute mode auto seed flow.",
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CreatePayload;

    const ownerUserId = body.ownerUserId || FIXED_OWNER_USER_ID;
    const createdAtKey = Date.now().toString();
    const targetSlug = `safe-auto-seed-test-${createdAtKey}`;
    const targetPid = `celeb:${targetSlug}`;

    const targetName = body.targetName || `Safe Auto Seed Test ${createdAtKey}`;
    const targetCountry = body.targetCountry || "KR";

    const bridgeName = body.bridgeName || "Operator Safe Test Bridge";
    const bridgeCity = body.bridgeCity || "Busan";
    const bridgeSchool = body.bridgeSchool || "Test University";
    const bridgeCompany = body.bridgeCompany || "Dunbar Link Test Company";

    const metadata = buildSafeMetadata(targetPid);

    const supabase = createSupabaseAdmin();

    const insertPayload = {
      status: "approved",
      source_type: "operator",
      owner_user_id: ownerUserId,

      bridge_candidate_id: null,
      bridge_candidate_id_key: `safe-seed-test-${createdAtKey}`,

      target_pid: targetPid,
      target_name: targetName,
      target_category: "public_figure",
      target_country: targetCountry,

      bridge_name: bridgeName,
      bridge_city: bridgeCity,
      bridge_school: bridgeSchool,
      bridge_company: bridgeCompany,

      match_score: 98,
      match_label: "high",

      preview_path_hint: `/my-network/graph-expansion-operator/auto-execute?targetPid=${encodeURIComponent(
        targetPid,
      )}`,
      expansion_reason: "safe approved seedReady=true execute verification row",

      metadata,
    };

    const { data, error } = await supabase
      .from("dl_graph_expansion_candidates")
      .insert(insertPayload)
      .select(
        `
        id,
        owner_user_id,
        status,
        source_type,
        target_pid,
        target_name,
        target_category,
        target_country,
        bridge_name,
        bridge_city,
        bridge_school,
        bridge_company,
        metadata,
        created_at
      `,
      )
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          step: "insert_test_candidate",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "safe approved seedReady=true 테스트 후보 생성 완료",
      candidate: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}