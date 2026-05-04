"use client";

import { useRouter } from "next/navigation";
import {
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DashboardPerson } from "../people/data";
import { usePeopleStore } from "../people/store";
import {
  buildActionDraft,
  buildReasonText,
  clearRelationshipSnooze,
  formatRelativeStatus,
  getPrimaryRecommendationForPerson,
  getRelationshipStatusFromMap,
  isRelationshipSnoozed,
  readRelationshipStatusMap,
  RelationshipStatusMap,
  resetRelationshipToIdle,
  setRelationshipActionStarted,
  subscribeRelationshipStatus,
} from "../people/relationship-status";
import { runPrimaryContactAction } from "../people/contact-actions";

type FocusCardKind = "today" | "core" | "restore";

type FocusCardItem = {
  person: DashboardPerson;
  kind: FocusCardKind;
  badgeText: string;
  actionTitle: string;
  reasonText: string;
  statusText: string;
  ctaLabel: string;
  ctaKind: "contact" | "reactivate" | "reopen";
  draft: string;
  score: number;
};

type ActionFeedbackTone = "success" | "neutral";

function getBucketFromStatus(status: {
  state?: string | null;
  lastCompletedAt?: string | null;
  snoozedUntil?: string | null;
}) {
  if (status.state === "snoozed" || isRelationshipSnoozed(status as never)) {
    return "later" as const;
  }

  if (status.state === "completed" || status.lastCompletedAt) {
    return "done" as const;
  }

  return "now" as const;
}

function getCtaClass(kind: FocusCardItem["ctaKind"]) {
  if (kind === "contact") {
    return "bg-neutral-900 text-white hover:bg-neutral-800";
  }

  if (kind === "reactivate") {
    return "bg-white text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50";
  }

  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100";
}

function feedbackClass(tone: ActionFeedbackTone) {
  if (tone === "success") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function buildTodayCards(
  people: DashboardPerson[],
  statusMap: RelationshipStatusMap,
  isHydrated: boolean,
): FocusCardItem[] {
  return [...people]
    .map((person) => {
      const status = getRelationshipStatusFromMap(statusMap, person.id);
      const bucket = getBucketFromStatus(status);
      const recommendation = getPrimaryRecommendationForPerson(person, statusMap);
      const reason = buildReasonText(person, status);
      const statusText = isHydrated ? formatRelativeStatus(person.id) : "아직 기록 없음";
      const draft = buildActionDraft(person, reason.body);

      return {
        person,
        bucket,
        recommendation,
        reason,
        statusText,
        draft,
      };
    })
    .filter((item) => item.bucket === "now")
    .sort((a, b) => {
      if (b.recommendation.score !== a.recommendation.score) {
        return b.recommendation.score - a.recommendation.score;
      }

      return a.person.name.localeCompare(b.person.name);
    })
    .slice(0, 3)
    .map((item) => ({
      person: item.person,
      kind: "today" as const,
      badgeText: "TODAY",
      actionTitle: "지금 연락",
      reasonText: item.reason.body,
      statusText: item.statusText,
      ctaLabel: "신호 보내기",
      ctaKind: "contact" as const,
      draft: item.draft,
      score: item.recommendation.score,
    }));
}

function buildCoreCards(
  people: DashboardPerson[],
  statusMap: RelationshipStatusMap,
  isHydrated: boolean,
): FocusCardItem[] {
  return [...people]
    .map((person) => {
      const status = getRelationshipStatusFromMap(statusMap, person.id);
      const recommendation = getPrimaryRecommendationForPerson(person, statusMap);
      const reason = buildReasonText(person, status);
      const statusText = isHydrated ? formatRelativeStatus(person.id) : "아직 기록 없음";
      const draft = buildActionDraft(person, reason.body);
      const bucket = getBucketFromStatus(status);

      return {
        person,
        bucket,
        recommendation,
        reason,
        statusText,
        draft,
      };
    })
    .filter((item) => item.bucket !== "done")
    .filter((item) => item.person.tier <= 15)
    .sort((a, b) => {
      if (a.person.tier !== b.person.tier) {
        return a.person.tier - b.person.tier;
      }

      if (b.recommendation.score !== a.recommendation.score) {
        return b.recommendation.score - a.recommendation.score;
      }

      return a.person.name.localeCompare(b.person.name);
    })
    .slice(0, 2)
    .map((item) => ({
      person: item.person,
      kind: "core" as const,
      badgeText: item.person.tier <= 5 ? "CORE" : "CLOSE",
      actionTitle: item.bucket === "later" ? "다시 활성화" : "먼저 확인",
      reasonText: item.reason.body,
      statusText: item.statusText,
      ctaLabel: item.bucket === "later" ? "다시 활성화" : "신호 보내기",
      ctaKind: item.bucket === "later" ? "reactivate" as const : "contact" as const,
      draft: item.draft,
      score: item.recommendation.score,
    }));
}

function buildRestoreCard(
  people: DashboardPerson[],
  statusMap: RelationshipStatusMap,
  isHydrated: boolean,
): FocusCardItem[] {
  const candidate = [...people]
    .map((person) => {
      const status = getRelationshipStatusFromMap(statusMap, person.id);
      const bucket = getBucketFromStatus(status);
      const recommendation = getPrimaryRecommendationForPerson(person, statusMap);
      const reason = buildReasonText(person, status);
      const statusText = isHydrated ? formatRelativeStatus(person.id) : "아직 기록 없음";
      const draft = buildActionDraft(person, reason.body);

      return {
        person,
        bucket,
        recommendation,
        reason,
        statusText,
        draft,
      };
    })
    .filter((item) => item.bucket === "later" || item.bucket === "done")
    .sort((a, b) => {
      if (b.recommendation.score !== a.recommendation.score) {
        return b.recommendation.score - a.recommendation.score;
      }

      return a.person.name.localeCompare(b.person.name);
    })[0];

  if (!candidate) {
    return [];
  }

  return [
    {
      person: candidate.person,
      kind: "restore" as const,
      badgeText: "RESTORE",
      actionTitle: candidate.bucket === "later" ? "다시 활성화" : "다시 보기",
      reasonText: candidate.reason.body,
      statusText: candidate.statusText,
      ctaLabel: candidate.bucket === "later" ? "다시 활성화" : "다시 보기",
      ctaKind: candidate.bucket === "later" ? "reactivate" : "reopen",
      draft: candidate.draft,
      score: candidate.recommendation.score,
    },
  ];
}

function EmptyCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] bg-white p-5 text-center shadow-sm ring-1 ring-black/5">
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-500">{body}</p>
    </div>
  );
}

function FocusSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-semibold text-neutral-600">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function FocusCard({
  item,
  onOpenDetail,
  onCardKeyDown,
  onPrimaryAction,
}: {
  item: FocusCardItem;
  onOpenDetail: (personId: string) => void;
  onCardKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    personId: string,
  ) => void;
  onPrimaryAction: (
    event: MouseEvent<HTMLButtonElement>,
    item: FocusCardItem,
  ) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(item.person.id)}
      onKeyDown={(event) => onCardKeyDown(event, item.person.id)}
      className="cursor-pointer rounded-[24px] bg-white px-4 py-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-neutral-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold text-neutral-900">
              {item.person.name}
            </h3>

            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
              {item.badgeText}
            </span>
          </div>

          <p className="mt-2 text-sm font-semibold text-neutral-800">
            {item.statusText}
          </p>

          <p className="mt-2 text-sm leading-6 text-neutral-600">
            {item.reasonText}
          </p>

          {item.person.notes.length > 0 ? (
            <p className="mt-2 text-[13px] leading-5 text-neutral-500">
              {item.person.notes[0]}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 w-[118px]">
          <div className="rounded-[18px] bg-neutral-900 px-3 py-3 text-center text-white">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
              Action
            </p>
            <p className="mt-2 text-sm font-semibold leading-5">
              {item.actionTitle}
            </p>
          </div>

          <button
            type="button"
            onClick={(event) => onPrimaryAction(event, item)}
            className={[
              "mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-[18px] px-4 text-center text-sm font-semibold transition",
              getCtaClass(item.ctaKind),
            ].join(" ")}
          >
            {item.ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FocusPage() {
  const router = useRouter();
  const people = usePeopleStore((state) => state.people);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);
  const markContacted = usePeopleStore((state) => state.markContacted);

  const [statusMap, setStatusMap] = useState<RelationshipStatusMap>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionMessageTone, setActionMessageTone] =
    useState<ActionFeedbackTone>("success");

  useEffect(() => {
    setIsHydrated(true);

    function syncStatus() {
      try {
        setStatusMap(readRelationshipStatusMap());
      } catch {
        setStatusMap({});
      }
    }

    syncStatus();

    const unsubscribe = subscribeRelationshipStatus(syncStatus);

    function handleFocus() {
      syncStatus();
    }

    function handlePageShow() {
      syncStatus();
    }

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActionMessage("");
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const todayCards = useMemo(() => {
    return buildTodayCards(people, statusMap, isHydrated);
  }, [people, statusMap, isHydrated]);

  const coreCards = useMemo(() => {
    return buildCoreCards(people, statusMap, isHydrated);
  }, [people, statusMap, isHydrated]);

  const restoreCards = useMemo(() => {
    return buildRestoreCard(people, statusMap, isHydrated);
  }, [people, statusMap, isHydrated]);

  function openDetail(personId: string) {
    router.push(`/dashboard/people/${personId}`);
  }

  function handleCardKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    personId: string,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(personId);
    }
  }

  async function handlePrimaryAction(
    event: MouseEvent<HTMLButtonElement>,
    item: FocusCardItem,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (item.ctaKind === "contact") {
      const result = await runPrimaryContactAction(item.person, item.draft);

      if (result.ok) {
        setRelationshipActionStarted(item.person.id, result.relationshipChannel);
        markContacted(item.person.id);
        setActionMessageTone("success");
        setActionMessage(result.message);
      } else {
        setActionMessageTone("neutral");
        setActionMessage(result.message);
      }

      return;
    }

    if (item.ctaKind === "reactivate") {
      clearRelationshipSnooze(item.person.id);
      setActionMessageTone("success");
      setActionMessage("다시 활성화했어요.");
      return;
    }

    resetRelationshipToIdle(item.person.id);
    setActionMessageTone("success");
    setActionMessage("다시 확인 대상으로 돌렸어요.");
  }

  if (!hasHydrated) {
    return (
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-50">
        <div className="px-5 pb-6 pt-6">
          <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-black/5">
            <p className="text-base font-semibold text-neutral-900">불러오는 중...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-50">
      <div className="sticky top-0 z-20 border-b border-black/5 bg-neutral-50/95 px-5 pb-4 pt-4 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400">
          Focus
        </p>

        <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-neutral-900">
          오늘 챙길 사람
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          오늘 바로 움직일 사람만 봐요.
        </p>

        {actionMessage ? (
          <div
            className={`mt-3 rounded-2xl px-4 py-3 text-sm font-semibold ${feedbackClass(
              actionMessageTone,
            )}`}
          >
            {actionMessage}
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
          <span className="rounded-full bg-neutral-100 px-3 py-1 font-semibold text-neutral-700">
            오늘 {todayCards.length}
          </span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 font-semibold text-neutral-700">
            가까운 관계 {coreCards.length}
          </span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 font-semibold text-neutral-700">
            복원 {restoreCards.length}
          </span>
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-[120px] pt-3">
        <FocusSection title="오늘 바로" count={todayCards.length}>
          {todayCards.length > 0 ? (
            <div className="space-y-3">
              {todayCards.map((item) => (
                <FocusCard
                  key={`${item.kind}-${item.person.id}`}
                  item={item}
                  onOpenDetail={openDetail}
                  onCardKeyDown={handleCardKeyDown}
                  onPrimaryAction={handlePrimaryAction}
                />
              ))}
            </div>
          ) : (
            <EmptyCard
              title="오늘 바로 움직일 사람 없음"
              body="지금은 전체 흐름이 안정적이에요."
            />
          )}
        </FocusSection>

        <FocusSection title="가까운 사람 먼저" count={coreCards.length}>
          {coreCards.length > 0 ? (
            <div className="space-y-3">
              {coreCards.map((item) => (
                <FocusCard
                  key={`${item.kind}-${item.person.id}`}
                  item={item}
                  onOpenDetail={openDetail}
                  onCardKeyDown={handleCardKeyDown}
                  onPrimaryAction={handlePrimaryAction}
                />
              ))}
            </div>
          ) : (
            <EmptyCard
              title="가까운 관계는 안정적이에요"
              body="지금은 무리하게 건드릴 필요 없어요."
            />
          )}
        </FocusSection>

        <FocusSection title="복원 / 재개" count={restoreCards.length}>
          {restoreCards.length > 0 ? (
            <div className="space-y-3">
              {restoreCards.map((item) => (
                <FocusCard
                  key={`${item.kind}-${item.person.id}`}
                  item={item}
                  onOpenDetail={openDetail}
                  onCardKeyDown={handleCardKeyDown}
                  onPrimaryAction={handlePrimaryAction}
                />
              ))}
            </div>
          ) : (
            <EmptyCard
              title="복원할 관계 없음"
              body="지금은 오늘 할 사람부터 보면 돼요."
            />
          )}
        </FocusSection>
      </section>
    </main>
  );
}