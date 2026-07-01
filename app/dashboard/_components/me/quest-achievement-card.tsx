"use client";

/**
 * P3-1G 인맥지도 성취도 카드 (Me 탭, presentational).
 *
 * 미션/점수 계산은 me/page 에서 buildQuestMissions 로 "한 번만" 하고 내려준다.
 * 그 결과 Me 상단 Point 와 이 카드의 점수가 항상 같은 소스를 쓴다(숫자 단일화).
 * 이 카드는 표시 + 완료 효과(🪙)만 담당한다.
 *
 * 원칙: computed-only · 서버 write 없음 · wallet/coin 미연동 · persist 잔액 없음.
 * 유일한 로컬 저장은 "효과 seen 처리" key 하나(정식 보상 store 아님).
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const SEEN_COMPLETIONS_KEY = "dunbar-link-quest-seen-completions-v1";

export type QuestMission = {
  key: string;
  label: string;
  points: number;
  done: boolean;
  href: string;
};

export type QuestState = {
  hasName: boolean;
  peopleCount: number;
  hasTieredPerson: boolean;
  inviteCount: number;
  hasExploreField: boolean;
  hasConnectedPerson: boolean;
};

/**
 * 미션/점수 단일 정의. Me 상단 Point 와 성취도 카드가 이 함수를 공유해 같은
 * 숫자를 쓴다. 총점 = 10+10+30+20+20+10 = 100P.
 */
export function buildQuestMissions(s: QuestState): QuestMission[] {
  return [
    { key: "name", label: "내 이름 등록", points: 10, done: s.hasName, href: "/dashboard/me" },
    { key: "person", label: "가까운 사람 1명 등록", points: 10, done: s.peopleCount >= 1, href: "/dashboard/people" },
    { key: "tier", label: "사람을 관계 단계로 분류", points: 30, done: s.hasTieredPerson, href: "/dashboard/people" },
    { key: "invite", label: "친구 초대 시작", points: 20, done: s.inviteCount >= 1, href: "/dashboard/people/invite" },
    { key: "explore", label: "학교·회사·지역 중 1개 입력", points: 20, done: s.hasExploreField, href: "/dashboard/me" },
    { key: "signal", label: "연결된 사람에게 신호 보내기", points: 10, done: s.hasConnectedPerson, href: "/dashboard/signals" },
  ];
}

function readSeenCompletions(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SEEN_COMPLETIONS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function writeSeenCompletions(keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_COMPLETIONS_KEY, JSON.stringify(keys));
  } catch {
    // 효과용일 뿐 — 실패 무시(데이터 아님)
  }
}

