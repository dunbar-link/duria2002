import { NextResponse } from "next/server";

type RequestType = "public_figure" | "private_person";

type CreateTargetRequestBody = {
  requestType?: RequestType;
  requestedName?: string;
  requestedQuery?: string;
  selectedPid?: string | null;
  requesterName?: string | null;
  note?: string | null;
  hintCity?: string | null;
  hintSchool?: string | null;
  hintCompany?: string | null;
  hintAgeBand?: string | null;
  knownBridgeHint?: string | null;
};

function normalizeRequestType(value?: string): RequestType {
  return value === "private_person" ? "private_person" : "public_figure";
}

function deriveAutoDecision(input: {
  requestType: RequestType;
  requestedName: string;
  hintCity?: string | null;
  hintSchool?: string | null;
  hintCompany?: string | null;
  hintAgeBand?: string | null;
  knownBridgeHint?: string | null;
}) {
  const signalCount = [
    input.hintCity,
    input.hintSchool,
    input.hintCompany,
    input.hintAgeBand,
    input.knownBridgeHint,
  ].filter((v) => Boolean(v && v.trim().length > 0)).length;

  if (input.requestType === "public_figure") {
    return {
      autoStatus: "seed_candidate",
      autoReason:
        "Public figure request should go to candidate queue for seed review and ingestion.",
    };
  }

  if (signalCount >= 2) {
    return {
      autoStatus: "candidate_ready",
      autoReason:
        "Private-person request has enough hints for candidate matching and network discovery.",
    };
  }

  return {
    autoStatus: "needs_more_info",
    autoReason:
      "Private-person request needs more hints such as city, school, company, age band, or bridge hint.",
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateTargetRequestBody;

    const requestType = normalizeRequestType(body.requestType);
    const requestedName = (body.requestedName || "").trim();
    const requestedQuery = (body.requestedQuery || "").trim();
    const selectedPid = (body.selectedPid || "").trim() || null;
    const requesterName = (body.requesterName || "").trim() || null;
    const note = (body.note || "").trim() || null;

    const hintCity = (body.hintCity || "").trim() || null;
    const hintSchool = (body.hintSchool || "").trim() || null;
    const hintCompany = (body.hintCompany || "").trim() || null;
    const hintAgeBand = (body.hintAgeBand || "").trim() || null;
    const knownBridgeHint = (body.knownBridgeHint || "").trim() || null;

    if (!requestedName) {
      return NextResponse.json(
        {
          ok: false,
          error: "requestedName is required",
        },
        { status: 400 }
      );
    }

    const autoDecision = deriveAutoDecision({
      requestType,
      requestedName,
      hintCity,
      hintSchool,
      hintCompany,
      hintAgeBand,
      knownBridgeHint,
    });

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const ACCESS_KEY = SERVICE_ROLE_KEY || ANON_KEY;

    if (!SUPABASE_URL || !ACCESS_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Supabase environment variables",
        },
        { status: 500 }
      );
    }

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/dl_target_requests`, {
      method: "POST",
      headers: {
        apikey: ACCESS_KEY,
        Authorization: `Bearer ${ACCESS_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([
        {
          request_type: requestType,
          requested_name: requestedName,
          requested_query: requestedQuery || null,
          selected_pid: selectedPid,
          requester_name: requesterName,
          note,
          hint_city: hintCity,
          hint_school: hintSchool,
          hint_company: hintCompany,
          hint_age_band: hintAgeBand,
          known_bridge_hint: knownBridgeHint,
          auto_status: autoDecision.autoStatus,
          auto_reason: autoDecision.autoReason,
          status: "pending",
        },
      ]),
      cache: "no-store",
    });

    const rawText = await resp.text();
    let data: unknown = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = rawText;
    }

    if (!resp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create target request",
          status: resp.status,
          raw: data,
        },
        { status: resp.status }
      );
    }

    const rows = Array.isArray(data) ? data : [];

    return NextResponse.json({
      ok: true,
      item: rows[0] ?? null,
      autoStatus: autoDecision.autoStatus,
      autoReason: autoDecision.autoReason,
      message: "Target request created successfully",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}