"use client";

/**
 * P3-1 인맥지도 시작 퀘스트 카드 (local / UI-only).
 *
 * 목적: "신호 앱"에서 "인맥지도/연결 가능성 앱"으로 사용 동기를 전환하는
 * 첫 화면. 기존 상태(people / inviteDrafts / me 프로필 localStorage)를
 * read-only 로 계산해 "완료 여부 · 진행도 · 다음 행동"만 보여준다.
 *
 * 이 컴포넌트는 additive / computed-only 다.
 *  - 저장/차감/해금/서버 포인트/실탐색을 하지 않는다.
 *  - quest 진행도를 localStorage 에 쓰지 않는다.
 *  - 표시되는 "예상 보상"은 실제 지급이 아니라 준비 점수(예상)일 뿐이다.
 *  - 개인정보는 "내 상태"만 읽으며, 다른 사람/비공개 필드는 표시하지 않는다.
 *
 * P3-2 에서 로컬 보상 store 를 붙일 수 있게 계산부만 이 파일에 모아둔다.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  isIncompleteMeName,
  readMeProfileName,
  PROFILE_UPDATED_EVENT,
} from "@/lib/me/profile-name";
import type { DashboardPerson } from "../../people/data";
import type { InviteDraft } from "../../people/store";

// me 프로필 localStorage 키(현재 + 레거시). read-only 로만 접근한다.
const PROFILE_STORAGE_KEYS = [
  "dunbar-link-me-profile-v3",
  "dunbar-link-me-profile-v2",
  "dunbar-link-me-profile-v1",
];

/**
 * 탐색 준비(학교/회사/지역) 필드가 하나라도 채워졌는지 read-only 로 확인.
 * 어떤 필드의 "값 존재 여부"만 보고, 값 자체나 비공개 필드는 노출하지 않는다.
 */
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
      // 파싱 실패는 무시하고 다음 키로 넘어간다.
    }
  }
  return false;
}

type QuestRow = {
  key: string;
  label: string;
  // 준비 점수(예상). 실제 지급이 아니다.
  points: number;
  done: boolean;
};

type NextAction = {
  label: string;
  href: string;
};

