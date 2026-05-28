"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SIGNALS,
  SIGNAL_CATEGORIES,
  SIGNAL_GRID_CATEGORY_ORDER,
  SIGNAL_RECENT_STORAGE_KEY,
  getSignalCategory,
  type SignalCategoryId,
  type SignalGridCategoryId,
  type SignalItem,
} from "./signal-data";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
};

function readRecentSignals(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(SIGNAL_RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentSignals(list: string[]) {
  try {
    localStorage.setItem(
      SIGNAL_RECENT_STORAGE_KEY,
      JSON.stringify(list.slice(0, 16)),
    );
  } catch {
    // localStorage 실패는 신호 전송 자체를 막지 않는다.
  }
}

type GridEntry = {
  signal: SignalItem;
  category: SignalGridCategoryId;
  isFirstInCategory: boolean;
};

export default function SignalBottomSheet({ open, onClose, onSelect }: Props) {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecent(readRecentSignals());
    }
  }, [open]);

  const recentList = useMemo(() => {
    return recent
      .map((emoji) => SIGNALS.find((signal) => signal.emoji === emoji))
      .filter((signal): signal is (typeof SIGNALS)[number] => Boolean(signal))
      .slice(0, 16);
  }, [recent]);

  // 카테고리별로 정렬된 신호 목록. 원본 SIGNALS 순서는 건드리지 않는다.
  const gridEntries = useMemo<GridEntry[]>(() => {
    const buckets = new Map<SignalGridCategoryId, SignalItem[]>();
    for (const cat of SIGNAL_GRID_CATEGORY_ORDER) {
      buckets.set(cat, []);
    }
    for (const signal of SIGNALS) {
      const cat = getSignalCategory(signal.id);
      buckets.get(cat)?.push(signal);
    }
    const ordered: GridEntry[] = [];
    for (const cat of SIGNAL_GRID_CATEGORY_ORDER) {
      const list = buckets.get(cat) ?? [];
      list.forEach((signal, index) => {
        ordered.push({
          signal,
          category: cat,
          isFirstInCategory: index === 0,
        });
      });
    }
    return ordered;
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<
    Partial<Record<SignalGridCategoryId, HTMLButtonElement | null>>
  >({});

  const handleCategoryJump = useCallback((categoryId: SignalCategoryId) => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    if (categoryId === "recent") {
      // recent 행은 시트 상단 고정 영역에 있으므로 그리드 컨테이너를 맨 위로.
      container.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const target = sectionRefs.current[categoryId];
    if (!target) {
      return;
    }

    // body 스크롤을 건드리지 않도록 scrollIntoView 대신 컨테이너 내부 좌표로 직접 이동.
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop;

    container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  }, []);

  if (!open) {
    return null;
  }

  function handleSelect(emoji: string) {
    const next = [emoji, ...recent.filter((item) => item !== emoji)];

    setRecent(next);
    writeRecentSignals(next);

    onSelect(emoji);
    onClose();
  }

  return (
    <>
      <button
        type="button"
        aria-label="신호 선택 닫기"
        onClick={onClose}
        className="fixed inset-0 z-[90] cursor-default bg-slate-950/25"
      />

      <section className="fixed bottom-0 left-1/2 z-[91] w-full max-w-md -translate-x-1/2 rounded-t-[30px] bg-[#f8f9fb] px-[14px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-[10px] shadow-[0_-18px_44px_rgba(15,23,42,0.18)]">
        <div className="mx-auto mb-[10px] h-[4px] w-[42px] rounded-full bg-slate-300" />

        <div className="-mx-[14px] mb-[10px] overflow-x-auto px-[14px]">
          <div className="flex w-max gap-[6px]">
            {SIGNAL_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryJump(category.id)}
                className="h-[26px] shrink-0 rounded-full border border-slate-200 bg-white px-[12px] text-[12px] font-medium text-slate-500 active:scale-95"
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {recentList.length > 0 ? (
          <div className="mb-[12px] flex gap-[9px] overflow-x-auto pb-[2px]">
            {recentList.map((signal) => (
              <button
                key={`recent-${signal.id}`}
                type="button"
                onClick={() => handleSelect(signal.emoji)}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-transparent text-[28px] active:scale-95"
                aria-label={`최근 신호 ${signal.emoji} 보내기`}
              >
                {signal.emoji}
              </button>
            ))}
          </div>
        ) : null}

        <div
          ref={scrollContainerRef}
          className="max-h-[330px] overflow-y-auto"
        >
          <div className="grid grid-cols-6 gap-x-[8px] gap-y-[10px]">
            {gridEntries.map(({ signal, category, isFirstInCategory }) => (
              <button
                key={signal.id}
                ref={
                  isFirstInCategory
                    ? (el) => {
                        sectionRefs.current[category] = el;
                      }
                    : undefined
                }
                type="button"
                onClick={() => handleSelect(signal.emoji)}
                className="flex h-[44px] items-center justify-center rounded-full bg-transparent text-[30px] active:scale-95"
                aria-label={`신호 ${signal.emoji} 보내기`}
              >
                {signal.emoji}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
