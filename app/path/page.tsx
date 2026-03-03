"use client";

import React, { useMemo, useState } from "react";

type Node = {
  pid: string;
  name: string;
  city: string | null;
  company: string | null;
  school: string | null;
  isCelebrity: boolean;
};

type ProbeResult = {
  ok: boolean;
  cost: number;
  found: boolean;
  hops: number | null;
  path: Node[];
  balance: number;
  sumTrust?: number;
  bottleneckTrust?: number;
  target_pid: string;
  source_pid?: string;
  error?: string;
};

const TARGETS = [
  { label: "Donald Trump", pid: "celeb:donald-trump" },
  // 내부 테스트용 타겟을 여기 계속 추가 (celeb:xxx)
];

async function track(eventType: string, payload: Record<string, any>) {
  try {
    await fetch("/api/events/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType, payload }),
    });
  } catch {
    // 내부 테스트: 로깅 실패는 무시
  }
}

export default function PathPage() {
  const [targetPid, setTargetPid] = useState(TARGETS[0].pid);
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runProbe() {
    setLoading(true);
    setResult(null);

    await track("path_probe_clicked", { targetPid });

    const res = await fetch("/api/path/probe-paid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetPid }),
    });

    const json = (await res.json().catch(() => null)) as ProbeResult | null;

    if (!res.ok || !json) {
      await track("path_probe_failed_http", { targetPid, status: res.status });
      setResult({
        ok: false,
        cost: 0,
        found: false,
        hops: null,
        path: [],
        balance: result?.balance ?? 0,
        target_pid: targetPid,
        error: `HTTP ${res.status}`,
      });
      setLoading(false);
      return;
    }

    setResult(json);

    await track("path_probe_result", {
      targetPid,
      found: json.found,
      hops: json.hops,
      balance: json.balance,
      bottleneckTrust: json.bottleneckTrust ?? null,
      sumTrust: json.sumTrust ?? null,
      pathLen: json.path?.length ?? 0,
    });

    setLoading(false);
  }

  async function grantCoins() {
    await track("wallet_grant_clicked", {});

    const res = await fetch("/api/wallet/grant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      await track("wallet_grant_failed", { status: res.status });
      alert(json?.error ?? `HTTP ${res.status}`);
      return;
    }

    await track("wallet_grant_ok", { balance: json?.balance ?? null });
    alert("100 coins granted (internal test)");
  }

  const degreeText = useMemo(() => {
    if (!result?.found || !result.hops) return null;
    const targetName =
      result.path?.[result.path.length - 1]?.name ?? result.target_pid;
    return `${result.hops} Degrees Away from ${targetName}`;
  }, [result]);

  return (
    <main className="min-h-screen bg-white text-black p-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <h1 className="text-3xl font-bold">Dunbar Link – Internal Test</h1>

        <div className="rounded-2xl border p-4 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Target</div>
            <select
              className="border px-4 py-2 rounded w-full"
              value={targetPid}
              onChange={(e) => setTargetPid(e.target.value)}
            >
              {TARGETS.map((t) => (
                <option key={t.pid} value={t.pid}>
                  {t.label} ({t.pid})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={runProbe}
              className="px-6 py-2 rounded border"
              disabled={loading}
            >
              {loading ? "Probing..." : "Reveal The Path (Paid)"}
            </button>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-medium">Admin (Internal)</div>
            <div className="flex gap-3 flex-wrap">
              <input
                className="border px-4 py-2 rounded"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
              />
              <button onClick={grantCoins} className="px-6 py-2 rounded border">
                +100 Coins
              </button>
            </div>
          </div>
        </div>

        {result?.found && (
          <>
            <div className="text-2xl font-semibold">{degreeText}</div>

            <div className="flex items-center gap-4 text-lg flex-wrap">
              <div>
                Strongest Link: <b>{result.bottleneckTrust}</b>
              </div>
              <div>
                Total Trust: <b>{result.sumTrust}</b>
              </div>
              <div>
                Balance: <b>{result.balance}</b>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {result.path.map((node, i) => (
                <React.Fragment key={node.pid}>
                  <div className="border px-4 py-3 rounded">
                    <div className="font-semibold">{node.name}</div>
                    <div className="text-sm opacity-70">
                      {node.company ?? "-"} · {node.school ?? "-"}
                    </div>
                    {node.isCelebrity && (
                      <div className="text-xs text-yellow-600">Celebrity</div>
                    )}
                  </div>
                  {i < result.path.length - 1 && <div className="text-2xl">→</div>}
                </React.Fragment>
              ))}
            </div>
          </>
        )}

        {result && !result.found && (
          <div className="rounded-2xl border p-4">
            <div className="font-semibold">Not Found</div>
            <div className="text-sm opacity-70">
              {result.error ? `error: ${result.error}` : "No path"}
            </div>
            <div className="text-sm opacity-70">balance: {result.balance}</div>
          </div>
        )}
      </div>
    </main>
  );
}