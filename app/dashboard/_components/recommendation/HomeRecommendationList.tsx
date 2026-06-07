"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePeopleStore } from "../../people/store";
import type { ConnectableCandidateStateMap } from "../home/home-page-types";
import {
  buildDynamicConnectableEntityId,
  upsertDynamicConnectableCandidate,
} from "../home/home-page-types";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";
const DEFAULT_LIMIT = 4;
const DRAG_INTENT_THRESHOLD_PX = 6;
const JUST_DRAGGED_RESET_MS = 140;

type JoinedConnectableCandidate = {
  pid: string;
  name: string;
  imageUrl?: string | null;
  confidence: "high" | "medium" | "low";
  badge?: string | null;
  acceptedAt?: string | null;
};

type Props = Record<string, unknown> & {
  ownerUserId?: string;
  maxItems?: number;
  title?: string;
  className?: string;
  onSelectCandidate?: (candidate: JoinedConnectableCandidate) => void;
  onOpenSearch?: () => void;
  occupiedEntityIds?: Set<string>;
  suppressedEntityIds?: Set<string>;
  connectableStateMap?: ConnectableCandidateStateMap;
  isDraggingCandidate?: boolean;
  onDragStartCandidate?: (entityId: string) => void;
  onDragEndCandidate?: () => void;
  onExploreCandidate?: (candidate: JoinedConnectableCandidate) => void;
  onDismissCandidate?: (entityId: string) => void;
  onDeferCandidate?: (entityId: string) => void;
};

function getInitials(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return "?";
  }

  if (trimmed.length === 1) {
    return trimmed;
  }

  return trimmed.slice(0, 2);
}

function mergeClassNames(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[15px] w-[15px]"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20L16.65 16.65" />
    </svg>
  );
}

function CandidateAvatar({
  candidate,
  isDragging,
}: {
  candidate: JoinedConnectableCandidate;
  isDragging: boolean;
}) {
  return (
    <div
      className={mergeClassNames(
        "relative flex h-[50px] w-[50px] items-center justify-center rounded-[17px] border border-slate-200 bg-slate-100 text-[14px] font-semibold text-slate-700 shadow-[0_3px_10px_rgba(15,23,42,0.05)] transition",
        isDragging && "scale-[1.03]",
      )}
    >
      <span>{getInitials(candidate.name)}</span>

      <span className="absolute -right-[2px] -top-[2px] rounded-full border-2 border-white bg-emerald-500 px-[5px] py-[2px] text-[9px] font-semibold leading-none text-white shadow-sm">
        가입
      </span>
    </div>
  );
}

