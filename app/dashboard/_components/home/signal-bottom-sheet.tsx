"use client";

import { useEffect, useMemo, useState } from "react";
import { SIGNALS, SIGNAL_RECENT_STORAGE_KEY } from "./signal-data";

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
        <div className="mx-auto mb-[12px] h-[4px] w-[42px] rounded-full bg-slate-300" />

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

        <div className="max-h-[330px] overflow-y-auto">
          <div className="grid grid-cols-6 gap-x-[8px] gap-y-[10px]">
            {SIGNALS.map((signal) => (
              <button
                key={signal.id}
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