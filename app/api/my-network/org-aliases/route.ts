import { NextResponse } from "next/server";

type CreateAliasBody = {
  alias?: string;
  orgPid?: string;
  edgeLabel?: "member" | "employee";
  isActive?: boolean;
};

type UpdateAliasBody = {
  id?: string;
  action?: "toggleActive" | "edit";
  isActive?: boolean;
  alias?: string;
  orgPid?: string;
  edgeLabel?: "member" | "employee";
};

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

export async function GET(req: Request) {
  try {
    const { url, serviceRoleKey } = getSupabaseEnv();
    const { searchParams } = new URL(req.url);

    const q = cleanText(searchParams.get("q"), 120)?.toLowerCase() ?? "";
    const status = cleanText(searchParams.get("status"), 20) ?? "all";

    let filters =
      "?select=id,alias,org_pid,edge_label,is_active,created_at&order=created_at.desc";

    if (status === "active") {
      filters += "&is_active=eq.true";
    } else if (status === "inactive") {
      filters += "&is_active=eq.false";
    }

    const response = await supabaseFetch(
      `${url}/rest/v1/dl_org_aliases${filters}`,
      { method: "GET" },
      serviceRoleKey
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.message || data?.error || "Failed to load org aliases.",
          details: data,
        },
        { status: response.status }
      );
    }

    let items = Array.isArray(data) ? data : [];

    if (q) {
      items = items.filter((item: any) => {
        const alias = String(item.alias || "").toLowerCase();
        const orgPid = String(item.org_pid || "").toLowerCase();
        const edgeLabel = String(item.edge_label || "").toLowerCase();
        return (
          alias.includes(q) || orgPid.includes(q) || edgeLabel.includes(q)
        );
      });
    }

    return NextResponse.json({
      ok: true,
      items,
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
    const body = (await req.json()) as CreateAliasBody;

    const alias = cleanText(body.alias, 120)?.toLowerCase() ?? null;
    const orgPid = cleanText(body.orgPid, 160);
    const edgeLabel = cleanText(body.edgeLabel, 20) as
      | "member"
      | "employee"
      | null;
    const isActive = body.isActive ?? true;

    if (!alias) {
      return NextResponse.json(
        { ok: false, error: "alias is required." },
        { status: 400 }
      );
    }

    if (!orgPid) {
      return NextResponse.json(
        { ok: false, error: "orgPid is required." },
        { status: 400 }
      );
    }

    if (edgeLabel !== "member" && edgeLabel !== "employee") {
      return NextResponse.json(
        { ok: false, error: "edgeLabel must be member or employee." },
        { status: 400 }
      );
    }

    const response = await supabaseFetch(
      `${url}/rest/v1/dl_org_aliases`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          alias,
          org_pid: orgPid,
          edge_label: edgeLabel,
          is_active: Boolean(isActive),
        }),
      },
      serviceRoleKey
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.message || data?.error || "Failed to create alias.",
          details: data,
        },
        { status: response.status }
      );
    }

    const item = Array.isArray(data) ? data[0] ?? null : data;

    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { url, serviceRoleKey } = getSupabaseEnv();
    const body = (await req.json()) as UpdateAliasBody;

    const id = cleanText(body.id, 64);
    const action = cleanText(body.action, 40);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id is required." },
        { status: 400 }
      );
    }

    if (action === "toggleActive") {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { ok: false, error: "isActive boolean is required." },
          { status: 400 }
        );
      }

      const response = await supabaseFetch(
        `${url}/rest/v1/dl_org_aliases?id=eq.${id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            is_active: body.isActive,
          }),
        },
        serviceRoleKey
      );

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          {
            ok: false,
            error:
              data?.message || data?.error || "Failed to update alias status.",
            details: data,
          },
          { status: response.status }
        );
      }

      const item = Array.isArray(data) ? data[0] ?? null : data;

      return NextResponse.json({
        ok: true,
        item,
      });
    }

    if (action === "edit") {
      const alias = cleanText(body.alias, 120)?.toLowerCase() ?? null;
      const orgPid = cleanText(body.orgPid, 160);
      const edgeLabel = cleanText(body.edgeLabel, 20) as
        | "member"
        | "employee"
        | null;

      if (!alias) {
        return NextResponse.json(
          { ok: false, error: "alias is required." },
          { status: 400 }
        );
      }

      if (!orgPid) {
        return NextResponse.json(
          { ok: false, error: "orgPid is required." },
          { status: 400 }
        );
      }

      if (edgeLabel !== "member" && edgeLabel !== "employee") {
        return NextResponse.json(
          { ok: false, error: "edgeLabel must be member or employee." },
          { status: 400 }
        );
      }

      const response = await supabaseFetch(
        `${url}/rest/v1/dl_org_aliases?id=eq.${id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            alias,
            org_pid: orgPid,
            edge_label: edgeLabel,
          }),
        },
        serviceRoleKey
      );

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: data?.message || data?.error || "Failed to edit alias.",
            details: data,
          },
          { status: response.status }
        );
      }

      const item = Array.isArray(data) ? data[0] ?? null : data;

      return NextResponse.json({
        ok: true,
        item,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Unsupported action." },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}