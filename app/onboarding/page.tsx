// app/onboarding/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type OrgItem = {
  id: string;
  name: string;
  type: string;
  country: string;
  metadata?: any;
};

type SaveResult = any;

async function fetchJSON(url: string) {
  const res = await fetch(url);
  const j = await res.json();
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return j;
}

export default function OnboardingPage() {
  const [token, setToken] = useState("");
  const [university, setUniversity] = useState("Korea University");
  const [company, setCompany] = useState("Naver");
  const [city, setCity] = useState("Seoul");
  const [interest, setInterest] = useState("AI");

  const [unis, setUnis] = useState<OrgItem[]>([]);
  const [loadingUnis, setLoadingUnis] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uniOptions = useMemo(() => {
    return unis.map((u) => ({
      value: u.name,
      label: `${u.metadata?.name_ko ? `${u.metadata.name_ko} / ` : ""}${u.name} (Tier ${u.metadata?.seed_tier ?? "-"})`,
    }));
  }, [unis]);

  useEffect(() => {
    (async () => {
      try {
        setLoadingUnis(true);
        const j = await fetchJSON("/api/organizations?type=university&country=KR&tiers=A,B,C,D&limit=200");
        setUnis(j.items ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load universities");
      } finally {
        setLoadingUnis(false);
      }
    })();
  }, []);

  async function onSave() {
    setError(null);
    setSaveResult(null);

    const t = token.trim();
    if (!t) {
      setError("테스트용 access_token을 먼저 입력하세요. (Bearer token)");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ university, company, city, interest }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
      setSaveResult(j);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Onboarding (Sprint 1 Step 4)</h1>

        <div className="p-4 rounded-xl border space-y-2">
          <div className="font-semibold">테스트 토큰 입력</div>
          <input
            className="w-full border rounded-lg p-2"
            placeholder="Supabase access_token (테스트용)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="text-sm opacity-70">
            지금은 로그인 UI를 아직 안 붙였으니, Supabase에서 받은 access_token을 여기에 넣고 테스트합니다.
          </div>
        </div>

        <div className="p-4 rounded-xl border space-y-4">
          <div className="font-semibold">4문항</div>

          <div className="space-y-1">
            <div className="text-sm font-medium">University</div>
            {loadingUnis ? (
              <div className="text-sm opacity-70">Loading universities...</div>
            ) : (
              <select
                className="w-full border rounded-lg p-2"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
              >
                {uniOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Company</div>
            <input className="w-full border rounded-lg p-2" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">City</div>
            <input className="w-full border rounded-lg p-2" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Interest</div>
            <input className="w-full border rounded-lg p-2" value={interest} onChange={(e) => setInterest(e.target.value)} />
          </div>

          <button
            className="w-full border rounded-lg p-2 font-semibold disabled:opacity-50"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Onboarding"}
          </button>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {saveResult ? (
            <pre className="text-xs border rounded-lg p-3 overflow-auto">{JSON.stringify(saveResult, null, 2)}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}