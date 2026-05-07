"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

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

type OverlapResponse =
  | {
      ok: true;
      ownerUserId: string;
      summary: {
        myContactCount: number;
        comparedOwnerCount: number;
        overlapOwnerCount: number;
        overlapPersonCount: number;
      };
      ownerGroups: OwnerGroup[];
      rules?: Array<{
        rule: string;
        score: number;
        label: string;
      }>;
      notes?: string[];
      note?: string;
    }
  | {
      ok: false;
      error: string;
    };

function shortUserId(userId: string) {
  if (!userId) return "-";
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}...${userId.slice(-6)}`;
}

function scoreLabel(score: number) {
  if (score >= 95) return "매우 강한 겹침";
  if (score >= 88) return "강한 겹침";
  if (score >= 78) return "유의미한 겹침";
  return "약한 겹침";
}

function metaLine(person: SharedPerson) {
  const items = [person.city, person.school, person.company].filter(Boolean);
  return items.length > 0 ? items.join(" · ") : "추가 메타데이터 없음";
}

function buildExploreHref(ownerUserId: string, otherOwnerUserId: string, person: SharedPerson) {
  const params = new URLSearchParams();
  params.set("ownerUserId", ownerUserId);
  params.set("otherOwnerUserId", otherOwnerUserId);
  params.set("name", person.displayName);
  if (person.city) params.set("city", person.city);
  if (person.school) params.set("school", person.school);
  if (person.company) params.set("company", person.company);
  params.set("matchScore", String(person.matchScore));
  return `/my-network/overlap/explore?${params.toString()}`;
}

function LoadingScreen() {
  return (
    <main className="min-h-screen bg-[#0f172a] px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[360px] max-w-6xl items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
        연결 정보를 불러오는 중...
      </div>
    </main>
  );
}

function MyNetworkOverlapPageContent() {
  const searchParams = useSearchParams();

  const ownerUserId = useMemo(() => {
    return searchParams.get("ownerUserId") || FIXED_OWNER_USER_ID;
  }, [searchParams]);

  const [data, setData] = useState<OverlapResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function run() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/my-network/overlap?ownerUserId=${encodeURIComponent(ownerUserId)}`,
          { cache: "no-store" }
        );
        const json: OverlapResponse = await res.json();
        if (!ignore) {
          setData(json);
        }
      } catch (error) {
        if (!ignore) {
          setData({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown fetch error",
          });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      ignore = true;
    };
  }, [ownerUserId]);

  const ownerGroups = data?.ok ? data.ownerGroups : [];
  const summary = data?.ok ? data.summary : null;

  return (
    <main className="min-h-screen bg-[#0f172a] px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                Dunbar Link Overlap
              </p>
              <h1 className="mt-2 text-2xl font-bold">겹치는 인맥 찾기</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
                내 네트워크와 다른 사용자 네트워크 사이에 반복해서 등장하는 사람을 찾아 연결 후보로 정리합니다.
              </p>
            </div>
            <Link
              href="/my-network"
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/15"
            >
              내 네트워크로 돌아가기
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/45">내 연락처</p>
            <p className="mt-2 text-2xl font-bold">{summary?.myContactCount ?? "-"}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/45">비교 사용자</p>
            <p className="mt-2 text-2xl font-bold">{summary?.comparedOwnerCount ?? "-"}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/45">겹침 사용자</p>
            <p className="mt-2 text-2xl font-bold">{summary?.overlapOwnerCount ?? "-"}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/45">겹친 사람</p>
            <p className="mt-2 text-2xl font-bold">{summary?.overlapPersonCount ?? "-"}</p>
          </div>
        </section>

        {loading ? <LoadingScreen /> : null}

        {!loading && data && !data.ok ? (
          <section className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-5">
            <h2 className="text-lg font-semibold text-rose-100">API 오류</h2>
            <p className="mt-3 break-all text-sm leading-6 text-rose-100/90">{data.error}</p>
          </section>
        ) : null}

        {!loading && data?.ok && ownerGroups.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
            아직 겹치는 인맥 후보가 없습니다.
          </section>
        ) : null}

        {!loading && data?.ok && ownerGroups.length > 0 ? (
          <section className="space-y-4">
            {ownerGroups.map((group) => (
              <article
                key={group.otherOwnerUserId}
                className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs text-white/45">상대 사용자</p>
                    <h2 className="mt-1 text-lg font-semibold">
                      {shortUserId(group.otherOwnerUserId)}
                    </h2>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-white/70">
                    <div className="rounded-2xl bg-white/10 px-3 py-2">
                      <p className="text-white/45">공유</p>
                      <p className="mt-1 font-semibold text-white">{group.sharedCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-3 py-2">
                      <p className="text-white/45">평균</p>
                      <p className="mt-1 font-semibold text-white">{Math.round(group.avgMatchScore)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-3 py-2">
                      <p className="text-white/45">최고</p>
                      <p className="mt-1 font-semibold text-white">{Math.round(group.strongestMatchScore)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {group.sharedPeople.map((person) => (
                    <Link
                      key={`${group.otherOwnerUserId}-${person.dedupeKey}-${person.otherContactId}`}
                      href={buildExploreHref(ownerUserId, group.otherOwnerUserId, person)}
                      className="rounded-3xl border border-white/10 bg-white/10 p-4 transition hover:bg-white/15"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold">{person.displayName}</h3>
                          <p className="mt-1 text-xs text-white/55">{metaLine(person)}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-900">
                          {Math.round(person.matchScore)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-white/10 px-3 py-1 text-white/75">
                          {person.matchLabel || scoreLabel(person.matchScore)}
                        </span>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-white/75">
                          {person.matchRule}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default function MyNetworkOverlapPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MyNetworkOverlapPageContent />
    </Suspense>
  );
}