function CandidateTile({
  candidate,
  onClick,
  onDragStartCandidate,
  onDragEndCandidate,
  isDragging,
}: {
  candidate: JoinedConnectableCandidate;
  onClick: () => void;
  onDragStartCandidate?: (entityId: string) => void;
  onDragEndCandidate?: () => void;
  isDragging: boolean;
}) {
  const entityId = buildDynamicConnectableEntityId(candidate.pid);

  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const dragIntentRef = useRef(false);
  const dragStartedRef = useRef(false);
  const justDraggedRef = useRef(false);

  const handleActivate = () => {
    const shouldSuppressClick =
      dragIntentRef.current || dragStartedRef.current || justDraggedRef.current;

    if (shouldSuppressClick) {
      return;
    }

    onClick();
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-[6px]">
      <div
        role="button"
        tabIndex={0}
        draggable
        onPointerDown={(event) => {
          pointerDownRef.current = {
            x: event.clientX,
            y: event.clientY,
          };
          dragIntentRef.current = false;
          dragStartedRef.current = false;
        }}
        onPointerMove={(event) => {
          if (!pointerDownRef.current) {
            return;
          }

          const deltaX = Math.abs(event.clientX - pointerDownRef.current.x);
          const deltaY = Math.abs(event.clientY - pointerDownRef.current.y);

          if (
            deltaX >= DRAG_INTENT_THRESHOLD_PX ||
            deltaY >= DRAG_INTENT_THRESHOLD_PX
          ) {
            dragIntentRef.current = true;
          }
        }}
        onPointerUp={() => {
          pointerDownRef.current = null;
        }}
        onPointerCancel={() => {
          pointerDownRef.current = null;
          dragIntentRef.current = false;
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleActivate();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleActivate();
          }
        }}
        onDragStart={(event) => {
          dragStartedRef.current = true;
          justDraggedRef.current = true;

          upsertDynamicConnectableCandidate({
            entityId,
            targetPid: candidate.pid,
            name: candidate.name,
            imageUrl: candidate.imageUrl ?? undefined,
            confidence: candidate.confidence,
          });

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", entityId);
          event.dataTransfer.setData(
            "application/x-dunbar-entity-id",
            entityId,
          );

          onDragStartCandidate?.(entityId);
        }}
        onDragEnd={() => {
          pointerDownRef.current = null;
          dragIntentRef.current = false;

          onDragEndCandidate?.();

          window.setTimeout(() => {
            dragStartedRef.current = false;
            justDraggedRef.current = false;
          }, JUST_DRAGGED_RESET_MS);
        }}
        className="group flex shrink-0 cursor-pointer flex-col items-center gap-[6px] rounded-[18px] transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-slate-300"
        aria-label={`${candidate.name} 상세 보기`}
        title={`${candidate.name} · 가입 완료 사용자`}
      >
        <CandidateAvatar candidate={candidate} isDragging={isDragging} />

        <span className="max-w-[56px] truncate text-[10px] font-medium leading-none text-slate-700">
          {candidate.name}
        </span>
      </div>
    </div>
  );
}

