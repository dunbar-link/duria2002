// P3-2A2 deterministic Point 계산 (상태 기반 순수 함수).
//
// P3-2A 의 localStorage 누적 장부(dunbar-link-point-ledger-v1)는 기기별로 갈리고
// append-only + 휘발성 key 로 인플레이션이 생겨 PC/모바일 불일치를 유발했다.
// → 잔액 장부를 Point source of truth 로 쓰지 않는다. Point 는 "현재 서버동기
//    상태"만으로 매번 결정적으로 계산한다. 같은 상태면 어느 기기든 같은 값.
//
// (기존 dunbar-link-point-ledger-v1 key 는 삭제하지 않는다. 더 이상 읽지/쓰지
//  않고 무시할 뿐이다. localStorage 는 아래 "효과 seen 캐시"에만 쓴다.)

export const POINT_RULES = {
  name: 10,
  profileField: 5,
  personAdd: 5,
  personTier: 5,
  inviteSent: 10,
  connection: 20,
  signalDay: 5,
} as const;

export type PointScoreInput = {
  hasName: boolean;
  // 채워진 추가정보 버킷 수(phone/email/address/birthday/school/university/company)
  filledFieldCount: number;
  peopleCount: number;
  tieredCount: number;
  // 초대/연결은 휘발성 token 이 아니라 안정 identity 로 dedup 한 "관계 수".
  inviteSentCount: number;
  connectionCount: number;
  // 신호를 보낸 고유 날짜 수(KST). 라이브 총점 반영은 호출부 플래그로 제어한다
  // (sender_id 가 기기별 id 라 계정 일치가 보장되기 전에는 0 을 넘기는 것이 안전).
  signalDayCount: number;
};

export type PointBreakdown = {
  namePoints: number;
  profileFieldPoints: number;
  peoplePoints: number;
  tierPoints: number;
  inviteSentPoints: number;
  connectionPoints: number;
  signalDayCount: number;
  signalPoints: number;
  totalPoints: number;
};

// 디버깅 용이성을 위해 항상 breakdown 을 반환한다(PC/모바일 값 비교용).
export function buildDeterministicPointScore(
  input: PointScoreInput
): PointBreakdown {
  const namePoints = input.hasName ? POINT_RULES.name : 0;
  const profileFieldPoints = Math.max(0, input.filledFieldCount) * POINT_RULES.profileField;
  const peoplePoints = Math.max(0, input.peopleCount) * POINT_RULES.personAdd;
  const tierPoints = Math.max(0, input.tieredCount) * POINT_RULES.personTier;
  const inviteSentPoints = Math.max(0, input.inviteSentCount) * POINT_RULES.inviteSent;
  const connectionPoints = Math.max(0, input.connectionCount) * POINT_RULES.connection;
  const signalDayCount = Math.max(0, input.signalDayCount);
  const signalPoints = signalDayCount * POINT_RULES.signalDay;
  const totalPoints =
    namePoints +
    profileFieldPoints +
    peoplePoints +
    tierPoints +
    inviteSentPoints +
    connectionPoints +
    signalPoints;
  return {
    namePoints,
    profileFieldPoints,
    peoplePoints,
    tierPoints,
    inviteSentPoints,
    connectionPoints,
    signalDayCount,
    signalPoints,
    totalPoints,
  };
}

// 🪙 효과용 seen 캐시. "이 기기에서 마지막으로 보여준 total" 일 뿐, 점수 정답
// 소스가 아니다(정답은 deterministic 계산). 서버동기로 total 이 올라가는 최초
// 순간에는 효과를 터뜨리지 않도록 호출부에서 seed 타이밍을 제어한다.
export const POINT_EFFECT_SEEN_KEY = "dunbar-link-point-effect-seen-v1";

export function readPointEffectSeen(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POINT_EFFECT_SEEN_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writePointEffectSeen(total: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POINT_EFFECT_SEEN_KEY, String(total));
  } catch {
    // 효과용 캐시일 뿐 — 실패 무시
  }
}
