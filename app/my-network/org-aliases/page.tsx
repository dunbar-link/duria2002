"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type OrgAliasItem = {
  id: string;
  alias: string;
  org_pid: string;
  edge_label: "member" | "employee";
  is_active: boolean;
  created_at: string;
};

type LoadResponse =
  | { ok: true; items: OrgAliasItem[] }
  | { ok: false; error: string };

type CreateResponse =
  | { ok: true; item: OrgAliasItem | null }
  | { ok: false; error: string };

type PatchResponse =
  | { ok: true; item: OrgAliasItem | null }
  | { ok: false; error: string };

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

export default function OrgAliasesPage() {
  const [items, setItems] = useState<OrgAliasItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info"
  );

  const [alias, setAlias] = useState("");
  const [orgPid, setOrgPid] = useState("");
  const [edgeLabel, setEdgeLabel] = useState<"member" | "employee">("member");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [editAlias, setEditAlias] = useState("");
  const [editOrgPid, setEditOrgPid] = useState("");
  const [editEdgeLabel, setEditEdgeLabel] = useState<"member" | "employee">("member");

  async function loadAliases(nextSearch?: string, nextStatus?: "all" | "active" | "inactive") {
    const q = nextSearch ?? search;
    const status = nextStatus ?? statusFilter;

    setLoading(true);

    try {
      const response = await fetch(
        `/api/my-network/org-aliases?q=${encodeURIComponent(q)}&status=${status}`,
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
      setMessage("alias 목록을 불러오지 못했습니다.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAliases("", "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    await loadAliases(search, statusFilter);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!alias.trim()) {
      setMessageType("error");
      setMessage("alias를 입력하세요.");
      return;
    }

    if (!orgPid.trim()) {
      setMessageType("error");
      setMessage("org pid를 입력하세요.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/my-network/org-aliases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          alias,
          orgPid,
          edgeLabel,
          isActive: true,
        }),
      });

      const data = (await response.json()) as CreateResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`alias 저장 실패 · ${data.error}`);
        }
        return;
      }

      setMessageType("success");
      setMessage(`alias 저장 완료 · ${alias.trim().toLowerCase()}`);
      setAlias("");
      setOrgPid("");
      setEdgeLabel("member");

      await loadAliases(search, statusFilter);
    } catch {
      setMessageType("error");
      setMessage("alias 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item: OrgAliasItem) {
    setTogglingId(item.id);
    setMessage("");

    try {
      const response = await fetch("/api/my-network/org-aliases", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          action: "toggleActive",
          isActive: !item.is_active,
        }),
      });

      const data = (await response.json()) as PatchResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`상태 변경 실패 · ${data.error}`);
        }
        return;
      }

      setMessageType("success");
      setMessage(
        `상태 변경 완료 · ${item.alias} · ${
          item.is_active ? "inactive" : "active"
        }`
      );

      await loadAliases(search, statusFilter);
    } catch {
      setMessageType("error");
      setMessage("상태 변경 중 오류가 발생했습니다.");
    } finally {
      setTogglingId("");
    }
  }

  function startEdit(item: OrgAliasItem) {
    setEditingId(item.id);
    setEditAlias(item.alias);
    setEditOrgPid(item.org_pid);
    setEditEdgeLabel(item.edge_label);
  }

  function cancelEdit() {
    setEditingId("");
    setEditAlias("");
    setEditOrgPid("");
    setEditEdgeLabel("member");
  }

  async function handleEditSave(itemId: string) {
    setMessage("");

    if (!editAlias.trim()) {
      setMessageType("error");
      setMessage("수정 alias를 입력하세요.");
      return;
    }

    if (!editOrgPid.trim()) {
      setMessageType("error");
      setMessage("수정 org pid를 입력하세요.");
      return;
    }

    try {
      const response = await fetch("/api/my-network/org-aliases", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: itemId,
          action: "edit",
          alias: editAlias,
          orgPid: editOrgPid,
          edgeLabel: editEdgeLabel,
        }),
      });

      const data = (await response.json()) as PatchResponse;

      if (!response.ok || !data.ok) {
        if (!data.ok) {
          setMessageType("error");
          setMessage(`수정 실패 · ${data.error}`);
        }
        return;
      }

      setMessageType("success");
      setMessage(`수정 완료 · ${editAlias.trim().toLowerCase()}`);
      cancelEdit();
      await loadAliases(search, statusFilter);
    } catch {
      setMessageType("error");
      setMessage("수정 중 오류가 발생했습니다.");
    }
  }

  const activeCount = useMemo(
    () => items.filter((item) => item.is_active).length,
    [items]
  );

  const inactiveCount = useMemo(
    () => items.filter((item) => !item.is_active).length,
    [items]
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
            Dunbar Link v2
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Organization Alias Admin
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/70">
            학교/회사 문자열을 org pid와 연결하는 운영용 alias 관리 화면입니다.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">
                Active
              </div>
              <div className="mt-2 text-2xl font-semibold">{activeCount}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">
                Inactive
              </div>
              <div className="mt-2 text-2xl font-semibold">{inactiveCount}</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white p-5 text-neutral-900 shadow-2xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">검색 / 필터</h2>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSearchSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                검색어
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="alias, org pid, edge label 검색"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                상태 필터
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["all", "active", "inactive"] as const).map((value) => {
                  const active = statusFilter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatusFilter(value)}
                      className={[
                        "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-900",
                      ].join(" ")}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              검색 적용
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white p-5 text-neutral-900 shadow-2xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">새 alias 추가</h2>
            <p className="mt-1 text-sm text-neutral-500">
              예: 고려대 → org:univ:korea-university / member
            </p>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                Alias
              </label>
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="예: 고려대"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                Org PID
              </label>
              <input
                value={orgPid}
                onChange={(e) => setOrgPid(e.target.value)}
                placeholder="예: org:univ:korea-university"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-800">
                Edge Label
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["member", "employee"] as const).map((value) => {
                  const active = edgeLabel === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEdgeLabel(value)}
                      className={[
                        "rounded-2xl border px-4 py-3 text-left transition",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-900",
                      ].join(" ")}
                    >
                      <div className="text-base font-semibold">{value}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "저장 중..." : "alias 저장"}
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
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Alias 목록</h2>
              <p className="mt-1 text-sm text-white/60">
                검색/필터/수정/활성화 제어가 가능합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadAliases(search, statusFilter)}
              className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            >
              새로고침
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
              목록 불러오는 중...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">
              조건에 맞는 alias가 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => {
                const isEditing = editingId === item.id;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold">{item.alias}</div>
                        <div className="mt-1 text-xs text-white/50">
                          {formatDate(item.created_at)}
                        </div>
                      </div>
                      <div
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          item.is_active
                            ? "bg-emerald-400/20 text-emerald-200"
                            : "bg-neutral-700 text-neutral-200",
                        ].join(" ")}
                      >
                        {item.is_active ? "active" : "inactive"}
                      </div>
                    </div>

                    {!isEditing ? (
                      <>
                        <div className="mt-3 flex flex-col gap-2 text-sm text-white/70">
                          <div>org_pid: {item.org_pid}</div>
                          <div>edge_label: {item.edge_label}</div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggle(item)}
                            disabled={togglingId === item.id}
                            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {togglingId === item.id
                              ? "변경 중..."
                              : item.is_active
                              ? "inactive로 변경"
                              : "active로 변경"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 flex flex-col gap-3">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-white">
                            Alias
                          </label>
                          <input
                            value={editAlias}
                            onChange={(e) => setEditAlias(e.target.value)}
                            className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-white">
                            Org PID
                          </label>
                          <input
                            value={editOrgPid}
                            onChange={(e) => setEditOrgPid(e.target.value)}
                            className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-white">
                            Edge Label
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {(["member", "employee"] as const).map((value) => {
                              const active = editEdgeLabel === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setEditEdgeLabel(value)}
                                  className={[
                                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                                    active
                                      ? "border-white bg-white text-black"
                                      : "border-white/15 bg-white/5 text-white",
                                  ].join(" ")}
                                >
                                  {value}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditSave(item.id)}
                            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}