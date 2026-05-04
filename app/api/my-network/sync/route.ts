import { NextResponse } from "next/server";
import { matchOrgFromDb, type OrgMatch } from "@/lib/dlOrgMatchers";

type ContactRow = {
  id: string;
  owner_user_id: string;
  owner_pid: string;
  contact_pid: string;
  name: string;
  city: string | null;
  school: string | null;
  company: string | null;
  tier: number;
  trust: number;
  edge_label: string;
  graph_sync_status: string;
  is_deleted?: boolean;
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

async function supabaseFetch(
  input: string,
  init: RequestInit,
  serviceRoleKey: string
) {
  return fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

async function getPendingContacts(
  url: string,
  serviceRoleKey: string,
  ownerUserId: string
) {
  const pendingUrl =
    `${url}/rest/v1/dl_contact_people` +
    `?owner_user_id=eq.${ownerUserId}` +
    `&graph_sync_status=eq.pending` +
    `&is_deleted=eq.false` +
    `&select=id,owner_user_id,owner_pid,contact_pid,name,city,school,company,tier,trust,edge_label,graph_sync_status,is_deleted` +
    `&order=created_at.asc`;

  const response = await supabaseFetch(
    pendingUrl,
    { method: "GET" },
    serviceRoleKey
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to load pending contacts."
    );
  }

  return Array.isArray(data) ? (data as ContactRow[]) : [];
}

async function upsertPersonNode(
  url: string,
  serviceRoleKey: string,
  item: ContactRow
) {
  const payload = {
    pid: item.contact_pid,
    name: item.name,
    city: item.city,
    school: item.school,
    company: item.company,
    is_celebrity: false,
  };

  const response = await supabaseFetch(
    `${url}/rest/v1/dl_people`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payload),
    },
    serviceRoleKey
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to upsert dl_people row."
    );
  }
}

async function edgeAlreadyExists(
  url: string,
  serviceRoleKey: string,
  fromPid: string,
  toPid: string,
  label: string
) {
  const query =
    `${url}/rest/v1/dl_edges` +
    `?from_pid=eq.${encodeURIComponent(fromPid)}` +
    `&to_pid=eq.${encodeURIComponent(toPid)}` +
    `&label=eq.${encodeURIComponent(label)}` +
    `&select=id` +
    `&limit=1`;

  const response = await supabaseFetch(
    query,
    { method: "GET" },
    serviceRoleKey
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to check existing dl_edges row."
    );
  }

  return Array.isArray(data) && data.length > 0;
}

async function insertEdgeWithValues(
  url: string,
  serviceRoleKey: string,
  values: {
    fromPid: string;
    toPid: string;
    label: string;
    trust: number;
    tier: number;
    status: "accepted";
  }
) {
  const tier = Number(values.tier);
  const trust = Number(values.trust);
  const label = cleanText(values.label, 40) || "knows";

  if (!ALLOWED_TIERS.has(tier)) {
    throw new Error(`Invalid tier for sync: ${values.tier}`);
  }

  if (!Number.isInteger(trust) || trust < 0 || trust > 100) {
    throw new Error(`Invalid trust for sync: ${values.trust}`);
  }

  const exists = await edgeAlreadyExists(
    url,
    serviceRoleKey,
    values.fromPid,
    values.toPid,
    label
  );

  if (exists) {
    return { inserted: false, skipped: true };
  }

  const payload = {
    from_pid: values.fromPid,
    to_pid: values.toPid,
    label,
    trust,
    tier,
    status: values.status,
  };

  const response = await supabaseFetch(
    `${url}/rest/v1/dl_edges`,
    {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    },
    serviceRoleKey
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to insert dl_edges row."
    );
  }

  return { inserted: true, skipped: false };
}

async function insertOwnerToContactEdge(
  url: string,
  serviceRoleKey: string,
  item: ContactRow
) {
  return insertEdgeWithValues(url, serviceRoleKey, {
    fromPid: item.owner_pid,
    toPid: item.contact_pid,
    label: cleanText(item.edge_label, 40) || "knows",
    trust: Number(item.trust),
    tier: Number(item.tier),
    status: "accepted",
  });
}

async function orgNodeExists(
  url: string,
  serviceRoleKey: string,
  pid: string
) {
  const query =
    `${url}/rest/v1/dl_people` +
    `?pid=eq.${encodeURIComponent(pid)}` +
    `&select=pid` +
    `&limit=1`;

  const response = await supabaseFetch(
    query,
    { method: "GET" },
    serviceRoleKey
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to check organization node."
    );
  }

  return Array.isArray(data) && data.length > 0;
}

