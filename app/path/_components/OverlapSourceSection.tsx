"use client";

type OverlapSourceSectionProps = {
  bridgeName: string;
  overlapMetaLine: string;
  bridgeMatchScore: string;
  resolvedTargetName: string;
  selectedPid: string;
  recReason: string;
  previewPathHint: string;
};

export default function OverlapSourceSection({
  bridgeName,
  overlapMetaLine,
  bridgeMatchScore,
  resolvedTargetName,
  selectedPid,
  recReason,
  previewPathHint,
}: OverlapSourceSectionProps) {
  return (
    <section className="mb-6 rounded-[28px] border border-cyan-200 bg-cyan-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Overlap Source
          </p>

          <h2 className="mt-2 text-xl font-bold leading-tight text-slate-950">
            겹치는 인맥에서 바로 경로 탐색으로 들어왔습니다
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            bridge person 기준으로 관련 타겟을 골라서 이 화면으로 진입했습니다.
            현재 선택 타겟은 아래 카드와 우측 결과에 자동 반영됩니다.
          </p>
        </div>

        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
          from overlap
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-cyan-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Bridge Person
          </p>

          <p className="mt-2 text-lg font-bold text-slate-950">
            {bridgeName || "-"}
          </p>

          {overlapMetaLine ? (
            <p className="mt-1 text-sm text-slate-600">{overlapMetaLine}</p>
          ) : null}

          {bridgeMatchScore ? (
            <div className="mt-3 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
              overlap score {bridgeMatchScore}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-cyan-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Auto Selected Target
          </p>

          <p className="mt-2 text-lg font-bold text-slate-950">
            {resolvedTargetName}
          </p>

          <p className="mt-1 break-all text-sm text-slate-600">
            {selectedPid || "-"}
          </p>
        </div>
      </div>

      {(recReason || previewPathHint) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recReason ? (
            <div className="rounded-2xl border border-cyan-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                Why This Target
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-700">
                {recReason}
              </p>
            </div>
          ) : null}

          {previewPathHint ? (
            <div className="rounded-2xl border border-cyan-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                Preview Path Hint
              </p>

              <p className="mt-2 break-words text-sm leading-6 text-slate-700">
                {previewPathHint}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}