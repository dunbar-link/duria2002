"use client";

import Link from "next/link";

type NoPathStateProps = {
  errorMessage: string;
  bridgeActionHref: string;
  selectedPid: string;
  loadingDiscover: boolean;
  resolvedTargetName: string;
  onRetry: () => void;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function buildNoPathSummary(targetName: string) {
  if (!normalizeText(targetName)) {
    return "지금은 연결 단서가 부족합니다.";
  }

  return `${targetName}까지 이어지는 단서가 아직 부족합니다.`;
}

function buildActionGuide(targetName: string) {
  if (!normalizeText(targetName)) {
    return "내 인맥을 더 입력하거나 브리지 후보를 만들면 다음 탐색 성공 가능성이 올라갑니다.";
  }

  return `${targetName} 주변 브리지 후보를 만들거나 내 인맥을 더 입력하면 다음 탐색 성공 가능성이 올라갑니다.`;
}

export default function NoPathState({
  errorMessage,
  bridgeActionHref,
  selectedPid,
  loadingDiscover,
  resolvedTargetName,
  onRetry,
}: NoPathStateProps) {
  const summaryText = buildNoPathSummary(resolvedTargetName);
  const actionGuideText = buildActionGuide(resolvedTargetName);
  const hasErrorMessage = normalizeText(errorMessage).length > 0;

  return (
    <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Next Move
          </p>

          <h3 className="mt-2 text-[20px] font-bold leading-tight text-slate-950">
            아직 연결되진 않았어요
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            {summaryText}
          </p>
        </div>

        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          no path
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
          What this means
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-700">
          현재 그래프 기준으로는
          <br />
          바로 이어질 브리지가 아직 충분하지 않습니다.
          <br />
          하지만 탐색 가치가 사라진 것은 아닙니다.
        </p>

        {hasErrorMessage ? (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Best next action
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-700">
          {actionGuideText}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link
          href="/my-network"
          className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50"
        >
          <p className="text-sm font-semibold text-slate-950">
            인맥 더 입력하기
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            내 쪽 그래프를 넓혀서
            <br />
            새 연결 단서를 추가합니다.
          </p>
        </Link>

        <Link
          href={bridgeActionHref}
          className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50"
        >
          <p className="text-sm font-semibold text-slate-950">
            브리지 후보 만들기
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            타겟 주변 연결 단서를 추가해서
            <br />
            다음 탐색 가능성을 높입니다.
          </p>
        </Link>
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

        <Link
          href="/path"
          className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          다른 타겟 보기
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Current Target
        </p>

        <p className="mt-2 text-sm font-semibold text-slate-950">
          {resolvedTargetName || "-"}
        </p>

        <p className="mt-1 break-all text-xs text-slate-500">
          {selectedPid || "-"}
        </p>
      </div>
    </div>
  );
}