import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Evidence = {
  orgPid: string;
  orgName: string;
  matchType: "school" | "company";
  contactCount: number;
  edgeTrust: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerUserId = searchParams.get("ownerUserId");

    if (!ownerUserId) {
      return NextResponse.json({
        ok: false,
        error: "ownerUserId required",
      });
    }

    const { data: contacts } = await supabase
      .from("dl_contact_people")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("is_deleted", false);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        ok: true,
        recommendedTargets: [],
      });
    }

    const schoolCounts: Record<string, number> = {};
    const companyCounts: Record<string, number> = {};

    for (const c of contacts) {
      if (c.school) {
        schoolCounts[c.school] = (schoolCounts[c.school] || 0) + 1;
      }
      if (c.company) {
        companyCounts[c.company] = (companyCounts[c.company] || 0) + 1;
      }
    }

    const evidences: Evidence[] = [];

    for (const school in schoolCounts) {
      const { data: alias } = await supabase
        .from("dl_org_aliases")
        .select("*")
        .eq("alias", school)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (alias) {
        evidences.push({
          orgPid: alias.org_pid,
          orgName: school,
          matchType: "school",
          contactCount: schoolCounts[school],
          edgeTrust: 80,
        });
      }
    }

    for (const company in companyCounts) {
      const { data: alias } = await supabase
        .from("dl_org_aliases")
        .select("*")
        .eq("alias", company)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (alias) {
        evidences.push({
          orgPid: alias.org_pid,
          orgName: company,
          matchType: "company",
          contactCount: companyCounts[company],
          edgeTrust: 70,
        });
      }
    }

    const recommendedTargets: any[] = [];

    for (const ev of evidences) {
      const { data: edges } = await supabase
        .from("dl_edges")
        .select("*")
        .eq("from_pid", ev.orgPid)
        .limit(20);

      if (!edges) continue;

      for (const edge of edges) {
        const { data: person } = await supabase
          .from("dl_people")
          .select("*")
          .eq("pid", edge.to_pid)
          .limit(1)
          .single();

        if (!person) continue;

        if (person.pid.startsWith("org:")) continue;

        const score =
          ev.contactCount * 20 +
          ev.edgeTrust +
          (person.category === "celebrity" ? 20 : 0);

        const previewPathHint = `${ev.orgName} → ${person.display_name}`;

        recommendedTargets.push({
          pid: person.pid,
          displayName: person.display_name,
          category: person.category,
          country: person.country,
          score,
          reason:
            ev.matchType === "school"
              ? `${ev.orgName} 네트워크 기반 연결 가능성`
              : `${ev.orgName} 회사 네트워크 기반 연결 가능성`,
          sourceHint: ev.matchType === "school" ? "School signal" : "Company signal",
          previewPathHint,
          evidence: [ev],
        });
      }
    }

    recommendedTargets.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      ok: true,
      recommendedTargets: recommendedTargets.slice(0, 10),
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message || "unknown error",
    });
  }
}