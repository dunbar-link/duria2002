// app/api/onboarding/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

type OrgType = "university" | "company" | "city" | "industry" | "community";

type OnboardingBody = {
  university?: string | null;
  company?: string | null;
  city?: string | null;
  interest?: string | null; // stored as community by default
};

function normName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (s.length > 120) return s.slice(0, 120);
  return s;
}

async function getUserIdFromBearer(
  admin: ReturnType<typeof getSupabaseAdmin>,
  req: Request
) {
  const authz = req.headers.get("authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function upsertOrganization(
  admin: ReturnType<typeof getSupabaseAdmin>,
  args: {
    name: string;
    type: OrgType;
    country?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const country = args.country ?? "KR";
  const metadata = args.metadata ?? {};

  const found = await admin
    .from("organizations")
    .select("id,name,type,country,metadata")
    .eq("name", args.name)
    .eq("type", args.type)
    .eq("country", country)
    .maybeSingle();

  if (found.error) throw found.error;
  if (found.data?.id) return found.data;

  const inserted = await admin
    .from("organizations")
    .insert({
      name: args.name,
      type: args.type,
      country,
      metadata,
    })
    .select("id,name,type,country,metadata")
    .single();

  if (inserted.error) {
    const msg = String(inserted.error.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      const again = await admin
        .from("organizations")
        .select("id,name,type,country,metadata")
        .eq("name", args.name)
        .eq("type", args.type)
        .eq("country", country)
        .maybeSingle();
      if (again.error) throw again.error;
      if (again.data?.id) return again.data;
    }
    throw inserted.error;
  }

  return inserted.data;
}

async function upsertMembership(
  admin: ReturnType<typeof getSupabaseAdmin>,
  args: {
    userId: string;
    organizationId: string;
    role: string; // studied_at / works_at / lives_in / interested_in
    verified?: boolean;
    startYear?: number | null;
    endYear?: number | null;
  }
) {
  const res = await admin
    .from("organization_memberships")
    .upsert(
      {
        user_id: args.userId,
        organization_id: args.organizationId,
        role: args.role,
        verified: args.verified ?? false,
        start_year: args.startYear ?? null,
        end_year: args.endYear ?? null,
      },
      { onConflict: "user_id,organization_id,role" }
    )
    .select("id,user_id,organization_id,role,verified,created_at")
    .single();

  if (res.error) throw res.error;
  return res.data;
}

export async function POST(req: Request) {
  const admin = getSupabaseAdmin();

  const userId = await getUserIdFromBearer(admin, req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Authorization Bearer token required" },
      { status: 401 }
    );
  }

  let body: OnboardingBody;
  try {
    body = (await req.json()) as OnboardingBody;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }

  const university = normName(body.university);
  const company = normName(body.company);
  const city = normName(body.city);
  const interest = normName(body.interest);

  if (!university && !company && !city && !interest) {
    return NextResponse.json(
      { ok: false, error: "EMPTY", message: "At least one field required" },
      { status: 400 }
    );
  }

  const created: any[] = [];

  if (university) {
    const org = await upsertOrganization(admin, {
      name: university,
      type: "university",
      country: "KR",
      metadata: { source: "onboarding" },
    });
    const mem = await upsertMembership(admin, {
      userId,
      organizationId: org.id,
      role: "studied_at",
    });
    created.push({ kind: "university", org, membership: mem });
  }

  if (company) {
    const org = await upsertOrganization(admin, {
      name: company,
      type: "company",
      country: "KR",
      metadata: { source: "onboarding" },
    });
    const mem = await upsertMembership(admin, {
      userId,
      organizationId: org.id,
      role: "works_at",
    });
    created.push({ kind: "company", org, membership: mem });
  }

  if (city) {
    const org = await upsertOrganization(admin, {
      name: city,
      type: "city",
      country: "KR",
      metadata: { source: "onboarding" },
    });
    const mem = await upsertMembership(admin, {
      userId,
      organizationId: org.id,
      role: "lives_in",
    });
    created.push({ kind: "city", org, membership: mem });
  }

  if (interest) {
    const org = await upsertOrganization(admin, {
      name: interest,
      type: "community",
      country: "KR",
      metadata: { source: "onboarding" },
    });
    const mem = await upsertMembership(admin, {
      userId,
      organizationId: org.id,
      role: "interested_in",
    });
    created.push({ kind: "interest", org, membership: mem });
  }

  return NextResponse.json({
    ok: true,
    userId,
    inserted: created.length,
    items: created,
  });
}