"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragSourceArea, DragState } from "./home-page-types";
import {
  CONNECTABLE_SOURCE_LAYER_ID,
  connectableCandidates,
} from "./home-page-types";

const SEARCH_EXAMPLES = [
  "김준호",
  "원빈",
  "BTS",
  "진",
  "이재명",
  "한동훈",
  "제니",
];

const VISIBLE_CANDIDATE_COUNT = 4;

function pickPlaceholderName() {
  const index = Math.floor(Math.random() * SEARCH_EXAMPLES.length);
  return SEARCH_EXAMPLES[index] ?? SEARCH_EXAMPLES[0];
}

function SearchPromptField({
  onOpenSearch,
}: {
  onOpenSearch: () => void;
}) {
  const [placeholderName, setPlaceholderName] = useState(SEARCH_EXAMPLES[0]);

  useEffect(() => {
    setPlaceholderName(pickPlaceholderName());
  }, []);

  return (
    <button
      type="button"
      onClick={onOpenSearch}
      className="relative w-full overflow-hidden rounded-[20px] border border-white/85 bg-white/82 px-[14px] py-[12px] text-left shadow-[0_8px_22px_rgba(15,23,42,0.06)] backdrop-blur-[6px]"
    >
      <div className="flex items-center gap-[10px]">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-[14px] text-slate-400">
          ⌕
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium tracking-[0.08em] text-slate-300">
            SEARCH
          </div>

          <div className="mt-[4px] truncate text-[15px] font-medium text-slate-300/70">
            {placeholderName}
          </div>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-[10px] py-[6px] text-[11px] font-medium text-slate-400">
          입력
        </div>
      </div>
    </button>
  );
}

function InfoBadge() {
  return (
    <button
      type="button"
      aria-label="연결 가능 안내"
      className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-slate-200 bg-white/86 text-[12px] font-semibold text-slate-500 shadow-[0_4px_12px_rgba(15,23,42,0.05)]"
    >
      i
    </button>
  );
}

function ExcludeButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="후보 제외"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="absolute right-[-4px] top-[-4px] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white bg-white/95 text-[10px] font-semibold text-slate-400 shadow-[0_4px_10px_rgba(15,23,42,0.12)]"
    >
      ×
    </button>
  );
}

function ConnectableTile({
  entityId,
  name,
  avatarEmoji,
  urgent,
  index,
  isDragging,
  onDragStart,
  onDragEnd,
  onExclude,
}: {
  entityId: string;
  name: string;
  avatarEmoji?: string;
  urgent?: boolean;
  index: number;
  isDragging: boolean;
  onDragStart: (
    layerId: string,
    index: number,
    entityId: string,
    sourceArea: DragSourceArea
  ) => void;
  onDragEnd: () => void;
  onExclude: (entityId: string) => void;
}) {
  return (
    <div
      className={[
        "group flex w-full cursor-grab flex-col items-center overflow-visible transition-all duration-150 active:cursor-grabbing",
        isDragging ? "scale-[0.94] opacity-35" : "",
      ].join(" ")}
      draggable
      onDragStart={() =>
        onDragStart(CONNECTABLE_SOURCE_LAYER_ID, index, entityId, "visible")
      }
      onDragEnd={onDragEnd}
    >
      <div className="relative flex h-[62px] w-[62px] items-center justify-center rounded-[22px] border border-white/90 bg-[linear-gradient(180deg,#FFFFFF_0%,#F7FAFC_100%)] shadow-[0_10px_20px_rgba(15,23,42,0.07)] transition-transform duration-150 group-active:scale-[0.96]">
        {avatarEmoji ? (
          <span className="text-[24px] leading-none">{avatarEmoji}</span>
        ) : (
          <span className="text-[18px] font-semibold text-slate-700">
            {name.slice(0, 1)}
          </span>
        )}

        {urgent ? (
          <span className="absolute right-[-1px] top-[-1px] h-[12px] w-[12px] rounded-full border-2 border-white bg-[#F35B5B]" />
        ) : null}

        <ExcludeButton onClick={() => onExclude(entityId)} />
      </div>

      <span className="mt-[7px] max-w-[66px] truncate text-center text-[11px] font-medium leading-none text-slate-600">
        {name}
      </span>
    </div>
  );
}

