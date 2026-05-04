"use client";

import { useCallback, useMemo, useState } from "react";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type AutoExecuteMode = "dry-run" | "execute";

type PlanRow = {
  candidateId: string;
  targetName: string;
  targetPid: string;
  ownerUserId: string;
  action: string;
  decision: string;
  costPlanned: number;
  seedAttempted: boolean;
  seedSuccess: boolean;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  finalStatus: string;
  error?: string;
  executionLogEntry?: Record<string, unknown>;
};

type AutoExecuteSummary = {
  total: number;
  skipped: number;
  wouldSeed: number;
  seeded: number;
  seedFailed: number;
  charged: number;
  chargePending: number;
};

type AutoExecuteResponse = {
  ok?: boolean;
  error?: string;
  ownerUserId?: string;
  mode?: AutoExecuteMode;
  limit?: number;
  source?: string;
  requestedBy?: string;
  summary?: Partial<AutoExecuteSummary>;
  items?: PlanRow[];
  planRows?: PlanRow[];
};

const EMPTY_SUMMARY: AutoExecuteSummary = {
  total: 0,
  skipped: 0,
  wouldSeed: 0,
  seeded: 0,
  seedFailed: 0,
  charged: 0,
  chargePending: 0,
};

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizePlanRows(payload: AutoExecuteResponse | null): PlanRow[] {
  if (!payload) {
    return [];
  }

  const rawRows = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.planRows)
    ? payload.planRows
    : [];

  return rawRows.map((item) => ({
    candidateId: asString(item?.candidateId, ""),
    targetName: asString(item?.targetName, ""),
    targetPid: asString(item?.targetPid, ""),
    ownerUserId: asString(item?.ownerUserId, ""),
    action: asString(item?.action, ""),
    decision: asString(item?.decision, ""),
    costPlanned: asNumber(item?.costPlanned, 0),
    seedAttempted: asBoolean(item?.seedAttempted, false),
    seedSuccess: asBoolean(item?.seedSuccess, false),
    chargeAttempted: asBoolean(item?.chargeAttempted, false),
    chargeSuccess: asBoolean(item?.chargeSuccess, false),
    finalStatus: asString(item?.finalStatus, ""),
    error: asString(item?.error, ""),
    executionLogEntry:
      item?.executionLogEntry && typeof item.executionLogEntry === "object"
        ? item.executionLogEntry
        : undefined,
  }));
}

function normalizeSummary(payload: AutoExecuteResponse | null): AutoExecuteSummary {
  const summary = payload?.summary;

  return {
    total: asNumber(summary?.total, 0),
    skipped: asNumber(summary?.skipped, 0),
    wouldSeed: asNumber(summary?.wouldSeed, 0),
    seeded: asNumber(summary?.seeded, 0),
    seedFailed: asNumber(summary?.seedFailed, 0),
    charged: asNumber(summary?.charged, 0),
    chargePending: asNumber(summary?.chargePending, 0),
  };
}

function formatBoolean(value: boolean) {
  return value ? "yes" : "no";
}

