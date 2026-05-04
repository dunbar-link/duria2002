"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3.5 10.7L12 3.8l8.5 6.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.8 9.6V20h12.4V9.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.4 20v-6.2h5.2V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "people") {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

  return (
    <div className="min-h-[100dvh] bg-[#F5F3EE]">
      <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#FAFAF8] shadow-[0_10px_30px_rgba(44,44,42,0.08)]">
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

        <div className="shrink-0 bg-[#F5F3EE] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
          <nav className="rounded-[34px] bg-[#2C2C2A] px-3 py-3 shadow-[0_14px_32px_rgba(44,44,42,0.18)]">
            <div className="grid grid-cols-3 gap-3">
              {tabs.map((tab) => {
                const active = isActive(pathname, tab.href);

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={[
                      "flex h-[74px] flex-col items-center justify-center rounded-[26px] text-center transition active:scale-[0.98]",
                      active
                        ? "bg-[#444441] text-[#F1EFE8]"
                        : "bg-transparent text-[#A8A59D] hover:text-[#F1EFE8]",
                    ].join(" ")}
                  >
                    <span className="leading-none"><TabIcon type={tab.icon} /></span>
                    <span className="mt-2 text-[14px] font-semibold tracking-[-0.02em]">
                      {tab.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