export function QuestCard({
  people,
  inviteDrafts,
}: {
  people: DashboardPerson[];
  inviteDrafts: InviteDraft[];
}) {
  // 하이드레이션 안정: 마운트 전에는 렌더하지 않는다(localStorage/store 접근).
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // me 프로필은 localStorage 라 store 처럼 reactive 하지 않다. 마운트 시 읽고,
  // 프로필 저장 이벤트/포커스에서 다시 읽어 최신 상태를 반영한다(read-only).
  const [hasName, setHasName] = useState(false);
  const [hasExploreField, setHasExploreField] = useState(false);

  useEffect(() => {
    setMounted(true);

    const refresh = () => {
      setHasName(!isIncompleteMeName(readMeProfileName()));
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

  if (!mounted) return null;

  const peopleCount = people.length;
  // tier 는 항상 존재하므로 "사람 1명이라도 있으면 분류됨"으로 본다(P3-1 판정 기준).
  const hasTieredPerson = people.some((person) => typeof person.tier === "number");
  const inviteCount = inviteDrafts.length;
  // 연결된 사람 = 수락 완료된 초대. (signal/서버 상태는 건드리지 않는다.)
  const hasConnectedPerson = inviteDrafts.some(
    (draft) => draft.status === "accepted"
  );

  // 준비도 계산에 쓰는 핵심 퀘스트 5개. 신호 보내기는 보조 액션이라 제외한다.
  const coreRows: QuestRow[] = [
    { key: "name", label: "내 이름 등록", points: 10, done: hasName },
    {
      key: "person",
      label: "가까운 사람 1명 등록",
      points: 10,
      done: peopleCount >= 1,
    },
    {
      key: "tier",
      label: "사람을 관계 단계로 분류",
      points: 30,
      done: hasTieredPerson,
    },
    {
      key: "invite",
      label: "친구 초대 시작",
      points: 20,
      done: inviteCount >= 1,
    },
    {
      key: "explore",
      label: "학교·회사·지역 중 1개 입력",
      points: 20,
      done: hasExploreField,
    },
  ];

  const doneCount = coreRows.filter((row) => row.done).length;
  const totalCount = coreRows.length;
  const readinessPct = Math.round((doneCount / totalCount) * 100);
  const totalPoints = coreRows.reduce((sum, row) => sum + row.points, 0);
  const earnedPoints = coreRows.reduce(
    (sum, row) => (row.done ? sum + row.points : sum),
    0
  );
  const allCoreDone = doneCount === totalCount;

  // 다음 추천 행동 1개(우선순위). CTA 는 네비게이션만 하며 기존 기능을 바꾸지 않는다.
  let nextAction: NextAction;
  if (!hasName) {
    nextAction = { label: "내 정보 입력하기", href: "/dashboard/me" };
  } else if (peopleCount === 0) {
    nextAction = { label: "사람 추가하기", href: "/dashboard/people" };
  } else if (!hasExploreField) {
    nextAction = { label: "학교·회사·지역 추가하기", href: "/dashboard/me" };
  } else if (inviteCount === 0) {
    nextAction = { label: "친구 초대 준비하기", href: "/dashboard/people/invite" };
  } else if (hasConnectedPerson) {
    nextAction = { label: "신호 보내기", href: "/dashboard/signals" };
  } else {
    nextAction = { label: "인맥지도 채우기", href: "/dashboard/people" };
  }

  return (
    <section
      aria-label="인맥지도 시작 퀘스트"
      className="rounded-[18px] border border-slate-200/85 bg-white/95 px-[16px] py-[14px] shadow-[0_2px_6px_rgba(15,23,42,0.05)]"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-slate-800">
            인맥지도 시작하기
          </p>
          <p className="mt-[3px] text-[12px] leading-snug text-slate-500">
            친구를 정리하면 나중에 누구에게 닿을 수 있는지 연결 경로가 열려요.
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`mt-[2px] shrink-0 text-[15px] leading-none text-slate-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>

      {/* 진행도: 완료 개수 / 전체 + 준비도 % + 얇은 바 */}
      <div className="mt-[12px]">
        <div className="flex items-center justify-between text-[12px] font-medium text-slate-500">
          <span>
            {doneCount}/{totalCount} 완료
          </span>
          <span>준비도 {readinessPct}%</span>
        </div>
        <div className="mt-[6px] h-[6px] w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#6C8A77] transition-[width]"
            style={{ width: `${readinessPct}%` }}
          />
        </div>
      </div>

      {expanded ? (
        <>
          <ul className="mt-[12px] flex flex-col gap-[8px]">
            {coreRows.map((row) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-[8px]">
                  <span
                    aria-hidden="true"
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                      row.done
                        ? "bg-[#6C8A77] text-white"
                        : "border border-slate-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={`truncate text-[13px] ${
                      row.done
                        ? "text-slate-400 line-through"
                        : "text-slate-700"
                    }`}
                  >
                    {row.label}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-slate-400">
                  준비 +{row.points}P
                </span>
              </li>
            ))}
          </ul>

          {/* 보조 액션: 신호 보내기(중심 기능 아님, 마지막 실행 액션) */}
          <div className="mt-[10px] flex items-center justify-between gap-3 border-t border-slate-100 pt-[10px]">
            <span className="min-w-0 truncate text-[12px] text-slate-500">
              연결된 사람에게 신호 보내기
            </span>
            {hasConnectedPerson ? (
              <Link
                href="/dashboard/signals"
                className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-[12px] font-medium text-slate-600 active:scale-[0.98]"
              >
                신호 보내기
              </Link>
            ) : (
              <span className="shrink-0 rounded-full bg-slate-50 px-3 py-1 text-[12px] font-medium text-slate-400">
                연결 후 가능
              </span>
            )}
          </div>

          {/* 다음 추천 행동 + 준비 점수(예상). 실제 포인트 지급이 아니다. */}
          <div className="mt-[12px] flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              준비 점수(예상) {earnedPoints}P / {totalPoints}P · 실제 지급 아님
            </span>
            {allCoreDone ? (
              <span className="shrink-0 rounded-full bg-[#EEF7F0] px-3 py-1.5 text-[12px] font-semibold text-[#4B6B57]">
                인맥지도 준비 완료
              </span>
            ) : (
              <Link
                href={nextAction.href}
                className="shrink-0 rounded-full bg-[#2C2C2A] px-3.5 py-1.5 text-[12px] font-semibold text-[#F1EFE8] active:scale-[0.98]"
              >
                {nextAction.label}
              </Link>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default QuestCard;
