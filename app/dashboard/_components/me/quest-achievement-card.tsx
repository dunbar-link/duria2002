"use client";

/**
 * P3-1B 인맥지도 성취도 카드 (Me 탭, local / UI-only).
 *
 * P3-1 의 Home 퀘스트 카드를 대체한다. Home 은 사람/레이어가 최우선이라
 * 읽는 카드를 두지 않고, 진행상황/미션/준비 점수는 Me 에서 "성취도"처럼
 * 확인하는 구조로 옮겼다.
 *
 * 원칙(P3-1 과 동일):
 *  - computed-only. 기존 상태(people / inviteDrafts / me 프로필 localStorage)를
 *    read-only 로 읽어 완료 여부만 계산한다.
 *  - 서버 write / wallet·coin 연동 / 서버 API 호출 없음.
 *  - "준비 점수"는 실제 지급/서버 코인이 아니다(문구로 명시).
 *  - 내 상태만 사용한다. 타인/비공개 필드는 표시하지 않는다.
 *
 * 유일한 신규 로컬 저장: 미션 완료 "효과 seen 처리"용 key 하나. 새로 완료된
 * 미션에만 +점수 효과를 1회 보여주고, 새로고침 후 같은 미션이 계속 터지지
 * 않게 한다. 이는 P3-2 정식 보상 store 가 아니다(점수 잔액 저장 없음).
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { DashboardPerson } from "../../people/data";
import type { InviteDraft } from "../../people/store";

const PROFILE_STORAGE_KEYS = [
  "dunbar-link-me-profile-v3",
  "dunbar-link-me-profile-v2",
  "dunbar-link-me-profile-v1",
];
// 미션 완료 효과 seen 처리(잔액이 아니라 "이미 터뜨린 미션 key" 집합).
const SEEN_COMPLETIONS_KEY = "dunbar-link-quest-seen-completions-v1";
const PROFILE_UPDATED_EVENT = "dunbar-link-me-profile-updated";

function readProfileName(): string {
  if (typeof window === "undefined") return "";
  for (const key of PROFILE_STORAGE_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { name?: unknown };
      const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
      if (name) return name;
    } catch {
      // 다음 키로
    }
  }
  return "";
}

function isIncompleteName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed === "" || trimmed === "나";
}

// 학교/회사/지역 필드가 하나라도 채워졌는지만 확인(값 자체는 노출하지 않음).
function readExploreFieldReady(): boolean {
  if (typeof window === "undefined") return false;
  const text = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  for (const key of PROFILE_STORAGE_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const filled = [
        parsed.schoolName,
        parsed.highSchool,
        parsed.middleSchool,
        parsed.elementarySchool,
        parsed.universityMajor,
        parsed.major,
        parsed.companyName,
        parsed.company,
        parsed.address,
      ].some((value) => text(value) !== "");
      if (filled) return true;
    } catch {
      // 다음 키로
    }
  }
  return false;
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
    // 저장 실패는 무시(효과용일 뿐, 데이터 아님)
  }
}

type Mission = {
  key: string;
  label: string;
  points: number;
  done: boolean;
  href: string;
};

export function QuestAchievementCard({
  people,
  inviteDrafts,
}: {
  people: DashboardPerson[];
  inviteDrafts: InviteDraft[];
}) {
  const [mounted, setMounted] = useState(false);
  const [hasName, setHasName] = useState(false);
  const [hasExploreField, setHasExploreField] = useState(false);
  // 새로 완료된 미션 효과: [{key, points}] 를 잠깐 띄운다.
  const [burst, setBurst] = useState<{ total: number } | null>(null);
  // 성취도 카드는 기본 접힘(Me 기본 화면을 가볍게). 요약은 접힘 상태에도 보인다.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setMounted(true);
    const refresh = () => {
      setHasName(!isIncompleteName(readProfileName()));
      setHasExploreField(readExploreFieldReady());
    };
    refresh();
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const hasConnectedPerson = inviteDrafts.some(
    (draft) => draft.status === "accepted"
  );

  const missions: Mission[] = useMemo(
    () => [
      {
        key: "name",
        label: "내 이름 등록",
        points: 10,
        done: hasName,
        href: "/dashboard/me",
      },
      {
        key: "person",
        label: "가까운 사람 1명 등록",
        points: 10,
        done: people.length >= 1,
        href: "/dashboard/people",
      },
      {
        key: "tier",
        label: "사람을 관계 단계로 분류",
        points: 30,
        done: people.some((person) => typeof person.tier === "number"),
        href: "/dashboard/people",
      },
      {
        key: "invite",
        label: "친구 초대 시작",
        points: 20,
        done: inviteDrafts.length >= 1,
        href: "/dashboard/people/invite",
      },
      {
        key: "explore",
        label: "학교·회사·지역 중 1개 입력",
        points: 20,
        done: hasExploreField,
        href: "/dashboard/me",
      },
      {
        key: "signal",
        label: "연결된 사람에게 신호 보내기",
        points: 5,
        done: hasConnectedPerson,
        href: "/dashboard/signals",
      },
    ],
    [hasName, hasExploreField, hasConnectedPerson, people, inviteDrafts]
  );

  // 미션 완료 효과 seen 처리. 최초 방문(seen 키 없음)에는 이미 완료된 미션을
  // 터뜨리지 않고 seen 으로만 심는다(첫 진입에 과하게 터지는 것 방지). 이후
  // 새로 완료되는 미션에만 +점수 효과를 1회 보여준다.
  useEffect(() => {
    if (!mounted) return;
    const completedKeys = missions.filter((m) => m.done).map((m) => m.key);
    const seen = readSeenCompletions();

    if (seen === null) {
      writeSeenCompletions(completedKeys);
      return;
    }

    const seenSet = new Set(seen);
    const newlyDone = missions.filter((m) => m.done && !seenSet.has(m.key));
    if (newlyDone.length === 0) return;

    const total = newlyDone.reduce((sum, m) => sum + m.points, 0);
    setBurst({ total });
    const union = Array.from(new Set([...seen, ...completedKeys]));
    writeSeenCompletions(union);

    const timer = window.setTimeout(() => setBurst(null), 1600);
    return () => window.clearTimeout(timer);
    // missions 는 상태 파생값이라 done 조합이 바뀔 때만 재평가된다.
  }, [mounted, missions]);

  const doneCount = missions.filter((m) => m.done).length;
  const totalCount = missions.length;
  const readinessPct = Math.round((doneCount / totalCount) * 100);
  const totalPoints = missions.reduce((sum, m) => sum + m.points, 0);
  const earnedPoints = missions.reduce(
    (sum, m) => (m.done ? sum + m.points : sum),
    0
  );
  const allDone = doneCount === totalCount;
  const nextMission = missions.find((m) => !m.done) ?? null;

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

      {/* 헤더(항상 표시) = 접힘/펼침 토글. 접힘 상태에도 요약(준비도·점수·완료)이
          보여 눌러볼 이유를 준다. 🪙 효과는 헤더 우측에 absolute 로 띄워 레이아웃을
          밀지 않는다. */}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
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
              style={burst ? { display: "inline-block", transform: "scale(1.12)" } : undefined}
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

      {/* 얇은 진행바(접힘 상태에도 표시) */}
      <div className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full bg-[#ECEAE2]">
        <div
          className="h-full rounded-full bg-[#6C8A77] transition-[width] duration-500"
          style={{ width: `${readinessPct}%` }}
        />
      </div>

      {!expanded ? null : (
      <>
      <p className="mt-3 text-[11px] font-medium leading-snug text-[#A0A8B4]">
        인맥지도 준비용 점수예요 · 실제 지급/서버 코인 아님 · 준비 점수 {earnedPoints}/
        {totalPoints}P
      </p>

      {/* 미션 리스트 */}
      <ul className="mt-3 flex flex-col gap-[10px]">
        {missions.map((mission) => (
          <li key={mission.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-[8px]">
              <span
                aria-hidden="true"
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${
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
              준비 +{mission.points}P
            </span>
          </li>
        ))}
      </ul>

      {/* 다음 추천 미션 1개 */}
      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[#ECEAE2] pt-3">
        {allDone ? (
          <>
            <span className="text-[12px] font-semibold text-[#4B6B57]">
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
      </>
      )}
    </section>
  );
}

export default QuestAchievementCard;
