"use client";

// P2-3 hydrate 클라이언트 헬퍼.
// localStorage(사람/Home배치/Me프로필) 요약·업로드payload·서버→로컬 복원을 담당한다.
// 원칙: 자동 복원 없음(호출부가 사용자 클릭으로만 실행), localStorage 삭제 없음,
//       person.id/Home slot/folder memberIds 통짜 보존(서버값 그대로), 빈값 덮어쓰기 금지.

import {
  getChannelAvailability,
  type ContactChannel,
  type DashboardPerson,
} from "@/app/dashboard/people/data";
import { STORAGE_KEY as HOME_LAYOUT_KEY } from "@/app/dashboard/_components/home/home-page-types";
import {
  PROFILE_STORAGE_KEY,
  PROFILE_UPDATED_EVENT,
} from "@/lib/me/profile-name";

const PEOPLE_STORE_KEY = "dunbar-link-dashboard-people-store";
export const SYNC_BASE_UPDATED_AT_KEY = "dunbar-link-sync-base-updated-at-v1";
export const SYNC_SCHEMA_VERSION = 1;

export type ServerSnapshotState = {
  people: unknown;
  homeLayout: unknown;
  meProfile: unknown;
};

export type LocalSnapshot = {
  people: DashboardPerson[];
  homeLayout: Record<string, unknown>;
  meProfile: Record<string, unknown>;
};

export type SnapshotSummary = {
  peopleCount: number;
  hasHomeLayout: boolean;
  hasMeProfile: boolean;
};

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// people store(zustand persist)의 state.people 만 추출.
function readLocalPeople(): DashboardPerson[] {
  const parsed = safeParse(localStorage.getItem(PEOPLE_STORE_KEY));
  const state =
    isPlainObject(parsed) && isPlainObject(parsed.state) ? parsed.state : parsed;
  const people =
    isPlainObject(state) && Array.isArray(state.people) ? state.people : [];
  return people as DashboardPerson[];
}

function readLocalHomeLayout(): Record<string, unknown> {
  const parsed = safeParse(localStorage.getItem(HOME_LAYOUT_KEY));
  return isPlainObject(parsed) ? parsed : {};
}

function readLocalMeProfile(): Record<string, unknown> {
  const parsed = safeParse(localStorage.getItem(PROFILE_STORAGE_KEY));
  return isPlainObject(parsed) ? parsed : {};
}

export function readLocalSnapshot(): LocalSnapshot {
  return {
    people: readLocalPeople(),
    homeLayout: readLocalHomeLayout(),
    meProfile: readLocalMeProfile(),
  };
}

// Home 배치가 의미있는 내용을 담는지(빈 골격 + family-me 만 있는 상태는 false).
export function homeLayoutHasContent(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const layers = isPlainObject(value.layers) ? value.layers : value;
  if (isPlainObject(layers)) {
    for (const layer of Object.values(layers)) {
      if (!isPlainObject(layer)) continue;
      const visible = Array.isArray(layer.visibleSlotIds)
        ? layer.visibleSlotIds
        : [];
      const hidden = Array.isArray(layer.hiddenSlotIds)
        ? layer.hiddenSlotIds
        : [];
      const meaningful = [...visible, ...hidden].some(
        (slot) =>
          typeof slot === "string" &&
          slot.trim().length > 0 &&
          slot !== "family-me",
      );
      if (meaningful) return true;
    }
  }
  const folders = isPlainObject(value.folders) ? value.folders : null;
  if (folders && Object.keys(folders).length > 0) return true;
  return false;
}

// Me 프로필이 의미있는 텍스트 필드를 하나라도 담는지(imageDataUrl 제외).
export function meProfileHasContent(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(
    ([k, v]) =>
      k !== "imageDataUrl" && typeof v === "string" && v.trim().length > 0,
  );
}

export function summarizeLocal(local: LocalSnapshot): SnapshotSummary {
  return {
    peopleCount: local.people.length,
    hasHomeLayout: homeLayoutHasContent(local.homeLayout),
    hasMeProfile: meProfileHasContent(local.meProfile),
  };
}