type HomeConnectableSectionProps = {
  dragState: DragState;
  occupiedEntityIds: Set<string>;
  excludedEntityIds: string[];
  onDragStart: (
    layerId: string,
    index: number,
    entityId: string,
    sourceArea: DragSourceArea
  ) => void;
  onDragEnd: () => void;
  onExcludeCandidate: (entityId: string) => void;
  onResetExcludedCandidates: () => void;
  onOpenSearch: () => void;
};

export default function HomeConnectableSection({
  dragState,
  occupiedEntityIds,
  excludedEntityIds,
  onDragStart,
  onDragEnd,
  onExcludeCandidate,
  onResetExcludedCandidates,
  onOpenSearch,
}: HomeConnectableSectionProps) {
  const visibleCandidates = useMemo(() => {
    return connectableCandidates
      .filter((candidate) => !occupiedEntityIds.has(candidate.id))
      .filter((candidate) => !excludedEntityIds.includes(candidate.id))
      .slice(0, VISIBLE_CANDIDATE_COUNT);
  }, [excludedEntityIds, occupiedEntityIds]);

  const hiddenAvailableCount = useMemo(() => {
    return connectableCandidates
      .filter((candidate) => !occupiedEntityIds.has(candidate.id))
      .filter((candidate) => !excludedEntityIds.includes(candidate.id)).length;
  }, [excludedEntityIds, occupiedEntityIds]);

  return (
    <section className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.64)_0%,rgba(247,250,252,0.76)_100%)] px-[14px] py-[14px] shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-[8px]">
      <div className="mb-[12px] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-slate-800">
            연결 가능
          </h2>
          <p className="mt-[3px] text-[11px] text-slate-400">
            올리거나, 찾아봐요
          </p>
        </div>

        <InfoBadge />
      </div>

      <div className="space-y-[12px]">
        <SearchPromptField onOpenSearch={onOpenSearch} />

        <div className="rounded-[22px] border border-white/75 bg-white/56 px-[10px] py-[12px]">
          <div className="mb-[10px] flex items-center justify-between">
            <div className="text-[11px] font-medium text-slate-400">
              아이콘 후보
            </div>

            <div className="flex items-center gap-[8px]">
              <div className="text-[10px] text-slate-300">
                {hiddenAvailableCount}명 남음
              </div>

              <button
                type="button"
                onClick={onResetExcludedCandidates}
                className="rounded-full border border-slate-200 bg-white/80 px-[8px] py-[4px] text-[10px] font-medium text-slate-400"
              >
                복원
              </button>
            </div>
          </div>

          {visibleCandidates.length > 0 ? (
            <div className="grid grid-cols-4 gap-x-[10px] gap-y-[14px]">
              {visibleCandidates.map((candidate, index) => (
                <ConnectableTile
                  key={candidate.id}
                  entityId={candidate.id}
                  name={candidate.canonicalName}
                  avatarEmoji={candidate.avatarEmoji}
                  urgent={candidate.urgent}
                  index={index}
                  isDragging={
                    dragState?.sourceLayerId === CONNECTABLE_SOURCE_LAYER_ID &&
                    dragState.entityId === candidate.id
                  }
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onExclude={onExcludeCandidate}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-[84px] flex-col items-center justify-center rounded-[18px] border border-dashed border-slate-200 bg-white/50 text-center">
              <div className="text-[12px] text-slate-400">
                지금 보이는 후보가 없어요
              </div>
              <button
                type="button"
                onClick={onResetExcludedCandidates}
                className="mt-[8px] rounded-full border border-slate-200 bg-white px-[10px] py-[5px] text-[11px] font-medium text-slate-500"
              >
                후보 다시 보기
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}