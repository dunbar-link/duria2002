"use client";

import { useEffect, useMemo, useState } from "react";

function num(v: string | null, fallback: number) {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function SharePage() {
  const [target, setTarget] = useState("Elon Musk");
  const [hops, setHops] = useState(2);
  const [confidence, setConfidence] = useState(0.24);
  const [via, setVia] = useState("Korea University");

  // ✅ query string -> state 반영
  useEffect(() => {
    const u = new URL(window.location.href);
    const q = u.searchParams;

    const qt = q.get("target");
    const qvia = q.get("via");

    if (qt) setTarget(qt);
    if (qvia) setVia(qvia);

    setHops(num(q.get("hops"), 2));
    setConfidence(num(q.get("confidence"), 0.24));
  }, []);

  const imgUrl = useMemo(() => {
    const q = new URLSearchParams({
      target,
      hops: String(hops),
      confidence: String(confidence),
      via,
    });
    return `/api/share-card?${q.toString()}`;
  }, [target, hops, confidence, via]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Share Card (Viral Discovery)</h1>

        <div className="p-4 rounded-xl border space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Target</div>
              <input className="w-full border rounded-lg p-2" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Via</div>
              <input className="w-full border rounded-lg p-2" value={via} onChange={(e) => setVia(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Hops</div>
              <input
                className="w-full border rounded-lg p-2"
                type="number"
                value={hops}
                onChange={(e) => setHops(Number(e.target.value))}
                min={0}
                max={99}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Confidence (0~1)</div>
              <input
                className="w-full border rounded-lg p-2"
                type="number"
                step="0.01"
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                min={0}
                max={1}
              />
            </div>
          </div>

          <div className="text-sm opacity-70">
            이 페이지는 URL 파라미터만으로 자동 채워집니다. (/path → share 버튼이 이걸 사용)
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Image URL</div>
            <div className="break-all text-xs border rounded-lg p-2">{imgUrl}</div>

            <div className="flex gap-2">
              <a className="inline-block border rounded-lg px-3 py-2 font-semibold" href={imgUrl} target="_blank" rel="noreferrer">
                Open PNG
              </a>

              <button
                className="border rounded-lg px-3 py-2 font-semibold"
                onClick={async () => {
                  await navigator.clipboard.writeText(window.location.origin + imgUrl);
                  alert("PNG URL copied");
                }}
              >
                Copy PNG URL
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border space-y-3">
          <div className="font-semibold">Preview</div>
          <img className="w-full rounded-xl border" src={imgUrl} alt="share card" />
        </div>
      </div>
    </div>
  );
}