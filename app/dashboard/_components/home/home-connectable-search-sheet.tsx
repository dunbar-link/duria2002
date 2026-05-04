"use client";

import { useEffect, useMemo, useState } from "react";
import { usePeopleStore } from "../../people/store";
import {
  buildDynamicConnectableEntityId,
  layerBlueprints,
  upsertDynamicConnectableCandidate,
} from "./home-page-types";

type HomeConnectableSearchSheetProps = {
  open: boolean;
  ownerUserId?: string;
  occupiedEntityIds: Set<string>;
  suppressedConnectableEntityIds: Set<string>;
  onClose: () => void;
  onAddToLayer: (entityId: string, targetLayerId: string) => void;
  onExploreCandidate: (
    entityId: string,
    targetPid: string,
    entityName: string,
  ) => void;
};

type SearchCandidate = {
  entityId: string;
  targetPid: string;
  canonicalName: string;
  initials: string;
  confidence: "high" | "medium" | "low";
  badge?: string | null;
  acceptedAt?: string | null;
};

type SearchResultItemProps = {
  candidate: SearchCandidate;
  onAddToLayer: (entityId: string, targetLayerId: string) => void;
  onExploreCandidate: (
    entityId: string,
    targetPid: string,
    entityName: string,
  ) => void;
};

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";
const LAYER_BUTTON_ORDER = ["family", "core", "trust", "intimate", "maintain"];

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

function getInitialsFromName(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return "?";
  }

  if (trimmed.length === 1) {
    return trimmed;
  }

  return trimmed.slice(0, 2);
}

function getOrderedLayers() {
  return LAYER_BUTTON_ORDER.map((layerId) =>
    layerBlueprints.find((layer) => layer.id === layerId),
  ).filter(Boolean);
}

