// C:\work\nextjs-server\app\my-network\graph-expansion-operator\auto-execute\page.tsx

"use client";

import { useMemo, useState } from "react";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type ExecuteMode = "dry-run" | "execute";

type AutoExecuteDecision = {
  candidateId: string;
  targetPid: string;
  targetName: string;
  status: string;
  decision: string;
  reason: string;
  riskLevel: string;
  recommendedAction: string;
  priorityScore: number;
  seedImpactScore: number;
  expectedExpansion: number;
  seedReady: boolean;
  executed: boolean;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  seedAttempted: boolean;
  seedSuccess: boolean;
  coinCost: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  error: string | null;
  executionType: "success" | "failed" | "skipped";
  createdAt: string;
  updatedAt: string;
  metadataSnapshot: {
    qualityScore: number;
    evidenceScore: number;
    duplicateRisk: "safe" | "risky";
    dangerous: boolean;
  };
};

type AutoExecuteSummary = {
  total: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  reasonCounts: Record<string, number>;
  decisionCounts: Record<string, number>;
  riskCounts: Record<string, number>;
};

type AutoExecuteHistoryItem = {
  candidateId: string;
  targetName: string;
  status: string;
  decision: string;
  reason: string;
  executionType: "success" | "failed" | "skipped";
  riskLevel: string;
  recommendedAction: string;
  priorityScore: number;
  seedImpactScore: number;
  expectedExpansion: number;
  seedReady: boolean;
  seedAttempted: boolean;
  seedSuccess: boolean;
  chargeAttempted: boolean;
  chargeSuccess: boolean;
  coinCost: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  executedAt: string;
};

type AutoExecuteResponse = {
  ok: boolean;
  mode: ExecuteMode;
  ownerUserId: string;
  count: number;
  summary: AutoExecuteSummary;
  recentHistory: AutoExecuteHistoryItem[];
  decisions: AutoExecuteDecision[];
  error?: string;
};

function CountCard(props: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-neutral-500">{props.label}</div>
      <div className="mt-2 text-2xl font-bold text-neutral-900">{props.value}</div>
    </div>
  );
}

function SectionCard(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">{props.title}</h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function Badge(props: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex rounded-full border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700">
      {props.children}
    </span>
  );
}

