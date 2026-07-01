// P3 인맥지도 준비 milestone 정의(준비도 % 계산용).
//
// 주의: 여기 points 는 "준비도"가 아니라 과거 표시용 잔여 필드다. P3-2A 부터
// 실제 점수는 누적 Point Ledger(point-ledger.ts)가 담당하고, 이 미션들은
// 준비도(완료율) 계산과 다음 미션 안내에만 쓰인다.

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
