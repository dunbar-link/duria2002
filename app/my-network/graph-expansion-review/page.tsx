"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type ReviewStatus = "queued" | "reviewing" | "approved" | "rejected";

type CandidateItem = {
  id: string;
  owner_user_id: string;
  status: string;
  source_type: string | null;
  bridge_candidate_id: string | null;
  bridge_candidate_id_key: string | null;
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
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
};

type LoadResponse =
  | {
      ok: true;
      items: CandidateItem[];
    }
  | {
      ok: false;
      error: string;
    };

type UpdateStatusResponse =
  | {
      ok: true;
      item: CandidateItem;
      message?: string;
    }
  | {
      ok: false;
      error: string;
    };

type SeedResponse =
  | {
      ok: true;
      candidateId?: string;
      bridgePid?: string;
      targetPid?: string;
      trust?: number;
      tier?: number;
      edgeLabel?: string;
      message?: string;
    }
  | {
      ok: false;
      error: string;
    };

const REVIEW_FILTERS: ReviewStatus[] = [
  "queued",
  "reviewing",
  "approved",
  "rejected",
];

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR");
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function statusBadgeClass(status: string) {
  if (status === "queued") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }

  if (status === "reviewing") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }

  if (status === "approved") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }

  if (status === "rejected") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function GraphExpansionReviewPage() {
  const [filter, setFilter] = useState<ReviewStatus>("queued");
  const [items, setItems] = useState<CandidateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [actionCandidateId, setActionCandidateId] = useState("");

  const loadCandidates = async (nextFilter: ReviewStatus) => {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const qs = new URLSearchParams({
        ownerUserId: FIXED_OWNER_USER_ID,
        status: nextFilter,
      });

      const response = await fetch(
        `/api/my-network/graph-expansion-candidates?${qs.toString()}`,
        {
          cache: "no-store",
        }
      );

      const data = (await response.json()) as LoadResponse;

      if (!response.ok || !data.ok) {
        setItems([]);
        setError(data.ok ? "Failed to load review candidates." : data.error);
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      const nextError =
        err instanceof Error ? err.message : "Failed to load review candidates.";

      setItems([]);
      setError(nextError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCandidates(filter);
  }, [filter]);

  const summary = useMemo(() => {
    return {
      total: items.length,
      queued: items.filter((item) => item.status === "queued").length,
      reviewing: items.filter((item) => item.status === "reviewing").length,
      approved: items.filter((item) => item.status === "approved").length,
      rejected: items.filter((item) => item.status === "rejected").length,
    };
  }, [items]);

  const changeStatusOnly = async (
    candidateId: string,
    nextStatus: ReviewStatus
  ) => {
    const response = await fetch(
      `/api/my-network/graph-expansion-candidates/${candidateId}/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nextStatus,
        }),
      }
    );

    const data = (await response.json()) as UpdateStatusResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.ok ? "Failed to update status." : data.error);
    }

    return data;
  };

  const runSeed = async (candidateId: string) => {
    const response = await fetch(
      `/api/my-network/graph-expansion-candidates/${candidateId}/seed`,
      {
        method: "POST",
      }
    );

    const data = (await response.json()) as SeedResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.ok ? "Failed to run seed." : data.error);
    }

    return data;
  };

  const handleStatusChange = async (
    candidateId: string,
    nextStatus: ReviewStatus
  ) => {
    try {
      setActionCandidateId(candidateId);
      setError("");
      setMessage("");

      if (nextStatus === "approved") {
        await changeStatusOnly(candidateId, "approved");

        const seedResult = await runSeed(candidateId);

        setMessage(
          [
            "Approved and auto-seeded successfully.",
            seedResult.message ? `message: ${seedResult.message}` : "",
            seedResult.bridgePid ? `bridgePid: ${seedResult.bridgePid}` : "",
            seedResult.targetPid ? `targetPid: ${seedResult.targetPid}` : "",
            typeof seedResult.trust === "number"
              ? `trust: ${seedResult.trust}`
              : "",
            typeof seedResult.tier === "number"
              ? `tier: ${seedResult.tier}`
              : "",
          ]
            .filter(Boolean)
            .join("  ")
        );

        await loadCandidates(filter);
        return;
      }

      const statusResult = await changeStatusOnly(candidateId, nextStatus);

      setMessage(statusResult.message ?? `Status changed to ${nextStatus}.`);

      await loadCandidates(filter);
    } catch (err) {
      const nextError =
        err instanceof Error ? err.message : "Failed to update status.";

      setError(nextError);
    } finally {
      setActionCandidateId("");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/my-network"
              className="inline-flex w-fit items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← Back to My Network
            </Link>

            <Link
              href="/my-network/graph-expansion-candidates"
              className="inline-flex w-fit items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Open Candidate Queue
            </Link>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Graph Expansion Review
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Review queue 전용 운영 화면입니다.
              <br />
              queued / reviewing / approved / rejected 상태를 필터링하고
              <br />
              Approve / Reject / Set Reviewing 버튼으로 상태를 변경할 수 있습니다.
              <br />
              Approve는 이제 자동으로 seed까지 실행합니다.
            </p>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="text-sm font-semibold text-slate-800">
              Owner User ID
            </div>
            <div className="mt-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {FIXED_OWNER_USER_ID}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {REVIEW_FILTERS.map((status) => {
              const isActive = filter === status;

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-medium",
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {status}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Current Filter</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {filter}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Loaded</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {summary.total}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Queued</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {summary.queued}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Reviewing</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {summary.reviewing}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Approved / Rejected</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {summary.approved} / {summary.rejected}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadCandidates(filter)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Loading review queue...
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          {items.length === 0 && !loading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
              No candidates found for filter: <b>{filter}</b>
            </div>
          ) : null}

          {items.map((item) => {
            const isBusy = actionCandidateId === item.id;

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          statusBadgeClass(item.status),
                        ].join(" ")}
                      >
                        {item.status}
                      </span>

                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        score: {item.match_score ?? 0}
                      </span>

                      {item.match_label ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          {item.match_label}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Candidate ID
                          </div>
                          <div className="mt-1 break-all text-sm text-slate-800">
                            {item.id}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Target
                          </div>
                          <div className="mt-1 text-base font-semibold text-slate-900">
                            {item.target_name || "(no target name)"}
                          </div>
                          <div className="mt-1 break-all text-sm text-slate-600">
                            PID: {item.target_pid || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            Category: {item.target_category || "-"} / Country:{" "}
                            {item.target_country || "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Bridge
                          </div>
                          <div className="mt-1 text-sm text-slate-800">
                            Name: {item.bridge_name || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            City: {item.bridge_city || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            School: {item.bridge_school || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            Company: {item.bridge_company || "-"}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Source
                          </div>
                          <div className="mt-1 text-sm text-slate-800">
                            source_type: {item.source_type || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            bridge_candidate_id: {item.bridge_candidate_id || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            bridge_candidate_id_key:{" "}
                            {item.bridge_candidate_id_key || "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Reason / Hint
                          </div>
                          <div className="mt-1 text-sm text-slate-800">
                            preview_path_hint: {item.preview_path_hint || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            expansion_reason: {item.expansion_reason || "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Timestamps
                          </div>
                          <div className="mt-1 text-sm text-slate-800">
                            created_at: {formatDateTime(item.created_at)}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            updated_at: {formatDateTime(item.updated_at)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Metadata
                      </div>
                      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">
                        {prettyJson(item.metadata)}
                      </pre>
                    </div>
                  </div>

                  <div className="w-full shrink-0 lg:w-56">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 text-sm font-semibold text-slate-800">
                        Review Actions
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleStatusChange(item.id, "reviewing")
                          }
                          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? "Processing..." : "Set Reviewing"}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleStatusChange(item.id, "approved")
                          }
                          className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? "Approving + Seeding..." : "Approve"}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleStatusChange(item.id, "rejected")
                          }
                          className="w-full rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? "Processing..." : "Reject"}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleStatusChange(item.id, "queued")
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? "Processing..." : "Move To Queued"}
                        </button>
                      </div>

                      <div className="mt-3 text-xs leading-5 text-slate-500">
                        Approve 버튼은 상태를 approved로 바꾼 뒤
                        <br />
                        seed API를 자동 실행합니다.
                        <br />
                        seeded / archived 상태는 이 화면에서 변경하지 않도록
                        <br />
                        API에서 막아두었습니다.
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}