export function QuestAchievementCard({
  missions,
  ready,
}: {
  missions: QuestMission[];
  ready: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showMissions, setShowMissions] = useState(false);
  const [burst, setBurst] = useState<{ total: number } | null>(null);
  // ready(데이터 안정) 후 첫 1회만 seed(효과 없이 현재 완료분 기록). 이후 세션 중
  // 새로 완료된 미션만 🪙 효과를 낸다 → 로드 시 하이드레이션으로 인한 효과 폭발 방지.
  const seededRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const doneCount = missions.filter((m) => m.done).length;
  const totalCount = missions.length;
  const readinessPct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const earnedPoints = missions.reduce(
    (sum, m) => (m.done ? sum + m.points : sum),
    0
  );
  const allDone = totalCount > 0 && doneCount === totalCount;
  const nextMission = missions.find((m) => !m.done) ?? null;

  const missionsToShow = allDone
    ? showMissions
      ? missions
      : []
    : showMissions
      ? missions
      : missions.slice(0, 3);
  const missionToggleVisible = allDone || missions.length > 3;
  const missionToggleLabel = allDone
    ? showMissions
      ? "완료 미션 접기"
      : "완료 미션 보기"
    : showMissions
      ? "접기"
      : `전체 보기 (${totalCount})`;

  useEffect(() => {
    if (!mounted || !ready) return;
    const doneKeys = missions.filter((m) => m.done).map((m) => m.key);
    const seen = readSeenCompletions() ?? [];
    if (!seededRef.current) {
      seededRef.current = true;
      writeSeenCompletions(Array.from(new Set([...seen, ...doneKeys])));
      return;
    }
    const seenSet = new Set(seen);
    const newly = missions.filter((m) => m.done && !seenSet.has(m.key));
    if (newly.length === 0) return;
    const total = newly.reduce((sum, m) => sum + m.points, 0);
    setBurst({ total });
    writeSeenCompletions(Array.from(new Set([...seen, ...doneKeys])));
    const timer = window.setTimeout(() => setBurst(null), 1600);
    return () => window.clearTimeout(timer);
  }, [mounted, ready, missions]);

  if (!mounted) return null;

  return (
    <section className="relative mt-2 rounded-[24px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#E2E0D8]">
      <style>{`
        @keyframes questPointRise {
          0% { opacity: 0; transform: translateY(6px) scale(0.9); }
          20% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-18px) scale(1); }
        }
      `}</style>

      {/* 헤더(항상 표시) = 접힘/펼침 토글. 요약(준비도·Point·완료)이 접힘에도 보인다. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "인맥지도 성취도 접기" : "인맥지도 성취도 펼치기"}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-[#334155]">인맥지도 성취도</h2>
          <p className="mt-1 text-[12px] font-medium leading-snug text-[#8D99AE]">
            준비도 <span className="font-semibold text-[#4B6B57]">{readinessPct}%</span>
            {" · "}
            <span
              className={`font-semibold text-[#4B6B57] ${
                burst ? "transition-transform duration-300" : ""
              }`}
              style={
                burst
                  ? { display: "inline-block", transform: "scale(1.12)" }
                  : undefined
              }
            >
              {earnedPoints}P
            </span>
            {" · "}
            {doneCount}/{totalCount} 완료
          </p>
        </div>
        <div className="relative flex shrink-0 items-center gap-1.5">
          {burst ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-4 right-5 text-[13px] font-bold text-[#C8890B]"
              style={{ animation: "questPointRise 1.6s ease-out forwards" }}
            >
              🪙 +{burst.total}
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className={`text-[15px] leading-none text-[#A0A8B4] transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            ⌄
          </span>
        </div>
      </button>

      {/* 얇은 진행바(접힘에도 표시) */}
      <div className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full bg-[#ECEAE2]">
        <div
          className="h-full rounded-full bg-[#6C8A77] transition-[width] duration-500"
          style={{ width: `${readinessPct}%` }}
        />
      </div>

      {!expanded ? null : (
        <>
          {/* 완료 요약(100%) 또는 다음 미션(<100%) — compact */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#ECEAE2] pt-3">
            {allDone ? (
              <>
                <span className="text-[13px] font-semibold text-[#4B6B57]">
                  모든 준비 미션 완료 🎉
                </span>
                <span className="shrink-0 rounded-full bg-[#EEF7F0] px-3 py-1 text-[12px] font-semibold text-[#4B6B57]">
                  인맥지도 준비 완료
                </span>
              </>
            ) : (
              <>
                <span className="min-w-0 truncate text-[12px] text-[#8D99AE]">
                  다음 미션 · {nextMission?.label}
                </span>
                {nextMission ? (
                  <Link
                    href={nextMission.href}
                    className="shrink-0 rounded-full bg-[#2C2C2A] px-3.5 py-1 text-[12px] font-semibold text-[#F1EFE8] active:scale-[0.98]"
                  >
                    하러 가기
                  </Link>
                ) : null}
              </>
            )}
          </div>

          {/* 미션 리스트: 100% 완료엔 기본 숨김(토글), 진행 중엔 3개 미리보기 */}
          {missionsToShow.length > 0 ? (
            <ul className="mt-2.5 flex flex-col gap-[8px]">
              {missionsToShow.map((mission) => (
                <li key={mission.key} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-[8px]">
                    <span
                      aria-hidden="true"
                      className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[10px] ${
                        mission.done
                          ? "bg-[#6C8A77] text-white"
                          : "border border-[#CDD2CB] text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`truncate text-[13px] ${
                        mission.done ? "text-[#A0A8B4] line-through" : "text-[#334155]"
                      }`}
                    >
                      {mission.label}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[11px] font-semibold ${
                      mission.done ? "text-[#6C8A77]" : "text-[#B7BEC8]"
                    }`}
                  >
                    +{mission.points}P
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {missionToggleVisible ? (
            <button
              type="button"
              onClick={() => setShowMissions((v) => !v)}
              aria-expanded={showMissions}
              className="mt-2.5 text-[12px] font-semibold text-[#6C8A77] active:opacity-70"
            >
              {missionToggleLabel}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

export default QuestAchievementCard;
