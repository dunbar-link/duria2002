"use client";

// P2-4a write sync 훅.
// people 변경(tier 포함)과 Home 배치 변경을 감지해서, 조건이 맞을 때만 2초
// debounce 후 PUT /api/me/sync-state 로 서버 snapshot 을 갱신한다.
//
// 자동 write sync 는 아래를 모두 만족할 때만 실행한다(설계 P2-4):
//   - baseUpdatedAt 존재(= "서버에 백업"/"서버 데이터로 복원" 성공으로 이 기기가
//     서버 snapshot 의 소유자)
//   - syncPaused 아님("이 기기 데이터 유지" 선택 시 멈춤)
//   - local people 이 비어있지 않음(빈 덮어쓰기 방지)
//   - 409(conflict) 이후가 아님
//
// 금지: 서버→로컬 자동 hydrate, 409 자동 덮어쓰기, localStorage 삭제,
//       person.id/slot/folder remap, 자동 재시도(P2-4c).

import { useEffect, useRef, useState } from "react";
import { usePeopleStore } from "@/app/dashboard/people/store";
import {
  buildUploadPayload,
  readBaseUpdatedAt,
  readLocalSnapshot,
  readSyncPaused,
  writeBaseUpdatedAt,
  HOME_LAYOUT_SAVED_EVENT,
} from "@/lib/sync/snapshot-client";

export type WriteSyncStatus = "idle" | "saving" | "saved" | "error" | "conflict";

const DEBOUNCE_MS = 2000;

export function useSnapshotWriteSync({
  ready,
}: {
  ready: boolean;
}): WriteSyncStatus {
  const [status, setStatus] = useState<WriteSyncStatus>("idle");
  const timerRef = useRef<number | null>(null);
  // 409 이후 자동 sync 영구 중단(이 기기 base 가 stale). 새로고침으로만 회복.
  const conflictRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!ready) return;

    const doSync = async () => {
      if (conflictRef.current) return; // 409 후 자동 재시도 금지
      if (inFlightRef.current) return; // 중복 PUT 방지
      if (readSyncPaused()) return; // "이 기기 데이터 유지" → 자동 sync 금지
      const base = readBaseUpdatedAt();
      if (!base) return; // 소유 base 없으면(백업/복원 전) 자동 sync 안 함

      const local = readLocalSnapshot();
      // 빈 people 로 서버를 덮지 않는다(API 도 차단하지만 클라에서 먼저 막는다).
      if (local.people.length === 0) return;

      inFlightRef.current = true;
      setStatus("saving");
      let res: Response | null = null;
      try {
        res = await fetch("/api/me/sync-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildUploadPayload(local, base)),
        });
      } catch {
        res = null;
      }
      inFlightRef.current = false;

      if (res && res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { updatedAt?: string }
          | null;
        if (payload?.updatedAt) writeBaseUpdatedAt(payload.updatedAt);
        setStatus("saved");
        // 잠깐 "서버에 백업됨" 표시 후 사라진다(P2-4a 최소 UI).
        window.setTimeout(() => {
          setStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 1500);
        return;
      }
      if (res && res.status === 409) {
        // 다른 기기가 더 최신 → 자동 덮어쓰기 금지, 자동 sync 중단.
        conflictRef.current = true;
        setStatus("conflict");
        return;
      }
      // 401/500/network: localStorage 유지, 자동 재시도 없음(P2-4c 에서).
      setStatus("error");
    };

    const schedule = () => {
      if (conflictRef.current || readSyncPaused()) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => void doSync(), DEBOUNCE_MS);
    };

    // people 변경 감지(참조 비교). zustand 는 immutable 갱신이라 참조가 바뀐다.
    let prevPeople = usePeopleStore.getState().people;
    const unsubPeople = usePeopleStore.subscribe((state) => {
      if (state.people !== prevPeople) {
        prevPeople = state.people;
        schedule();
      }
    });

    // Home 배치 변경 감지(커스텀 이벤트).
    const homeHandler = () => schedule();
    window.addEventListener(HOME_LAYOUT_SAVED_EVENT, homeHandler);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      window.removeEventListener(HOME_LAYOUT_SAVED_EVENT, homeHandler);
      unsubPeople();
    };
  }, [ready]);

  return status;
}
