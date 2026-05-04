"use client";

type SearchPerson = {
  pid: string;
  displayName: string;
  category: string;
  country?: string;
  city?: string | null;
  company?: string | null;
  school?: string | null;
};

type TargetSearchPanelProps = {
  query: string;
  onQueryChange: (value: string) => void;
  loadingSearch: boolean;
  items: SearchPerson[];
  quickTargets: SearchPerson[];
  onSelectTarget: (item: SearchPerson) => void;
  resolvedTargetName: string;
  selectedPid: string;
  resolvedTargetCategory: string;
  recScore: string;
  recReason: string;
  recSourceHint: string;
  previewPathHint: string;
  isFromOverlap: boolean;
  bridgeName: string;
  overlapMetaLine: string;
  loadingDiscover: boolean;
  onDiscover: () => void;
  getTargetBadge: (category: string) => string;
};

export default function TargetSearchPanel({
  query,
  onQueryChange,
  loadingSearch,
  items,
  quickTargets,
  onSelectTarget,
  resolvedTargetName,
  selectedPid,
  resolvedTargetCategory,
  recScore,
  recReason,
  recSourceHint,
  previewPathHint,
  isFromOverlap,
  bridgeName,
  overlapMetaLine,
  loadingDiscover,
  onDiscover,
  getTargetBadge,
}: TargetSearchPanelProps) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-900">Target Search</p>
        <p className="mt-1 text-sm text-slate-600">
          사람 이름을 검색하거나 빠른 타겟을 선택하세요.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="예: Elon Musk"
        className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {quickTargets.map((item) => (
          <button
            key={item.pid}
            type="button"
            onClick={() => onSelectTarget(item)}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {item.displayName}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {loadingSearch ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            검색 중...
          </div>
        ) : null}

        {!loadingSearch &&
          items.map((item) => (
            <button
              key={item.pid}
              type="button"
              onClick={() => onSelectTarget(item)}
              className="block w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">
                    {item.displayName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.pid}</p>
                </div>

                <div className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {getTargetBadge(item.category)}
                </div>
              </div>
            </button>
          ))}
      </div>

      <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
          Selected Target
        </p>

        <p className="mt-2 text-lg font-bold text-slate-950">
          {resolvedTargetName}
        </p>

        <p className="mt-1 break-all text-sm text-slate-600">
          {selectedPid || "-"}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            {getTargetBadge(resolvedTargetCategory)}
          </div>

          {recScore ? (
            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
              추천 점수 {recScore}
            </div>
          ) : null}

          {isFromOverlap ? (
            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
              overlap 유입
            </div>
          ) : null}
        </div>

        {(recReason || recSourceHint) && (
          <div className="mt-3 space-y-2">
            {recReason ? (
              <p className="text-sm leading-6 text-slate-700">{recReason}</p>
            ) : null}

            {recSourceHint ? (
              <p className="text-sm leading-6 text-slate-500">{recSourceHint}</p>
            ) : null}
          </div>
        )}

        {previewPathHint ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Preview Path Hint
            </p>
            <p className="mt-2 break-words text-sm leading-6 text-slate-700">
              {previewPathHint}
            </p>
          </div>
        ) : null}

        {isFromOverlap && bridgeName ? (
          <div className="mt-4 rounded-2xl border border-cyan-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Bridge Context
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {bridgeName}
            </p>
            {overlapMetaLine ? (
              <p className="mt-1 text-sm text-slate-600">{overlapMetaLine}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onDiscover}
        disabled={!selectedPid || loadingDiscover}
        className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loadingDiscover ? "Discovering..." : "Discover Path"}
      </button>
    </section>
  );
}