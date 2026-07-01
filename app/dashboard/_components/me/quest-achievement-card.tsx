"use client";

/**
 * P3-2A 인맥지도 성취도 카드 (Me 탭, presentational).
 *
 * - 준비도(%)는 6개 milestone(quest missions)의 완료율 — 0~100%.
 * - Point 는 누적값(로컬 Point Ledger 합계)으로 me/page 에서 계산해 내려준다.
 *   준비도(완료율)와 Point(누적)는 분리된 개념이며 100점 만점 표현을 쓰지 않는다.
 * - 🪙 +N 효과는 me/page 의 ledger reconcile 에서 "새 적립"이 생겼을 때만
 *   burstPoints 로 내려온다(기존 backfill 에는 효과 없음).
 *
 * computed-only · 서버 write 없음 · wallet/coin 미연동.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { buildQuestMissions } from "./quest-missions";
import type { QuestMission } from "./quest-missions";

export { buildQuestMissions };
export type { QuestMission };

export function QuestAchievementCard({
  missions,
  pointTotal,
  burstPoints,
}: {
  missions: QuestMission[];
  pointTotal: number;
  burstPoints: number | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showMissions, setShowMissions] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const doneCount = missions.filter((m) => m.done).length;
  const totalCount = missions.length;
  const readinessPct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
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

      {/* 헤더(항상 표시) = 접힘/펼침 토글. 요약: 준비도(완료율) · 누적 Point · 완료수 */}
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
                burstPoints !== null ? "transition-transform duration-300" : ""
              }`}
              style={
                burstPoints !== null
                  ? { display: "inline-block", transform: "scale(1.12)" }
                  : undefined
              }
            >
              누적 {pointTotal}P
            </span>
            {" · "}
            {doneCount}/{totalCount} 완료
          </p>
        </div>
        <div className="relative flex shrink-0 items-center gap-1.5">
          {burstPoints !== null ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-4 right-5 text-[13px] font-bold text-[#C8890B]"
              style={{ animation: "questPointRise 1.6s ease-out forwards" }}
            >
              🪙 +{burstPoints}
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

      {/* 얇은 진행바 = 준비도(완료율). 누적 Point 와 무관. */}
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

          {/* 미션 리스트: milestone 완료 체크(누적 Point 와 별개라 점수 미표기) */}
          {missionsToShow.length > 0 ? (
            <ul className="mt-2.5 flex flex-col gap-[8px]">
              {missionsToShow.map((mission) => (
                <li key={mission.key} className="flex items-center gap-[8px]">
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
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-2.5 flex items-center justify-between gap-3">
            {missionToggleVisible ? (
              <button
                type="button"
                onClick={() => setShowMissions((v) => !v)}
                aria-expanded={showMissions}
                className="text-[12px] font-semibold text-[#6C8A77] active:opacity-70"
              >
                {missionToggleLabel}
              </button>
            ) : (
              <span />
            )}
            <span className="shrink-0 text-[12px] font-semibold text-[#4B6B57]">
              누적 Point {pointTotal}P
            </span>
          </div>
        </>
      )}
    </section>
  );
}

export default QuestAchievementCard;
