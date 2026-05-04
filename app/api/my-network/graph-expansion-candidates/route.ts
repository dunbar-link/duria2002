import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type GraphExpansionCandidateRow = {
  id: string;
  status: "queued" | "reviewing" | "approved" | "rejected" | "seeded" | "archived";
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

function normalizeStatus(value: string | null) {
  if (!value) return null;

  const allowed = new Set([
    "queued",
    "reviewing",
    "approved",
    "rejected",
    "seeded",
    "archived",
  ]);

  return allowed.has(value) ? value : null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getAdminClient();

    const { searchParams } = new URL(req.url);

    const ownerUserId = searchParams.get("ownerUserId")?.trim() ?? "";
    const status = normalizeStatus(searchParams.get("status"));
    const limitRaw = Number(searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 200))
      : 100;

    if (!ownerUserId) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId is required.",
        },
        { status: 400 }
      );
    }

    let query = supabase
      .from("dl_graph_expansion_candidates")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      items: (data ?? []) as GraphExpansionCandidateRow[],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error in graph expansion candidates GET.",
      },
      { status: 500 }
    );
  }
}