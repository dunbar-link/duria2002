import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

type SingleCreateBody = {
  ownerUserId?: string;
  name?: string;
  city?: string;
  school?: string;
  company?: string;
  tier?: number;
  trust?: number;
};

type BulkCreateBody = {
  ownerUserId?: string;
  names?: string[];
  city?: string;
  school?: string;
  company?: string;
  tier?: number;
  trust?: number;
};

const ALLOWED_TIERS = new Set([1, 5, 15, 50, 150, 500, 1500]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeNames(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => cleanText(v, 80))
    .filter((v): v is string => Boolean(v));
}

function normalizeKeyPart(value: string | null) {
  return (value || "").trim().toLowerCase();
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return { url, serviceRoleKey };
}

async function findExistingContacts(
  url: string,
  serviceRoleKey: string,
  ownerUserId: string
) {
  const query = new URL(
    `${url}/rest/v1/dl_contact_people?owner_user_id=eq.${ownerUserId}&is_deleted=eq.false&select=id,name,city,school,company`
  );

  const response = await fetch(query.toString(), {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to load existing contacts."
    );
  }

  return Array.isArray(data) ? data : [];
}

function buildDuplicateKey(input: {
  name: string;
  city: string | null;
  school: string | null;
  company: string | null;
}) {
  return [
    normalizeKeyPart(input.name),
    normalizeKeyPart(input.city),
    normalizeKeyPart(input.school),
    normalizeKeyPart(input.company),
  ].join("|");
}

export async function GET(req: Request) {
  try {
    const { url, serviceRoleKey } = getSupabaseEnv();
    const { searchParams } = new URL(req.url);
    const ownerUserId = searchParams.get("ownerUserId")?.trim() ?? "";
    const includeDeleted = searchParams.get("includeDeleted") === "true";

    if (!ownerUserId) {
      return NextResponse.json({
        ok: true,
        items: [],
      });
    }

    if (!isUuid(ownerUserId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const deletedFilter = includeDeleted ? "" : "&is_deleted=eq.false";

    const query = new URL(
      `${url}/rest/v1/dl_contact_people?owner_user_id=eq.${ownerUserId}${deletedFilter}&select=id,owner_user_id,owner_pid,contact_pid,name,city,school,company,tier,trust,edge_label,graph_sync_status,is_deleted,deleted_at,created_at&order=created_at.desc`
    );

    const response = await fetch(query.toString(), {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.message || data?.error || "Failed to load contacts.",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      items: Array.isArray(data) ? data : [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { url, serviceRoleKey } = getSupabaseEnv();
    const body = (await req.json()) as SingleCreateBody | BulkCreateBody;

    const ownerUserId = cleanText(body.ownerUserId, 64);
    const city = cleanText(body.city, 80);
    const school = cleanText(body.school, 120);
    const company = cleanText(body.company, 120);
    const tier = Number(body.tier);
    const trust = Number(body.trust);

    if (!ownerUserId || !isUuid(ownerUserId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_TIERS.has(tier)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tier must be one of 1, 5, 15, 50, 150, 500, 1500.",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(trust) || trust < 0 || trust > 100) {
      return NextResponse.json(
        {
          ok: false,
          error: "Trust must be an integer between 0 and 100.",
        },
        { status: 400 }
      );
    }

    const ownerPid = `u_${ownerUserId}`;

    const bulkNames = normalizeNames((body as BulkCreateBody).names);
    const singleName = cleanText((body as SingleCreateBody).name, 80);

    let names: string[] = [];

    if (bulkNames.length > 0) {
      names = bulkNames;
    } else if (singleName) {
      names = [singleName];
    }

    if (names.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "At least one name is required.",
        },
        { status: 400 }
      );
    }

    const existingRows = await findExistingContacts(url, serviceRoleKey, ownerUserId);
    const existingKeys = new Set(
      existingRows.map((row: any) =>
        buildDuplicateKey({
          name: row.name ?? "",
          city: row.city ?? null,
          school: row.school ?? null,
          company: row.company ?? null,
        })
      )
    );

    const seenIncomingKeys = new Set<string>();
    const insertPayload: Array<Record<string, unknown>> = [];
    const skippedDuplicates: string[] = [];

    for (const rawName of names) {
      const key = buildDuplicateKey({
        name: rawName,
        city,
        school,
        company,
      });

      if (existingKeys.has(key) || seenIncomingKeys.has(key)) {
        skippedDuplicates.push(rawName);
        continue;
      }

      seenIncomingKeys.add(key);

      insertPayload.push({
        owner_user_id: ownerUserId,
        owner_pid: ownerPid,
        contact_pid: `contact:${randomUUID()}`,
        name: rawName,
        city,
        school,
        company,
        tier,
        trust,
        edge_label: "knows",
        graph_sync_status: "pending",
        is_deleted: false,
        deleted_at: null,
      });
    }

    if (insertPayload.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            skippedDuplicates.length > 0
              ? `All contacts were skipped as duplicates: ${skippedDuplicates.join(", ")}`
              : "No contacts to insert.",
        },
        { status: 400 }
      );
    }

    const response = await fetch(`${url}/rest/v1/dl_contact_people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(insertPayload),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data?.message || data?.error || "Failed to create contact(s).",
          details: data,
        },
        { status: response.status }
      );
    }

    const items = Array.isArray(data) ? data : [data];

    return NextResponse.json({
      ok: true,
      items,
      count: items.length,
      skippedDuplicateCount: skippedDuplicates.length,
      skippedDuplicates,
      graphPlan: {
        ownerPid,
        nextStep: "Later sync these rows into dl_people nodes + dl_edges edges.",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { url, serviceRoleKey } = getSupabaseEnv();
    const { searchParams } = new URL(req.url);

    const ownerUserId = searchParams.get("ownerUserId")?.trim() ?? "";
    const contactId = searchParams.get("contactId")?.trim() ?? "";

    if (!ownerUserId || !isUuid(ownerUserId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    if (!contactId) {
      return NextResponse.json(
        {
          ok: false,
          error: "contactId is required.",
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${url}/rest/v1/dl_contact_people?id=eq.${contactId}&owner_user_id=eq.${ownerUserId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        }),
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data?.message || data?.error || "Failed to archive contact.",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      archived: Array.isArray(data) ? data[0] ?? null : data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { url, serviceRoleKey } = getSupabaseEnv();
    const body = await req.json();

    const ownerUserId = cleanText(body?.ownerUserId, 64);
    const contactId = cleanText(body?.contactId, 64);
    const action = cleanText(body?.action, 20);

    if (!ownerUserId || !isUuid(ownerUserId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    if (!contactId) {
      return NextResponse.json(
        {
          ok: false,
          error: "contactId is required.",
        },
        { status: 400 }
      );
    }

    if (action !== "restore") {
      return NextResponse.json(
        {
          ok: false,
          error: "Only restore action is supported.",
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${url}/rest/v1/dl_contact_people?id=eq.${contactId}&owner_user_id=eq.${ownerUserId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          is_deleted: false,
          deleted_at: null,
        }),
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data?.message || data?.error || "Failed to restore contact.",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      restored: Array.isArray(data) ? data[0] ?? null : data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}