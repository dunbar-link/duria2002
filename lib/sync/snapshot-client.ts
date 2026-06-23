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