export default function GraphExpansionOperatorAutoPage() {
  const [ownerUserId, setOwnerUserId] = useState(FIXED_OWNER_USER_ID);
  const [limit, setLimit] = useState(10);
  const [mode, setMode] = useState<AutoExecuteMode>("dry-run");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AutoExecuteResponse | null>(null);
  const [error, setError] = useState("");

  const planRows = useMemo(() => normalizePlanRows(response), [response]);
  const summary = useMemo(() => normalizeSummary(response), [response]);

  const runPlan = useCallback(
    async (nextMode: AutoExecuteMode) => {
      setLoading(true);
      setError("");
      setMode(nextMode);

      try {
        const res = await fetch(
          "/api/my-network/graph-expansion-operator/auto-execute",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ownerUserId,
              mode: nextMode,
              limit,
              requestedBy: "operator_auto_page",
              source: "operator_auto_page",
            }),
          }
        );

        const data = (await res.json()) as AutoExecuteResponse;

        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || "Auto execute request failed.");
        }

        setResponse(data);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown request error";
        setError(message);
        setResponse(null);
      } finally {
        setLoading(false);
      }
    },
    [ownerUserId, limit]
  );

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
          <h1 className="text-2xl font-semibold">
            Graph Expansion Operator Auto Execute
          </h1>

          <p className="mt-2 text-sm text-neutral-400">
            Dry-run 과 execute 를 테스트하는 페이지입니다.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-neutral-300">Owner User ID</span>
              <input
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none"
                placeholder="owner user id"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-neutral-300">Limit</span>
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 1)}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-neutral-300">Current Mode</span>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">
                {mode}
              </div>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => runPlan("dry-run")}
              disabled={loading}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {loading && mode === "dry-run" ? "Running..." : "Run Dry-Run"}
            </button>

            <button
              type="button"
              onClick={() => runPlan("execute")}
              disabled={loading}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {loading && mode === "execute" ? "Executing..." : "Run Execute"}
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-900 bg-red-950 p-4 text-sm text-red-300">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
          <MetricCard label="Total" value={summary.total} />
          <MetricCard label="Skipped" value={summary.skipped} />
          <MetricCard label="Would Seed" value={summary.wouldSeed} />
          <MetricCard label="Seeded" value={summary.seeded} />
          <MetricCard label="Seed Failed" value={summary.seedFailed} />
          <MetricCard label="Charged" value={summary.charged} />
          <MetricCard label="Charge Pending" value={summary.chargePending} />
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Execution Result</h2>
              <p className="mt-1 text-sm text-neutral-400">
                API 응답의 items 또는 planRows 를 모두 안전하게 처리합니다.
              </p>
            </div>

            <div className="text-sm text-neutral-400">
              Rows: {planRows.length}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="px-3 py-3">Candidate</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Decision</th>
                  <th className="px-3 py-3">Cost</th>
                  <th className="px-3 py-3">Seed Attempted</th>
                  <th className="px-3 py-3">Seed Success</th>
                  <th className="px-3 py-3">Charge Attempted</th>
                  <th className="px-3 py-3">Charge Success</th>
                  <th className="px-3 py-3">Final Status</th>
                  <th className="px-3 py-3">Error</th>
                </tr>
              </thead>

              <tbody>
                {planRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-8 text-center text-neutral-500"
                    >
                      아직 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  planRows.map((item) => (
                    <tr
                      key={item.candidateId || `${item.targetPid}-${item.decision}`}
                      className="border-b border-neutral-900 align-top"
                    >
                      <td className="px-3 py-3 font-mono text-xs text-neutral-300">
                        {item.candidateId || "-"}
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium text-white">
                          {item.targetName || "-"}
                        </div>
                        <div className="mt-1 font-mono text-xs text-neutral-500">
                          {item.targetPid || "-"}
                        </div>
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {item.action || "-"}
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {item.decision || "-"}
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {item.costPlanned}
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {formatBoolean(item.seedAttempted)}
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {formatBoolean(item.seedSuccess)}
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {formatBoolean(item.chargeAttempted)}
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {formatBoolean(item.chargeSuccess)}
                      </td>

                      <td className="px-3 py-3 text-neutral-200">
                        {item.finalStatus || "-"}
                      </td>

                      <td className="px-3 py-3 text-red-300">
                        {item.error || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
          <h2 className="text-lg font-semibold">Raw Response</h2>

          <pre className="mt-4 overflow-x-auto rounded-xl border border-neutral-800 bg-black p-4 text-xs text-neutral-300">
            {JSON.stringify(
              response ?? {
                ok: false,
                summary: EMPTY_SUMMARY,
                items: [],
              },
              null,
              2
            )}
          </pre>
        </section>
      </div>
    </main>
  );
}

function MetricCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-sm text-neutral-400">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {props.value}
      </div>
    </div>
  );
}