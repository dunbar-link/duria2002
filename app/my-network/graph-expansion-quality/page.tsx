"use client";

import { useEffect, useMemo, useState } from "react";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type CandidateQuality = {
  candidateId: string;
  score: number;
  label: "high" | "medium" | "low";
  normalizedTargetName: string;
  normalizedBridgeName: string;
  aliasKeys: string[];
  dedupKey: string;
  duplicateGroupSize: number;
  duplicateIds: string[];
  evidence: {
    hasTargetPid: boolean;
    hasTargetName: boolean;
    hasBridgeName: boolean;
    hasBridgeCity: boolean;
    hasBridgeSchool: boolean;
    hasBridgeCompany: boolean;
    hasPreviewPathHint: boolean;
    hasExpansionReason: boolean;
    sourceTypeBoost: number;
    statusPenalty: number;
    duplicatePenalty: number;
    aliasStrength: number;
  };
};

type CandidateItem = {
  id: string;
  status: string;
  source_type: string;
  owner_user_id: string;
  target_pid: string | null;
  target_name: string | null;
  target_category: string | null;
  target_country: string | null;
  bridge_name: string | null;
  bridge_city: string | null;
  bridge_school: string | null;
  bridge_company: string | null;
  match_score: number | null;
  match_label: string | null;
  preview_path_hint: string | null;
  expansion_reason: string | null;
  created_at: string | null;
  quality: CandidateQuality | null;
};

type LoadResponse =
  | {
      ok: true;
      ownerUserId: string;
      count: number;
      items: CandidateItem[];
    }
  | {
      ok: false;
      error: string;
    };

type RescoreResponse =
  | {
      ok: true;
      ownerUserId: string;
      count: number;
      results: CandidateQuality[];
    }
  | {
      ok: false;
      error: string;
    };

async function readJsonSafely<T>(res: Response): Promise<T> {
  const text = await res.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `API returned non-JSON response. status=${res.status} body=${text.slice(0, 300)}`,
    );
  }
}

