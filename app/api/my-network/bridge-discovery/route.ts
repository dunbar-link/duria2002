import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ContactRow = {
  id: string;
  name: string;
  city: string | null;
  school: string | null;
  company: string | null;
};

type EdgeRow = {
  from_pid: string;
  to_pid: string;
  label: string | null;
  trust: number | null;
  tier: number | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function slugify(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/&/g, " and ")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildOrgPidCandidates(input: {
  school?: string | null;
  company?: string | null;
  city?: string | null;
}) {
  const result: Array<{
    kind: "school" | "company" | "city";
    raw: string;
    pid: string;
    score: number;
    label: string;
  }> = [];

  const school = (input.school ?? "").trim();
  const company = (input.company ?? "").trim();
  const city = (input.city ?? "").trim();

  if (school) {
    const schoolSlug = slugify(school);

    if (schoolSlug) {
      result.push({
        kind: "school",
        raw: school,
        pid: `org:univ:${schoolSlug}`,
        score: 85,
        label: "school_match",
      });

      if (schoolSlug === "korea-university" || schoolSlug === "고려대") {
        result.push({
          kind: "school",
          raw: school,
          pid: "org:univ:korea-university",
          score: 90,
          label: "school_alias_match",
        });
      }

      if (schoolSlug === "ku") {
        result.push({
          kind: "school",
          raw: school,
          pid: "org:univ:korea-university",
          score: 80,
          label: "school_alias_match",
        });
      }
    }
  }

  if (company) {
    const companySlug = slugify(company);

    if (companySlug) {
      result.push({
        kind: "company",
        raw: company,
        pid: `org:company:${companySlug}`,
        score: 90,
        label: "company_match",
      });

      if (companySlug === "테슬라") {
        result.push({
          kind: "company",
          raw: company,
          pid: "org:company:tesla",
          score: 90,
          label: "company_alias_match",
        });
      }
    }
  }

  if (city) {
    const citySlug = slugify(city);

    if (citySlug) {
      result.push({
        kind: "city",
        raw: city,
        pid: `org:city:${citySlug}`,
        score: 70,
        label: "city_match",
      });

      if (citySlug === "서울") {
        result.push({
          kind: "city",
          raw: city,
          pid: "org:city:seoul",
          score: 70,
          label: "city_alias_match",
        });
      }
    }
  }

  return result;
}

function humanizePid(pid: string) {
  const last = pid.split(":").pop() ?? pid;

  return last
    .split("-")
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ownerUserId = String(body.ownerUserId ?? "").trim();

    if (!ownerUserId) {
      return NextResponse.json({
        ok: false,
        error: "ownerUserId required",
      });
    }

    const { data: contacts, error: contactError } = await supabase
      .from("dl_contact_people")
      .select("id, name, city, school, company")
      .eq("owner_user_id", ownerUserId)
      .eq("is_deleted", false);

    if (contactError) {
      return NextResponse.json({
        ok: false,
        error: contactError.message,
      });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        ok: true,
        created: 0,
        message: "no contacts",
      });
    }

    const { data: edgeRows, error: edgeError } = await supabase
      .from("dl_edges")
      .select("from_pid, to_pid, label, trust, tier")
      .eq("status", "accepted");

    if (edgeError) {
      return NextResponse.json({
        ok: false,
        error: edgeError.message,
      });
    }

    const edges = (edgeRows ?? []) as EdgeRow[];

    const edgesByFromPid = new Map<string, EdgeRow[]>();

    for (const edge of edges) {
      const bucket = edgesByFromPid.get(edge.from_pid) ?? [];
      bucket.push(edge);
      edgesByFromPid.set(edge.from_pid, bucket);
    }

    let created = 0;
    let skipped = 0;

    for (const contact of contacts as ContactRow[]) {
      const orgCandidates = buildOrgPidCandidates({
        school: contact.school,
        company: contact.company,
        city: contact.city,
      });

      const seenOrgPid = new Set<string>();

      for (const orgCandidate of orgCandidates) {
        if (seenOrgPid.has(orgCandidate.pid)) {
          continue;
        }

        seenOrgPid.add(orgCandidate.pid);

        const matchedEdges = edgesByFromPid.get(orgCandidate.pid) ?? [];

        for (const edge of matchedEdges) {
          if (!edge.to_pid.startsWith("celeb:")) {
            continue;
          }

          const targetPid = edge.to_pid;

          const { data: existingCandidate, error: existingError } = await supabase
            .from("dl_graph_expansion_candidates")
            .select("id")
            .eq("owner_user_id", ownerUserId)
            .eq("target_pid", targetPid)
            .eq("bridge_name", contact.name)
            .limit(1)
            .maybeSingle();

          if (existingError) {
            return NextResponse.json({
              ok: false,
              error: existingError.message,
            });
          }

          if (existingCandidate) {
            skipped += 1;
            continue;
          }

          const targetName = humanizePid(targetPid);
          const previewPathHint = `Me -> ${orgCandidate.raw} -> ${contact.name} -> ${targetName}`;

          const { error: insertError } = await supabase
            .from("dl_graph_expansion_candidates")
            .insert({
              owner_user_id: ownerUserId,
              status: "queued",
              source_type: "approved_bridge",
              target_pid: targetPid,
              target_name: targetName,
              target_category: "celebrity",
              target_country: null,
              bridge_name: contact.name,
              bridge_city: contact.city,
              bridge_school: contact.school,
              bridge_company: contact.company,
              match_score: orgCandidate.score,
              match_label: orgCandidate.label,
              preview_path_hint: previewPathHint,
              expansion_reason: `auto discovered via ${orgCandidate.kind} bridge`,
              metadata: {
                auto_discovered: true,
                source_contact_id: contact.id,
                source_contact_name: contact.name,
                matched_org_pid: orgCandidate.pid,
                matched_org_raw: orgCandidate.raw,
                matched_org_kind: orgCandidate.kind,
                edge_label: edge.label ?? "connection",
                edge_trust: edge.trust ?? 70,
                edge_tier: edge.tier ?? 50,
              },
            });

          if (insertError) {
            return NextResponse.json({
              ok: false,
              error: insertError.message,
            });
          }

          created += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown server error";

    return NextResponse.json({
      ok: false,
      error: message,
    });
  }
}