export function summarizeServer(state: ServerSnapshotState): SnapshotSummary {
  const people = Array.isArray(state.people) ? state.people : [];
  return {
    peopleCount: people.length,
    hasHomeLayout: homeLayoutHasContent(state.homeLayout),
    hasMeProfile: meProfileHasContent(state.meProfile),
  };
}

// 로컬에 백업할 만한 데이터가 하나라도 있는지(서버 null 분기 UI 노출 판단).
export function localHasAnyData(local: LocalSnapshot): boolean {
  return (
    local.people.length > 0 ||
    homeLayoutHasContent(local.homeLayout) ||
    meProfileHasContent(local.meProfile)
  );
}

function stripImageDataUrl(
  meProfile: Record<string, unknown>,
): Record<string, unknown> {
  if (!("imageDataUrl" in meProfile)) return meProfile;
  const next = { ...meProfile };
  delete next.imageDataUrl;
  return next;
}

// base64/데이터 URL 포함 방어 검사(서버로 보내거나 서버에서 복원하면 안 됨).
function containsBase64(value: unknown): boolean {
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    return true;
  }
  if (!s) return false;
  return /data:image\//i.test(s) || /;base64,/i.test(s);
}

// PUT 업로드 payload. imageDataUrl(base64)은 제거하고 보낸다(서버도 차단).
export function buildUploadPayload(
  local: LocalSnapshot,
  baseUpdatedAt: string | null,
) {
  return {
    people: local.people,
    homeLayout: local.homeLayout,
    meProfile: stripImageDataUrl(local.meProfile),
    schemaVersion: SYNC_SCHEMA_VERSION,
    ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
  };
}

export function readBaseUpdatedAt(): string | null {
  try {
    return localStorage.getItem(SYNC_BASE_UPDATED_AT_KEY);
  } catch {
    return null;
  }
}

export function writeBaseUpdatedAt(updatedAt: string): void {
  try {
    localStorage.setItem(SYNC_BASE_UPDATED_AT_KEY, updatedAt);
  } catch {
    // ignore quota/availability errors
  }
}

// 채널 상태 재계산(app/dashboard/people/store.ts 의 buildChannelState 와 동일 로직).
// 복원 시 people 만 바꾸면 availableChannels 가 stale 되므로 함께 재계산해 기록한다.
function buildChannelState(people: DashboardPerson[]) {
  const availableChannels: Record<string, ContactChannel[]> = {};
  const preferredChannels: Record<string, ContactChannel> = {};
  for (const person of people) {
    const available = getChannelAvailability(person)
      .filter((item) => item.available && item.channel !== "copy")
      .map((item) => item.channel);
    availableChannels[person.id] = available.length > 0 ? available : ["copy"];
    const preferred =
      person.preferredChannels.find((channel) => available.includes(channel)) ??
      available[0] ??
      "copy";
    preferredChannels[person.id] = preferred;
  }
  return { availableChannels, preferredChannels };
}

export type RestoreResult =
  | { ok: true; applied: string[] }
  | { ok: false; error: string };

