"use client";

// P2-3 hydrate UI: 로그인+identity 연결 후 서버 snapshot 상태를 확인하고,
// 사용자가 버튼을 누를 때만 백업(PUT) 또는 복원(localStorage 반영)을 수행한다.
// 자동 복원/자동 덮어쓰기는 하지 않는다.

import { useEffect, useState } from "react";
import {
  buildUploadPayload,
  localHasAnyData,
  readLocalSnapshot,
  restoreToLocal,
  summarizeLocal,
  summarizeServer,
  writeBaseUpdatedAt,
  writeSyncPaused,
  type LocalSnapshot,
  type ServerSnapshotState,
  type SnapshotSummary,
} from "@/lib/sync/snapshot-client";

type Phase = "checking" | "hidden" | "backup" | "restore";

function SummaryRow({ label, summary }: { label: string; summary: SnapshotSummary }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] bg-[#F1EFE8] px-3 py-2 text-[13px]">
      <span className="font-semibold text-[#5C5C58]">{label}</span>
      <span className="text-[#8D99AE]">
        사람 {summary.peopleCount} · 배치 {summary.hasHomeLayout ? "있음" : "없음"} · 프로필{" "}
        {summary.hasMeProfile ? "있음" : "없음"}
      </span>
    </div>
  );
}

export function SnapshotSyncPanel({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [local, setLocal] = useState<LocalSnapshot | null>(null);
  const [serverState, setServerState] = useState<ServerSnapshotState | null>(null);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    // StrictMode(dev) 의 mount→unmount→remount 에서도 GET 이 한 번은 끝까지
    // 진행되도록 startedRef 가드를 두지 않는다(가드 시 remount 가 영구 checking
    // 으로 갇힘). 첫 effect 는 cleanup 의 cancelled 로 버려지고 두 번째가 적용된다.
    // GET 은 read-only 라 중복 호출이 무해하다.
    let cancelled = false;

    void (async () => {
      const localSnap = readLocalSnapshot();
      if (cancelled) return;
      setLocal(localSnap);

      let res: Response | null = null;
      try {
        res = await fetch("/api/me/sync-state", { cache: "no-store" });
      } catch {
        res = null;
      }
      if (cancelled) return;

      // 네트워크 실패 / 401(로그아웃은 layout 가 처리) / 500 등 → 로컬로 계속, 패널 숨김.
      if (!res || !res.ok) {
        setPhase("hidden");
        return;
      }

      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; state?: ServerSnapshotState | null; updatedAt?: string }
        | null;

      if (cancelled) return;
      if (!payload?.ok) {
        setPhase("hidden");
        return;
      }

      if (!payload.state) {
        // 서버에 백업 없음. 로컬에 데이터가 있을 때만 백업 UI 표시.
        setPhase(localHasAnyData(localSnap) ? "backup" : "hidden");
        return;
      }

      // 서버에 저장 데이터 있음. updatedAt 은 표시/복원용으로만 보관하고,
      // baseUpdatedAt(자동 sync 소유권)은 여기서 저장하지 않는다 — "백업"/"복원"
      // 성공 시에만 base 를 잡아야 "이 기기 데이터 유지" 케이스가 자동 write
      // sync 로 다른 기기 데이터를 덮어쓰지 않는다.
      setServerState(payload.state);
      setServerUpdatedAt(payload.updatedAt ?? null);
      setPhase("restore");
    })();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  async function handleBackup() {
    if (!local) return;
    setBusy(true);
    setMessage(null);
    let res: Response | null = null;
    try {
      res = await fetch("/api/me/sync-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildUploadPayload(local, null)),
      });
    } catch {
      res = null;
    }
    setBusy(false);

    if (res && res.ok) {
      const p = (await res.json().catch(() => null)) as
        | { updatedAt?: string }
        | null;
      // 백업 성공 = 이 기기가 서버 snapshot 소유자 → base 저장 + 자동 sync 활성.
      if (p?.updatedAt) writeBaseUpdatedAt(p.updatedAt);
      writeSyncPaused(false);
      setPhase("hidden");
      return;
    }
    if (res && res.status === 409) {
      setMessage("서버에 이미 저장 데이터가 있어요. 새로고침 후 다시 확인하세요.");
      return;
    }
    setMessage("백업에 실패했어요. 이 기기 데이터는 그대로예요.");
  }

  function handleRestore() {
    if (!serverState || !local) return;
    setBusy(true);
    setMessage(null);
    const result = restoreToLocal(serverState, local);
    if (result.ok) {
      // 복원 성공 = 이 기기가 서버 snapshot 기준이 됨 → base 저장 + 자동 sync 활성.
      if (serverUpdatedAt) writeBaseUpdatedAt(serverUpdatedAt);
      writeSyncPaused(false);
      // 복원 반영 후 전체 재hydrate.
      window.location.reload();
      return;
    }
    setBusy(false);
    setMessage("복원에 실패했어요. 이 기기 데이터는 그대로예요.");
  }

  if (phase === "checking" || phase === "hidden") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-10">
      <div className="w-full max-w-md rounded-[24px] bg-[#FAFAF8] p-5 shadow-[0_18px_44px_rgba(44,44,42,0.22)]">
        {phase === "backup" && local && (
          <div className="flex flex-col gap-3">
            <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#2C2C2A]">
              이 기기 데이터를 서버에 백업할까요?
            </h2>
            <p className="text-[13px] leading-snug text-[#6F6F69]">
              다른 기기에서 복원할 수 있도록 현재 사람 목록과 배치를 서버에 저장합니다.
            </p>
            <SummaryRow label="이 기기" summary={summarizeLocal(local)} />
            {message && (
              <p className="text-[12px] font-medium text-[#B4524E]">{message}</p>
            )}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setPhase("hidden")}
                disabled={busy}
                className="flex-1 rounded-[16px] bg-[#ECEAE3] py-3 text-[14px] font-semibold text-[#5C5C58] active:scale-[0.98] disabled:opacity-50"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={handleBackup}
                disabled={busy}
                className="flex-1 rounded-[16px] bg-[#2C2C2A] py-3 text-[14px] font-semibold text-[#F1EFE8] active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "백업 중…" : "서버에 백업"}
              </button>
            </div>
          </div>
        )}

        {phase === "restore" && local && serverState && (
          <div className="flex flex-col gap-3">
            <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#2C2C2A]">
              서버에 저장된 데이터가 있어요
            </h2>
            <p className="text-[13px] leading-snug text-[#6F6F69]">
              이 기기 데이터를 덮어쓰기 전에 현재 기기 데이터를 백업합니다.
            </p>
            <div className="flex flex-col gap-2">
              <SummaryRow label="서버 저장 데이터" summary={summarizeServer(serverState)} />
              <SummaryRow label="이 기기" summary={summarizeLocal(local)} />
            </div>
            {message && (
              <p className="text-[12px] font-medium text-[#B4524E]">{message}</p>
            )}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // "이 기기 데이터 유지" = 서버(다른 기기) 기준을 따르지 않음.
                  // 자동 write sync 를 멈춰 이 기기 변경이 서버를 덮지 않게 한다.
                  writeSyncPaused(true);
                  setPhase("hidden");
                }}
                disabled={busy}
                className="flex-1 rounded-[16px] bg-[#ECEAE3] py-3 text-[14px] font-semibold text-[#5C5C58] active:scale-[0.98] disabled:opacity-50"
              >
                이 기기 데이터 유지
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={busy}
                className="flex-1 rounded-[16px] bg-[#2C2C2A] py-3 text-[14px] font-semibold text-[#F1EFE8] active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "복원 중…" : "서버 데이터로 복원"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