export default function GraphExpansionOperatorAutoExecutePage() {
  const [mode, setMode] = useState<ExecuteMode>("dry-run");
  const [limit, setLimit] = useState<number>(20);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AutoExecuteResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  const selectedDecision = useMemo(() => {
    if (!response?.decisions?.length) {
      return null;
    }

    return (
      response.decisions.find((item) => item.candidateId === selectedCandidateId) ??
      response.decisions[0]
    );
  }, [response, selectedCandidateId]);

  async function run(modeValue: ExecuteMode) {
    try {
      setMode(modeValue);
      setLoading(true);
      setError("");

      const res = await fetch(
        "/api/my-network/graph-expansion-operator/auto-execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerUserId: FIXED_OWNER_USER_ID,
            mode: modeValue,
            limit,
          }),
        },
      );

      const json = (await res.json()) as AutoExecuteResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Auto execute failed.");
      }

      setResponse(json);
      setSelectedCandidateId(json.decisions?.[0]?.candidateId ?? "");
    } catch (err) {
      setResponse(null);
      setSelectedCandidateId("");
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const summary = response?.summary;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-900">
            Graph Expansion Operator Auto Execute
          </h1>

          <p className="text-sm text-neutral-600">
            Execution summary / history UI 강화 버전이다.
          </p>
        </header>

        <SectionCard title="실행 컨트롤">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">
                Owner User ID
              </label>
              <input
                value={FIXED_OWNER_USER_ID}
                readOnly
                className="w-full rounded-xl border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">
                Limit
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value || 20))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="flex items-end gap-3">
              <button
                onClick={() => run("dry-run")}
                disabled={loading}
                className="cursor-pointer rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && mode === "dry-run" ? "실행 중..." : "Dry Run"}
              </button>

              <button
                onClick={() => run("execute")}
                disabled={loading}
                className="cursor-pointer rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && mode === "execute" ? "실행 중..." : "Execute"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-5">
          <CountCard label="Total" value={summary?.total ?? 0} />
          <CountCard label="Success" value={summary?.successCount ?? 0} />
          <CountCard label="Failed" value={summary?.failedCount ?? 0} />
          <CountCard label="Skipped" value={summary?.skippedCount ?? 0} />
          <CountCard label="Mode" value={response?.mode ?? "-"} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title="후보별 실행 결과">
            {!response?.decisions?.length ? (
              <div className="text-sm text-neutral-500">
                아직 실행 결과가 없다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500">
                      <th className="px-3 py-3">Target</th>
                      <th className="px-3 py-3">Decision</th>
                      <th className="px-3 py-3">Reason</th>
                      <th className="px-3 py-3">Risk</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Seed Ready</th>
                      <th className="px-3 py-3">Result</th>
                    </tr>
                  </thead>

                  <tbody>
                    {response.decisions.map((item) => {
                      const active = selectedDecision?.candidateId === item.candidateId;

                      return (
                        <tr
                          key={item.candidateId}
                          onClick={() => setSelectedCandidateId(item.candidateId)}
                          className={`cursor-pointer border-b border-neutral-100 ${
                            active ? "bg-neutral-100" : "bg-white"
                          }`}
                        >
                          <td className="px-3 py-3">
                            <div className="font-medium text-neutral-900">
                              {item.targetName || "(no name)"}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {item.candidateId}
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <Badge>{item.decision}</Badge>
                          </td>

                          <td className="px-3 py-3 text-neutral-700">{item.reason}</td>

                          <td className="px-3 py-3">
                            <Badge>{item.riskLevel}</Badge>
                          </td>

                          <td className="px-3 py-3 text-neutral-700">
                            {item.priorityScore}
                          </td>

                          <td className="px-3 py-3 text-neutral-700">
                            {String(item.seedReady)}
                          </td>

                          <td className="px-3 py-3">
                            <Badge>{item.executionType}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="선택 후보 상세">
            {!selectedDecision ? (
              <div className="text-sm text-neutral-500">
                선택된 후보가 없다.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">
                    {selectedDecision.targetName || "(no name)"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {selectedDecision.candidateId}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge>{selectedDecision.executionType}</Badge>
                  <Badge>{selectedDecision.decision}</Badge>
                  <Badge>{selectedDecision.reason}</Badge>
                  <Badge>{selectedDecision.riskLevel}</Badge>
                  <Badge>{selectedDecision.recommendedAction}</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <CountCard
                    label="Quality Score"
                    value={selectedDecision.metadataSnapshot.qualityScore}
                  />
                  <CountCard
                    label="Evidence Score"
                    value={selectedDecision.metadataSnapshot.evidenceScore}
                  />
                  <CountCard
                    label="Seed Impact"
                    value={selectedDecision.seedImpactScore}
                  />
                  <CountCard
                    label="Expected Expansion"
                    value={selectedDecision.expectedExpansion}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                    <div className="font-medium text-neutral-900">Duplicate Risk</div>
                    <div className="mt-2 text-neutral-700">
                      {selectedDecision.metadataSnapshot.duplicateRisk}
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                    <div className="font-medium text-neutral-900">Dangerous</div>
                    <div className="mt-2 text-neutral-700">
                      {String(selectedDecision.metadataSnapshot.dangerous)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                    <div className="font-medium text-neutral-900">Coin Cost</div>
                    <div className="mt-2 text-neutral-700">
                      {selectedDecision.coinCost}
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                    <div className="font-medium text-neutral-900">Balance</div>
                    <div className="mt-2 text-neutral-700">
                      {selectedDecision.balanceBefore ?? "-"} →{" "}
                      {selectedDecision.balanceAfter ?? "-"}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                  <div className="font-medium text-neutral-900">실행 플래그</div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div>executed: {String(selectedDecision.executed)}</div>
                    <div>seedAttempted: {String(selectedDecision.seedAttempted)}</div>
                    <div>seedSuccess: {String(selectedDecision.seedSuccess)}</div>
                    <div>chargeAttempted: {String(selectedDecision.chargeAttempted)}</div>
                    <div>chargeSuccess: {String(selectedDecision.chargeSuccess)}</div>
                    <div>seedReady: {String(selectedDecision.seedReady)}</div>
                  </div>
                </div>

                {selectedDecision.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {selectedDecision.error}
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard title="Reason Summary">
            {!summary ? (
              <div className="text-sm text-neutral-500">데이터 없음</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(summary.reasonCounts).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  >
                    <span className="text-neutral-700">{key}</span>
                    <span className="font-semibold text-neutral-900">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Decision Summary">
            {!summary ? (
              <div className="text-sm text-neutral-500">데이터 없음</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(summary.decisionCounts).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  >
                    <span className="text-neutral-700">{key}</span>
                    <span className="font-semibold text-neutral-900">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Risk Summary">
            {!summary ? (
              <div className="text-sm text-neutral-500">데이터 없음</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(summary.riskCounts).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  >
                    <span className="text-neutral-700">{key}</span>
                    <span className="font-semibold text-neutral-900">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Recent Execution History">
          {!response?.recentHistory?.length ? (
            <div className="text-sm text-neutral-500">히스토리 없음</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="px-3 py-3">Executed At</th>
                    <th className="px-3 py-3">Target</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Decision</th>
                    <th className="px-3 py-3">Reason</th>
                    <th className="px-3 py-3">Coin</th>
                    <th className="px-3 py-3">Balance</th>
                  </tr>
                </thead>

                <tbody>
                  {response.recentHistory.map((item) => (
                    <tr
                      key={`${item.candidateId}-${item.executedAt}`}
                      className="border-b border-neutral-100"
                    >
                      <td className="px-3 py-3 text-neutral-700">{item.executedAt}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-neutral-900">{item.targetName}</div>
                        <div className="text-xs text-neutral-500">{item.candidateId}</div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge>{item.executionType}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge>{item.decision}</Badge>
                      </td>
                      <td className="px-3 py-3 text-neutral-700">{item.reason}</td>
                      <td className="px-3 py-3 text-neutral-700">{item.coinCost}</td>
                      <td className="px-3 py-3 text-neutral-700">
                        {item.balanceBefore ?? "-"} → {item.balanceAfter ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}