function LoadingStrip({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-[10px] overflow-hidden">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`joined-loading-${index}`}
          className="flex shrink-0 flex-col items-center gap-[6px]"
        >
          <div className="h-[50px] w-[50px] animate-pulse rounded-[17px] bg-slate-200" />
          <div className="h-[9px] w-[32px] animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export default function HomeRecommendationList({
  ownerUserId = FIXED_OWNER_USER_ID,
  maxItems = DEFAULT_LIMIT,
  title = "연결 가능",
  className,
  onSelectCandidate,
  onOpenSearch,
  occupiedEntityIds,
  suppressedEntityIds,
  connectableStateMap,
  isDraggingCandidate = false,
  onDragStartCandidate,
  onDragEndCandidate,
  onExploreCandidate,
}: Props) {
  const router = useRouter();
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const peopleStoreHydrated = usePeopleStore((state) => state.hasHydrated);

  const [draggingCandidateId, setDraggingCandidateId] = useState<string | null>(
    null,
  );

  const joinedCandidates = useMemo<JoinedConnectableCandidate[]>(() => {
    const joinedMap = new Map<string, JoinedConnectableCandidate>();

    for (const draft of inviteDrafts) {
      if (draft.status !== "accepted" || !draft.acceptedPersonId) {
        continue;
      }

      const matchedPerson = people.find(
        (person) => person.id === draft.acceptedPersonId,
      );

      if (!matchedPerson) {
        continue;
      }

      joinedMap.set(matchedPerson.id, {
        pid: matchedPerson.id,
        name: matchedPerson.name,
        imageUrl: null,
        confidence: "high",
        badge: "가입",
        acceptedAt: draft.acceptedAt,
      });
    }

    return Array.from(joinedMap.values()).sort((a, b) => {
      const aTime = a.acceptedAt ? new Date(a.acceptedAt).getTime() : 0;
      const bTime = b.acceptedAt ? new Date(b.acceptedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [inviteDrafts, people]);

  const visibleCandidates = useMemo(() => {
    const occupied = occupiedEntityIds ?? new Set<string>();
    const suppressed = suppressedEntityIds ?? new Set<string>();

    return joinedCandidates
      .filter((candidate) => {
        const entityId = buildDynamicConnectableEntityId(candidate.pid);

        if (occupied.has(entityId)) {
          return false;
        }

        if (suppressed.has(entityId)) {
          return false;
        }

        return true;
      })
      .slice(0, maxItems);
  }, [joinedCandidates, maxItems, occupiedEntityIds, suppressedEntityIds]);

  const activeCount = visibleCandidates.length;
  const showSearchButton = typeof onOpenSearch === "function";

  const handleSelect = (candidate: JoinedConnectableCandidate) => {
    const entityId = buildDynamicConnectableEntityId(candidate.pid);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        "dl.connectable.selection.v1",
        JSON.stringify({
          source: "home-connectable-joined-users",
          entityId,
          targetId: candidate.pid,
          targetPid: candidate.pid,
          targetName: candidate.name,
          name: candidate.name,
          selectedAt: new Date().toISOString(),
        }),
      );
    }

    onExploreCandidate?.(candidate);

    if (onSelectCandidate) {
      onSelectCandidate(candidate);
      return;
    }

    router.push(`/dashboard/people/${candidate.pid}`);
  };

  return (
    <section
      className={mergeClassNames(
        "px-[6px] py-[6px] transition-all duration-200",
        isDraggingCandidate &&
          "border-slate-300 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80",
        className,
      )}
    >
      <div className="mb-[8px] flex items-center justify-between gap-[10px]">
        <div className="min-w-0 flex items-center gap-[6px]">
          <h2 className="text-[13px] font-semibold text-slate-800">{title}</h2>

          

          

          {isDraggingCandidate ? (
            <span className="rounded-full bg-slate-800 px-[7px] py-[3px] text-[10px] leading-none text-white">
              놓기
            </span>
          ) : null}
        </div>

        {showSearchButton ? (
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-[0_3px_10px_rgba(15,23,42,0.06)] transition active:scale-[0.97]"
            aria-label="연결 가능 사람 검색 열기"
            title="사람 검색"
          >
            <SearchIcon />
          </button>
        ) : null}
      </div>

      {!peopleStoreHydrated ? <LoadingStrip count={Math.min(maxItems, 4)} /> : null}

      {peopleStoreHydrated && activeCount > 0 ? (
        <div
          className={mergeClassNames(
            "flex items-start gap-[10px] overflow-x-auto overflow-y-hidden pb-[2px] hide-scrollbar transition-opacity duration-150",
            isDraggingCandidate && "opacity-95",
          )}
        >
          {visibleCandidates.map((candidate) => {
            const entityId = buildDynamicConnectableEntityId(candidate.pid);
            const isDraggingThis = draggingCandidateId === entityId;

            return (
              <div
                key={candidate.pid}
                className={mergeClassNames(
                  "transition-all duration-150",
                  isDraggingCandidate &&
                    !isDraggingThis &&
                    "scale-[0.98] opacity-70",
                  isDraggingThis && "scale-[1.03]",
                )}
              >
                <CandidateTile
                  candidate={candidate}
                  isDragging={isDraggingThis}
                  onClick={() => handleSelect(candidate)}
                  onDragStartCandidate={(nextEntityId) => {
                    setDraggingCandidateId(nextEntityId);
                    onDragStartCandidate?.(nextEntityId);
                  }}
                  onDragEndCandidate={() => {
                    setDraggingCandidateId(null);
                    onDragEndCandidate?.();
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      

      {peopleStoreHydrated && activeCount === 0 ? (
        <div className="flex flex-col items-center justify-center gap-[6px] rounded-[16px] border border-dashed border-slate-200 bg-white/55 px-[12px] py-[16px] text-center">
          <p className="text-[12px] font-medium text-slate-500">
            아직 추천할 사람이 없어요
          </p>
          <p className="text-[11px] leading-[1.5] text-slate-400">
            초대로 연결된 사람이 생기면 여기에서 홈에 바로 추가할 수 있어요.
          </p>
          {showSearchButton ? (
            <button
              type="button"
              onClick={onOpenSearch}
              className="mt-[2px] rounded-full border border-slate-200 bg-white px-[12px] py-[6px] text-[11px] font-medium text-slate-500 shadow-[0_3px_10px_rgba(15,23,42,0.05)] active:scale-[0.97]"
            >
              사람 검색
            </button>
          ) : null}
        </div>
      ) : null}

      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}