"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ExplorePathCta from "@/components/my-network/ExplorePathCta";

type ContactItem = {
  id: string;
  owner_user_id: string;
  owner_pid: string;
  contact_pid: string;
  name: string;
  city: string | null;
  school: string | null;
  company: string | null;
  tier: number;
  trust: number;
  edge_label: string;
  graph_sync_status: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
};

type LoadResponse =
  | {
      ok: true;
      items: ContactItem[];
    }
  | {
      ok: false;
      error: string;
    };

type SaveResponse =
  | {
      ok: true;
      items: ContactItem[];
      count: number;
      skippedDuplicateCount?: number;
      skippedDuplicates?: string[];
      graphPlan: {
        ownerPid: string;
        nextStep: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

type SyncResponse =
  | {
      ok: true;
      syncedCount: number;
      skippedCount: number;
      failedCount: number;
      message?: string;
      syncedPeople?: Array<{
        name: string;
        contactPid: string;
        tier: number;
        trust: number;
        edgeInserted: boolean;
        edgeSkipped: boolean;
      }>;
      failures?: Array<{
        name: string;
        contactPid: string;
        error: string;
      }>;
    }
  | {
      ok: false;
      error: string;
    };

type DeleteResponse =
  | {
      ok: true;
      archived: ContactItem | null;
    }
  | {
      ok: false;
      error: string;
    };

type RestoreResponse =
  | {
      ok: true;
      restored: ContactItem | null;
    }
  | {
      ok: false;
      error: string;
    };

const TIER_OPTIONS = [
  { value: 1, label: "1", desc: "직계가족" },
  { value: 5, label: "5", desc: "가장 친밀한 핵심 비가족" },
  { value: 15, label: "15", desc: "신뢰/동정심을 나누는 친구" },
  { value: 50, label: "50", desc: "파티에 초대할 수 있는 친구" },
  { value: 150, label: "150", desc: "이름 알고 교류 가능한 전체 인맥" },
  { value: 500, label: "500", desc: "얼굴+이름 매칭 가능한 지인" },
  { value: 1500, label: "1500", desc: "얼굴을 알아볼 수 있는 최대 범위" },
];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

function tierLabel(value: number) {
  const found = TIER_OPTIONS.find((item) => item.value === value);
  return found ? `${found.label} · ${found.desc}` : String(value);
}

function parseNames(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function MyNetworkPage() {
 const [ownerUserId, setOwnerUserId] = useState(
  "fa0d8146-46c1-4fab-b6ba-e1b002c62011"
);
  const [name, setName] = useState("");
  const [quickNames, setQuickNames] = useState("");
  const [city, setCity] = useState("");
  const [school, setSchool] = useState("");
  const [company, setCompany] = useState("");
  const [tier, setTier] = useState(5);
  const [trust, setTrust] = useState(80);

  const [savingSingle, setSavingSingle] = useState(false);
  const [savingQuick, setSavingQuick] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [syncSignal, setSyncSignal] = useState(0);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info"
  );

  const [items, setItems] = useState<ContactItem[]>([]);

  const ownerPidPreview = useMemo(() => {
    const value = ownerUserId.trim();
    if (!isUuid(value)) return "-";
    return `u_${value}`;
  }, [ownerUserId]);

  const quickParsedCount = useMemo(
    () => parseNames(quickNames).length,
    [quickNames]
  );

  const activeItems = useMemo(
    () => items.filter((item) => !item.is_deleted),
    [items]
  );

  const archivedItems = useMemo(
    () => items.filter((item) => item.is_deleted),
    [items]
  );

  async function loadPeople(
    nextOwnerUserId?: string,
    nextShowArchived?: boolean
  ) {
    const targetOwnerUserId = (nextOwnerUserId ?? ownerUserId).trim();
    const includeDeleted = nextShowArchived ?? showArchived;

    if (!isUuid(targetOwnerUserId)) {
      setItems([]);
      return;
    }

    setLoadingList(true);

    try {
      const response = await fetch(
        `/api/my-network/people?ownerUserId=${encodeURIComponent(
          targetOwnerUserId
        )}&includeDeleted=${includeDeleted ? "true" : "false"}`,
        {
          cache: "no-store",
        }
      );

      const data = (await response.json()) as LoadResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(data.error);
        }
        setItems([]);
        return;
      }

      setItems(data.items);
    } catch {
      setMessageType("error");
      setMessage("저장된 사람 목록을 불러오지 못했습니다.");
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    const trimmed = ownerUserId.trim();
    if (!isUuid(trimmed)) {
      setItems([]);
      return;
    }
    loadPeople(trimmed, showArchived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerUserId, showArchived]);

  async function handleSingleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");

    const trimmedOwnerUserId = ownerUserId.trim();

    if (!isUuid(trimmedOwnerUserId)) {
      setMessageType("error");
      setMessage("Owner User UUID를 정확히 입력하세요.");
      return;
    }

    if (!name.trim()) {
      setMessageType("error");
      setMessage("이름은 반드시 입력해야 합니다.");
      return;
    }

    setSavingSingle(true);

    try {
      const response = await fetch("/api/my-network/people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId: trimmedOwnerUserId,
          name,
          city,
          school,
          company,
          tier,
          trust,
        }),
      });

      const data = (await response.json()) as SaveResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`단건 저장 실패 · ${data.error}`);
        }
        return;
      }

      const duplicateText =
        data.skippedDuplicateCount && data.skippedDuplicateCount > 0
          ? ` · 중복 ${data.skippedDuplicateCount}건 건너뜀`
          : "";

      setMessageType("success");
      setMessage(
        `단건 저장 완료 · ${data.count}명 저장됨 · 이름=${name.trim()}${duplicateText}`
      );
      setName("");

      await loadPeople(trimmedOwnerUserId, showArchived);
    } catch {
      setMessageType("error");
      setMessage("단건 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingSingle(false);
    }
  }

  async function handleQuickSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");

    const trimmedOwnerUserId = ownerUserId.trim();
    const names = parseNames(quickNames);

    if (!isUuid(trimmedOwnerUserId)) {
      setMessageType("error");
      setMessage("Owner User UUID를 정확히 입력하세요.");
      return;
    }

    if (names.length === 0) {
      setMessageType("error");
      setMessage("빠른 추가 영역에 이름을 한 줄씩 입력하세요.");
      return;
    }

    setSavingQuick(true);

    try {
      const response = await fetch("/api/my-network/people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId: trimmedOwnerUserId,
          names,
          city,
          school,
          company,
          tier,
          trust,
        }),
      });

      const data = (await response.json()) as SaveResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`빠른 추가 실패 · ${data.error}`);
        }
        return;
      }

      const duplicateText =
        data.skippedDuplicateCount && data.skippedDuplicateCount > 0
          ? ` · 중복 ${data.skippedDuplicateCount}건 건너뜀 (${(
              data.skippedDuplicates || []
            ).join(", ")})`
          : "";

      setMessageType("success");
      setMessage(`빠른 추가 완료 · ${data.count}명 저장됨${duplicateText}`);
      setQuickNames("");

      await loadPeople(trimmedOwnerUserId, showArchived);
    } catch {
      setMessageType("error");
      setMessage("빠른 추가 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingQuick(false);
    }
  }

  async function handleSync() {
    setMessage("");

    const trimmedOwnerUserId = ownerUserId.trim();

    if (!isUuid(trimmedOwnerUserId)) {
      setMessageType("error");
      setMessage("Owner User UUID를 정확히 입력하세요.");
      return;
    }

    setSyncing(true);

    try {
      const response = await fetch("/api/my-network/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId: trimmedOwnerUserId,
        }),
      });

      const data = (await response.json()) as SyncResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`그래프 동기화 실패 · ${data.error}`);
        }
        return;
      }

      if (data.syncedCount === 0) {
        setMessageType("info");
        setMessage(data.message || "동기화할 pending 사람이 없습니다.");
      } else {
        const failedText =
          data.failedCount > 0 ? ` · 실패 ${data.failedCount}건` : "";
        const skippedText =
          data.skippedCount > 0 ? ` · edge 중복 skip ${data.skippedCount}건` : "";

        setMessageType("success");
        setMessage(
          `그래프 동기화 완료 · ${data.syncedCount}명 synced${skippedText}${failedText}`
        );
        setSyncSignal(Date.now());
      }

      await loadPeople(trimmedOwnerUserId, showArchived);
    } catch {
      setMessageType("error");
      setMessage("그래프 동기화 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleArchive(contactId: string, contactName: string) {
    const trimmedOwnerUserId = ownerUserId.trim();

    if (!isUuid(trimmedOwnerUserId)) {
      setMessageType("error");
      setMessage("Owner User UUID를 정확히 입력하세요.");
      return;
    }

    setDeletingId(contactId);
    setMessage("");

    try {
      const response = await fetch(
        `/api/my-network/people?ownerUserId=${encodeURIComponent(
          trimmedOwnerUserId
        )}&contactId=${encodeURIComponent(contactId)}`,
        {
          method: "DELETE",
        }
      );

      const data = (await response.json()) as DeleteResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`보관 실패 · ${data.error}`);
        }
        return;
      }

      setMessageType("success");
      setMessage(`보관 완료 · ${contactName}`);
      await loadPeople(trimmedOwnerUserId, showArchived);
    } catch {
      setMessageType("error");
      setMessage("보관 중 오류가 발생했습니다.");
    } finally {
      setDeletingId("");
    }
  }

  async function handleRestore(contactId: string, contactName: string) {
    const trimmedOwnerUserId = ownerUserId.trim();

    if (!isUuid(trimmedOwnerUserId)) {
      setMessageType("error");
      setMessage("Owner User UUID를 정확히 입력하세요.");
      return;
    }

    setRestoringId(contactId);
    setMessage("");

    try {
      const response = await fetch("/api/my-network/people", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId: trimmedOwnerUserId,
          contactId,
          action: "restore",
        }),
      });

      const data = (await response.json()) as RestoreResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`복구 실패 · ${data.error}`);
        }
        return;
      }

      setMessageType("success");
      setMessage(`복구 완료 · ${contactName}`);
      await loadPeople(trimmedOwnerUserId, showArchived);
    } catch {
      setMessageType("error");
      setMessage("복구 중 오류가 발생했습니다.");
    } finally {
      setRestoringId("");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="mb-4">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              Dunbar Link v2
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              내 사람 관리
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/70">
              단건 입력, 빠른 이름 추가, 중복 방지, 보관, 복구, 그리고 그래프
              동기화까지 한 화면에서 진행합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">
              Graph-ready preview
            </div>
            <div className="mt-2 text-sm text-cyan-50">
              owner_pid: <span className="font-mono">{ownerPidPreview}</span>
            </div>
            <div className="mt-1 text-sm text-cyan-50">
              edge_label: <span className="font-mono">knows</span>
            </div>
            <div className="mt-1 text-sm text-cyan-50">
              graph_sync_status:{" "}
              <span className="font-mono">pending → synced</span>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white p-5 text-neutral-900 shadow-2xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">공통 입력값</h2>
            <p className="mt-1 text-sm text-neutral-500">
              아래 값은 단건 추가와 빠른 추가에 공통으로 적용됩니다.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                Owner User UUID
              </label>
              <input
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                placeholder="예: fa0d8146-46c1-4fab-b6ba-e1b002c62011"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                도시
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="예: 서울"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                학교
              </label>
              <input
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="예: 고려대"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                회사
              </label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="예: 바이브"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                관계 Tier
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TIER_OPTIONS.map((option) => {
                  const active = tier === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTier(option.value)}
                      className={[
                        "rounded-2xl border px-4 py-3 text-left transition",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-900",
                      ].join(" ")}
                    >
                      <div className="text-base font-semibold">
                        {option.label}
                      </div>
                      <div
                        className={[
                          "mt-1 text-xs",
                          active ? "text-white/70" : "text-neutral-500",
                        ].join(" ")}
                      >
                        {option.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-semibold text-neutral-800">
                  Trust
                </label>
                <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">
                  {trust}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={trust}
                onChange={(e) => setTrust(Number(e.target.value))}
                className="w-full"
              />

              <div className="mt-2 flex justify-between text-xs text-neutral-500">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? "그래프 동기화 중..." : "pending 사람들을 그래프에 동기화"}
            </button>
          </div>
        </section>

        <ExplorePathCta ownerUserId={ownerUserId} syncSignal={syncSignal} />

        <section className="rounded-3xl border border-white/10 bg-white p-5 text-neutral-900 shadow-2xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">단건 추가</h2>
            <p className="mt-1 text-sm text-neutral-500">
              한 사람씩 상세하게 추가합니다.
            </p>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSingleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                이름
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 강병구"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <button
              type="submit"
              disabled={savingSingle}
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSingle ? "저장 중..." : "한 명 저장"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white p-5 text-neutral-900 shadow-2xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">빠른 이름 추가</h2>
            <p className="mt-1 text-sm text-neutral-500">
              이름을 한 줄에 한 명씩 입력하면 공통 입력값으로 한 번에 저장됩니다.
            </p>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleQuickSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                이름 목록
              </label>
              <textarea
                value={quickNames}
                onChange={(e) => setQuickNames(e.target.value)}
                placeholder={`예:
강병구
강남구`}
                rows={8}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
              <p className="mt-2 text-xs text-neutral-500">
                현재 파싱된 이름 수: {quickParsedCount}명
              </p>
            </div>

            <button
              type="submit"
              disabled={savingQuick}
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingQuick ? "일괄 저장 중..." : "빠르게 여러 명 저장"}
            </button>
          </form>
        </section>

        {message ? (
          <section
            className={[
              "rounded-3xl border p-4 text-sm leading-6",
              messageType === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : messageType === "error"
                ? "border-red-400/30 bg-red-400/10 text-red-100"
                : "border-white/10 bg-white/5 text-white/80",
            ].join(" ")}
          >
            {message}
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">저장된 사람</h2>
              <p className="mt-1 text-sm text-white/60">
                active 목록이 기본이며, 필요하면 보관된 사람도 함께 볼 수 있습니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowArchived((prev) => !prev)}
                className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
              >
                {showArchived ? "보관 숨기기" : "보관 보기"}
              </button>
              <button
                type="button"
                onClick={() => loadPeople(undefined, showArchived)}
                className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
              >
                새로고침
              </button>
            </div>
          </div>

          {!ownerUserId.trim() ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
              먼저 Owner User UUID를 입력하세요.
            </div>
          ) : !isUuid(ownerUserId.trim()) ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
              올바른 UUID 형식이 아닙니다.
            </div>
          ) : loadingList ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
              목록 불러오는 중...
            </div>
          ) : activeItems.length === 0 &&
            (!showArchived || archivedItems.length === 0) ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
              아직 저장된 사람이 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <div className="text-sm font-semibold text-white/80">
                  Active ({activeItems.length})
                </div>

                {activeItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
                    active 사람이 없습니다.
                  </div>
                ) : (
                  activeItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold">
                            {item.name}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            {formatDate(item.created_at)}
                          </div>
                        </div>
                        <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                          Tier {item.tier}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-white/80">
                        <div className="rounded-xl bg-white/5 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                            Trust
                          </div>
                          <div className="mt-1 font-medium">{item.trust}</div>
                        </div>
                        <div className="rounded-xl bg-white/5 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                            Sync
                          </div>
                          <div className="mt-1 font-medium">
                            {item.graph_sync_status}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 text-sm text-white/70">
                        <div>도시: {item.city || "-"}</div>
                        <div>학교: {item.school || "-"}</div>
                        <div>회사: {item.company || "-"}</div>
                        <div>관계: {tierLabel(item.tier)}</div>
                      </div>

                      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/50">
                        <div>owner_pid: {item.owner_pid}</div>
                        <div>contact_pid: {item.contact_pid}</div>
                        <div>edge_label: {item.edge_label}</div>
                      </div>

                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleArchive(item.id, item.name)}
                          disabled={deletingId === item.id}
                          className="w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === item.id ? "보관 중..." : "이 사람 보관"}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>

              {showArchived ? (
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-semibold text-white/80">
                    Archived ({archivedItems.length})
                  </div>

                  {archivedItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
                      보관된 사람이 없습니다.
                    </div>
                  ) : (
                    archivedItems.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-white/10 bg-black/10 p-4 opacity-80"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold">
                              {item.name}
                            </div>
                            <div className="mt-1 text-xs text-white/50">
                              생성: {formatDate(item.created_at)}
                            </div>
                            <div className="mt-1 text-xs text-white/50">
                              보관:{" "}
                              {item.deleted_at
                                ? formatDate(item.deleted_at)
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                            Tier {item.tier}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 text-sm text-white/70">
                          <div>도시: {item.city || "-"}</div>
                          <div>학교: {item.school || "-"}</div>
                          <div>회사: {item.company || "-"}</div>
                          <div>관계: {tierLabel(item.tier)}</div>
                          <div>Sync: {item.graph_sync_status}</div>
                        </div>

                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => handleRestore(item.id, item.name)}
                            disabled={restoringId === item.id}
                            className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {restoringId === item.id ? "복구 중..." : "이 사람 복구"}
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}