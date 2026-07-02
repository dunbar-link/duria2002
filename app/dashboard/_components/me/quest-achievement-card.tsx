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

  useEffect(() => {
    setMounted(true);
  }, []);

  const doneCount = missions.filter((m) => m.done).length;
  const totalCount = missions.length;
  const readinessPct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const allDone = totalCount > 0 && doneCount === totalCount;

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
        <div className="mt-3 border-t border-[#ECEAE2] pt-3">
          {/* 상태판 — 미션 표가 아니라 짧은 상태 문구만. 행동 유도는 실제 입력
              위치의 빨간 점/포인트 힌트가 담당한다. */}
          <p className="text-[12px] leading-snug text-[#8D99AE]">
            {allDone
              ? "좋아요. 인맥지도 기본 준비가 끝났어요."
              : "다음 포인트는 화면에 표시된 곳(빨간 점)에서 얻을 수 있어요."}
          </p>
          <p className="mt-1.5 text-[12px] font-semibold text-[#4B6B57]">
            누적 Point {pointTotal}P
          </p>
        </div>
      )}
    </section>
  );
}

export default QuestAchievementCard;
