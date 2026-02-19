"use client";

import { useState } from "react";

export default function Home() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function createDM() {
    setLoading(true);
    setResult(null);

    const res = await fetch("/api/super-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_dm",
        userId1: "me",
        userId2: "u1",
      }),
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Dunbar Link - Chat</h1>

      <button onClick={createDM} disabled={loading}>
        {loading ? "생성 중..." : "DM 생성"}
      </button>

      <pre style={{ marginTop: 20, background: "#111", color: "#0f0", padding: 20 }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
