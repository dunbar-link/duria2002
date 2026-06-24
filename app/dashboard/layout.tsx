"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { SnapshotSyncPanel } from "@/app/dashboard/_components/sync/snapshot-sync-panel";
import { useSnapshotWriteSync } from "@/lib/sync/use-snapshot-write-sync";

type Props = {
  children: ReactNode;
};

type TabItem = {
  href: string;
  label: string;
  icon: "home" | "people" | "me";
};

const tabs: TabItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/people", label: "People", icon: "people" },
  { href: "/dashboard/me", label: "Me", icon: "me" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabIcon({ type }: { type: TabItem["icon"] }) {
  if (type === "home") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3.5 10.7L12 3.8l8.5 6.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.8 9.6V20h12.4V9.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.4 20v-6.2h5.2V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "people") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M4.8 20.2c.9-3.7 3.4-5.7 7.2-5.7s6.3 2 7.2 5.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14.3a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19.4 13.1v-2.2l-2-.5a6.2 6.2 0 0 0-.6-1.4l1.1-1.7-1.6-1.6-1.7 1.1a6.2 6.2 0 0 0-1.4-.6l-.5-2h-2.2l-.5 2a6.2 6.2 0 0 0-1.4.6L6.4 5.7 4.8 7.3 5.9 9a6.2 6.2 0 0 0-.6 1.4l-2 .5v2.2l2 .5a6.2 6.2 0 0 0 .6 1.4l-1.1 1.7 1.6 1.6 1.7-1.1a6.2 6.2 0 0 0 1.4.6l.5 2h2.2l.5-2a6.2 6.2 0 0 0 1.4-.6l1.7 1.1 1.6-1.6-1.1-1.7a6.2 6.2 0 0 0 .6-1.4l2-.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardLayout({ children }: Props) {
  const pathname = usePathname();

  // 로그인 세션이 있는데 이 기기가 계정에 아직 연결 안 됐으면(예: /login 의 finishLogin
  // 을 거치지 않고 기존 세션으로 dashboard 직행) identity-link 연결을 "완료"한 뒤에야
  // children(People 등)을 렌더한다. 그래야 invite mine 이 연결 전에 호출되어 빈 결과가
  // 되는 첫 진입 race 가 사라진다(새로고침 불필요). idempotent(200/201).
  const [identityReady, setIdentityReady] = useState(false);
  // P2-4c: 자동 로드가 충돌로 차단됐을 때(이 기기 데이터 유지) 작은 안내 표시용.
  const [loadConflict, setLoadConflict] = useState(false);
  // P2-4a: people/Home 변경을 감지해 조건 충족 시 자동으로 서버 snapshot 갱신.
  const writeSyncStatus = useSnapshotWriteSync({ ready: identityReady });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        // 비로그인은 proxy 가 막지만, 방어적으로 렌더는 허용한다.
        setIdentityReady(true);
        return;
      }
      let res: Response | null = null;
      try {
        res = await fetch("/api/account/identity-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legacyUserId: getCurrentUserId() }),
        });
      } catch {
        res = null;
      }
      if (cancelled) return;
      if (res && res.status === 409) {
        // 이 기기 데이터가 다른 계정에 연결됨 → 자동 로그아웃, 이전하지 않음.
        await supabase.auth.signOut();
        window.location.replace("/login?reason=account_conflict");
        return;
      }
      if (res && res.status === 401) {
        await supabase.auth.signOut();
        window.location.replace("/login?reason=signed_out");
        return;
      }
      // 200/201/400/500/network: 세션은 유효 → 렌더(미연결이면 초대만 graceful 제한).
      setIdentityReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!identityReady) {
    return (
      <div className="min-h-[100dvh] bg-[#F5F3EE]">
        <div className="mx-auto flex h-[100dvh] w-full max-w-md items-center justify-center bg-[#FAFAF8] text-sm font-medium text-[#8D99AE]">
          계정 준비 중…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F5F3EE]">
      <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#FAFAF8] shadow-[0_10px_30px_rgba(44,44,42,0.08)]">
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

        <div className="shrink-0 bg-[#F5F3EE] px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2">
          <nav className="rounded-[30px] bg-[#2C2C2A] px-3 py-2 shadow-[0_12px_28px_rgba(44,44,42,0.16)]">
            <div className="grid grid-cols-3 gap-3">
              {tabs.map((tab) => {
                const active = isActive(pathname, tab.href);

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={[
                      "flex h-[60px] flex-col items-center justify-center rounded-[22px] text-center transition active:scale-[0.98]",
                      active
                        ? "bg-[#444441] text-[#F1EFE8]"
                        : "bg-transparent text-[#A8A59D] hover:text-[#F1EFE8]",
                    ].join(" ")}
                  >
                    <span className="leading-none"><TabIcon type={tab.icon} /></span>
                    <span className="mt-1.5 text-[13px] font-semibold tracking-[-0.02em]">
                      {tab.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
      <SnapshotSyncPanel
        ready={identityReady}
        onConflict={() => setLoadConflict(true)}
      />
      {(writeSyncStatus === "error" ||
        writeSyncStatus === "conflict" ||
        loadConflict) && (
        <div className="pointer-events-none fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-40 -translate-x-1/2 rounded-full bg-[#B4524E]/92 px-3 py-1 text-[11px] font-medium text-[#FBEAE8] shadow-[0_4px_12px_rgba(44,44,42,0.18)]">
          {writeSyncStatus === "error"
            ? "저장하지 못했어요"
            : writeSyncStatus === "conflict"
              ? "다른 기기 데이터가 더 최신이에요"
              : "다른 기기 데이터와 충돌 — 이 기기 데이터는 유지했어요"}
        </div>
      )}
    </div>
  );
}
