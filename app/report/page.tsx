"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  tester_name: string;
  reveal_total: number;
  reveal_found_true: number;
  reveal_found_false: number;
  avg_hops: number | null;
  avg_sum_trust: number | null;
  avg_bottleneck_trust: number | null;
  coin_spent_total: number;
  last_reveal_at: string | null;
  topup_count: number;
  topup_amount_total: number;
  last_topup_at: string | null;
};

export default function ReportPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => {
    const acc = {
      testers: rows.length,
      reveal_total: 0,
      reveal_found_true: 0,
      reveal_found_false: 0,
      coin_spent_total: 0,
      topup_count: 0,
      topup_amount_total: 0,
    };
    for (const r of rows) {
      acc.reveal_total += Number(r.reveal_total ?? 0);
      acc.reveal_found_true += Number(r.reveal_found_true ?? 0);
      acc.reveal_found_false += Number(r.reveal_found_false ?? 0);
      acc.coin_spent_total += Number(r.coin_spent_total ?? 0);
      acc.topup_count += Number(r.topup_count ?? 0);
      acc.topup_amount_total += Number(r.topup_amount_total ?? 0);
    }
    return acc;
  }, [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/cbt?days=${encodeURIComponent(String(days))}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error ?? "Failed to load");
      setRows(json.rows ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>CBT Report</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Days</span>
          <input
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            type="number"
            min={1}
            max={365}
            style={{ width: 90, padding: 6 }}
          />
        </label>

        <button onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          {loading ? "Loading..." : "Refresh"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>Testers: <b>{total.testers}</b></span>
          <span>Reveal: <b>{total.reveal_total}</b> (T:{total.reveal_found_true} / F:{total.reveal_found_false})</span>
          <span>Coin Spent: <b>{total.coin_spent_total}</b></span>
          <span>Topup: <b>{total.topup_count}</b> / <b>{total.topup_amount_total}</b></span>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, border: "1px solid #f00", marginBottom: 12 }}>
          <b>Error:</b> {error}
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "tester",
                "reveal_total",
                "found_true",
                "found_false",
                "avg_hops(success)",
                "avg_sumTrust(success)",
                "avg_bottleneck(success)",
                "coin_spent",
                "last_reveal",
                "topup_count",
                "topup_total",
                "last_topup",
              ].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tester_name}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                  <b>{r.tester_name}</b>
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.reveal_total}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.reveal_found_true}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.reveal_found_false}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.avg_hops ?? "-"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.avg_sum_trust ?? "-"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.avg_bottleneck_trust ?? "-"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.coin_spent_total}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{r.last_reveal_at ?? "-"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.topup_count}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.topup_amount_total}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{r.last_topup_at ?? "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: 12 }}>
                  No rows. (Check events payload includes tester_name)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}