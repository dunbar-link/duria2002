"use client";

import Link from "next/link";

type Evidence = {
  orgPid: string;
  orgName: string;
  matchType: "school" | "company";
  contactCount: number;
  edgeTrust: number;
};

type RecommendedTarget = {
  pid: string;
  displayName: string;
  category: string;
  country?: string;
  score: number;
  reason: string;
  sourceHint: string;
  previewPathHint?: string;
  evidence?: Evidence[];
};

type Props = {
  ownerUserId: string;
  items: RecommendedTarget[];
};

function getTargetBadge(category: string) {
  const c = String(category || "").toLowerCase();

  if (c.includes("celeb")) return "Celebrity";
  if (c.includes("public")) return "Public Figure";
  if (c.includes("person")) return "Person";

  return "Target";
}

export default function ExplorePathCta({ ownerUserId, items }: Props) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          아직 추천 가능한 타겟이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const url = `/path?ownerUserId=${ownerUserId}&targetPid=${item.pid}&recScore=${item.score}&recReason=${encodeURIComponent(
          item.reason
        )}&recSourceHint=${encodeURIComponent(item.sourceHint)}`;

        return (
          <Link
            key={item.pid}
            href={url}
            className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-950">
                  {item.displayName}
                </p>

                <p className="mt-1 text-xs text-slate-500">{item.pid}</p>
              </div>

              <div className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {getTargetBadge(item.category)}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                추천 점수 {item.score}
              </div>
            </div>

            {item.reason ? (
              <p className="mt-3 text-sm text-slate-700">{item.reason}</p>
            ) : null}

            {item.sourceHint ? (
              <p className="mt-1 text-xs text-slate-500">{item.sourceHint}</p>
            ) : null}

            {item.previewPathHint ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">
                  예상 경로
                </p>

                <p className="mt-1 text-sm text-slate-700 break-words">
                  {item.previewPathHint}
                </p>
              </div>
            ) : null}

            <div className="mt-4 text-sm font-semibold text-violet-600">
              경로 탐색 →
            </div>
          </Link>
        );
      })}
    </div>
  );
}