"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Evidence = {
  orgPid: string;
  orgName: string;
  matchType: "school" | "company";
  contactCount: number;
  edgeTrust: number;
};

type RecommendedTarget = {
  pid: string;
  displayName?: string;
  display_name?: string;
  category?: string;
  country?: string;
  score: number;
  reason: string;
  sourceHint: string;
  evidence: Evidence[];
  previewPathHint?: string;
};

type SummaryResponse =
  | {
      ok: true;
      recommendedTargets: RecommendedTarget[];
    }
  | {
      ok: false;
      error: string;
    };

type NormalizedTarget = {
  pid: string;
  displayName: string;
  category: string;
  country: string;
  score: number;
  reason: string;
  sourceHint: string;
  evidence: Evidence[];
  previewPathHint?: string;
  boostedScore: number;
};

type SaveBridgeButtonProps = {
  ownerUserId: string;
  otherOwnerUserId?: string;
  bridgeName: string;
  bridgeCity: string;
  bridgeSchool: string;
  bridgeCompany: string;
  matchScore: number;
  matchLabel: string;
  target: NormalizedTarget;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function getTargetDisplayName(target: Partial<RecommendedTarget>) {
  return cleanText(target.displayName) || cleanText(target.display_name) || "Unknown Target";
}

function getTargetCategory(target: Partial<RecommendedTarget>) {
  return cleanText(target.category) || "unknown";
}

function getTargetCountry(target: Partial<RecommendedTarget>) {
  return cleanText(target.country) || "unknown";
}

function makeMatchLabel(score: number) {
  if (score >= 95) return "Exact Overlap";
  if (score >= 80) return "Strong Overlap";
  if (score >= 60) return "Good Overlap";
  return "Possible Overlap";
}

function buildPreviewPathHint(
  target: Pick<NormalizedTarget, "displayName" | "previewPathHint">,
  bridgeSchool: string,
  bridgeCompany: string
) {
  if (cleanText(target.previewPathHint)) {
    return cleanText(target.previewPathHint);
  }

  if (bridgeCompany) {
    return `${bridgeCompany} → ${target.displayName}`;
  }

  if (bridgeSchool) {
    return `${bridgeSchool} → ${target.displayName}`;
  }

  return target.displayName;
}

function SaveBridgeButton(props: SaveBridgeButtonProps) {
  const {
    ownerUserId,
    otherOwnerUserId,
    bridgeName,
    bridgeCity,
    bridgeSchool,
    bridgeCompany,
    matchScore,
    matchLabel,
    target,
  } = props;

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    try {
      setSaving(true);
      setMessage("");

      const evidenceSummaryParts: string[] = [];
      if (bridgeSchool) evidenceSummaryParts.push(`school=${bridgeSchool}`);
      if (bridgeCompany) evidenceSummaryParts.push(`company=${bridgeCompany}`);
      if (bridgeCity) evidenceSummaryParts.push(`city=${bridgeCity}`);
      evidenceSummaryParts.push(`matchScore=${matchScore}`);
      evidenceSummaryParts.push(`target=${target.displayName}`);

      const res = await fetch("/api/my-network/bridge-candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId,
          otherOwnerUserId: otherOwnerUserId || null,
          sourceType: "overlap",
          status: "saved",
          bridgeName,
          bridgeCity,
          bridgeSchool,
          bridgeCompany,
          matchScore,
          matchLabel,
          evidenceSummary: evidenceSummaryParts.join(" | "),
          suggestedTargetPid: target.pid,
          suggestedTargetName: target.displayName,
          previewPathHint: buildPreviewPathHint(target, bridgeSchool, bridgeCompany),
          metadata: {
            category: target.category,
            country: target.country,
            baseScore: target.score,
            boostedScore: target.boostedScore,
            sourceHint: target.sourceHint,
            reason: target.reason,
            evidence: target.evidence,
          },
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Bridge candidate save failed.");
      }

      setDone(true);
      setMessage("저장 완료");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || done}
        className="cursor-pointer rounded-2xl border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "저장 중..." : done ? "저장됨" : "이 브리지 후보 저장"}
      </button>

      {message ? (
        <p className="text-xs text-neutral-600">{message}</p>
      ) : null}
    </div>
  );
}

