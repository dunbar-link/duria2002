"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function buildExploreHref(ownerUserId: string, person: SharedPerson) {
  const params = new URLSearchParams();
  params.set("ownerUserId", ownerUserId);
  params.set("name", person.displayName);
  if (person.city) params.set("city", person.city);
  if (person.school) params.set("school", person.school);
  if (person.company) params.set("company", person.company);
  params.set("matchScore", String(person.matchScore));
  return `/my-network/overlap/explore?${params.toString()}`;
}

export default function MyNetworkOverlapPage() {
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

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/50">
                Mutual Network Discovery
              </p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight">
                너도 이 사람 알아?
              </h1>
            </div>
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/70">
              1차 구현
            </div>
          </div>

          <p className="text-sm leading-6 text-white/75">
            내 네트워크와 다른 owner 네트워크 사이에서, 같은 사람일 가능성이 높은
            공통 지인 후보를 보여줍니다. 현재 버전은 이름만 같은 경우는 제외하고,
            이름 + 학교 / 회사 / 도시 조합이 겹칠 때만 후보로 올립니다.
          </p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm">
            <div className="text-white/60">현재 ownerUserId</div>
            <div className="mt-1 break-all font-mono text-xs text-white/90">
              {ownerUserId}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/my-network"
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              내 인맥으로 돌아가기
            </Link>
            <Link
              href={`/my-network/overlap?ownerUserId=${encodeURIComponent(ownerUserId)}`}
              className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15"
            >
              다시 계산하기
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="animate-pulse text-sm text-white/70">
              overlap 후보를 계산하는 중...
            </div>
          </section>
        ) : null}

        {!loading && data?.ok ? (
          <>
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/55">내 active contact</div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.summary.myContactCount}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/55">비교된 다른 owner</div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.summary.comparedOwnerCount}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/55">겹침 있는 owner</div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.summary.overlapOwnerCount}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/55">총 overlap 후보</div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.summary.overlapPersonCount}
                </div>
              </div>
            </section>

            {data.note ? (
              <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                {data.note}
              </section>
            ) : null}

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-semibold">매칭 기준</h2>
              <div className="mt-3 flex flex-col gap-2">
                {(data.rules ?? []).map((rule) => (
                  <div
                    key={rule.rule}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  >
                    <span className="text-white/80">{rule.label}</span>
                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                      score {rule.score}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {data.ownerGroups.length === 0 ? (
              <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-lg font-semibold">결과</h2>
                <p className="mt-3 text-sm leading-6 text-white/75">
                  아직 공통 지인 후보가 없습니다. 이 상태면 다음 액션은 두 가지입니다.
                  먼저 <span className="font-semibold text-white">/my-network</span>에서
                  인맥 수를 더 늘리고, 학교 / 회사 / 도시 정보를 더 정확히 입력하세요.
                </p>
              </section>
            ) : (
              <section className="flex flex-col gap-4">
                {data.ownerGroups.map((group, index) => (
                  <article
                    key={`${group.otherOwnerUserId}-${index}`}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/45">
                          overlap owner #{index + 1}
                        </div>
                        <h2 className="mt-1 text-lg font-semibold">
                          다른 네트워크 {shortUserId(group.otherOwnerUserId)}
                        </h2>
                      </div>
                      <div className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                        {group.sharedCount}명 겹침
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs text-white/50">평균 매칭 점수</div>
                        <div className="mt-1 text-lg font-semibold">
                          {group.avgMatchScore}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs text-white/50">최고 매칭 점수</div>
                        <div className="mt-1 text-lg font-semibold">
                          {group.strongestMatchScore}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3">
                      {group.sharedPeople.map((person) => (
                        <div
                          key={person.dedupeKey}
                          className="rounded-2xl border border-white/10 bg-black/25 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold">
                                {person.displayName}
                              </div>
                              <div className="mt-1 text-sm text-white/60">
                                {metaLine(person)}
                              </div>
                            </div>
                            <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/75">
                              {scoreLabel(person.matchScore)}
                            </div>
                          </div>

                          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                            {person.matchLabel}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="text-xs text-white/50">내 네트워크</div>
                              <div className="mt-1 text-white/85">
                                Tier {person.myTier ?? "-"} · Trust {person.myTrust ?? "-"}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="text-xs text-white/50">상대 네트워크</div>
                              <div className="mt-1 text-white/85">
                                Tier {person.otherTier ?? "-"} · Trust {person.otherTrust ?? "-"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-col gap-2">
                            <Link
                              href={buildExploreHref(ownerUserId, person)}
                              className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/15"
                            >
                              이 겹침으로 타겟 찾기
                            </Link>

                            <Link
                              href="/path"
                              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
                            >
                              그냥 경로 탐색 화면으로 이동
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            )}

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-semibold">이 다음 단계</h2>
              <div className="mt-3 space-y-2 text-sm leading-6 text-white/75">
                <p>1차 구현은 overlap 후보 계산과 리스트 출력까지입니다.</p>
                <p>
                  이번 단계에서는 overlap 후보를 눌러서
                  <span className="font-semibold text-white">
                    관련 타겟 후보를 다시 추천받는 연결 화면
                  </span>
                  으로 넘어갑니다.
                </p>
                <p>
                  다음 단계에서는 여기서 바로
                  <span className="font-semibold text-white">
                    /path 자동 진입 + 자동 discover
                  </span>
                  까지 연결하면 됩니다.
                </p>
              </div>
            </section>
          </>
        ) : null}

        {!loading && data && !data.ok ? (
          <section className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-5">
            <h2 className="text-lg font-semibold text-rose-100">API 오류</h2>
            <p className="mt-3 break-all text-sm leading-6 text-rose-100/90">
              {data.error}
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}