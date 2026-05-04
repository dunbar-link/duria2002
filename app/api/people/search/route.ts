import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseEnvDebug } from "@/lib/supabase-admin";

type DlPersonDbRow = {
  pid: string;
  name: string | null;
  is_celebrity: boolean | null;
  city: string | null;
  company: string | null;
  school: string | null;
};

type TargetItem = {
  pid: string;
  displayName: string;
  display_name: string;
  category: string;
  isCelebrity: boolean;
  is_celebrity: boolean;
  city: string | null;
  company: string | null;
  school: string | null;
};

function sanitizeQuery(value: string) {
  return value.replace(/[%_]/g, "").trim();
}

function getCategory(row: DlPersonDbRow) {
  if (row.is_celebrity || row.pid.startsWith("celeb:")) {
    return "celebrity";
  }

  return "person";
}

function buildSearchTerms(q: string) {
  return q
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = sanitizeQuery(searchParams.get("q") || "");
    const terms = buildSearchTerms(q);

    const supabase = getsupabaseAdmin;

    let query = supabase
      .from("dl_people")
      .select("pid,name,is_celebrity,city,company,school")
      .order("name", { ascending: true })
      .limit(q ? 30 : 20);

    if (terms.length > 0) {
      const orParts: string[] = [];

      for (const term of terms) {
        orParts.push(`name.ilike.%${term}%`);
        orParts.push(`company.ilike.%${term}%`);
        orParts.push(`school.ilike.%${term}%`);
        orParts.push(`city.ilike.%${term}%`);
        orParts.push(`pid.ilike.%${term}%`);
      }

      query = query.or(orParts.join(","));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          errorCode: "PEOPLE_SEARCH_QUERY_FAILED",
          debug: {
            query: q,
            supabase: getSupabaseEnvDebug(),
          },
        },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? (data as DlPersonDbRow[]) : [];

    const items: TargetItem[] = rows.map((row) => {
      const displayName = row.name?.trim() || row.pid;
      const category = getCategory(row);

      return {
        pid: row.pid,
        displayName,
        display_name: displayName,
        category,
        isCelebrity: Boolean(row.is_celebrity),
        is_celebrity: Boolean(row.is_celebrity),
        city: row.city,
        company: row.company,
        school: row.school,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      count: items.length,
      debug: {
        query: q,
        terms,
        supabase: getSupabaseEnvDebug(),
        sourceColumns: [
          "pid",
          "name",
          "is_celebrity",
          "city",
          "company",
          "school",
        ],
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
        errorCode: "PEOPLE_SEARCH_INTERNAL_ERROR",
        debug: {
          supabase: getSupabaseEnvDebug(),
        },
      },
      { status: 500 }
    );
  }
}