function badgeClass(label?: string | null) {
  if (label === "high") {
    return "bg-green-100 text-green-800 border-green-200";
  }

  if (label === "medium") {
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  }

  if (label === "low") {
    return "bg-red-100 text-red-800 border-red-200";
  }

  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function GraphExpansionQualityPage() {
  const [items, setItems] = useState<CandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({
      ownerUserId: FIXED_OWNER_USER_ID,
    });

    if (statusFilter) {
      params.set("status", statusFilter);
    }

    return `/api/my-network/graph-expansion-quality?${params.toString()}`;
  }, [statusFilter]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(apiUrl, {
        method: "GET",
        cache: "no-store",
      });

      const json = await readJsonSafely<LoadResponse>(res);

      if (!json.ok) {
        setItems([]);
        setError(json.error || "Failed to load quality data.");
        return;
      }

      setItems(json.items ?? []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRescoreAll() {
    setRescoring(true);
    setError("");

    try {
      const res = await fetch("/api/my-network/graph-expansion-quality", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId: FIXED_OWNER_USER_ID,
        }),
      });

      const json = await readJsonSafely<RescoreResponse>(res);

      if (!json.ok) {
        setError(json.error || "Failed to rescore.");
        return;
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRescoring(false);
    }
  }

  useEffect(() => {
    void load();
  }, [apiUrl]);

  const summary = useMemo(() => {
    const high = items.filter((item) => item.quality?.label === "high").length;
    const medium = items.filter((item) => item.quality?.label === "medium").length;
    const low = items.filter((item) => item.quality?.label === "low").length;
    const duplicated = items.filter(
      (item) => (item.quality?.duplicateGroupSize ?? 1) > 1,
    ).length;

    return {
      total: items.length,
      high,
      medium,
      low,
      duplicated,
    };
  }, [items]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">
            Graph Expansion Quality
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Evidence scoring, alias matching, candidate deduplication 결과를
            확인하는 디버그 페이지입니다.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRescoreAll}
              disabled={rescoring}
              className="rounded-xl border border-black bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rescoring ? "Rescoring..." : "Rescore All"}
            </button>

            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border px-4 py-2 text-sm font-medium"
            >
              Reload
            </button>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="queued">queued</option>
              <option value="reviewing">reviewing</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="seeded">seeded</option>
              <option value="archived">archived</option>
            </select>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase text-neutral-500">Total</div>
            <div className="mt-2 text-3xl font-bold">{summary.total}</div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase text-neutral-500">High</div>
            <div className="mt-2 text-3xl font-bold">{summary.high}</div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase text-neutral-500">Medium</div>
            <div className="mt-2 text-3xl font-bold">{summary.medium}</div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase text-neutral-500">Low</div>
            <div className="mt-2 text-3xl font-bold">{summary.low}</div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase text-neutral-500">Duplicated</div>
            <div className="mt-2 text-3xl font-bold">{summary.duplicated}</div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border bg-white p-8 text-sm text-neutral-600 shadow-sm">
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border bg-white p-8 text-sm text-neutral-600 shadow-sm">
            No candidates found.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const q = item.quality;

              return (
                <section
                  key={item.id}
                  className="rounded-2xl border bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">
                          {item.target_name || "(no target name)"}
                        </h2>

                        <span className="rounded-full border px-3 py-1 text-xs font-medium">
                          {item.status}
                        </span>

                        <span className="rounded-full border px-3 py-1 text-xs font-medium">
                          {item.source_type}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(
                            q?.label,
                          )}`}
                        >
                          {q?.label ?? "unscored"}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-neutral-700 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Candidate ID
                          </div>
                          <div className="mt-1 break-all">{item.id}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Target PID
                          </div>
                          <div className="mt-1 break-all">{item.target_pid || "-"}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Bridge Name
                          </div>
                          <div className="mt-1">{item.bridge_name || "-"}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Created At
                          </div>
                          <div className="mt-1">{formatDate(item.created_at)}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Bridge City
                          </div>
                          <div className="mt-1">{item.bridge_city || "-"}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Bridge School
                          </div>
                          <div className="mt-1">{item.bridge_school || "-"}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Bridge Company
                          </div>
                          <div className="mt-1">{item.bridge_company || "-"}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Stored Match Score
                          </div>
                          <div className="mt-1">
                            {item.match_score ?? "-"} / {item.match_label ?? "-"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full rounded-2xl border bg-neutral-50 p-5 lg:max-w-sm">
                      <div className="text-xs uppercase text-neutral-500">
                        Quality Score
                      </div>

                      <div className="mt-2 text-4xl font-bold">
                        {q?.score ?? "-"}
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-neutral-700">
                        <div>
                          normalizedTargetName:{" "}
                          <span className="font-medium">
                            {q?.normalizedTargetName || "-"}
                          </span>
                        </div>

                        <div>
                          normalizedBridgeName:{" "}
                          <span className="font-medium">
                            {q?.normalizedBridgeName || "-"}
                          </span>
                        </div>

                        <div>
                          duplicateGroupSize:{" "}
                          <span className="font-medium">
                            {q?.duplicateGroupSize ?? "-"}
                          </span>
                        </div>

                        <div>
                          aliasKeys:{" "}
                          <span className="font-medium break-all">
                            {q?.aliasKeys?.join(", ") || "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border bg-neutral-50 p-5">
                      <div className="mb-3 text-sm font-semibold">
                        Evidence Breakdown
                      </div>

                      <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-2">
                        <div>hasTargetPid: {String(q?.evidence.hasTargetPid ?? false)}</div>
                        <div>hasTargetName: {String(q?.evidence.hasTargetName ?? false)}</div>
                        <div>hasBridgeName: {String(q?.evidence.hasBridgeName ?? false)}</div>
                        <div>hasBridgeCity: {String(q?.evidence.hasBridgeCity ?? false)}</div>
                        <div>hasBridgeSchool: {String(q?.evidence.hasBridgeSchool ?? false)}</div>
                        <div>hasBridgeCompany: {String(q?.evidence.hasBridgeCompany ?? false)}</div>
                        <div>
                          hasPreviewPathHint: {String(q?.evidence.hasPreviewPathHint ?? false)}
                        </div>
                        <div>
                          hasExpansionReason: {String(q?.evidence.hasExpansionReason ?? false)}
                        </div>
                        <div>sourceTypeBoost: {q?.evidence.sourceTypeBoost ?? 0}</div>
                        <div>statusPenalty: {q?.evidence.statusPenalty ?? 0}</div>
                        <div>duplicatePenalty: {q?.evidence.duplicatePenalty ?? 0}</div>
                        <div>aliasStrength: {q?.evidence.aliasStrength ?? 0}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-neutral-50 p-5">
                      <div className="mb-3 text-sm font-semibold">
                        Dedup / Context
                      </div>

                      <div className="space-y-3 text-sm text-neutral-700">
                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Dedup Key
                          </div>
                          <div className="mt-1 break-all">{q?.dedupKey || "-"}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Duplicate IDs
                          </div>
                          <div className="mt-1 break-all">
                            {q?.duplicateIds?.join(", ") || "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Preview Path Hint
                          </div>
                          <div className="mt-1">{item.preview_path_hint || "-"}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase text-neutral-500">
                            Expansion Reason
                          </div>
                          <div className="mt-1">{item.expansion_reason || "-"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}