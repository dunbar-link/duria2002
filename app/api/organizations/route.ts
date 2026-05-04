// app/api/organizations/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

const ALLOWED_TYPES = new Set(["university", "company", "city", "industry", "community"]);

function norm(v: string | null, max = 80) {
  const s = (v ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export async function GET(req: Request) {
  const admin = getSupabaseAdmin();
  const url = new URL(req.url);

  const type = norm(url.searchParams.get("type"));
  const country = norm(url.searchParams.get("country")) ?? "KR";
  const q = norm(url.searchParams.get("q"), 120);
  const tiersRaw = norm(url.searchParams.get("tiers"), 40); // "A,B"
  const limitRaw = norm(url.searchParams.get("limit"), 10);

  if (type && !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ ok: false, error: "BAD_TYPE" }, { status: 400 });
  }

  const limit = Math.min(Math.max(Number(limitRaw ?? 50), 1), 200);

  // Base query
  let query = admin
    .from("organizations")
    .select("id,name,type,country,metadata,created_at")
    .eq("country", country)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) query = query.eq("type", type);

  // Search by name (ILIKE)
  if (q) query = query.ilike("name", `%${q}%`);

  // Filter by seed_tier for universities
  if (tiersRaw) {
    const tiers = tiersRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((t) => ["A", "B", "C", "D"].includes(t));
    if (tiers.length > 0) {
      // metadata->>'seed_tier' in (...)
      // Supabase JS: use .in with "metadata->>seed_tier"
      // Note: the column syntax is literal; Supabase supports it.
      query = query.in("metadata->>seed_tier", tiers);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "DB_ERROR", message: error.message }, { status: 500 });
  }

  // Stable sorting for UX: tier asc then name asc when tier exists
  const items = (data ?? []).slice().sort((a: any, b: any) => {
    const ta = (a?.metadata?.seed_tier ?? "Z").toString();
    const tb = (b?.metadata?.seed_tier ?? "Z").toString();
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return NextResponse.json({ ok: true, count: items.length, items });
}