// 서버 state 를 localStorage 에 복원한다(사용자 클릭으로만 호출).
// - 쓰기 전 backup key 생성(기존 key 삭제 없이 복사). backup 실패 시 복원 중단.
// - 빈 서버값은 로컬을 덮어쓰지 않는다(필드별 가드).
// - people 는 state.people 만 교체(quickNotes/inviteDrafts 보존) + 채널 재계산.
// - person.id / Home slot / folder.memberIds 는 서버값 통짜 보존(재발급/remap 없음).
// 호출부는 성공 후 reload 로 전체 재hydrate 한다.
export function restoreToLocal(
  state: ServerSnapshotState,
  local: LocalSnapshot,
): RestoreResult {
  if (containsBase64(state)) {
    return { ok: false, error: "BASE64_IN_SERVER_STATE" };
  }

  const ts = Date.now();

  // 1) backup (쓰기 전, 삭제 없이 복사). 실패하면 복원 중단.
  try {
    for (const key of [
      PEOPLE_STORE_KEY,
      HOME_LAYOUT_KEY,
      PROFILE_STORAGE_KEY,
    ]) {
      const cur = localStorage.getItem(key);
      if (cur !== null) {
        localStorage.setItem(`${key}-backup-${ts}`, cur);
      }
    }
  } catch {
    return { ok: false, error: "BACKUP_FAILED" };
  }

  const applied: string[] = [];

  try {
    // 2) people: 빈 서버 people 이 로컬 people 을 덮어쓰지 못한다.
    const serverPeople = Array.isArray(state.people)
      ? (state.people as DashboardPerson[])
      : [];
    if (serverPeople.length > 0 || local.people.length === 0) {
      const parsed = safeParse(localStorage.getItem(PEOPLE_STORE_KEY));
      const wrapper = isPlainObject(parsed) ? parsed : {};
      const prevState = isPlainObject(wrapper.state) ? wrapper.state : {};
      const channels = buildChannelState(serverPeople);
      const nextWrapper = {
        ...wrapper,
        state: {
          ...prevState,
          people: serverPeople,
          availableChannels: channels.availableChannels,
          preferredChannels: channels.preferredChannels,
        },
        version: typeof wrapper.version === "number" ? wrapper.version : 0,
      };
      localStorage.setItem(PEOPLE_STORE_KEY, JSON.stringify(nextWrapper));
      applied.push("people");
    }

    // 3) home layout: 빈 서버 배치가 로컬 배치를 덮어쓰지 못한다.
    if (
      isPlainObject(state.homeLayout) &&
      (homeLayoutHasContent(state.homeLayout) ||
        !homeLayoutHasContent(local.homeLayout))
    ) {
      localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(state.homeLayout));
      applied.push("homeLayout");
    }

    // 4) me profile: 빈 서버 프로필이 로컬 프로필을 덮어쓰지 못한다. imageDataUrl 무시.
    if (
      isPlainObject(state.meProfile) &&
      (meProfileHasContent(state.meProfile) ||
        !meProfileHasContent(local.meProfile))
    ) {
      localStorage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify(stripImageDataUrl(state.meProfile)),
      );
      applied.push("meProfile");
      try {
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      } catch {
        // ignore event dispatch errors
      }
    }
  } catch {
    return { ok: false, error: "WRITE_FAILED" };
  }

  return { ok: true, applied };
}

// === P2-4 write sync 보조 ===

// Home 배치(useHomeLayoutStorage)가 localStorage 에 저장될 때 dispatch 되는
// 커스텀 이벤트. 같은 탭 변경은 storage 이벤트가 안 오므로 이걸로 감지한다.
export const HOME_LAYOUT_SAVED_EVENT = "dunbar-link-home-layout-saved";

// "이 기기 데이터 유지"(복원 거부) 선택 시 자동 write sync 를 멈추는 flag.
// 서버가 다른 기기 snapshot 인 상태에서 이 기기 변경이 자동으로 서버를 덮지
// 않도록 한다. "서버에 백업"/"서버 데이터로 복원" 성공 시 해제된다.
const SYNC_PAUSED_KEY = "dunbar-link-sync-paused-v1";