function OverlapExploreContent() {
  const searchParams = useSearchParams();

  const ownerUserId = searchParams.get("ownerUserId") || "";
  const otherOwnerUserId = searchParams.get("otherOwnerUserId") || "";
  const bridgeName = searchParams.get("name") || "";
  const bridgeCity = searchParams.get("city") || "";
  const bridgeSchool = searchParams.get("school") || "";
  const bridgeCompany = searchParams.get("company") || "";
  const matchScore = Number(searchParams.get("matchScore") || "0");

  const [items, setItems] = useState<NormalizedTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const matchLabel = useMemo(() => makeMatchLabel(matchScore), [matchScore]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!ownerUserId) {
        setError("ownerUserId 가 필요합니다.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const res = await fetch(
          `/api/my-network/summary?ownerUserId=${encodeURIComponent(ownerUserId)}`,
          { cache: "no-store" }
        );

        const json = (await res.json()) as SummaryResponse;

        if (!res.ok || !json.ok) {
          throw new Error(
            "error" in json ? json.error : "추천 데이터를 불러오지 못했습니다."
          );
        }

        const schoolKey = normalizeText(bridgeSchool);
        const companyKey = normalizeText(bridgeCompany);

        const normalizedTargets = json.recommendedTargets.map((target) => {
          const normalized: NormalizedTarget = {
            pid: cleanText(target.pid),
            displayName: getTargetDisplayName(target),
            category: getTargetCategory(target),
            country: getTargetCountry(target),
            score: Number(target.score || 0),
            reason: cleanText(target.reason),
            sourceHint: cleanText(target.sourceHint),
            evidence: Array.isArray(target.evidence) ? target.evidence : [],
            previewPathHint: cleanText(target.previewPathHint) || undefined,
            boostedScore: Number(target.score || 0),
          };

          return normalized;
        });

        const related = normalizedTargets
          .map((target) => {
            const evidenceMatches = target.evidence.filter((ev) => {
              const orgNameKey = normalizeText(ev.orgName || "");
              const schoolMatched = schoolKey && orgNameKey.includes(schoolKey);
              const companyMatched = companyKey && orgNameKey.includes(companyKey);
              return Boolean(schoolMatched || companyMatched);
            });

            const textBlob = normalizeText(
              `${target.reason} ${target.sourceHint} ${target.previewPathHint || ""}`
            );

            const textMatched =
              (schoolKey && textBlob.includes(schoolKey)) ||
              (companyKey && textBlob.includes(companyKey));

            const isRelated = evidenceMatches.length > 0 || textMatched;

            const overlapBonus =
              matchScore >= 95 ? 40 : matchScore >= 80 ? 28 : matchScore >= 60 ? 18 : 8;

            const evidenceBonus = evidenceMatches.length * 12;
            const boostedScore = target.score + overlapBonus + evidenceBonus;

            return {
              ...target,
              boostedScore,
              __isRelated: isRelated,
            };
          })
          .filter((target) => target.__isRelated)
          .sort((a, b) => b.boostedScore - a.boostedScore)
          .slice(0, 12)
          .map(({ __isRelated, ...rest }) => rest);

        const fallback = normalizedTargets
          .map((target) => ({
            ...target,
            boostedScore: target.score + (matchScore >= 80 ? 10 : 5),
          }))
          .sort((a, b) => b.boostedScore - a.boostedScore)
          .slice(0, 8);

        if (!ignore) {
          setItems(related.length > 0 ? related : fallback);
        }
      } catch (error) {
        if (!ignore) {
          setError(error instanceof Error ? error.message : "알 수 없는 오류");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [ownerUserId, bridgeSchool, bridgeCompany, matchScore]);

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Dunbar Link
          </p>

          <h1 className="mt-2 text-2xl font-bold leading-tight">
            겹치는 인맥으로 타겟 찾기
          </h1>

          <p className="mt-2 text-sm leading-6 text-neutral-600">
            overlap 인맥을 기반으로 연결 가능성이 높은 타겟을 다시 추천합니다.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              <span className="font-semibold">Bridge Name:</span>{" "}
              {bridgeName || "-"}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              <span className="font-semibold">City:</span> {bridgeCity || "-"}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              <span className="font-semibold">School:</span>{" "}
              {bridgeSchool || "-"}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              <span className="font-semibold">Company:</span>{" "}
              {bridgeCompany || "-"}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              <span className="font-semibold">Match:</span> {matchScore} /{" "}
              {matchLabel}
            </div>
          </div>

          <div className="mt-4">
            <Link
              href={`/my-network/overlap?ownerUserId=${encodeURIComponent(ownerUserId)}`}
              className="text-sm font-semibold text-neutral-700 underline underline-offset-4"
            >
              ← overlap 목록으로 돌아가기
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">추천 후보를 불러오는 중...</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-red-700">오류</p>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              추천 가능한 타겟이 아직 없습니다.
            </p>
          </div>
        ) : null}

        {!loading && !error
          ? items.map((target) => {
              const pathQuery = new URLSearchParams({
                ownerUserId,
                targetPid: target.pid,
                targetName: target.displayName,
                targetCategory: target.category,
                from: "overlap",
                bridgeName,
                bridgeCity,
                bridgeSchool,
                bridgeCompany,
                bridgeMatchScore: String(matchScore),
                recScore: String(target.boostedScore),
                recReason: target.reason,
                recSourceHint: target.sourceHint,
                previewPathHint: buildPreviewPathHint(
                  target,
                  bridgeSchool,
                  bridgeCompany
                ),
              });

              if (otherOwnerUserId) {
                pathQuery.set("otherOwnerUserId", otherOwnerUserId);
              }

              return (
                <section
                  key={target.pid}
                  className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold leading-tight">
                        {target.displayName}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-neutral-500">
                        {target.category} · {target.country}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-black px-3 py-2 text-right text-white">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">
                        Score
                      </p>
                      <p className="text-lg font-bold leading-none">
                        {target.boostedScore}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-neutral-700">
                    <p>
                      <span className="font-semibold">Reason:</span>{" "}
                      {target.reason || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Source Hint:</span>{" "}
                      {target.sourceHint || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Preview Path:</span>{" "}
                      {buildPreviewPathHint(target, bridgeSchool, bridgeCompany)}
                    </p>
                  </div>

                  {target.evidence.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {target.evidence.slice(0, 4).map((ev, index) => (
                        <span
                          key={`${target.pid}-${ev.orgPid}-${index}`}
                          className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700"
                        >
                          {ev.matchType === "school" ? "학교" : "회사"} · {ev.orgName} ·
                          trust {ev.edgeTrust}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 grid grid-cols-1 gap-3">
                    <Link
                      href={`/path?${pathQuery.toString()}`}
                      className="cursor-pointer rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold text-neutral-900"
                    >
                      이 타겟으로 경로 탐색하기
                    </Link>

                    <SaveBridgeButton
                      ownerUserId={ownerUserId}
                      otherOwnerUserId={otherOwnerUserId}
                      bridgeName={bridgeName}
                      bridgeCity={bridgeCity}
                      bridgeSchool={bridgeSchool}
                      bridgeCompany={bridgeCompany}
                      matchScore={matchScore}
                      matchLabel={matchLabel}
                      target={target}
                    />
                  </div>
                </section>
              );
            })
          : null}
      </div>
    </main>
  );
}

export default function OverlapExplorePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900">
          <div className="mx-auto w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">페이지를 불러오는 중...</p>
          </div>
        </main>
      }
    >
      <OverlapExploreContent />
    </Suspense>
  );
}
