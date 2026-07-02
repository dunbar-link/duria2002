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
import VoiceSignalPreview from "./voice-signal-preview";

// P2-5: 신호 "받는 사람". receiverId = 연결 PID(userId/dlUserId/acceptedPersonId),
// personId = 로컬 person id(markContacted 용), name = 표시명.
export type SignalRecipient = {
  receiverId: string;
  personId: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  // legacy 단일 콜백(상세/신호함/invite 시트에서 사용). 받는 사람은 호출부 고정.
  onSelect?: (emoji: string) => void;
  // P2-5 받는 사람 선택 모드(개인/폴더 신호). recipients + onSendSignal 이 모두
  // 주어지면 chip + "사람 추가" UI 를 렌더하고, 이모지 탭 시 선택된 모두에게 보낸다.
  recipients?: SignalRecipient[];
  candidates?: SignalRecipient[];
  onSendSignal?: (emoji: string, receiverIds: string[]) => void;
};

function dedupeRecipients(list: SignalRecipient[]): SignalRecipient[] {
  const seen = new Set<string>();
  const out: SignalRecipient[] = [];
  for (const r of list) {
    const id = r.receiverId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

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

export default function SignalBottomSheet({
  open,
  onClose,
  onSelect,
  recipients,
  candidates,
  onSendSignal,
}: Props) {
  const [recent, setRecent] = useState<string[]>([]);
  // P4-1A: 2초 음성 신호 local preview 실험(접힘 기본, 전송 없음).
  const [showVoiceLab, setShowVoiceLab] = useState(false);
  // P2-5 받는 사람 선택 모드.
  const recipientMode = Boolean(recipients && onSendSignal);
  const [selected, setSelected] = useState<SignalRecipient[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  // recipients/candidates 는 렌더마다 새 배열일 수 있어 open 전이 시점에만 초기화.
  const recipientsRef = useRef<SignalRecipient[] | undefined>(recipients);
  recipientsRef.current = recipients;

  useEffect(() => {
    if (open) {
      setRecent(readRecentSignals());
      setSelected(dedupeRecipients(recipientsRef.current ?? []));
      setShowAdd(false);
      setAddQuery("");
      setShowVoiceLab(false);
    }
  }, [open]);

  const selectedIds = useMemo(
    () => new Set(selected.map((r) => r.receiverId)),
    [selected],
  );
  // 추가 가능한 후보 = 연결된 사람(호출부가 PID 보장) 중 아직 선택 안 된 사람.
  const addableCandidates = useMemo(
    () => dedupeRecipients(candidates ?? []).filter((c) => !selectedIds.has(c.receiverId)),
    [candidates, selectedIds],
  );
  // 이름 검색 필터(대소문자/공백 둔감).
  const normalizedQuery = addQuery.trim().toLowerCase().replace(/\s+/g, "");
  const filteredCandidates = useMemo(() => {
    if (!normalizedQuery) return addableCandidates;
    return addableCandidates.filter((c) =>
      c.name.toLowerCase().replace(/\s+/g, "").includes(normalizedQuery),
    );
  }, [addableCandidates, normalizedQuery]);

  function addRecipient(r: SignalRecipient) {
    setSelected((prev) =>
      prev.some((p) => p.receiverId === r.receiverId) ? prev : [...prev, r],
    );
  }

  function removeRecipient(receiverId: string) {
    setSelected((prev) => prev.filter((p) => p.receiverId !== receiverId));
  }

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
    // 받는 사람 선택 모드: 0명이면 전송 막음, 아니면 선택된 모두에게 보낸다.
    if (recipientMode) {
      const receiverIds = Array.from(
        new Set(selected.map((r) => r.receiverId.trim()).filter(Boolean)),
      );
      if (receiverIds.length === 0) {
        return;
      }
      const next = [emoji, ...recent.filter((item) => item !== emoji)];
      setRecent(next);
      writeRecentSignals(next);
      onSendSignal?.(emoji, receiverIds);
      onClose();
      return;
    }

    const next = [emoji, ...recent.filter((item) => item !== emoji)];

    setRecent(next);
    writeRecentSignals(next);

    onSelect?.(emoji);
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

        {recipientMode ? (
          <div className="mb-[14px] rounded-[18px] border border-slate-200 bg-white px-[13px] py-[11px] shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
            <div className="mb-[9px] flex items-center justify-between">
              <span className="text-[13px] font-bold text-slate-800">
                받는 사람 {selected.length}명
              </span>
              {/* "사람 추가"는 항상 노출(후보 0명이어도 패널에서 안내). */}
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className="rounded-full border border-slate-200 bg-white px-[10px] py-[4px] text-[11px] font-semibold text-slate-600 active:scale-95"
              >
                {showAdd ? "닫기" : "+ 사람 추가"}
              </button>
            </div>

            {/* 받는 사람 이름표 */}
            {selected.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                받는 사람을 1명 이상 선택하면 신호를 보낼 수 있어요.
              </p>
            ) : (
              <div className="flex flex-wrap gap-[6px]">
                {selected.map((r) => (
                  <span
                    key={r.receiverId}
                    className="inline-flex items-center gap-[5px] rounded-full bg-slate-100 px-[10px] py-[5px] text-[12px] font-medium text-slate-700"
                  >
                    <span className="max-w-[120px] truncate">{r.name}</span>
                    <button
                      type="button"
                      aria-label={`${r.name} 제외`}
                      onClick={() => removeRecipient(r.receiverId)}
                      className="text-[12px] leading-none text-slate-400 active:scale-90"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {showAdd ? (
              <div className="mt-[10px]">
                <input
                  type="text"
                  value={addQuery}
                  onChange={(event) => setAddQuery(event.target.value)}
                  placeholder="이름 검색"
                  className="mb-[6px] h-[36px] w-full rounded-[12px] border border-slate-200 bg-white px-[10px] text-[13px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-slate-400"
                />
                <div className="max-h-[160px] overflow-y-auto rounded-[14px] border border-slate-100 bg-slate-50/60 p-[6px] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.35)_transparent] [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/50 [&::-webkit-scrollbar-track]:bg-transparent">
                  {addableCandidates.length === 0 ? (
                    <p className="px-[10px] py-[10px] text-[12px] text-slate-400">
                      추가할 사람이 없어요.
                    </p>
                  ) : filteredCandidates.length === 0 ? (
                    <p className="px-[10px] py-[10px] text-[12px] text-slate-400">
                      검색 결과가 없어요.
                    </p>
                  ) : (
                    filteredCandidates.map((c) => (
                      <button
                        key={c.receiverId}
                        type="button"
                        onClick={() => addRecipient(c)}
                        className="flex w-full items-center justify-between rounded-[10px] px-[10px] py-[7px] text-left text-[13px] font-medium text-slate-700 hover:bg-white active:scale-[0.99]"
                      >
                        <span className="max-w-[200px] truncate">{c.name}</span>
                        <span className="text-[12px] font-semibold text-slate-400">
                          추가
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="-mx-[14px] mb-[12px] overflow-x-auto px-[14px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-[7px]">
            {SIGNAL_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryJump(category.id)}
                className="h-[28px] shrink-0 rounded-full border border-slate-200 bg-white px-[13px] text-[12px] font-medium text-slate-500 active:scale-95"
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
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-transparent text-[26px] active:scale-95"
                aria-label={`최근 신호 ${signal.emoji} 보내기`}
              >
                {signal.emoji}
              </button>
            ))}
          </div>
        ) : null}

        <div
          ref={scrollContainerRef}
          className="max-h-[330px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.35)_transparent] [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/50 [&::-webkit-scrollbar-track]:bg-transparent"
        >
          <div className="grid grid-cols-6 gap-x-[10px] gap-y-[13px] pb-[4px]">
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
                className="flex h-[42px] items-center justify-center rounded-full bg-transparent text-[26px] active:scale-95"
                aria-label={`신호 ${signal.emoji} 보내기`}
              >
                {signal.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* P4-1A: 2초 음성 신호 실험(local preview 전용, 이모지 전송 흐름과 무관). */}
        <div className="mt-[10px]">
          <button
            type="button"
            onClick={() => setShowVoiceLab((v) => !v)}
            className="text-[11px] font-medium text-slate-400 active:scale-95"
          >
            {showVoiceLab ? "🎙️ 2초 음성 신호 실험 접기" : "🎙️ 2초 음성 신호 실험"}
          </button>
          {showVoiceLab ? (
            <div className="mt-[8px]">
              <VoiceSignalPreview />
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
