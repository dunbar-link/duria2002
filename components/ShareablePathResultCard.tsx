"use client";

type PathNode = {
  pid: string;
  name: string | null;
  city?: string | null;
  school?: string | null;
  company?: string | null;
  isCelebrity?: boolean;
};

type ShareablePathResultCardProps = {
  targetName: string;
  hops: number;
  confidence?: number | null;
  confidenceLabel?: string | null;
  avgTrust?: number | null;
  bottleneckTrust?: number | null;
  cost?: number | null;
  path?: PathNode[];
};

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value)}%`;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value)}`;
}

function buildPresentedPath(path?: PathNode[]) {
  if (!path || path.length === 0) return "Path unavailable";

  return path
    .map((node, index) => {
      if (index === 0) return "Me";
      return node.name?.trim() || node.pid;
    })
    .join(" → ");
}

export default function ShareablePathResultCard({
  targetName,
  hops,
  confidence,
  confidenceLabel,
  avgTrust,
  bottleneckTrust,
  cost,
  path,
}: ShareablePathResultCardProps) {
  const presentedPath = buildPresentedPath(path);

  return (
    <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/15 bg-[#0b1220] text-white shadow-2xl">
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.22),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.16),transparent_30%)]" />
        <div className="relative px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-blue-200/80">
                Dunbar Link
              </p>
              <h2 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">
                Relationship Distance
              </h2>
            </div>

            <div className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              {confidenceLabel || "Path Result"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <p className="text-xs text-white/65">Target</p>
            <p className="mt-1 text-lg font-semibold leading-snug sm:text-xl">
              {targetName}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/55">
                  Distance
                </p>
                <p className="mt-1 text-2xl font-bold">{hops}</p>
                <p className="text-xs text-white/65">hops</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/55">
                  Confidence
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatPercent(confidence)}
                </p>
                <p className="text-xs text-white/65">
                  {confidenceLabel || "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/55">
                  Avg Trust
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatNumber(avgTrust)}
                </p>
                <p className="text-xs text-white/65">average</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/55">
                  Bottleneck
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatNumber(bottleneckTrust)}
                </p>
                <p className="text-xs text-white/65">lowest trust</p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-emerald-200/80">
                    Reveal Cost
                  </p>
                  <p className="mt-1 text-base font-semibold text-emerald-100">
                    {cost ?? 0} coins
                  </p>
                </div>
                <div className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-medium text-emerald-100">
                  Paid Discovery
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/55">
              Presented Path
            </p>
            <p className="mt-2 break-words text-sm leading-7 text-white/90 sm:text-[15px]">
              {presentedPath}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 text-[11px] text-white/45">
            <span>Mutual relationship graph only</span>
            <span>Dunbar Link v2</span>
          </div>
        </div>
      </div>
    </div>
  );
}