export function readSyncPaused(): boolean {
  try {
    return localStorage.getItem(SYNC_PAUSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSyncPaused(paused: boolean): void {
  try {
    // 삭제 대신 "0"/"1" 로 기록(localStorage 삭제 금지 원칙).
    localStorage.setItem(SYNC_PAUSED_KEY, paused ? "1" : "0");
  } catch {
    // ignore quota/availability errors
  }
}

// 서버 snapshot 이 자동 로드 대상으로 valid 한지 판정.
// - people 도 비어있고 Home 배치도 비어있으면 invalid(빈 서버로 로컬 덮어쓰기 금지)
// - data:image/;base64/imageDataUrl 포함 시 invalid(오염 snapshot 자동 적용 금지)
export function isServerStateValid(state: ServerSnapshotState): boolean {
  const people = Array.isArray(state.people) ? state.people : [];
  const hasPeople = people.length > 0;
  const hasHome = homeLayoutHasContent(state.homeLayout);
  if (!hasPeople && !hasHome) return false;
  if (containsBase64(state)) return false;
  return true;
}

// 두 timestamptz 가 같은 시점인지(ms 비교). 로컬 base == 서버 updatedAt 판정용
// (= 이 기기가 이미 서버 snapshot 의 소유자/최신 상태인지).
export function sameUpdatedAt(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta === tb;
}

// === P2-4c 다중기기 충돌/덮어쓰기 방지: sync meta + snapshot hash ===

// 자동 restore 가 로컬을 덮기 전에 "이 로컬이 직전 서버 snapshot 그대로(이 기기에서
// 변경 없음)인지" 판정하기 위한 메타. hash 가 현재 로컬과 다르면 이 기기 고유 변경이
// 있다고 보고 자동 restore 를 막는다(local-only 사람/배치 손실 방지).
export const SYNC_META_KEY = "dunbar-link-sync-meta-v1";

export type SyncMeta = {
  authUserId: string | null;
  baseUpdatedAt: string | null;
  lastSyncedHash: string | null;
  lastSyncedAt: string | null;
};

// 키 정렬 기반 안정 stringify(JSON 키 순서에 영향받지 않는 hash 용).
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

// djb2 변형 32bit hash(동일성 판정용, 보안용 아님).
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// 서버 저장 기준(buildUploadPayload)과 동일하게 정규화한 snapshot hash.
// imageDataUrl 은 제거(서버에 저장되지 않으므로 hash 에서도 제외해 일치성 유지).
export function computeSnapshotHash(input: {
  people: unknown;
  homeLayout: unknown;
  meProfile: unknown;
  schemaVersion: number;
}): string {
  const meProfile = isPlainObject(input.meProfile)
    ? stripImageDataUrl(input.meProfile)
    : {};
  return hashString(
    stableStringify({
      people: input.people,
      homeLayout: input.homeLayout,
      meProfile,
      schemaVersion: input.schemaVersion,
    }),
  );
}

// 현재 로컬 snapshot 의 hash(서버 payload 와 동일 정규화).
export function currentLocalHash(local: LocalSnapshot): string {
  return computeSnapshotHash({
    people: local.people,
    homeLayout: local.homeLayout,
    meProfile: local.meProfile,
    schemaVersion: SYNC_SCHEMA_VERSION,
  });
}

export function readSyncMeta(): SyncMeta | null {
  const parsed = safeParse(localStorage.getItem(SYNC_META_KEY));
  return isPlainObject(parsed) ? (parsed as unknown as SyncMeta) : null;
}

// 부분 갱신(기존 값 merge). authUserId 는 panel 이, hash/base 는 write sync·panel 이
// 기록한다. 삭제 없이 항상 4개 필드를 가진 객체로 덮어쓴다.
export function writeSyncMeta(patch: Partial<SyncMeta>): void {
  try {
    const prev = readSyncMeta();
    const next: SyncMeta = {
      authUserId: patch.authUserId ?? prev?.authUserId ?? null,
      baseUpdatedAt: patch.baseUpdatedAt ?? prev?.baseUpdatedAt ?? null,
      lastSyncedHash: patch.lastSyncedHash ?? prev?.lastSyncedHash ?? null,
      lastSyncedAt: patch.lastSyncedAt ?? prev?.lastSyncedAt ?? null,
    };
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(next));
  } catch {
    // ignore quota/availability errors
  }
}

// 자동 restore 허용 판정(데이터 손실 방지 핵심).
//   - 로컬에 의미있는 데이터 없음        → 허용(잃을 것 없음)
//   - 로컬 hash == 직전 sync hash        → 허용(이 기기는 직전 서버 snapshot 그대로)
//   - 그 외(meta 없음 / hash 불일치)     → 금지(이 기기 고유 변경 있음 → 덮으면 손실)
export function canAutoRestore(local: LocalSnapshot): boolean {
  if (!localHasAnyData(local)) return true;
  const meta = readSyncMeta();
  if (!meta || !meta.lastSyncedHash) return false;
  return meta.lastSyncedHash === currentLocalHash(local);
}
