export type OrgMatch = {
  pid: string;
  edgeLabel: "member" | "employee";
  matchedBy: string;
};

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

type AliasRow = {
  alias: string;
  org_pid: string;
  edge_label: "member" | "employee";
  is_active: boolean;
};

export async function matchOrgFromDb(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  rawText: string | null | undefined;
  expectedEdgeLabel: "member" | "employee";
}): Promise<OrgMatch | null> {
  const normalized = normalizeText(params.rawText);
  if (!normalized) return null;

  const query =
    `${params.supabaseUrl}/rest/v1/dl_org_aliases` +
    `?alias=eq.${encodeURIComponent(normalized)}` +
    `&edge_label=eq.${encodeURIComponent(params.expectedEdgeLabel)}` +
    `&is_active=eq.true` +
    `&select=alias,org_pid,edge_label,is_active` +
    `&limit=1`;

  const response = await fetch(query, {
    method: "GET",
    headers: {
      apikey: params.serviceRoleKey,
      Authorization: `Bearer ${params.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = (await response.json()) as AliasRow[] | { error?: string; message?: string };

  if (!response.ok) {
    const err =
      !Array.isArray(data) && (data.message || data.error)
        ? data.message || data.error
        : "Failed to read dl_org_aliases.";
    throw new Error(err);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const row = data[0];

  return {
    pid: row.org_pid,
    edgeLabel: row.edge_label,
    matchedBy: row.alias,
  };
}