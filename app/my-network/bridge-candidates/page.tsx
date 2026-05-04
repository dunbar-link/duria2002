"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type BridgeCandidateItem = {
  id: string;
  status: string;
  source_type: string;
  owner_user_id: string;
  other_owner_user_id: string | null;
  other_owner_user_id_key: string;
  bridge_name: string;
  bridge_city: string | null;
  bridge_school: string | null;
  bridge_company: string | null;
  bridge_name_key: string;
  bridge_city_key: string;
  bridge_school_key: string;
  bridge_company_key: string;
  match_score: number;
  match_label: string | null;
  evidence_summary: string | null;
  suggested_target_pid: string;
  suggested_target_name: string | null;
  preview_path_hint: string | null;
  metadata: {
    category?: string;
    country?: string;
    baseScore?: number;
    boostedScore?: number;
    sourceHint?: string;
    reason?: string;
    evidence?: Array<{
      orgPid: string;
      orgName: string;
      matchType: "school" | "company";
      contactCount: number;
      edgeTrust: number;
    }>;
  } | null;
  created_at: string;
  updated_at: string;
};

type BridgeCandidateListResponse =
  | {
      ok: true;
      items: BridgeCandidateItem[];
    }
  | {
      ok: false;
      error: string;
    };

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "saved", label: "saved" },
  { value: "reviewing", label: "reviewing" },
  { value: "approved", label: "approved" },
  { value: "rejected", label: "rejected" },
  { value: "expanded", label: "expanded" },
  { value: "archived", label: "archived" },
];

const STATUS_ACTIONS: Array<{ value: BridgeCandidateItem["status"]; label: string }> = [
  { value: "saved", label: "saved로 변경" },
  { value: "reviewing", label: "reviewing으로 변경" },
  { value: "approved", label: "approved로 변경" },
  { value: "rejected", label: "rejected로 변경" },
  { value: "expanded", label: "expanded로 변경" },
  { value: "archived", label: "archived로 변경" },
];

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
  const explicit = cleanText(item.suggested_target_name);
  if (explicit) return explicit;

  const hint = cleanText(item.preview_path_hint);
  if (hint.includes("→")) {
    const parts = hint
      .split("→")
      .map((v) => v.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return item.suggested_target_pid || "Unknown Target";
}

function getCategory(item: BridgeCandidateItem) {
  return cleanText(item.metadata?.category) || "unknown";
}

function getCountry(item: BridgeCandidateItem) {
  return cleanText(item.metadata?.country) || "unknown";
}

function getReason(item: BridgeCandidateItem) {
  return cleanText(item.metadata?.reason) || cleanText(item.evidence_summary) || "-";
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
    from: "bridge-candidate",
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

function buildOverlapExploreUrl(item: BridgeCandidateItem) {
  const params = new URLSearchParams({
    ownerUserId: item.owner_user_id,
    name: cleanText(item.bridge_name),
    city: cleanText(item.bridge_city),
    school: cleanText(item.bridge_school),
    company: cleanText(item.bridge_company),
    matchScore: String(item.match_score || 0),
  });

  if (cleanText(item.other_owner_user_id || "")) {
    params.set("otherOwnerUserId", cleanText(item.other_owner_user_id || ""));
  }

  return `/my-network/overlap/explore?${params.toString()}`;
}

type StatusControlProps = {
  item: BridgeCandidateItem;
  onStatusUpdated: (nextItem: BridgeCandidateItem) => void;
};

function StatusControl({ item, onStatusUpdated }: StatusControlProps) {
  const [nextStatus, setNextStatus] = useState(item.status || "saved");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setNextStatus(item.status || "saved");
  }, [item.status]);

  async function handleUpdate() {
    try {
      setSaving(true);
      setMessage("");

      const res = await fetch("/api/my-network/bridge-candidates", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          ownerUserId: item.owner_user_id,
          status: nextStatus,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "상태 변경 실패");
      }

      onStatusUpdated(json.item as BridgeCandidateItem);
      setMessage("상태 변경 완료");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태 변경 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded-2xl border border-neutral-200 p-3">
      <p className="text-sm font-semibold text-neutral-900">상태 변경</p>

      <select
        value={nextStatus}
        onChange={(e) => setNextStatus(e.target.value)}
        disabled={saving}
        className="rounded-2xl border border-neutral-300 bg-white px-3 py-3 text-sm outline-none disabled:opacity-60"
      >
        {STATUS_ACTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handleUpdate}
        disabled={saving || nextStatus === item.status}
        className="cursor-pointer rounded-2xl border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "변경 중..." : "상태 적용"}
      </button>

      {message ? <p className="text-xs text-neutral-600">{message}</p> : null}
    </div>
  );
}

