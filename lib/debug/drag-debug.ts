// Mobile drag diagnostics (opt-in, localStorage-only).
//
// 목적: 실기기 모바일 Chrome 에서 long-press drag 가 "ghost 생성 → follow →
// drop target → layout move / tier sync → rollback" 중 어느 단계에서 끊기는지
// 증거를 남긴다. 일반 사용자 동작/데이터에는 영향이 없으며, 아래 flag 가 켜진
// 경우에만 이벤트를 localStorage 에 append 한다(서버/Supabase/DB write 없음).
//
// - enable flag: dunbar-link-drag-debug-enabled === "1"
// - event log : dunbar-link-drag-debug-events (JSON 배열, 최대 MAX_EVENTS)
//
// flag 가 꺼져 있으면 logDragEvent 는 즉시 return 하므로 drag 핫패스 비용은
// localStorage 읽기 1회 수준이고, 호출부는 핫패스(pointermove)에서 직접 부르지
// 않고 시작/종료/단계 전환에서만 호출한다.

const ENABLED_KEY = "dunbar-link-drag-debug-enabled";
const EVENTS_KEY = "dunbar-link-drag-debug-events";
const MAX_EVENTS = 120;

export type DragDebugEvent = {
  t: number;
  stage: string;
  [key: string]: unknown;
};

export function isDragDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDragDebugEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(ENABLED_KEY, "1");
    } else {
      window.localStorage.removeItem(ENABLED_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function logDragEvent(
  stage: string,
  data?: Record<string, unknown>,
): void {
  if (!isDragDebugEnabled()) {
    return;
  }
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: DragDebugEvent[] = Array.isArray(parsed) ? parsed : [];
    list.push({ t: Date.now(), stage, ...(data ?? {}) });
    const trimmed =
      list.length > MAX_EVENTS ? list.slice(list.length - MAX_EVENTS) : list;
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage / serialization failures
  }
  try {
    // live USB-debugging convenience; harmless when devtools is closed.
    console.log("[drag-debug]", stage, data ?? {});
  } catch {
    // ignore
  }
}

export function readDragEvents(): DragDebugEvent[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as DragDebugEvent[]) : [];
  } catch {
    return [];
  }
}

export function clearDragEvents(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(EVENTS_KEY);
  } catch {
    // ignore
  }
}
