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

function toHttpStatus(result: SeedRpcResult) {
  if (result.ok) {
    return 200;
  }

  if (result.reason === "candidate_not_found") {
    return 404;
  }

  if (result.reason === "invalid_seed_payload") {
    return 400;
  }

  if (result.reason === "insufficient_funds") {
    return 402;
  }

  return 500;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await context.params;
    const body = await request.json().catch(() => ({}));

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

    if (!candidateId) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          reason: "candidate_id_missing",
          candidateId: null,
          chargeAttempted: false,
          chargeSuccess: false,
          seedAttempted: false,
          seedSuccess: false,
          coinCost: 0,
          balanceBefore: null,
          balanceAfter: null,
          error: "candidateId is required",
        },
        { status: 400 }
      );
    }

    if (!ownerUserId) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          reason: "owner_user_id_missing",
          candidateId,
          chargeAttempted: false,
          chargeSuccess: false,
          seedAttempted: false,
          seedSuccess: false,
          coinCost: 0,
          balanceBefore: null,
          balanceAfter: null,
          error: "ownerUserId is required",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("dl_execute_graph_expansion_seed", {
      p_candidate_id: candidateId,
      p_owner_user_id: ownerUserId,
      p_seed_cost: seedCost,
    });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          reason: "seed_rpc_error",
          candidateId,
          chargeAttempted: false,
          chargeSuccess: false,
          seedAttempted: false,
          seedSuccess: false,
          coinCost: seedCost,
          balanceBefore: null,
          balanceAfter: null,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const result = data as SeedRpcResult;

    return NextResponse.json(result, {
      status: toHttpStatus(result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        reason: "seed_route_exception",
        candidateId: null,
        chargeAttempted: false,
        chargeSuccess: false,
        seedAttempted: false,
        seedSuccess: false,
        coinCost: 0,
        balanceBefore: null,
        balanceAfter: null,
        error: message,
      },
      { status: 500 }
    );
  }
}