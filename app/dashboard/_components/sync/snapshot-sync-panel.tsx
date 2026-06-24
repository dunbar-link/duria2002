"use client";

// P2-4 hotfix: 로그인(identity 연결) 후 서버 snapshot 을 "자동" 로드/최초저장한다.
// 기존 P2-3 확인형 패널(매번 "서버에 백업"을 눌러야 하는 UX)을 폐지하고,
// 일반 사용자는 저장/복원을 의식하지 않아도 되게 한다(UI 없음).
//
// 분기:
//   - 서버 snapshot valid + 이 기기 base 와 다름  → backup key 후 자동 로드 + reload(서버 우선)
//   - 서버 snapshot valid + base 일치             → 이미 동기화됨, 자동 sync 만 활성화
//   - 서버 snapshot 없음 + 로컬 데이터 있음        → 자동 최초 저장(PUT)
//   - 서버 없음/로컬 없음 / invalid / 실패         → 아무것도 안 함(로컬 유지)
//
// 안전: 자동 로드 전 backup key 생성(restoreToLocal), 빈/base64 snapshot 차단,
//       person.id/slot/folder 통짜 보존, 실패해도 localStorage 유지, 자동 덮어쓰기
//       는 valid + (base 불일치) 조건에서만. 409 후 pause 는 write sync 훅이 유지.

import { useEffect, useRef } from "react";
import {
  buildUploadPayload,
  isServerStateValid,
  localHasAnyData,
  readBaseUpdatedAt,
  readLocalSnapshot,
  restoreToLocal,
  sameUpdatedAt,
  writeBaseUpdatedAt,
  writeSyncPaused,
  type ServerSnapshotState,
} from "@/lib/sync/snapshot-client";

export function SnapshotSyncPanel({ ready }: { ready: boolean }) {
  // StrictMode 재마운트에도 자동 로드/저장이 중복 reload/PUT 되지 않도록
  // 1회만 수행한다(첫 effect 가 cleanup 으로 버려지면 두 번째가 실행).
  const doneRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      const local = readLocalSnapshot();

      let res: Response | null = null;
      try {
        res = await fetch("/api/me/sync-state", { cache: "no-store" });
      } catch {
        res = null;
      }
      // 401(로그아웃은 layout 처리) / 500 / network → 로컬로 계속, 아무것도 안 함.
      if (cancelled || !res || !res.ok) return;

      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; state?: ServerSnapshotState | null; updatedAt?: string }
        | null;
      if (cancelled || !payload?.ok || doneRef.current) return;

      if (payload.state) {
        // ── 서버에 저장 데이터 있음 ──
        // 빈/base64 오염 snapshot 이면 자동 로드 금지(로컬 보존).
        if (!isServerStateValid(payload.state)) return;

        const base = readBaseUpdatedAt();
        const serverUpdatedAt = payload.updatedAt ?? null;

        // 이미 이 기기 = 서버 최신(base 일치) → 로드 불필요, 자동 sync 활성화.
        if (base && sameUpdatedAt(base, serverUpdatedAt)) {
          writeSyncPaused(false);
          return;
        }

        // base 없음(첫 로그인) 또는 다름(다른 기기가 더 최신) → 서버 우선 자동 로드.
        // restoreToLocal 이 쓰기 전 backup key 를 만들고(실패 시 중단), 빈값/필드별
        // 가드와 person.id 통짜 보존을 적용한다.
        doneRef.current = true;
        const result = restoreToLocal(payload.state, local);
        if (cancelled) return;
        if (result.ok) {
          if (serverUpdatedAt) writeBaseUpdatedAt(serverUpdatedAt);
          writeSyncPaused(false);
          window.location.reload();
        }
        // 실패(backup 실패 등) → 로컬 유지, 자동 sync 시작 안 함.
        return;
      }

      // ── 서버에 저장 데이터 없음 ──
      // 로컬에 데이터가 있으면 자동으로 최초 저장(로컬→서버, 덮어쓰기 아님).
      if (!localHasAnyData(local)) return;

      doneRef.current = true;
      let putRes: Response | null = null;
      try {
        putRes = await fetch("/api/me/sync-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildUploadPayload(local, null)),
        });
      } catch {
        putRes = null;
      }
      if (cancelled || !putRes || !putRes.ok) return; // 실패 → 로컬 유지

      const p = (await putRes.json().catch(() => null)) as
        | { updatedAt?: string }
        | null;
      if (p?.updatedAt) writeBaseUpdatedAt(p.updatedAt);
      writeSyncPaused(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  // 자동 로드/저장이라 사용자 대면 UI 없음. 저장 상태(실패/충돌)는 layout 의
  // write sync 인디케이터가 작게 표시한다.
  return null;
}
