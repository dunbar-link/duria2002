import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CandidateStatus =
  | "queued"
  | "reviewing"
  | "approved"
  | "rejected"
  | "seeded"
  | "archived";

type GraphExpansionCandidateRow = {
  id: string;
  status: CandidateStatus;
  source_type: "approved_bridge" | "manual" | "operator";
  owner_user_id: string;
  bridge_candidate_id: string | null;
  bridge_candidate_id_key: string;
  target_pid: string;
  target_name: string | null;
  target_category: string | null;
  target_country: string | null;
  bridge_name: string | null;
  bridge_city: string | null;
  bridge_school: string | null;
  bridge_company: string | null;
  match_score: number;
  match_label: string | null;
  preview_path_hint: string | null;
  expansion_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const ALLOWED_STATUS: CandidateStatus[] = [
  "queued",
  "reviewing",
  "approved",
  "rejected",
  "seeded",
  "archived",
];

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isAllowedStatus(value: unknown): value is CandidateStatus {
  return typeof value === "string" && ALLOWED_STATUS.includes(value as CandidateStatus);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ candidateId: string }> }
) {
  try {
    const supabase = getAdminClient();
    const { candidateId } = await context.params;

    const { data, error } = await supabase
      .from("dl_graph_expansion_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: error.code === "PGRST116" ? 404 : 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: data as GraphExpansionCandidateRow,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error in graph expansion candidate GET.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ candidateId: string }> }
) {
  try {
    const supabase = getAdminClient();
    const { candidateId } = await context.params;
    const body = await req.json();

    const nextStatus = body?.status;
    const ownerUserId =
      typeof body?.ownerUserId === "string" ? body.ownerUserId.trim() : "";

    if (!ownerUserId) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId is required.",
        },
        { status: 400 }
      );
    }

    if (!isAllowedStatus(nextStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid status. Allowed: queued, reviewing, approved, rejected, seeded, archived.",
        },
        { status: 400 }
      );
    }

    const { data: current, error: loadError } = await supabase
      .from("dl_graph_expansion_candidates")
      .select("*")
      .eq("id", candidateId)
      .eq("owner_user_id", ownerUserId)
      .single();

    if (loadError || !current) {
      return NextResponse.json(
        {
          ok: false,
          error: loadError?.message ?? "Candidate not found.",
        },
        { status: 404 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("dl_graph_expansion_candidates")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId)
      .eq("owner_user_id", ownerUserId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          error: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: updated as GraphExpansionCandidateRow,
      previousStatus: current.status,
      nextStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error in graph expansion candidate PATCH.",
      },
      { status: 500 }
    );
  }
}