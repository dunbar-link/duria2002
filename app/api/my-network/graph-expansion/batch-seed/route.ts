import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const candidateIds = Array.isArray(body?.candidateIds) ? body.candidateIds : [];
    const ownerUserId =
      body?.ownerUserId ??
      body?.owner_user_id ??
      "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

    const seedCost =
      typeof body?.seedCost === "number"
        ? body.seedCost
        : typeof body?.coinCost === "number"
        ? body.coinCost
        : 10;

    if (!candidateIds.length) {
      return NextResponse.json(
        {
          ok: false,
          count: 0,
          results: [],
          error: "candidateIds is required",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const results: SeedRpcResult[] = [];

    for (const candidateId of candidateIds) {
      const { data, error } = await supabase.rpc("dl_execute_graph_expansion_seed", {
        p_candidate_id: candidateId,
        p_owner_user_id: ownerUserId,
        p_seed_cost: seedCost,
      });

      if (error) {
        results.push({
          ok: false,
          status: "failed",
          reason: "seed_rpc_error",
          candidateId,
          bridgePid: null,
          targetPid: null,
          targetName: null,
          trust: null,
          tier: null,
          edgeLabel: null,
          chargeAttempted: false,
          chargeSuccess: false,
          seedAttempted: false,
          seedSuccess: false,
          coinCost: seedCost,
          balanceBefore: null,
          balanceAfter: null,
          error: error.message,
        });
        continue;
      }

      results.push(data as SeedRpcResult);
    }

    const successCount = results.filter((item) => item.ok).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({
      ok: failureCount === 0,
      count: results.length,
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    return NextResponse.json(
      {
        ok: false,
        count: 0,
        results: [],
        error: message,
      },
      { status: 500 }
    );
  }
}