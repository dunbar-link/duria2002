"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { findDashboardPersonById, type DashboardPerson } from "../data";
import PersonDetailClient from "./person-detail-client";
import { usePeopleStore } from "../store";

function EmptyState({ personId }: { personId: string }) {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-slate-50 pb-[104px]">
      <div className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/92 px-5 pb-4 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard/people"
            className="inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            뒤로
          </Link>

          <span className="text-sm font-semibold text-slate-500">People</span>
        </div>
      </div>

      <div className="px-5 pb-6 pt-5">
        <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-500">관계 상세</p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            사람을 찾을 수 없어요
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            요청한 사람 정보를 불러오지 못했어요.
            <br />
            목록으로 돌아가서 다시 선택해 주세요.
          </p>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Person ID
            </p>
            <p className="mt-2 break-all text-sm leading-6 text-slate-700">
              {personId || "(empty)"}
            </p>
          </div>

          <Link
            href="/dashboard/people"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            People로 돌아가기
          </Link>
        </section>
      </div>
    </main>
  );
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function PersonDetailPage() {
  const params = useParams();
  const people = usePeopleStore((state) => state.people);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);

  const personId = useMemo(() => {
    const raw = params?.id;

    if (typeof raw === "string") {
      return safeDecodeURIComponent(raw);
    }

    if (Array.isArray(raw)) {
      return safeDecodeURIComponent(raw[0] ?? "");
    }

    return "";
  }, [params]);

  const person = useMemo<DashboardPerson | null>(() => {
    if (!personId) {
      return null;
    }

    return findDashboardPersonById(personId, people);
  }, [personId, people]);

  if (!hasHydrated) {
    return (
      <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-slate-50 pb-[104px]">
        <div className="px-5 pb-6 pt-6">
          <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-base font-semibold text-slate-900">불러오는 중...</p>
          </section>
        </div>
      </main>
    );
  }

  if (!person) {
    return <EmptyState personId={personId} />;
  }

  return <PersonDetailClient person={person} />;
}
