"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type SeedResult = {
  seeded_at?: string;
  bridge_pid?: string;
  target_pid?: string;
  trust?: number;
  tier?: number;
  edge_label?: string;
  log_id?: string;
  candidate_id?: string;
};

type GraphExpansionCandidate = {
  id: string;
  owner_user_id: string;
  status: "queued" | "reviewing" | "approved" | "rejected" | "seeded" | "archived";
  source_type: "approved_bridge" | "manual" | "operator";
  bridge_candidate_id: string | null;
  bridge_candidate_id_key: string;
  target_pid: string;
  target_name: string | null;
  target_category: string | null;
  target_country: string | null;
  bridge_name: string | null;
  bridge_city: string | null;
  bridge_school: string | null;
  bridge_company: string | null;
  match_score: number;
  match_label: string | null;
  preview_path_hint: string | null;
  expansion_reason: string | null;
  metadata: {
    note?: string;
    seed_result?: SeedResult;
    [key: string]: unknown;
  } | null;
  created_at: string;
  updated_at: string;
};

type LoadResponse =
  | {
      ok: true;
      items: GraphExpansionCandidate[];
    }
  | {
      ok: false;
      error: string;
    };

type SeedResponse =
  | {
      ok: true;
      candidateId: string;
      bridgePid: string;
      targetPid: string;
      trust: number;
      tier: number;
      edgeLabel: string;
      logId: string;
      seededAt: string;
    }
  | {
      ok: false;
      error: string;
    };

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString("ko-KR");
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getSeedResult(candidate: GraphExpansionCandidate): SeedResult | null {
  if (!candidate.metadata || typeof candidate.metadata !== "object") {
    return null;
  }

  const raw = candidate.metadata.seed_result;

  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as SeedResult;
}