function SearchResultItem({
  candidate,
  onAddToLayer,
  onExploreCandidate,
}: SearchResultItemProps) {
  const orderedLayers = useMemo(() => getOrderedLayers(), []);

  const registerCandidate = () => {
    return upsertDynamicConnectableCandidate({
      entityId: candidate.entityId,
      targetPid: candidate.targetPid,
      name: candidate.canonicalName,
      confidence: candidate.confidence,
    });
  };

  return (
    <div className="rounded-[18px] border border-slate-200/80 bg-white px-[12px] py-[12px] shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-[10px]">
        <div className="relative flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[16px] border border-slate-200 bg-slate-100 text-[14px] font-semibold text-slate-700">
          <span>{candidate.initials}</span>
          <span className="absolute -right-[2px] -top-[2px] rounded-full border-2 border-white bg-emerald-500 px-[5px] py-[2px] text-[9px] font-semibold leading-none text-white shadow-sm">
            가입
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[6px]">
            <h3 className="truncate text-[14px] font-semibold text-slate-800">
              {candidate.canonicalName}
            </h3>
            <span className="rounded-full bg-slate-100 px-[7px] py-[3px] text-[10px] leading-none text-slate-500">
              가입자
            </span>
          </div>

          <p className="mt-[4px] text-[11px] text-slate-400">
            홈에 바로 올릴 수 있어요
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onExploreCandidate(
              candidate.entityId,
              candidate.targetPid,
              candidate.canonicalName,
            )
          }
          className="shrink-0 rounded-full border border-slate-200 bg-white px-[10px] py-[6px] text-[11px] font-medium text-slate-600 transition active:bg-slate-50"
        >
          보기
        </button>
      </div>

      <div className="mt-[10px] flex flex-wrap gap-[6px]">
        {orderedLayers.map((layer) => {
          if (!layer) {
            return null;
          }

          return (
            <button
              key={`${candidate.entityId}-${layer.id}`}
              type="button"
              onClick={() => {
                const registered = registerCandidate();
                onAddToLayer(registered.id, layer.id);
              }}
              className="rounded-full border border-slate-200 bg-slate-50 px-[10px] py-[6px] text-[11px] font-medium text-slate-600 transition active:bg-slate-100"
            >
              {layer.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-[8px]">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`search-loading-${index}`}
          className="rounded-[18px] border border-slate-200/80 bg-white px-[12px] py-[12px] shadow-[0_4px_12px_rgba(15,23,42,0.04)]"
        >
          <div className="flex items-center gap-[10px]">
            <div className="h-[48px] w-[48px] animate-pulse rounded-[16px] bg-slate-200" />
            <div className="flex-1 space-y-[6px]">
              <div className="h-[13px] w-[88px] animate-pulse rounded bg-slate-200" />
              <div className="h-[9px] w-[120px] animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-[32px] w-[50px] animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomeConnectableSearchSheet({
  open,
  ownerUserId = FIXED_OWNER_USER_ID,
  occupiedEntityIds,
  suppressedConnectableEntityIds,
  onClose,
  onAddToLayer,
  onExploreCandidate,
}: HomeConnectableSearchSheetProps) {
  const [query, setQuery] = useState("");

  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const peopleStoreHydrated = usePeopleStore((state) => state.hasHydrated);

  void ownerUserId;

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const joinedCandidates = useMemo<SearchCandidate[]>(() => {
    const joinedMap = new Map<string, SearchCandidate>();

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

      const name = matchedPerson.name?.trim();

      if (!name) {
        continue;
      }

      joinedMap.set(matchedPerson.id, {
        entityId: buildDynamicConnectableEntityId(matchedPerson.id),
        targetPid: matchedPerson.id,
        canonicalName: name,
        initials: getInitialsFromName(name),
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

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return joinedCandidates
      .filter((candidate) => !occupiedEntityIds.has(candidate.entityId))
      .filter(
        (candidate) => !suppressedConnectableEntityIds.has(candidate.entityId),
      )
      .filter((candidate) => {
        if (!normalizedQuery) {
          return true;
        }

        const fields = [
          candidate.canonicalName,
          candidate.initials,
          candidate.badge ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return fields.includes(normalizedQuery);
      });
  }, [
    joinedCandidates,
    occupiedEntityIds,
    suppressedConnectableEntityIds,
    query,
  ]);

  const resultCountLabel = peopleStoreHydrated
    ? `${filteredCandidates.length}명`
    : "불러오는 중";

  return (
    <>
      <button
        type="button"
        aria-label="검색 시트 닫기"
        onClick={onClose}
        className={[
          "fixed inset-0 z-[72] bg-slate-900/34 backdrop-blur-[1px] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />

      <section
        className={[
          "fixed inset-x-[10px] bottom-0 z-[73] mx-auto rounded-t-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] px-[14px] pb-[14px] pt-[12px] shadow-[0_-12px_30px_rgba(15,23,42,0.16)] transition-all duration-200 ease-out",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[24px] opacity-0",
        ].join(" ")}
        style={{ width: "min(100%, 412px)", height: "min(72vh, 640px)" }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0">
            <div className="mx-auto mb-[10px] h-[4px] w-[56px] rounded-full bg-slate-200" />

            <div className="mb-[10px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-[8px]">
                <h2 className="text-[15px] font-semibold text-slate-800">
                  사람 찾기
                </h2>
                <span className="rounded-full bg-slate-100 px-[7px] py-[3px] text-[10px] leading-none text-slate-500">
                  가입자만
                </span>
                <span className="rounded-full bg-emerald-50 px-[7px] py-[3px] text-[10px] leading-none text-emerald-700 ring-1 ring-emerald-200">
                  {resultCountLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors duration-150 active:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="mb-[12px] flex items-center gap-[8px] rounded-[16px] border border-slate-200 bg-white px-[12px] py-[10px] shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
              <span className="text-slate-400">
                <SearchIcon />
              </span>

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름 검색"
                className="w-full bg-transparent text-[14px] text-slate-700 outline-none placeholder:text-slate-300"
                autoFocus={open}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-[2px]">
            {!peopleStoreHydrated ? <LoadingState /> : null}

            {peopleStoreHydrated ? (
              <div className="space-y-[8px]">
                {filteredCandidates.length > 0 ? (
                  filteredCandidates.map((candidate) => (
                    <SearchResultItem
                      key={candidate.entityId}
                      candidate={candidate}
                      onAddToLayer={onAddToLayer}
                      onExploreCandidate={onExploreCandidate}
                    />
                  ))
                ) : (
                  <div className="flex h-[100px] items-center justify-center rounded-[18px] border border-dashed border-slate-200 bg-white/65 text-[12px] text-slate-400">
                    결과가 없어요
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}