"use client";

import { useMemo, useState } from "react";

function qs(o: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => {
    if (v === undefined) return;
    p.set(k, String(v));
  });
  return p.toString();
}

export default function CbtPage() {
  const [tester, setTester] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("tester_name") ?? "";
  });

  const presets = useMemo(
    () => [
      {
        id: "S1",
        title: "S1: Trump (max_hops=5, cost=10)",
        href: "/path?" + qs({ target: "donald-trump", maxHops: 5, cost: 10, back: "/cbt" }),
      },
      {
        id: "S2",
        title: "S2: Trump (max_hops=5, cost=10) ✅ main",
        href: "/path?" + qs({ target: "donald-trump", maxHops: 5, cost: 10, back: "/cbt" }),
      },
      {
        id: "S3",
        title: "S3: Trump (max_hops=3, cost=10)",
        href: "/path?" + qs({ target: "donald-trump", maxHops: 3, cost: 10, back: "/cbt" }),
      },
      {
        id: "S4",
        title: "S4: ghost(no connection) (max_hops=5, cost=10)",
        href: "/path?" + qs({ target: "ghost", maxHops: 5, cost: 10, back: "/cbt" }),
      },
      {
        id: "S5",
        title: "S5: Trump 제한 실패 (max_hops=1, cost=10)",
        href: "/path?" + qs({ target: "donald-trump", maxHops: 1, cost: 10, back: "/cbt" }),
      },
    ],
    []
  );

  function saveTester() {
    const v = tester.trim();
    localStorage.setItem("tester_name", v);
    alert("Saved tester_name to localStorage");
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="text-2xl font-semibold">CBT Checklist</div>

      <div className="border rounded p-4 space-y-3">
        <div className="text-sm font-medium">Tester Name (필수)</div>
        <div className="flex gap-2">
          <input
            className="border rounded px-3 py-2 w-full"
            value={tester}
            onChange={(e) => setTester(e.target.value)}
            placeholder="ex) bg_kang_01"
          />
          <button className="border rounded px-4 py-2" onClick={saveTester}>
            Save
          </button>
        </div>
        <div className="text-xs opacity-70">
          /path 실행 로그(payload.tester_name)에 자동 포함됨
        </div>
      </div>

      <div className="border rounded p-4 space-y-2">
        <div className="text-sm font-medium">Scenarios (click → /path preset)</div>
        <div className="space-y-2">
          {presets.map((p) => (
            <a key={p.id} className="block border rounded px-4 py-3 hover:bg-gray-50" href={p.href}>
              <div className="font-semibold">{p.id}</div>
              <div className="text-sm opacity-80">{p.title}</div>
            </a>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <a className="border rounded px-4 py-2" href="/report">
          Open /report
        </a>
        <a className="border rounded px-4 py-2" href="/path">
          Open /path
        </a>
      </div>

      <div className="border rounded p-4 text-sm space-y-2">
        <div className="font-semibold">운영 체크</div>
        <ul className="list-disc ml-5 space-y-1">
          <li>각 시나리오 실행 후 /report에서 테스터별 집계가 증가하는지 확인</li>
          <li>실패(found=false)도 코인 차감(cost) 기록되는지 확인</li>
          <li>topup 후 /report의 Topups/Coins 증가 확인</li>
        </ul>
      </div>
    </div>
  );
}