export default function GraphExpansionCandidatesPage() {
  const [items, setItems] = useState<GraphExpansionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "queued" | "reviewing" | "approved" | "rejected" | "seeded" | "archived"
  >("all");

  const [seedingId, setSeedingId] = useState("");
  const [seedMessage, setSeedMessage] = useState("");
  const [seedError, setSeedError] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/my-network/graph-expansion-candidates?ownerUserId=${encodeURIComponent(
          FIXED_OWNER_USER_ID
        )}`,
        {
          cache: "no-store",
        }
      );

      const json = (await res.json()) as LoadResponse;

      if (!json.ok) {
        setError(json.error || "후보 목록을 불러오지 못했습니다.");
        setItems([]);
        return;
      }

      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "후보 목록 조회 중 오류가 발생했습니다.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    if (selectedStatus === "all") {
      return items;
    }

    return items.filter((item) => item.status === selectedStatus);
  }, [items, selectedStatus]);

  async function handleSeed(candidateId: string) {
    setSeedingId(candidateId);
    setSeedMessage("");
    setSeedError("");

    try {
      const res = await fetch(
        `/api/my-network/graph-expansion-candidates/${candidateId}/seed`,
        {
          method: "POST",
        }
      );

      const json = (await res.json()) as SeedResponse;

      if (!json.ok) {
        setSeedError(json.error || "Seed 실행에 실패했습니다.");
        return;
      }

      setSeedMessage(
        [
          "Seed 성공",
          `candidateId: ${json.candidateId}`,
          `bridgePid: ${json.bridgePid}`,
          `targetPid: ${json.targetPid}`,
          `trust: ${json.trust}`,
          `tier: ${json.tier}`,
          `edgeLabel: ${json.edgeLabel}`,
          `seededAt: ${json.seededAt}`,
        ].join("\n")
      );

      await loadItems();
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Seed 실행 중 오류가 발생했습니다.");
    } finally {
      setSeedingId("");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-3">
          <p className="text-sm text-neutral-400">Dunbar Link v2</p>

          <h1 className="text-3xl font-bold">Graph Expansion Candidates</h1>

          <p className="max-w-3xl text-sm leading-6 text-neutral-300">
            운영자가 Graph Expansion 후보를 확인하고 Seed 실행 결과를 검토하는 화면입니다.
            이제 이미 seeded 상태인 후보도 metadata.seed_result 내용을 자동 표시합니다.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/my-network"
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
            >
              ← My Network
            </Link>

            <button
              type="button"
              onClick={() => void loadItems()}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
            >
              새로고침
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-neutral-200">운영 필터</div>

              <label className="flex flex-col gap-2 text-sm text-neutral-300">
                <span>Status</span>
                <select
                  value={selectedStatus}
                  onChange={(e) =>
                    setSelectedStatus(
                      e.target.value as
                        | "all"
                        | "queued"
                        | "reviewing"
                        | "approved"
                        | "rejected"
                        | "seeded"
                        | "archived"
                    )
                  }
                  className="w-[220px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none"
                >
                  <option value="all">all</option>
                  <option value="queued">queued</option>
                  <option value="reviewing">reviewing</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                  <option value="seeded">seeded</option>
                  <option value="archived">archived</option>
                </select>
              </label>
            </div>

            <div className="text-sm text-neutral-400">
              전체 {items.length}건 / 현재 {filteredItems.length}건
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
            <p className="text-sm text-neutral-300">후보 목록 불러오는 중...</p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-red-800 bg-red-950/40 p-6">
            <p className="text-sm font-semibold text-red-300">로드 오류</p>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-red-200">{error}</pre>
          </section>
        ) : null}

        {seedMessage ? (
          <section className="rounded-2xl border border-emerald-800 bg-emerald-950/40 p-6">
            <p className="text-sm font-semibold text-emerald-300">마지막 Seed 결과</p>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-emerald-200">
              {seedMessage}
            </pre>
          </section>
        ) : null}

        {seedError ? (
          <section className="rounded-2xl border border-red-800 bg-red-950/40 p-6">
            <p className="text-sm font-semibold text-red-300">Seed 오류</p>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-red-200">{seedError}</pre>
          </section>
        ) : null}

        <section className="grid gap-5">
          {filteredItems.length === 0 && !loading ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 text-sm text-neutral-400">
              표시할 후보가 없습니다.
            </div>
          ) : null}

          {filteredItems.map((item) => {
            const seedResult = getSeedResult(item);
            const canSeed = item.status === "approved";
            const isSeeding = seedingId === item.id;

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6"
              >
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200">
                          status: {item.status}
                        </span>

                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200">
                          source: {item.source_type}
                        </span>

                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200">
                          score: {item.match_score}
                        </span>

                        {item.match_label ? (
                          <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200">
                            match: {item.match_label}
                          </span>
                        ) : null}
                      </div>

                      <h2 className="text-2xl font-semibold">
                        {item.target_name || item.target_pid || "Unnamed Target"}
                      </h2>

                      <div className="grid gap-2 text-sm text-neutral-300 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <span className="text-neutral-500">candidateId</span>
                          <div className="break-all text-neutral-200">{item.id}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">targetPid</span>
                          <div className="break-all text-neutral-200">{item.target_pid || "-"}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">category</span>
                          <div className="text-neutral-200">{item.target_category || "-"}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">country</span>
                          <div className="text-neutral-200">{item.target_country || "-"}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">createdAt</span>
                          <div className="text-neutral-200">{formatDateTime(item.created_at)}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">updatedAt</span>
                          <div className="text-neutral-200">{formatDateTime(item.updated_at)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={!canSeed || isSeeding}
                        onClick={() => void handleSeed(item.id)}
                        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isSeeding ? "Seeding..." : "Run Seed"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                      <h3 className="text-sm font-semibold text-neutral-200">Bridge 정보</h3>

                      <div className="mt-3 grid gap-2 text-sm text-neutral-300">
                        <div>
                          <span className="text-neutral-500">bridge_name</span>
                          <div className="text-neutral-200">{item.bridge_name || "-"}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">bridge_city</span>
                          <div className="text-neutral-200">{item.bridge_city || "-"}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">bridge_school</span>
                          <div className="text-neutral-200">{item.bridge_school || "-"}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">bridge_company</span>
                          <div className="text-neutral-200">{item.bridge_company || "-"}</div>
                        </div>

                        <div>
                          <span className="text-neutral-500">bridge_candidate_id</span>
                          <div className="break-all text-neutral-200">
                            {item.bridge_candidate_id || "-"}
                          </div>
                        </div>

                        <div>
                          <span className="text-neutral-500">bridge_candidate_id_key</span>
                          <div className="break-all text-neutral-200">
                            {item.bridge_candidate_id_key || "-"}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                      <h3 className="text-sm font-semibold text-neutral-200">Path / Reason 정보</h3>

                      <div className="mt-3 grid gap-2 text-sm text-neutral-300">
                        <div>
                          <span className="text-neutral-500">preview_path_hint</span>
                          <div className="whitespace-pre-wrap text-neutral-200">
                            {item.preview_path_hint || "-"}
                          </div>
                        </div>

                        <div>
                          <span className="text-neutral-500">expansion_reason</span>
                          <div className="whitespace-pre-wrap text-neutral-200">
                            {item.expansion_reason || "-"}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
                    <h3 className="text-sm font-semibold text-emerald-300">
                      Seed Result 자동 표시
                    </h3>

                    {seedResult ? (
                      <div className="mt-3 grid gap-2 text-sm text-emerald-100 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <span className="text-emerald-400">seeded_at</span>
                          <div>{formatDateTime(seedResult.seeded_at)}</div>
                        </div>

                        <div>
                          <span className="text-emerald-400">bridge_pid</span>
                          <div className="break-all">{seedResult.bridge_pid || "-"}</div>
                        </div>

                        <div>
                          <span className="text-emerald-400">target_pid</span>
                          <div className="break-all">{seedResult.target_pid || "-"}</div>
                        </div>

                        <div>
                          <span className="text-emerald-400">trust</span>
                          <div>{seedResult.trust ?? "-"}</div>
                        </div>

                        <div>
                          <span className="text-emerald-400">tier</span>
                          <div>{seedResult.tier ?? "-"}</div>
                        </div>

                        <div>
                          <span className="text-emerald-400">edge_label</span>
                          <div>{seedResult.edge_label || "-"}</div>
                        </div>

                        <div>
                          <span className="text-emerald-400">candidate_id</span>
                          <div className="break-all">{seedResult.candidate_id || item.id}</div>
                        </div>

                        <div>
                          <span className="text-emerald-400">log_id</span>
                          <div className="break-all">{seedResult.log_id || "-"}</div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-400">
                        metadata.seed_result 가 아직 없습니다.
                      </p>
                    )}
                  </section>

                  <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                    <h3 className="text-sm font-semibold text-neutral-200">Metadata JSON</h3>

                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-800 bg-black/40 p-4 text-xs text-neutral-300">
                      {prettyJson(item.metadata ?? {})}
                    </pre>
                  </section>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}