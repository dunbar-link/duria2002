// P3-2A 로컬 누적 Point Ledger (localStorage MVP).
//
// - Point 는 100점 만점이 아니라 계속 쌓이는 누적값이다.
// - idempotency key 로 "같은 대상 1회만" 적립한다(중복/수정/삭제 재입력 방지).
// - 기존 데이터는 첫 진입 시 조용히 backfill 하고, 이후 새 적립만 효과를 낸다.
// - 서버 wallet/coin/dl_wallets 미연동. 로컬 MVP라 anti-abuse 는 범위 밖(P3-4+).

export type PointLedgerEntry = {
  key: string;
  kind: string;
  points: number;
  label: string;
  createdAt: string;
};

export const POINT_LEDGER_KEY = "dunbar-link-point-ledger-v1";

// 적립 정책(누적). 신호는 하루 첫 1회만(daily key)로 별도 처리한다.
export const POINT_RULES = {
  name: 10,
  profileField: 5,
  personAdd: 5,
  personTier: 5,
  inviteSent: 10,
  connection: 20,
  signalDaily: 5,
} as const;

export type PointStateInput = {
  hasName: boolean;
  // 채워진 추가정보 버킷 키(phone/email/address/birthday/school/university/company)
  filledProfileFields: string[];
  personIds: string[];
  tieredPersonIds: string[];
  inviteSentKeys: string[];
  connectionKeys: string[];
};

function isEntry(value: unknown): value is PointLedgerEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { key?: unknown }).key === "string" &&
    typeof (value as { points?: unknown }).points === "number"
  );
}

export function loadPointLedger(): PointLedgerEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POINT_LEDGER_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function savePointLedger(entries: PointLedgerEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POINT_LEDGER_KEY, JSON.stringify(entries));
  } catch {
    // 저장 실패는 무시(다음 reconcile 에서 재시도)
  }
}

export function getPointTotal(entries: PointLedgerEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + (typeof entry.points === "number" ? entry.points : 0),
    0
  );
}

// YYYY-MM-DD (로컬 날짜). 신호 daily key 계산용.
export function todayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 현재 상태에서 "적립 후보" 이벤트 목록을 만든다(신호 제외 — 신호는 발송 시점 처리).
export function buildPointEventsFromCurrentState(
  input: PointStateInput
): PointLedgerEntry[] {
  const now = new Date().toISOString();
  const events: PointLedgerEntry[] = [];

  if (input.hasName) {
    events.push({ key: "profile:name", kind: "profile", points: POINT_RULES.name, label: "이름 등록", createdAt: now });
  }
  for (const field of input.filledProfileFields) {
    events.push({ key: `profile:field:${field}`, kind: "profile", points: POINT_RULES.profileField, label: "추가정보 입력", createdAt: now });
  }
  for (const id of input.personIds) {
    events.push({ key: `person:add:${id}`, kind: "person", points: POINT_RULES.personAdd, label: "사람 등록", createdAt: now });
  }
  for (const id of input.tieredPersonIds) {
    events.push({ key: `person:tier:${id}`, kind: "tier", points: POINT_RULES.personTier, label: "관계 분류", createdAt: now });
  }
  for (const key of input.inviteSentKeys) {
    events.push({ key: `invite:sent:${key}`, kind: "invite", points: POINT_RULES.inviteSent, label: "친구 초대", createdAt: now });
  }
  for (const key of input.connectionKeys) {
    events.push({ key: `invite:accepted:${key}`, kind: "connection", points: POINT_RULES.connection, label: "연결 성공", createdAt: now });
  }
  return events;
}

// 현재 ledger 에 없는 key 만 추가한다. added(신규 적립분)를 함께 반환한다.
// 삭제/수정으로 상태가 줄어도 기존 적립은 차감하지 않는다(append-only).
export function reconcilePointLedger(
  existing: PointLedgerEntry[],
  events: PointLedgerEntry[]
): { ledger: PointLedgerEntry[]; added: PointLedgerEntry[] } {
  const seen = new Set(existing.map((entry) => entry.key));
  const added: PointLedgerEntry[] = [];
  for (const event of events) {
    if (!seen.has(event.key)) {
      seen.add(event.key);
      added.push(event);
    }
  }
  return { ledger: added.length ? [...existing, ...added] : existing, added };
}

// P3-2B 용: 신호 발송 성공 시 "하루 첫 신호"만 +5P. 이미 오늘 적립됐으면 무시.
// (이번 P3-2A 에서는 아직 호출 지점을 연결하지 않는다 — 신호 발송이 여러 UI 에
//  분산돼 있고 Home 은 수정 금지라, 안전한 단일 훅킹을 P3-2B 로 분리한다.)
export function addSignalDailyPoint(now: Date = new Date()): {
  added: boolean;
  points: number;
} {
  const ledger = loadPointLedger() ?? [];
  const key = `signal:daily:${todayKey(now)}`;
  if (ledger.some((entry) => entry.key === key)) {
    return { added: false, points: 0 };
  }
  savePointLedger([
    ...ledger,
    {
      key,
      kind: "signal",
      points: POINT_RULES.signalDaily,
      label: "오늘 신호 보상",
      createdAt: now.toISOString(),
    },
  ]);
  return { added: true, points: POINT_RULES.signalDaily };
}
