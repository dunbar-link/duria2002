"use client";

/**
 * P3-3 연결 가능성 (인맥 탐색 mock, Me 탭, UI-only).
 *
 * "신호 앱"이 아니라 "인맥지도/연결 가능성 앱" 감각을 주기 위한 미리보기.
 * - 실제 그래프/2촌·3촌 탐색 없음. mock/derived 문구만.
 * - 개인정보(친구의 친구 이름/전화/회사/학교/지역/비공개) 절대 노출 없음.
 * - Point 미연동(적립/차감/탐색권 저장 없음). 서버 API 호출 없음.
 * - 거리 코드는 mock 예시값(앞=경유 친구 수, 뒤=경로 약도, 낮을수록 가까움).
 */

import { useState } from "react";

// 안전한 카테고리형 mock 추천(실제 사람/개인정보 아님).
const MOCK_SUGGESTIONS: {
  key: string;
  title: string;
  desc: string;
  code: string;
}[] = [
  {
    key: "business",
    title: "사업가 연결 가능성",
    desc: "핵심·신뢰 관계를 통해 닿을 수 있는 후보예요.",
    code: "1.5",
  },
  {
    key: "dev",
    title: "개발자 연결 가능성",
    desc: "친구 1명을 거치는 탐색 후보예요.",
    code: "1.7",
  },
  {
    key: "alumni",
    title: "동문·지역 연결 가능성",
    desc: "학교·회사·지역 정보가 쌓이면 더 정확해져요.",
    code: "2.5",
  },
];

// 검색 체험 chip → mock 응답(실제 검색 안 함, 이름/개인정보 없음).
const MOCK_CHIPS: { label: string; response: string }[] = [
  { label: "개발자", response: "친구 1명을 거치는 탐색 후보예요 · 거리 코드 1.7 · 승인 후 공개" },
  { label: "변호사", response: "직접 연결은 아직 없지만 2명을 거쳐 탐색 가능해요 · 거리 코드 2.4" },
  { label: "사업가", response: "핵심 관계를 통한 강한 연결 가능성이 있어요 · 거리 코드 1.5" },
  { label: "투자자", response: "탐색 후보를 준비 중이에요 · 관계를 더 정리하면 열려요" },
  { label: "동문", response: "학교 정보가 쌓이면 동문 연결이 더 정확해져요 · 거리 코드 2.2" },
  { label: "부산", response: "지역 정보 기반 연결 가능성을 준비 중이에요" },
];

export function NetworkDiscoveryCard({
  networkCount = 0,
}: {
  networkCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  // 내 인맥지도 규모에서 파생한 "연결 단서" 요약 숫자(개인정보 아님, 내 카운트 기반).
  const clueCount = Math.max(0, networkCount);
  const activeResponse =
    MOCK_CHIPS.find((c) => c.label === activeChip)?.response ?? null;

  return (
    <section className="mt-2 rounded-[24px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#E2E0D8]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "연결 가능성 접기" : "연결 가능성 펼치기"}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-[#334155]">연결 가능성</h2>
          <p className="mt-1 text-[12px] font-medium leading-snug text-[#8D99AE]">
            {clueCount > 0
              ? `현재 인맥지도에서 ${clueCount}개의 연결 단서를 탐색할 수 있어요`
              : "사람을 정리하면 연결 단서가 열려요"}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`mt-[2px] shrink-0 text-[15px] leading-none text-[#A0A8B4] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>

      {expanded ? (
        <>
          {/* mock 추천 카드 3개 (카테고리형, 개인정보 없음) */}
          <ul className="mt-3 flex flex-col gap-[8px]">
            {MOCK_SUGGESTIONS.map((s) => (
              <li
                key={s.key}
                className="flex items-center justify-between gap-3 rounded-[16px] bg-white/80 px-3 py-2.5 ring-1 ring-[#ECEAE2]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-[#334155]">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[#8D99AE]">
                    {s.desc}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[#EEF4FB] px-2.5 py-1 text-[11px] font-semibold text-[#4B6B8A]">
                  거리 {s.code}
                </span>
              </li>
            ))}
          </ul>

          {/* 검색 체험 chip (실제 검색 아님) */}
          <div className="mt-3">
            <p className="text-[11px] font-medium text-[#A0A8B4]">
              탐색 체험 (미리보기)
            </p>
            <div className="mt-1.5 flex flex-wrap gap-[6px]">
              {MOCK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() =>
                    setActiveChip((prev) =>
                      prev === chip.label ? null : chip.label
                    )
                  }
                  aria-pressed={activeChip === chip.label}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium active:scale-[0.98] ${
                    activeChip === chip.label
                      ? "bg-[#2C2C2A] text-[#F1EFE8]"
                      : "bg-[#EFEDE6] text-[#64748B]"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {activeResponse ? (
              <p className="mt-2 rounded-[14px] bg-white/80 px-3 py-2 text-[12px] leading-snug text-[#4B5563] ring-1 ring-[#ECEAE2]">
                {activeResponse}
              </p>
            ) : null}
          </div>

          {/* 잠금/준비 상태 + 개인정보 안내 */}
          <div className="mt-3 border-t border-[#ECEAE2] pt-2.5">
            <p className="text-[11px] leading-relaxed text-[#8D99AE]">
              연결 가능성만 보여줘요. 실제 정보는 승인 후에만 공개돼요.
              <br />
              실제 연결 경로 보기는 다음 단계에서 열려요. Point 는 나중에 탐색권으로
              쓸 수 있어요.
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default NetworkDiscoveryCard;