export default function BridgeCandidatesPage() {
  const searchParams = useSearchParams();

  const ownerUserId = searchParams.get("ownerUserId") || "";
  const initialStatus = searchParams.get("status") || "all";

  const [status, setStatus] = useState(initialStatus);
  const [items, setItems] = useState<BridgeCandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
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

        const qs = new URLSearchParams({
          ownerUserId,
        });

        if (status && status !== "all") {
          qs.set("status", status);
        }

        const res = await fetch(
          `/api/my-network/bridge-candidates?${qs.toString()}`,
          { cache: "no-store" }
        );

        const json = (await res.json()) as BridgeCandidateListResponse;

        if (!res.ok || !json.ok) {
          throw new Error("error" in json ? json.error : "bridge candidate 조회 실패");
        }

        if (!ignore) {
          setItems(Array.isArray(json.items) ? json.items : []);
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
  }, [ownerUserId, status, refreshTick]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      saved: items.filter((item) => item.status === "saved").length,
      reviewing: items.filter((item) => item.status === "reviewing").length,
      approved: items.filter((item) => item.status === "approved").length,
      rejected: items.filter((item) => item.status === "rejected").length,
      expanded: items.filter((item) => item.status === "expanded").length,
      archived: items.filter((item) => item.status === "archived").length,
    };
  }, [items]);

  function handleItemStatusUpdated(nextItem: BridgeCandidateItem) {
    setItems((prev) => prev.map((item) => (item.id === nextItem.id ? nextItem : item)));
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Dunbar Link
          </p>

          <h1 className="mt-2 text-2xl font-bold leading-tight">
            저장된 브리지 후보
          </h1>

          <p className="mt-2 text-sm leading-6 text-neutral-600">
            overlap 기반으로 저장한 bridge candidate 를 다시 보고, 상태를 관리하고,
            경로 탐색으로 바로 이어갈 수 있습니다.
          </p>

          <div className="mt-4 space-y-2 text-sm">
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              <span className="font-semibold">Owner User ID:</span>{" "}
              {ownerUserId || "-"}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              <span className="font-semibold">현재 필터:</span> {status}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">전체 {counts.total}</div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">saved {counts.saved}</div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              reviewing {counts.reviewing}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              approved {counts.approved}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              rejected {counts.rejected}
            </div>
            <div className="rounded-2xl bg-neutral-100 px-3 py-2">
              expanded {counts.expanded}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold">status 필터</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-2xl border border-neutral-300 bg-white px-3 py-3 outline-none"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setRefreshTick((v) => v + 1)}
              className="cursor-pointer rounded-2xl border border-black bg-black px-4 py-3 text-sm font-semibold text-white"
            >
              목록 새로고침
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 text-sm">
            <Link
              href={`/my-network/overlap?ownerUserId=${encodeURIComponent(ownerUserId)}`}
              className="cursor-pointer font-semibold text-neutral-700 underline underline-offset-4"
            >
              ← overlap 목록으로 이동
            </Link>

            <Link
              href={`/my-network?ownerUserId=${encodeURIComponent(ownerUserId)}`}
              className="cursor-pointer font-semibold text-neutral-700 underline underline-offset-4"
            >
              ← my-network 로 이동
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              bridge candidate 목록을 불러오는 중...
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-red-700">오류</p>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </section>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              저장된 bridge candidate 가 없습니다.
            </p>
          </section>
        ) : null}

        {!loading && !error
          ? items.map((item) => {
              const targetName = getTargetName(item);
              const category = getCategory(item);
              const country = getCountry(item);
              const reason = getReason(item);
              const sourceHint = getSourceHint(item);
              const boostedScore = getBoostedScore(item);

              return (
                <section
                  key={item.id}
                  className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold leading-tight">{targetName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-neutral-500">
                        {category} · {country}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-black px-3 py-2 text-right text-white">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">
                        Score
                      </p>
                      <p className="text-lg font-bold leading-none">{boostedScore}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Status:</span> {item.status || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Source Type:</span>{" "}
                      {item.source_type || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Bridge Name:</span>{" "}
                      {item.bridge_name || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">City:</span> {item.bridge_city || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">School:</span>{" "}
                      {item.bridge_school || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Company:</span>{" "}
                      {item.bridge_company || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Match:</span> {item.match_score} /{" "}
                      {item.match_label || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Reason:</span> {reason}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Source Hint:</span> {sourceHint}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Preview Path:</span>{" "}
                      {item.preview_path_hint || "-"}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Created:</span>{" "}
                      {formatDateTime(item.created_at)}
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-3 py-2">
                      <span className="font-semibold">Updated:</span>{" "}
                      {formatDateTime(item.updated_at)}
                    </div>
                  </div>

                  {Array.isArray(item.metadata?.evidence) &&
                  item.metadata?.evidence.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.metadata.evidence.slice(0, 4).map((ev, index) => (
                        <span
                          key={`${item.id}-${ev.orgPid}-${index}`}
                          className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700"
                        >
                          {ev.matchType === "school" ? "학교" : "회사"} · {ev.orgName} ·
                          trust {ev.edgeTrust}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 grid grid-cols-1 gap-3">
                    <StatusControl
                      item={item}
                      onStatusUpdated={handleItemStatusUpdated}
                    />

                    <Link
                      href={buildPathUrl(item)}
                      className="cursor-pointer rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold text-neutral-900"
                    >
                      이 타겟으로 경로 탐색하기
                    </Link>

                    <Link
                      href={buildOverlapExploreUrl(item)}
                      className="cursor-pointer rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold text-neutral-900"
                    >
                      overlap explore 다시 열기
                    </Link>
                  </div>
                </section>
              );
            })
          : null}
      </div>
    </main>
  );
}