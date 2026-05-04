"use client";

type SystemErrorStateProps = {
  errorMessage: string;
  selectedPid: string;
  loadingDiscover: boolean;
  resolvedTargetName: string;
  onRetry: () => void;
  onReset: () => void;
};

export default function SystemErrorState({
  errorMessage,
  selectedPid,
  loadingDiscover,
  resolvedTargetName,
  onRetry,
  onReset,
}: SystemErrorStateProps) {
  return (
    <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
            System Error
          </p>
          <h3 className="mt-2 text-lg font-bold text-slate-950">
            경로 확인 중 문제가 생겼어요
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{errorMessage}</p>
        </div>

        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
          retry
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">권장 행동</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          잠시 후 다시 시도하거나,
          <br />
          타겟 정보를 다시 선택한 뒤 재탐색해보세요.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRetry}
          disabled={!selectedPid || loadingDiscover}
          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          다시 탐색
        </button>

        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          선택 초기화
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Current Target
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-950">
          {resolvedTargetName}
        </p>
        <p className="mt-1 break-all text-xs text-slate-500">
          {selectedPid || "-"}
        </p>
      </div>
    </div>
  );
}