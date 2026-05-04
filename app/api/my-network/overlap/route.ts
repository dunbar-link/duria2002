import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  owner_user_id: string;
  owner_pid: string | null;
  contact_pid: string | null;
  name: string | null;
  city: string | null;
  school: string | null;
  company: string | null;
  tier: number | null;
  trust: number | null;
  graph_sync_status: string | null;
  is_deleted: boolean | null;
};

type KeyCandidate = {
  key: string;
  rule: string;
  score: number;
  label: string;
};

type SharedPerson = {
  dedupeKey: string;
  displayName: string;
  city: string | null;
  school: string | null;
  company: string | null;
  matchRule: string;
  matchLabel: string;
  matchScore: number;
  myContactId: string;
  otherContactId: string;
  myTier: number | null;
  myTrust: number | null;
  otherTier: number | null;
  otherTrust: number | null;
};

type OwnerGroup = {
  otherOwnerUserId: string;
  sharedCount: number;
  avgMatchScore: number;
  strongestMatchScore: number;
  sharedPeople: SharedPerson[];
};

const DEFAULT_LIMIT_OWNERS = 20;
const DEFAULT_LIMIT_PEOPLE_PER_OWNER = 8;

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanDisplay(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

function buildKeyCandidates(row: ContactRow): KeyCandidate[] {
  const name = norm(row.name);
  const city = norm(row.city);
  const school = norm(row.school);
  const company = norm(row.company);

  if (!name) {
    return [];
  }

  const out: KeyCandidate[] = [];

  const push = (
    parts: string[],
    rule: string,
    score: number,
    label: string
  ) => {
    if (parts.every((part) => part.length > 0)) {
      out.push({
        key: parts.join("|"),
        rule,
        score,
        label,
      });
    }
  };

  push(
    [name, city, school, company],
    "name_city_school_company",
    100,
    "이름 + 도시 + 학교 + 회사 일치"
  );
  push(
    [name, school, company],
    "name_school_company",
    94,
    "이름 + 학교 + 회사 일치"
  );
  push(
    [name, city, school],
    "name_city_school",
    90,
    "이름 + 도시 + 학교 일치"
  );
  push(
    [name, city, company],
    "name_city_company",
    88,
    "이름 + 도시 + 회사 일치"
  );
  push(
    [name, school],
    "name_school",
    78,
    "이름 + 학교 일치"
  );
  push(
    [name, company],
    "name_company",
    76,
    "이름 + 회사 일치"
  );
  push(
    [name, city],
    "name_city",
    72,
    "이름 + 도시 일치"
  );

  const deduped = new Map<string, KeyCandidate>();
  for (const item of out) {
    const existing = deduped.get(item.key);
    if (!existing || item.score > existing.score) {
      deduped.set(item.key, item);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.score - a.score);
}

function buildSharedPersonDedupeKey(row: ContactRow): string {
  return [
    norm(row.name),
    norm(row.city),
    norm(row.school),
    norm(row.company),
  ].join("|");
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number(
    (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2)
  );
}

export async function GET(req: NextRequest) {
  try {
    const ownerUserId = req.nextUrl.searchParams.get("ownerUserId")?.trim() ?? "";
    const limitOwners = Number(
      req.nextUrl.searchParams.get("limitOwners") ?? DEFAULT_LIMIT_OWNERS
    );
    const limitPeoplePerOwner = Number(
      req.nextUrl.searchParams.get("limitPeoplePerOwner") ??
        DEFAULT_LIMIT_PEOPLE_PER_OWNER
    );

    if (!ownerUserId) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId is required.",
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase
      .from("dl_contact_people")
      .select(
        [
          "id",
          "owner_user_id",
          "owner_pid",
          "contact_pid",
          "name",
          "city",
          "school",
          "company",
          "tier",
          "trust",
          "graph_sync_status",
          "is_deleted",
        ].join(",")
      )
      .or("is_deleted.is.null,is_deleted.eq.false");

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const rows = ((data ?? []) as ContactRow[]).filter((row) => {
      return !!norm(row.name);
    });

    const myRows = rows.filter((row) => row.owner_user_id === ownerUserId);
    const otherRows = rows.filter((row) => row.owner_user_id !== ownerUserId);

    if (myRows.length === 0) {
      return NextResponse.json({
        ok: true,
        ownerUserId,
        summary: {
          myContactCount: 0,
          comparedOwnerCount: 0,
          overlapOwnerCount: 0,
          overlapPersonCount: 0,
        },
        ownerGroups: [],
        note: "No active contacts found for this owner.",
      });
    }

    const myKeyIndex = new Map<
      string,
      Array<{
        row: ContactRow;
        candidate: KeyCandidate;
      }>
    >();

    for (const row of myRows) {
      const keys = buildKeyCandidates(row);
      for (const candidate of keys) {
        const arr = myKeyIndex.get(candidate.key) ?? [];
        arr.push({ row, candidate });
        myKeyIndex.set(candidate.key, arr);
      }
    }

    const ownerGroupMap = new Map<string, Map<string, SharedPerson>>();

    for (const otherRow of otherRows) {
      const otherKeys = buildKeyCandidates(otherRow);
      if (otherKeys.length === 0) continue;

      let bestMatch:
        | {
            myRow: ContactRow;
            otherRow: ContactRow;
            candidate: KeyCandidate;
          }
        | null = null;

      for (const otherCandidate of otherKeys) {
        const myMatches = myKeyIndex.get(otherCandidate.key);
        if (!myMatches || myMatches.length === 0) continue;

        for (const myMatch of myMatches) {
          if (
            !bestMatch ||
            otherCandidate.score > bestMatch.candidate.score
          ) {
            bestMatch = {
              myRow: myMatch.row,
              otherRow,
              candidate: otherCandidate,
            };
          }
        }
      }

      if (!bestMatch) continue;

      const ownerKey = otherRow.owner_user_id;
      const sharedKey = buildSharedPersonDedupeKey(bestMatch.myRow);

      const existingOwnerGroup = ownerGroupMap.get(ownerKey) ?? new Map();

      const mergedDisplayName =
        cleanDisplay(bestMatch.myRow.name) ??
        cleanDisplay(bestMatch.otherRow.name) ??
        "Unknown";

      const mergedCity =
        cleanDisplay(bestMatch.myRow.city) ??
        cleanDisplay(bestMatch.otherRow.city);
      const mergedSchool =
        cleanDisplay(bestMatch.myRow.school) ??
        cleanDisplay(bestMatch.otherRow.school);
      const mergedCompany =
        cleanDisplay(bestMatch.myRow.company) ??
        cleanDisplay(bestMatch.otherRow.company);

      const candidatePerson: SharedPerson = {
        dedupeKey: sharedKey,
        displayName: mergedDisplayName,
        city: mergedCity,
        school: mergedSchool,
        company: mergedCompany,
        matchRule: bestMatch.candidate.rule,
        matchLabel: bestMatch.candidate.label,
        matchScore: bestMatch.candidate.score,
        myContactId: bestMatch.myRow.id,
        otherContactId: bestMatch.otherRow.id,
        myTier: bestMatch.myRow.tier,
        myTrust: bestMatch.myRow.trust,
        otherTier: bestMatch.otherRow.tier,
        otherTrust: bestMatch.otherRow.trust,
      };

      const existingShared = existingOwnerGroup.get(sharedKey);
      if (!existingShared || candidatePerson.matchScore > existingShared.matchScore) {
        existingOwnerGroup.set(sharedKey, candidatePerson);
      }

      ownerGroupMap.set(ownerKey, existingOwnerGroup);
    }

    const ownerGroups: OwnerGroup[] = Array.from(ownerGroupMap.entries())
      .map(([otherOwnerUserId, sharedMap]) => {
        const sharedPeople = Array.from(sharedMap.values())
          .sort((a, b) => {
            if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
            return a.displayName.localeCompare(b.displayName);
          })
          .slice(0, Math.max(1, limitPeoplePerOwner));

        const allScores = Array.from(sharedMap.values()).map((item) => item.matchScore);

        return {
          otherOwnerUserId,
          sharedCount: sharedMap.size,
          avgMatchScore: average(allScores),
          strongestMatchScore: Math.max(...allScores),
          sharedPeople,
        };
      })
      .sort((a, b) => {
        if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
        if (b.strongestMatchScore !== a.strongestMatchScore) {
          return b.strongestMatchScore - a.strongestMatchScore;
        }
        return b.avgMatchScore - a.avgMatchScore;
      })
      .slice(0, Math.max(1, limitOwners));

    const overlapPersonCount = ownerGroups.reduce(
      (sum, group) => sum + group.sharedCount,
      0
    );

    return NextResponse.json({
      ok: true,
      ownerUserId,
      summary: {
        myContactCount: myRows.length,
        comparedOwnerCount: new Set(otherRows.map((row) => row.owner_user_id)).size,
        overlapOwnerCount: ownerGroups.length,
        overlapPersonCount,
      },
      ownerGroups,
      rules: [
        {
          rule: "name_city_school_company",
          score: 100,
          label: "이름 + 도시 + 학교 + 회사 일치",
        },
        {
          rule: "name_school_company",
          score: 94,
          label: "이름 + 학교 + 회사 일치",
        },
        {
          rule: "name_city_school",
          score: 90,
          label: "이름 + 도시 + 학교 일치",
        },
        {
          rule: "name_city_company",
          score: 88,
          label: "이름 + 도시 + 회사 일치",
        },
        {
          rule: "name_school",
          score: 78,
          label: "이름 + 학교 일치",
        },
        {
          rule: "name_company",
          score: 76,
          label: "이름 + 회사 일치",
        },
        {
          rule: "name_city",
          score: 72,
          label: "이름 + 도시 일치",
        },
      ],
      notes: [
        "1차 버전은 exact/fingerprint 기반 overlap 후보 계산입니다.",
        "이름만 같은 경우는 false positive 방지를 위해 제외했습니다.",
        "현재는 active contact only 대상으로 계산합니다.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}