"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type BridgeCandidateItem = {
  id: string;
  status: string;
  owner_user_id: string;
  other_owner_user_id: string | null;
  bridge_name: string;
  bridge_city: string | null;
  bridge_school: string | null;
  bridge_company: string | null;
  match_score: number;
  match_label: string | null;
  suggested_target_pid: string;
  suggested_target_name: string | null;
  preview_path_hint: string | null;
  metadata: {
    category?: string;
    country?: string;
    boostedScore?: number;
    sourceHint?: string;
    reason?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

type BridgeCandidateListResponse =
  | { ok: true; items: BridgeCandidateItem[] }
  | { ok: false; error: string };

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function formatDateTime(value: string) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getTargetName(item: BridgeCandidateItem) {
  return (
    cleanText(item.suggested_target_name) ||
    cleanText(item.suggested_target_pid) ||
    "Unknown Target"
  );
}

function getCategory(item: BridgeCandidateItem) {
  return cleanText(item.metadata?.category) || "unknown";
}

function getCountry(item: BridgeCandidateItem) {
  return cleanText(item.metadata?.country) || "unknown";
}

function getReason(item: BridgeCandidateItem) {
  return cleanText(item.metadata?.reason) || "-";
}

function getSourceHint(item: BridgeCandidateItem) {
  return cleanText(item.metadata?.sourceHint) || "-";
}

function getBoostedScore(item: BridgeCandidateItem) {
  const value = Number(item.metadata?.boostedScore);
  if (Number.isFinite(value)) return value;
  return 0;
}

function buildPathUrl(item: BridgeCandidateItem) {
  const params = new URLSearchParams({
    ownerUserId: item.owner_user_id,
    targetPid: item.suggested_target_pid,
    targetName: getTargetName(item),
    targetCategory: getCategory(item),
    from: "approved-bridge-candidate",
    bridgeName: cleanText(item.bridge_name),
    bridgeCity: cleanText(item.bridge_city),
    bridgeSchool: cleanText(item.bridge_school),
    bridgeCompany: cleanText(item.bridge_company),
    bridgeMatchScore: String(item.match_score || 0),
    recScore: String(getBoostedScore(item)),
    recReason: getReason(item),
    recSourceHint: getSourceHint(item),
    previewPathHint: cleanText(item.preview_path_hint),
  });

  if (cleanText(item.other_owner_user_id || "")) {
    params.set("otherOwnerUserId", cleanText(item.other_owner_user_id || ""));
  }

  return `/path?${params.toString()}`;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-sm leading-6 text-neutral-900 break-words">
        {value || "-"}
      </p>
    </div>
  );
}

function ExpansionButton({
  item,
}: {
  item: BridgeCandidateItem;
}) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  async function handleCreateExpansionCandidate() {
    try {
      setSaving(true);
      setMessage("");

      const res = await fetch("/api/my-network/graph-expansion-candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId: item.owner_user_id,
          bridgeCandidateId: item.id,
          status: "queued",
          sourceType: "approved_bridge",
          targetPid: item.suggested_target_pid,
          targetName: getTargetName(item),
          targetCategory: getCategory(item),
          targetCountry: getCountry(item),
          bridgeName: cleanText(item.bridge_name),
          bridgeCity: cleanText(item.bridge_city),
          bridgeSchool: cleanText(item.bridge_school),
          bridgeCompany: cleanText(item.bridge_company),
          matchScore: item.match_score || 0,
          matchLabel: cleanText(item.match_label),
          previewPathHint: cleanText(item.preview_path_hint),
          expansionReason: getReason(item),
          metadata: {
            sourceHint: getSourceHint(item),
            boostedScore: getBoostedScore(item),
            bridgeCandidateStatus: item.status,
          },
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "graph expansion candidate 생성 실패");
      }

      setDone(true);
      setMessage("graph expansion candidate 생성 완료");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "graph expansion candidate 생성 실패"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleCreateExpansionCandidate}
        disabled={saving || done}
        className="cursor-pointer block w-full rounded-2xl border border-black bg-black px-4 py-3 text-center text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving
          ? "생성 중..."
          : done
          ? "graph expansion candidate 생성됨"
          : "graph expansion candidate 로 올리기"}
      </button>

      {message ? (
        <p className="mt-2 text-xs leading-5 text-neutral-600">{message}</p>
      ) : null}
    </div>
  );
}

