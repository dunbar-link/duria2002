"use client";

// P2-4d: 다중기기 충돌 시 사용자가 기준본을 선택하는 하단시트 카드.
// P2-4c(자동 덮어쓰기 방지) 위에, 충돌이면 "이 기기로 계속 / 서버 불러오기 /
// 나중에" 3선택을 제공한다. 자동 병합·자동 삭제 없음. 기준본 확정은 버튼으로만.
//
// 자동 분기(카드 없이):
//   - 서버 valid + base 일치                         → 이미 동기화, 자동 sync 활성화
//   - 서버 valid + canAutoRestore(로컬 빔/직전 서버 그대로) → 자동 복원 + reload
//   - 서버 valid + 충돌(canAutoRestore false)        → 카드 표시(자동 write 없음)
//   - 서버 없음 + 로컬 있음                           → 자동 최초 저장(PUT)
//
// 안전: restore 전 backup key, 빈/base64 차단, person.id 통짜 보존, 409 보호,
//       inFlight 중복 클릭 방지, 실패 시 로컬 유지 + syncPaused 유지.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildUploadPayload,
  canAutoRestore,
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

type ConflictState = {
  serverState: ServerSnapshotState;
  serverUpdatedAt: string | null;
};

export function SnapshotSyncPanel({ ready }: { ready: boolean }) {
  // StrictMode 재마운트에도 자동 로드/저장이 중복 reload/PUT 되지 않도록 1회만.
  const doneRef = useRef(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [working, setWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

        doneRef.current = true;
        // P2-4c: 이 기기 고유 변경이 있으면(canAutoRestore false) 자동으로 덮지 않고
        // P2-4d 카드로 사용자 선택을 받는다. 그 전까지 자동 sync 중단(로컬 보존).
        if (!canAutoRestore(local)) {
          writeSyncPaused(true);
          if (!cancelled) {
            setConflict({ serverState: payload.state, serverUpdatedAt });
          }
          return;
        }
        // 로컬이 비었거나 직전 서버 그대로 → 자동 복원(서버 우선).
        const result = restoreToLocal(payload.state, local);
        if (cancelled) return;
        if (result.ok) {
          const restored = readLocalSnapshot();
          const authUserId = await readAuthUserId();
          if (cancelled) return;
          if (serverUpdatedAt) writeBaseUpdatedAt(serverUpdatedAt);
          writeSyncMeta({
            authUserId,
            baseUpdatedAt: serverUpdatedAt,
            lastSyncedHash: currentLocalHash(restored),
            lastSyncedAt: new Date().toISOString(),
          });
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
      const authUserId = await readAuthUserId();
      if (cancelled) return;
      if (p?.updatedAt) writeBaseUpdatedAt(p.updatedAt);
      // 최초 저장 = 이 기기 로컬이 곧 서버 snapshot → 현재 로컬 hash 를 기록한다.
      writeSyncMeta({
        authUserId,
        baseUpdatedAt: p?.updatedAt ?? null,
        lastSyncedHash: currentLocalHash(local),
        lastSyncedAt: new Date().toISOString(),
      });
      writeSyncPaused(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  // ── P2-4d 버튼 핸들러 ──

  // 1) 이 기기로 계속: 이 기기 로컬을 서버 기준본으로 올린다. base=충돌 시점 서버
  //    updatedAt 이므로, 그새 또 바뀌면 409 로 보호(자동 덮어쓰기 아님).
  const handleKeepThisDevice = async () => {
    if (working || !conflict) return;
    setWorking(true);
    setErrorMsg(null);
    const local = readLocalSnapshot();
    let res: Response | null = null;
    try {
      res = await fetch("/api/me/sync-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildUploadPayload(local, conflict.serverUpdatedAt)),
      });
    } catch {
      res = null;
    }
    if (res && res.ok) {
      const p = (await res.json().catch(() => null)) as
        | { updatedAt?: string }
        | null;
      const authUserId = await readAuthUserId();
      if (p?.updatedAt) writeBaseUpdatedAt(p.updatedAt);
      writeSyncMeta({
        authUserId,
        baseUpdatedAt: p?.updatedAt ?? null,
        lastSyncedHash: currentLocalHash(local),
        lastSyncedAt: new Date().toISOString(),
      });
      writeSyncPaused(false);
      setConflict(null);
      setWorking(false);
      return;
    }
    if (res && res.status === 409) {
      // 그새 다른 기기가 또 변경 → 최신 서버로 카드 갱신, 자동 덮어쓰기 금지.
      const p = (await res.json().catch(() => null)) as
        | { serverState?: ServerSnapshotState; updatedAt?: string }
        | null;
      if (p?.serverState) {
        setConflict({
          serverState: p.serverState,
          serverUpdatedAt: p.updatedAt ?? null,
        });
      }
      setErrorMsg("다른 기기에서 또 바뀌었어요. 다시 선택해 주세요.");
      setWorking(false);
      return;
    }
    // 400/500/network → 로컬 유지, syncPaused 유지.
    setErrorMsg("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    setWorking(false);
  };

  // 2) 서버 데이터 불러오기: 기존 restoreToLocal(backup key + 빈값/base64 가드) 후
  //    reload 로 재hydrate. 실패 시 로컬 유지.
  const handleLoadServer = async () => {
    if (working || !conflict) return;
    setWorking(true);
    setErrorMsg(null);
    const local = readLocalSnapshot();
    const result = restoreToLocal(conflict.serverState, local);
    if (result.ok) {
      const restored = readLocalSnapshot();
      const authUserId = await readAuthUserId();
      if (conflict.serverUpdatedAt) writeBaseUpdatedAt(conflict.serverUpdatedAt);
      writeSyncMeta({
        authUserId,
        baseUpdatedAt: conflict.serverUpdatedAt,
        lastSyncedHash: currentLocalHash(restored),
        lastSyncedAt: new Date().toISOString(),
      });
      writeSyncPaused(false);
      window.location.reload();
      return;
    }
    // BACKUP_FAILED / BASE64_IN_SERVER_STATE / WRITE_FAILED → 로컬 유지.
    setErrorMsg("불러오지 못했어요. 이 기기 데이터는 그대로예요.");
    setWorking(false);
  };

  // 3) 나중에 선택: 서버 write/restore 없음. syncPaused 유지, 카드만 닫는다.
  const handleLater = () => {
    if (working) return;
    writeSyncPaused(true);
    setConflict(null);
  };

  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-[#2C2C2A]/40" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-t-[28px] bg-[#FAFAF8] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-12px_40px_rgba(44,44,42,0.22)]">
        <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#2C2C2A]">
          서버에 더 최신 데이터가 있어요
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B6B66]">
          이 기기 데이터와 서버 데이터가 달라요. 서버 최신 데이터를 불러오면 이
          기기의 현재 데이터는 백업 후 교체돼요.
        </p>
        {errorMsg && (
          <p className="mt-3 rounded-xl bg-[#B4524E]/10 px-3 py-2 text-[12px] font-medium text-[#B4524E]">
            {errorMsg}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2.5">
          {/* 1순위(기본·강조): 서버 최신 데이터 불러오기 — 서버 source-of-truth.
              restoreToLocal 은 쓰기 전 backup key 를 만들고 reload 한다. */}
          <button
            type="button"
            onClick={handleLoadServer}
            disabled={working}
            className="flex flex-col items-start rounded-2xl bg-[#2C2C2A] px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-50"
          >
            <span className="text-[15px] font-semibold text-[#F1EFE8]">
              서버 최신 데이터 불러오기
            </span>
            <span className="mt-0.5 text-[12px] text-[#A8A59D]">
              서버에 저장된 친구와 배치를 이 기기에 불러와요
            </span>
          </button>
          {/* 2순위(보조·주의): 이 기기 데이터로 서버에 저장. 오래된 캐시에서 누르면
              서버 최신을 덮을 수 있어 테두리만 두고 약하게 + 주의 문구. */}
          <button
            type="button"
            onClick={handleKeepThisDevice}
            disabled={working}
            className="flex flex-col items-start rounded-2xl bg-transparent px-4 py-3 text-left ring-1 ring-[#D3D1C7] transition active:scale-[0.99] disabled:opacity-50"
          >
            <span className="text-[14px] font-semibold text-[#6B6B66]">
              이 기기 데이터로 서버에 저장
            </span>
            <span className="mt-0.5 text-[12px] text-[#A8A59D]">
              이 기기 데이터가 맞을 때만 선택해요
            </span>
          </button>
          <button
            type="button"
            onClick={handleLater}
            disabled={working}
            className="flex flex-col items-start rounded-2xl px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-50"
          >
            <span className="text-[14px] font-semibold text-[#8D8D87]">
              나중에 선택
            </span>
            <span className="mt-0.5 text-[12px] text-[#A8A59D]">
              지금은 아무것도 바꾸지 않아요
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
