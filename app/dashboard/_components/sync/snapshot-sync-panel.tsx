"use client";

// P2-4h: 서버 snapshot = source of truth(카카오톡 모델). 로그인/마운트/포커스/
// 탭복귀/visible polling 에서 서버 최신 데이터를 자동으로 이 기기에 반영한다.
// 일반 흐름에서 "서버 불러오기 / 이 기기로 저장" 같은 선택 카드는 띄우지 않는다.
//
// 자동 분기(카드 없음):
//   - 서버 valid + base 일치          → 이미 최신, 그대로(자동 sync 활성)
//   - 서버 valid + base 불일치(서버가 더 최신/다른 기기 push) → 자동 복원 + reload
//   - 서버 없음 + 로컬 데이터 있음     → 자동 최초 저장(PUT)
//
// 안전장치(유지): restore 전 timestamp backup key, 빈/base64 서버 snapshot 자동
//   적용 금지(isServerStateValid + restoreToLocal containsBase64 가드), people.id/
//   Home slot/folder memberIds 통짜 보존, 빈 people 로 서버 덮어쓰기 금지(API+클라).
//   서버가 더 최신일 때만 덮으므로(같은 base 면 skip) 이 기기가 서버 소유자일 땐
//   로컬을 덮지 않는다. 덮는 경우에도 backup 으로 복구 가능.

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildUploadPayload,
  currentLocalHash,
  isServerStateValid,
  localHasAnyData,
  readBaseUpdatedAt,
  readLocalSnapshot,
  restoreToLocal,
  sameUpdatedAt,
  writeBaseUpdatedAt,
  writeSyncMeta,
  writeSyncPaused,
  type ServerSnapshotState,
  type LocalSnapshot,
} from "@/lib/sync/snapshot-client";

// 현재 로그인 authUserId(sync meta 기록용). 실패 시 null.
async function readAuthUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// visible 상태에서 서버 변경을 주기적으로 확인하는 polling 간격(PC/모바일이 동시에
// 열려 있어 focus 이벤트가 없을 때도 "곧" 반영되도록). 가벼운 GET 1회/주기.
const VISIBLE_POLL_MS = 15_000;
// focus + polling 이 겹쳐 GET 이 몰리는 것만 막는 throttle(polling 주기보다 짧게).
const PULL_THROTTLE_MS = 10_000;

export function SnapshotSyncPanel({ ready }: { ready: boolean }) {
  // StrictMode 재마운트에도 mount 자동 로드/저장이 중복 reload/PUT 되지 않도록 1회만.
  const doneRef = useRef(false);
  // pull 의 inFlight(중복 GET 방지)와 throttle 타임스탬프.
  const checkingRef = useRef(false);
  const lastPullRef = useRef(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    // 서버 snapshot 을 이 기기에 적용하고 reload 한다(서버 우선). 성공 시 true.
    const applyServer = async (
      state: ServerSnapshotState,
      serverUpdatedAt: string | null,
      local: LocalSnapshot,
    ): Promise<boolean> => {
      const result = restoreToLocal(state, local);
      if (cancelled || !result.ok) return false;
      const restored = readLocalSnapshot();
      const authUserId = await readAuthUserId();
      if (cancelled) return false;
      if (serverUpdatedAt) writeBaseUpdatedAt(serverUpdatedAt);
      writeSyncMeta({
        authUserId,
        baseUpdatedAt: serverUpdatedAt,
        lastSyncedHash: currentLocalHash(restored),
        lastSyncedAt: new Date().toISOString(),
      });
      writeSyncPaused(false);
      window.location.reload();
      return true;
    };

    void (async () => {
      // 과거 충돌 흐름에서 남았을 수 있는 syncPaused("1")를 해제한다(서버 우선
      // 모델에서는 자동 sync 를 멈추지 않는다).
      writeSyncPaused(false);

      const local = readLocalSnapshot();

      let res: Response | null = null;
      try {
        res = await fetch("/api/me/sync-state", { cache: "no-store" });
      } catch {
        res = null;
      }
      // 401(로그아웃은 layout 처리) / 500 / network → 로컬로 계속.
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

        // 이미 이 기기 = 서버 최신(base 일치) → 로드 불필요, 자동 sync 유지.
        if (base && sameUpdatedAt(base, serverUpdatedAt)) {
          return;
        }

        // base 불일치 = 서버가 더 최신(다른 기기 push) 또는 이 기기 미동기화 →
        // 서버 우선으로 자동 복원(backup 후 교체 + reload). 카드 없음.
        doneRef.current = true;
        await applyServer(payload.state, serverUpdatedAt, local);
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
      const authUserId = await readAuthUserId();
      if (cancelled) return;
      if (p?.updatedAt) writeBaseUpdatedAt(p.updatedAt);
      writeSyncMeta({
        authUserId,
        baseUpdatedAt: p?.updatedAt ?? null,
        lastSyncedHash: currentLocalHash(local),
        lastSyncedAt: new Date().toISOString(),
      });
      writeSyncPaused(false);
    })();

    // 포커스/탭복귀/visible polling 에서 서버 최신을 확인(GET)하고, 서버가 더
    // 최신이면 자동 반영(restore+reload). 서버 null → 아무것도 안 함(로컬 유지).
    const pullLatestFromServer = async () => {
      if (cancelled || checkingRef.current) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      const now = Date.now();
      if (now - lastPullRef.current < PULL_THROTTLE_MS) return;
      lastPullRef.current = now;
      checkingRef.current = true;
      try {
        const local = readLocalSnapshot();
        let res: Response | null = null;
        try {
          res = await fetch("/api/me/sync-state", { cache: "no-store" });
        } catch {
          res = null;
        }
        if (cancelled || !res || !res.ok) return; // 401/500/network → 조용히 중단
        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; state?: ServerSnapshotState | null; updatedAt?: string }
          | null;
        if (cancelled || !payload?.ok || !payload.state) return;
        if (!isServerStateValid(payload.state)) return;

        const base = readBaseUpdatedAt();
        const serverUpdatedAt = payload.updatedAt ?? null;
        // 이미 이 기기 = 서버 최신 → 아무것도 안 한다.
        if (base && sameUpdatedAt(base, serverUpdatedAt)) return;

        // 서버가 더 최신 → 서버 우선 자동 반영(backup 후 교체 + reload).
        await applyServer(payload.state, serverUpdatedAt, local);
      } finally {
        checkingRef.current = false;
      }
    };

    const handleVisibility = () => {
      void pullLatestFromServer();
    };
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    const pollId = window.setInterval(() => {
      void pullLatestFromServer();
    }, VISIBLE_POLL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(pollId);
    };
  }, [ready]);

  // 헤드리스: 일반 흐름에서 충돌 선택 카드를 띄우지 않는다(서버 우선 자동 반영).
  return null;
}