function ApprovedBridgeCandidatesPageContent() {
  const searchParams = useSearchParams();
  const ownerUserId = searchParams.get("ownerUserId") || "";

  const [items, setItems] = useState<BridgeCandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          `/api/my-network/bridge-candidates?ownerUserId=${encodeURIComponent(ownerUserId)}&status=approved&limit=200`,
          { cache: "no-store" }
        );

        const json = (await res.json()) as BridgeCandidateListResponse;

        if (!res.ok || !json.ok) {
          throw new Error("error" in json ? json.error : "approved 목록 조회 실패");
        }

        if (!ignore) {
          setItems(json.items || []);
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
  }, [ownerUserId]);

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <section className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Dunbar Link Approved View
          </p>

          <h1 className="mt-2 text-2xl font-bold leading-tight">
            Approved Bridge Candidates
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-600">
            승인된 bridge candidate 만 따로 보는 화면입니다.
          </p>

          <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Approved Count
            </p>
            <p className="mt-1 text-lg font-bold text-neutral-900">{items.length}</p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              href={`/my-network/graph-expansion-candidates?ownerUserId=${encodeURIComponent(ownerUserId)}`}
              className="cursor-pointer rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold text-neutral-900"
            >
              graph expansion candidate 목록 보기
            </Link>

            <Link
              href={`/my-network/bridge-candidates/review?ownerUserId=${encodeURIComponent(ownerUserId)}`}
              className="cursor-pointer rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold text-neutral-900"
            >
              review 전용 화면으로 이동
            </Link>

            <Link
              href={`/my-network/bridge-candidates?ownerUserId=${encodeURIComponent(ownerUserId)}`}
              className="cursor-pointer rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold text-neutral-900"
            >
              전체 bridge candidate 목록으로 이동
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-6 text-neutral-600">approved 목록을 불러오는 중...</p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-[28px] border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-red-700">오류</p>
            <p className="mt-2 text-sm leading-6 text-red-600">{error}</p>
          </section>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <section className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-6 text-neutral-600">approved 상태 항목이 없습니다.</p>
          </section>
        ) : null}

        {!loading && !error
          ? items.map((item) => (
              <article
                key={item.id}
                className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-tight break-words">
                      {getTargetName(item)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-neutral-500">
                      {getCategory(item)} · {getCountry(item)}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-2xl bg-black px-3 py-2 text-right text-white">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">
                      Score
                    </p>
                    <p className="text-lg font-bold leading-none">
                      {getBoostedScore(item)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <InfoRow label="Bridge Name" value={cleanText(item.bridge_name) || "-"} />
                  <InfoRow label="City" value={cleanText(item.bridge_city) || "-"} />
                  <InfoRow label="School" value={cleanText(item.bridge_school) || "-"} />
                  <InfoRow label="Company" value={cleanText(item.bridge_company) || "-"} />
                  <InfoRow
                    label="Match"
                    value={`${item.match_score || 0} / ${cleanText(item.match_label) || "-"}`}
                  />
                  <InfoRow label="Reason" value={getReason(item)} />
                  <InfoRow label="Source Hint" value={getSourceHint(item)} />
                  <InfoRow
                    label="Preview Path"
                    value={cleanText(item.preview_path_hint) || "-"}
                  />
                  <InfoRow
                    label="Approved Updated"
                    value={formatDateTime(item.updated_at)}
                  />
                </div>

                <div className="mt-4">
                  <Link
                    href={buildPathUrl(item)}
                    className="cursor-pointer block rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-center text-sm font-semibold text-neutral-900"
                  >
                    승인된 브리지로 경로 탐색하기
                  </Link>
                </div>

                <ExpansionButton item={item} />
              </article>
            ))
          : null}
      </div>
    </main>
  );
}

export default function ApprovedBridgeCandidatesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900">
          <div className="mx-auto flex min-h-[320px] w-full max-w-md items-center justify-center text-sm text-neutral-500">
            approved bridge candidates 불러오는 중...
          </div>
        </main>
      }
    >
      <ApprovedBridgeCandidatesPageContent />
    </Suspense>
  );
}
