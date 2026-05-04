import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{
    candidateId: string;
  }>;
};

type UpdateStatusBody = {
  nextStatus?: "queued" | "reviewing" | "approved" | "rejected";
};

const ALLOWED_NEXT_STATUS = new Set([
  "queued",
  "reviewing",
  "approved",
  "rejected",
] as const);

export async function POST(req: Request, context: RouteContext) {
  try {
    const { candidateId } = await context.params;
    const safeCandidateId = String(candidateId ?? "").trim();

    if (!safeCandidateId) {
      return NextResponse.json(
        {
          ok: false,
          error: "candidateId is required.",
        },
        { status: 400 }
      );
    }

    const body = (await req.json()) as UpdateStatusBody;
    const nextStatus = String(body?.nextStatus ?? "").trim();

    if (!ALLOWED_NEXT_STATUS.has(nextStatus as never)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "nextStatus must be one of: queued, reviewing, approved, rejected.",
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Supabase environment variables.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: existingRow, error: selectError } = await supabase
      .from("dl_graph_expansion_candidates")
      .select(
        `
          id,
          status,
          owner_user_id,
          target_pid,
          target_name,
          bridge_name,
          match_score,
          metadata,
          updated_at
        `
      )
      .eq("id", safeCandidateId)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json(
        {
          ok: false,
          error: selectError.message,
        },
        { status: 500 }
      );
    }

    if (!existingRow) {
      return NextResponse.json(
        {
          ok: false,
          error: "Candidate not found.",
        },
        { status: 404 }
      );
    }

    if (existingRow.status === "seeded" || existingRow.status === "archived") {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot change status from ${existingRow.status}.`,
        },
        { status: 400 }
      );
    }

    const nextMetadata =
      existingRow.metadata && typeof existingRow.metadata === "object"
        ? {
            ...existingRow.metadata,
            review_status_changed_at: new Date().toISOString(),
            review_status_changed_to: nextStatus,
          }
        : {
            review_status_changed_at: new Date().toISOString(),
            review_status_changed_to: nextStatus,
          };

    const { data: updatedRow, error: updateError } = await supabase
      .from("dl_graph_expansion_candidates")
      .update({
        status: nextStatus,
        metadata: nextMetadata,
      })
      .eq("id", safeCandidateId)
      .select(
        `
          id,
          status,
          owner_user_id,
          target_pid,
          target_name,
          bridge_name,
          match_score,
          metadata,
          updated_at
        `
      )
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
      item: updatedRow,
      message: `Candidate status updated to ${nextStatus}.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}