// app/api/share-card/route.tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const target = (url.searchParams.get("target") ?? "Elon Musk").slice(0, 60);
  const hops = clamp(Number(url.searchParams.get("hops") ?? 0), 0, 99);

  const confidenceRaw = Number(url.searchParams.get("confidence") ?? 0);
  const confidencePct = clamp(Math.round(confidenceRaw * 100), 0, 100);

  const via = (url.searchParams.get("via") ?? "Dunbar Link").slice(0, 60);

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
          border: "20px solid #111",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", fontSize: 28, opacity: 0.75 }}>Dunbar Link</div>

          {/* ✅ multiple children => display:flex required */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 60,
              fontWeight: 800,
              lineHeight: 1.05,
            }}
          >
            <div style={{ display: "flex" }}>
              I am <span style={{ textDecoration: "underline", marginLeft: 14 }}>{hops}</span>
              <span style={{ marginLeft: 14 }}>degrees from</span>
            </div>

            <div style={{ display: "flex", fontSize: 72 }}>{target}</div>
          </div>

          <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
            <div style={{ display: "flex", fontSize: 28 }}>
              Confidence: <b style={{ marginLeft: 10 }}>{confidencePct}%</b>
            </div>
            <div style={{ display: "flex", fontSize: 28, opacity: 0.7 }}>via {via}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, opacity: 0.8 }}>
          <div style={{ display: "flex" }}>Relationship Graph Infrastructure</div>
          <div style={{ display: "flex" }}>Share → Join → Graph Expands</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}