async function insertContactToOrgEdge(
  url: string,
  serviceRoleKey: string,
  item: ContactRow,
  orgMatch: OrgMatch
) {
  const exists = await orgNodeExists(url, serviceRoleKey, orgMatch.pid);

  if (!exists) {
    return {
      attempted: false,
      inserted: false,
      skipped: true,
      reason: `org node not found: ${orgMatch.pid}`,
      orgPid: orgMatch.pid,
      edgeLabel: orgMatch.edgeLabel,
    };
  }

  const result = await insertEdgeWithValues(url, serviceRoleKey, {
    fromPid: item.contact_pid,
    toPid: orgMatch.pid,
    label: orgMatch.edgeLabel,
    trust: Number(item.trust),
    tier: Number(item.tier),
    status: "accepted",
  });

  return {
    attempted: true,
    inserted: result.inserted,
    skipped: result.skipped,
    reason: null,
    orgPid: orgMatch.pid,
    edgeLabel: orgMatch.edgeLabel,
  };
}

async function markContactSynced(
  url: string,
  serviceRoleKey: string,
  contactId: string
) {
  const response = await supabaseFetch(
    `${url}/rest/v1/dl_contact_people?id=eq.${contactId}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        graph_sync_status: "synced",
      }),
    },
    serviceRoleKey
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to update graph_sync_status."
    );
  }
}

export async function POST(req: Request) {
  try {
    const { url, serviceRoleKey } = getSupabaseEnv();
    const body = await req.json();
    const ownerUserId = cleanText(body?.ownerUserId, 64);

    if (!ownerUserId || !isUuid(ownerUserId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const pendingItems = await getPendingContacts(url, serviceRoleKey, ownerUserId);

    if (pendingItems.length === 0) {
      return NextResponse.json({
        ok: true,
        syncedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        orgEdgeInsertedCount: 0,
        orgEdgeSkippedCount: 0,
        message: "No pending contacts to sync.",
        syncedPeople: [],
        failures: [],
      });
    }

    const syncedPeople: Array<{
      name: string;
      contactPid: string;
      tier: number;
      trust: number;
      edgeInserted: boolean;
      edgeSkipped: boolean;
      orgLinks: Array<{
        orgPid: string;
        edgeLabel: string;
        inserted: boolean;
        skipped: boolean;
        reason: string | null;
      }>;
    }> = [];

    const failures: Array<{
      name: string;
      contactPid: string;
      error: string;
    }> = [];

    for (const item of pendingItems) {
      try {
        await upsertPersonNode(url, serviceRoleKey, item);

        const ownerEdgeResult = await insertOwnerToContactEdge(
          url,
          serviceRoleKey,
          item
        );

        const orgLinks: Array<{
          orgPid: string;
          edgeLabel: string;
          inserted: boolean;
          skipped: boolean;
          reason: string | null;
        }> = [];

        const schoolMatch = await matchOrgFromDb({
          supabaseUrl: url,
          serviceRoleKey,
          rawText: item.school,
          expectedEdgeLabel: "member",
        });

        if (schoolMatch) {
          const schoolEdgeResult = await insertContactToOrgEdge(
            url,
            serviceRoleKey,
            item,
            schoolMatch
          );

          orgLinks.push({
            orgPid: schoolEdgeResult.orgPid,
            edgeLabel: schoolEdgeResult.edgeLabel,
            inserted: schoolEdgeResult.inserted,
            skipped: schoolEdgeResult.skipped,
            reason: schoolEdgeResult.reason,
          });
        }

        const companyMatch = await matchOrgFromDb({
          supabaseUrl: url,
          serviceRoleKey,
          rawText: item.company,
          expectedEdgeLabel: "employee",
        });

        if (companyMatch) {
          const companyEdgeResult = await insertContactToOrgEdge(
            url,
            serviceRoleKey,
            item,
            companyMatch
          );

          orgLinks.push({
            orgPid: companyEdgeResult.orgPid,
            edgeLabel: companyEdgeResult.edgeLabel,
            inserted: companyEdgeResult.inserted,
            skipped: companyEdgeResult.skipped,
            reason: companyEdgeResult.reason,
          });
        }

        await markContactSynced(url, serviceRoleKey, item.id);

        syncedPeople.push({
          name: item.name,
          contactPid: item.contact_pid,
          tier: Number(item.tier),
          trust: Number(item.trust),
          edgeInserted: ownerEdgeResult.inserted,
          edgeSkipped: ownerEdgeResult.skipped,
          orgLinks,
        });
      } catch (error) {
        failures.push({
          name: item.name,
          contactPid: item.contact_pid,
          error: error instanceof Error ? error.message : "Unknown sync error.",
        });
      }
    }

    const skippedCount = syncedPeople.filter((x) => x.edgeSkipped).length;
    const orgEdgeInsertedCount = syncedPeople.reduce(
      (sum, person) =>
        sum + person.orgLinks.filter((link) => link.inserted).length,
      0
    );
    const orgEdgeSkippedCount = syncedPeople.reduce(
      (sum, person) =>
        sum + person.orgLinks.filter((link) => link.skipped).length,
      0
    );

    return NextResponse.json({
      ok: true,
      syncedCount: syncedPeople.length,
      skippedCount,
      failedCount: failures.length,
      orgEdgeInsertedCount,
      orgEdgeSkippedCount,
      message:
        failures.length === 0
          ? "Graph sync completed successfully."
          : "Graph sync completed with partial failures.",
      syncedPeople,
      failures,
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