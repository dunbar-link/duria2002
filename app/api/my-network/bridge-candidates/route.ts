import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SaveBridgeCandidateBody = {
  ownerUserId?: string;
  otherOwnerUserId?: string | null;
  sourceType?: "overlap" | "manual" | "operator" | "path";
  status?: "saved" | "reviewing" | "approved" | "rejected" | "expanded" | "archived";
  bridgeName?: string | null;
  bridgeCity?: string | null;
  bridgeSchool?: string | null;
  bridgeCompany?: string | null;
  matchScore?: number | null;
  matchLabel?: string | null;
  evidenceSummary?: string | null;
  suggestedTargetPid?: string | null;
  suggestedTargetName?: string | null;
  previewPathHint?: string | null;
  metadata?: Record<string, unknown> | null;
};

type UpdateBridgeCandidateBody = {
  id?: string;
  ownerUserId?: string;
  status?: "saved" | "reviewing" | "approved" | "rejected" | "expanded" | "archived";
};

const ALLOWED_STATUS = new Set([
  "saved",
  "reviewing",
  "approved",
  "rejected",
  "expanded",
  "archived",
]);



  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function cleanText(value: unknown, maxLength = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeKey(value: unknown) {
  return cleanText(value, 300).toLowerCase().replace(/\s+/g, " ");
}

function toSafeScore(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 1000) return 1000;
  return Math.round(num);
}

function buildEvidenceSummary(input: {
  bridgeCity: string;
  bridgeSchool: string;
  bridgeCompany: string;
  matchScore: number;
  evidenceSummary: string;
}) {
  if (input.evidenceSummary) return input.evidenceSummary;

  const parts: string[] = [];

  if (input.bridgeSchool) {
    parts.push(`school=${input.bridgeSchool}`);
  }
  if (input.bridgeCompany) {
    parts.push(`company=${input.bridgeCompany}`);
  }
  if (input.bridgeCity) {
    parts.push(`city=${input.bridgeCity}`);
  }

  parts.push(`matchScore=${input.matchScore}`);

  return parts.join(" | ");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getsupabaseAdmin;
    const { searchParams } = new URL(req.url);

    const ownerUserId = cleanText(searchParams.get("ownerUserId"));
    const status = cleanText(searchParams.get("status"));
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

    if (!ownerUserId) {
      return NextResponse.json(
        { ok: false, error: "ownerUserId is required." },
        { status: 400 }
      );
    }

    let query = supabase
      .from("dl_bridge_candidates")
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
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      items: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getsupabaseAdmin;
    const body = (await req.json()) as SaveBridgeCandidateBody;

    const ownerUserId = cleanText(body.ownerUserId, 100);
    const otherOwnerUserId = cleanText(body.otherOwnerUserId, 100);
    const sourceType = cleanText(body.sourceType || "overlap", 50) || "overlap";
    const status = cleanText(body.status || "saved", 50) || "saved";

    const bridgeName = cleanText(body.bridgeName, 200);
    const bridgeCity = cleanText(body.bridgeCity, 200);
    const bridgeSchool = cleanText(body.bridgeSchool, 200);
    const bridgeCompany = cleanText(body.bridgeCompany, 200);

    const matchScore = toSafeScore(body.matchScore);
    const matchLabel = cleanText(body.matchLabel, 100);
    const suggestedTargetPid = cleanText(body.suggestedTargetPid, 200);
    const suggestedTargetName = cleanText(body.suggestedTargetName, 200);
    const previewPathHint = cleanText(body.previewPathHint, 300);
    const evidenceSummary = buildEvidenceSummary({
      bridgeCity,
      bridgeSchool,
      bridgeCompany,
      matchScore,
      evidenceSummary: cleanText(body.evidenceSummary, 500),
    });

    if (!ownerUserId) {
      return NextResponse.json(
        { ok: false, error: "ownerUserId is required." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status." },
        { status: 400 }
      );
    }

    if (!bridgeName && !bridgeSchool && !bridgeCompany) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "At least one bridge identity field is required: bridgeName, bridgeSchool, or bridgeCompany.",
        },
        { status: 400 }
      );
    }

    if (!suggestedTargetPid) {
      return NextResponse.json(
        { ok: false, error: "suggestedTargetPid is required." },
        { status: 400 }
      );
    }

    const payload = {
      owner_user_id: ownerUserId,
      other_owner_user_id: otherOwnerUserId || null,
      other_owner_user_id_key: otherOwnerUserId || "",
      source_type: sourceType,
      status,
      bridge_name: bridgeName,
      bridge_city: bridgeCity || null,
      bridge_school: bridgeSchool || null,
      bridge_company: bridgeCompany || null,
      bridge_name_key: normalizeKey(bridgeName),
      bridge_city_key: normalizeKey(bridgeCity),
      bridge_school_key: normalizeKey(bridgeSchool),
      bridge_company_key: normalizeKey(bridgeCompany),
      match_score: matchScore,
      match_label: matchLabel || null,
      evidence_summary: evidenceSummary || null,
      suggested_target_pid: suggestedTargetPid,
      suggested_target_name: suggestedTargetName || null,
      preview_path_hint: previewPathHint || null,
      metadata:
        body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("dl_bridge_candidates")
      .upsert(payload, {
        onConflict:
          "owner_user_id,other_owner_user_id_key,bridge_name_key,bridge_city_key,bridge_school_key,bridge_company_key,suggested_target_pid",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getsupabaseAdmin;
    const body = (await req.json()) as UpdateBridgeCandidateBody;

    const id = cleanText(body.id, 100);
    const ownerUserId = cleanText(body.ownerUserId, 100);
    const status = cleanText(body.status, 50);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id is required." },
        { status: 400 }
      );
    }

    if (!ownerUserId) {
      return NextResponse.json(
        { ok: false, error: "ownerUserId is required." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("dl_bridge_candidates")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_user_id", ownerUserId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Bridge candidate not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}

