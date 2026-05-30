"use client";

/**
 * 숨김 진단 페이지 (/dashboard/debug-beta).
 *
 * 베타 전 Home / People / Invite 상태 불일치를 한 화면에서 빠르게 확인하기
 * 위한 read-only inspection 도구. 사용자에게 공개되는 기능이 아니며,
 * 앱 어디에서도 이 페이지로 가는 링크를 노출하지 않는다. 직접 URL 입력으로만
 * 접근한다.
 *
 * 원칙:
 *  - 모든 표시는 read-only. store/Supabase/localStorage 에 write 하지 않는다.
 *  - count 계산은 Home / People 의 실제 로직을 변경하지 않고 "보여주기" 목적
 *    으로만 inline 으로 재구현(또는 같은 식 그대로 사용).
 *  - 페이지 mount 시 localStorage(home layout) + 현재 store(people, invites) +
 *    /api/invites/mine GET 만 호출.
 */

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { usePeopleStore } from "../people/store";
import { STORAGE_KEY } from "../_components/home/home-page-types";

type FolderMap = Record<string, { id: string; memberIds: string[] }>;
type LayerLayoutState = {
  visibleSlotIds: Array<string | null>;
  hiddenSlotIds: Array<string | null>;
};

type RemoteInviteRow = {
  token: string;
  invitee_name: string | null;
  status: string;
  accepted_person_id: string | null;
  accepted_person_name: string | null;
  source_person_id: string | null;
  tier: number;
  created_at: string | null;
};

const LAYER_DEFS = [
  { id: "family", label: "가족", min: 0, max: 1 },
  { id: "core", label: "핵심", min: 2, max: 5 },
  { id: "intimate", label: "신뢰", min: 6, max: 15 },
  { id: "trust", label: "친밀", min: 16, max: 50 },
  { id: "maintain", label: "친근", min: 51, max: 150 },
] as const;

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function readHomeLayoutFromStorage(): {
  layoutState: Record<string, LayerLayoutState>;
  folders: FolderMap;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      layoutState?: Record<string, LayerLayoutState>;
      folders?: FolderMap;
    };
    return {
      layoutState: parsed.layoutState ?? {},
      folders: parsed.folders ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * Home count 와 동일한 의미. family-me 는 0 으로 친다(People 와 동일 기준).
 * folder 멤버는 재귀 펼침. cycle 방지 visited set.
 */
function countLayerEntities(
  layer: LayerLayoutState | undefined,
  folders: FolderMap,
): number {
  if (!layer) return 0;
  const visited = new Set<string>();
  function countOne(id: string | null): number {
    if (!id) return 0;
    if (id === "family-me") return 0;
    if (visited.has(id)) return 0;
    visited.add(id);
    const f = folders[id];
    if (f) {
      return f.memberIds.reduce((s, m) => s + countOne(m), 0);
    }
    return 1;
  }
  return [...layer.visibleSlotIds, ...layer.hiddenSlotIds].reduce(
    (s, id) => s + countOne(id),
    0,
  );
}

function getTierBand(tier: number | null | undefined) {
  if (typeof tier !== "number") return "unknown";
  if (tier <= 1) return "family";
  if (tier <= 5) return "core";
  if (tier <= 15) return "intimate";
  if (tier <= 50) return "trust";
  return "maintain";
}

export default function DashboardDebugBetaPage() {
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);

  const [home, setHome] = useState<{
    layoutState: Record<string, LayerLayoutState>;
    folders: FolderMap;
  } | null>(null);
  const [remoteInvites, setRemoteInvites] = useState<RemoteInviteRow[]>([]);
  const [remoteError, setRemoteError] = useState<string>("");

  useEffect(() => {
    setHome(readHomeLayoutFromStorage());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const userId = getCurrentUserId();
      if (!userId) return;
      try {
        const res = await fetch(
          `/api/invites/mine?userId=${encodeURIComponent(userId)}&limit=100`,
          { cache: "no-store" },
        );
        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; invites?: RemoteInviteRow[]; message?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || payload?.ok !== true) {
          setRemoteError(payload?.message ?? `http ${res.status}`);
          return;
        }
        setRemoteInvites(payload.invites ?? []);
      } catch (err) {
        if (cancelled) return;
        setRemoteError(err instanceof Error ? err.message : "fetch failed");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const inviteState = useMemo(() => {
    const localPending = inviteDrafts.filter((d) => d.status === "pending");
    const localAccepted = inviteDrafts.filter((d) => d.status === "accepted");
    const remotePending = remoteInvites.filter((r) => r.status === "pending");
    const remoteAccepted = remoteInvites.filter((r) => r.status === "accepted");

    // token-level dedup (local + remote)
    const tokensSeen = new Set<string>();
    const pendingByToken: Array<{
      token: string;
      inviteeName: string;
      sourcePersonId: string | null;
      provisionalPersonId: string | null;
      origin: "local" | "remote";
    }> = [];
    for (const d of localPending) {
      const t = d.token?.trim();
      if (!t || tokensSeen.has(t)) continue;
      tokensSeen.add(t);
      pendingByToken.push({
        token: t,
        inviteeName: d.inviteeName ?? "",
        sourcePersonId: d.sourcePersonId ?? null,
        provisionalPersonId: d.provisionalPersonId ?? null,
        origin: "local",
      });
    }
    for (const r of remotePending) {
      const t = r.token?.trim();
      if (!t || tokensSeen.has(t)) continue;
      tokensSeen.add(t);
      pendingByToken.push({
        token: t,
        inviteeName: r.invitee_name ?? "",
        sourcePersonId: r.source_person_id ?? null,
        provisionalPersonId: null,
        origin: "remote",
      });
    }

    // person-level dedup
    const personSeen = new Set<string>();
    const pendingByPerson: typeof pendingByToken = [];
    for (const p of pendingByToken) {
      let key = "";
      if (p.sourcePersonId) key = `pid:${p.sourcePersonId}`;
      else if (p.provisionalPersonId) key = `pid:${p.provisionalPersonId}`;
      else {
        const n = normalizeName(p.inviteeName);
        key = n ? `name:${n}` : `token:${p.token}`;
      }
      if (personSeen.has(key)) continue;
      personSeen.add(key);
      pendingByPerson.push(p);
    }

    return {
      localPending,
      localAccepted,
      remotePending,
      remoteAccepted,
      pendingByToken,
      pendingByPerson,
    };
  }, [inviteDrafts, remoteInvites]);

  function isAcceptedPerson(p: (typeof people)[number]) {
    const r = p as Record<string, unknown>;
    if (r.isJoined !== true) return false;
    const candidates = [r.userId, r.dlUserId, r.acceptedPersonId];
    return candidates.some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  }

  function findPendingMatch(person: { id: string; name: string }) {
    return inviteState.pendingByPerson.find((p) => {
      if (p.sourcePersonId && p.sourcePersonId === person.id) return true;
      if (p.provisionalPersonId && p.provisionalPersonId === person.id) return true;
      const a = normalizeName(p.inviteeName);
      const b = normalizeName(person.name);
      return Boolean(a && b && a === b);
    });
  }

  const classified = useMemo(() => {
    const accepted: typeof people = [];
    const pending: typeof people = [];
    const localOnly: typeof people = [];
    for (const p of people) {
      if (isAcceptedPerson(p)) {
        accepted.push(p);
      } else if (findPendingMatch({ id: p.id, name: p.name })) {
        pending.push(p);
      } else {
        localOnly.push(p);
      }
    }
    return { accepted, pending, localOnly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, inviteState]);

  const tierComparison = useMemo(() => {
    return LAYER_DEFS.map((def) => {
      const homeCount = countLayerEntities(
        home?.layoutState?.[def.id],
        home?.folders ?? {},
      );
      const peopleCount = people.filter((p) => getTierBand(p.tier) === def.id).length;
      return {
        layerId: def.id,
        label: def.label,
        homeCount,
        peopleCount,
        match: homeCount === peopleCount,
      };
    });
  }, [home, people]);

  const duplicates = useMemo(() => {
    // 같은 token 의 invite 가 local + remote 양쪽에 있는 경우만 표시 (정상)
    const localTokens = new Set(
      inviteDrafts.map((d) => d.token?.trim()).filter(Boolean) as string[],
    );
    const remoteTokens = new Set(
      remoteInvites.map((r) => r.token?.trim()).filter(Boolean) as string[],
    );
    const sharedTokens = Array.from(localTokens).filter((t) =>
      remoteTokens.has(t),
    );

    // 같은 이름의 person 이 store 안에 여러 개 (잠재적 중복)
    const nameCount = new Map<string, number>();
    for (const p of people) {
      const n = normalizeName(p.name);
      if (!n) continue;
      nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
    }
    const duplicateNames = Array.from(nameCount.entries())
      .filter(([, c]) => c > 1)
      .map(([name, count]) => ({ name, count }));

    // 같은 sourcePersonId 에 pending invite 가 여러 개 (server upsert 이전 stale local)
    const pendingBySource = new Map<string, number>();
    for (const d of inviteDrafts) {
      if (d.status !== "pending") continue;
      const src = d.sourcePersonId?.trim();
      if (!src) continue;
      pendingBySource.set(src, (pendingBySource.get(src) ?? 0) + 1);
    }
    const duplicatePendingBySource = Array.from(pendingBySource.entries())
      .filter(([, c]) => c > 1)
      .map(([sourcePersonId, count]) => ({ sourcePersonId, count }));

    return { sharedTokens, duplicateNames, duplicatePendingBySource };
  }, [inviteDrafts, remoteInvites, people]);

  const peopleTotal = people.length;
  const acceptedCount = classified.accepted.length;
  const pendingPersonCount = inviteState.pendingByPerson.length;
  const localOnlyCount = classified.localOnly.length;

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col gap-4 overflow-y-auto bg-[#0F172A] px-4 pb-[120px] pt-5 text-[12px] text-[#E2E8F0]">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#94A3B8]">
          Hidden Beta Inspector
        </p>
        <h1 className="mt-1 text-[18px] font-bold tracking-tight text-white">
          /dashboard/debug-beta
        </h1>
        <p className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">
          read-only. write 없음. 사용자에게 공개되지 않는 진단 화면.
        </p>
        {!hasHydrated ? (
          <p className="mt-2 text-[11px] text-[#F59E0B]">store hydrate 중...</p>
        ) : null}
        {remoteError ? (
          <p className="mt-2 text-[11px] text-[#F87171]">
            remote invites fetch 실패: {remoteError} (local 만 표시)
          </p>
        ) : null}
      </header>

      <Section title="섹션 1. 요약">
        <KV k="total people" v={peopleTotal} />
        <KV k="local-only" v={localOnlyCount} />
        <KV k="pending (person dedup)" v={pendingPersonCount} />
        <KV k="pending (token dedup)" v={inviteState.pendingByToken.length} />
        <KV k="accepted" v={acceptedCount} />
        <KV k="local invite drafts (raw)" v={inviteDrafts.length} />
        <KV k="remote invites (raw)" v={remoteInvites.length} />
      </Section>

      <Section title="섹션 2. Tier Count 비교">
        <div className="grid grid-cols-[1fr_60px_60px_40px] gap-x-2 gap-y-1.5 text-[11px]">
          <div className="font-semibold text-[#94A3B8]">layer</div>
          <div className="text-right font-semibold text-[#94A3B8]">Home</div>
          <div className="text-right font-semibold text-[#94A3B8]">People</div>
          <div className="text-right font-semibold text-[#94A3B8]">match</div>
          {tierComparison.map((row) => (
            <ContentsFragment key={row.layerId}>
              <div>{row.label}</div>
              <div className="text-right">{row.homeCount}</div>
              <div className="text-right">{row.peopleCount}</div>
              <div
                className={`text-right font-semibold ${row.match ? "text-[#34D399]" : "text-[#F87171]"}`}
              >
                {row.match ? "OK" : "!="}
              </div>
            </ContentsFragment>
          ))}
        </div>
      </Section>

      <Section title="섹션 3. Invite 상태">
        <KV k="local pending" v={inviteState.localPending.length} />
        <KV k="local accepted" v={inviteState.localAccepted.length} />
        <KV k="remote pending" v={inviteState.remotePending.length} />
        <KV k="remote accepted" v={inviteState.remoteAccepted.length} />
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            pending 목록 (token dedup)
          </p>
          {inviteState.pendingByToken.length === 0 ? (
            <p className="mt-1 text-[#64748B]">없음</p>
          ) : (
            <ul className="mt-1 space-y-1 break-all">
              {inviteState.pendingByToken.map((p) => (
                <li key={p.token} className="rounded bg-[#1E293B] px-2 py-1">
                  <div>
                    <span className="text-[#94A3B8]">name:</span> {p.inviteeName || "(빈 이름)"}
                  </div>
                  <div className="text-[10px] text-[#64748B]">
                    {p.origin} · token={p.token.slice(0, 12)}... · sourcePersonId={p.sourcePersonId ?? "-"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            accepted 목록
          </p>
          {[...inviteState.localAccepted, ...inviteState.remoteAccepted].length === 0 ? (
            <p className="mt-1 text-[#64748B]">없음</p>
          ) : (
            <ul className="mt-1 space-y-1 break-all">
              {inviteState.localAccepted.map((d) => (
                <li key={`la-${d.token}`} className="rounded bg-[#1E293B] px-2 py-1">
                  <div>
                    <span className="text-[#94A3B8]">name:</span> {d.acceptedPersonName ?? d.inviteeName ?? "(빈 이름)"}
                  </div>
                  <div className="text-[10px] text-[#64748B]">
                    local · token={d.token.slice(0, 12)}... · acceptedPersonId={d.acceptedPersonId ?? "-"}
                  </div>
                </li>
              ))}
              {inviteState.remoteAccepted.map((r) => (
                <li key={`ra-${r.token}`} className="rounded bg-[#1E293B] px-2 py-1">
                  <div>
                    <span className="text-[#94A3B8]">name:</span> {r.accepted_person_name ?? r.invitee_name ?? "(빈 이름)"}
                  </div>
                  <div className="text-[10px] text-[#64748B]">
                    remote · token={r.token.slice(0, 12)}... · acceptedPersonId={r.accepted_person_id ?? "-"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title="섹션 4. Local-only 목록">
        {classified.localOnly.length === 0 ? (
          <p className="text-[#64748B]">없음</p>
        ) : (
          <ul className="space-y-1">
            {classified.localOnly.map((p) => (
              <li key={p.id} className="rounded bg-[#1E293B] px-2 py-1">
                <div>
                  <span className="text-[#94A3B8]">name:</span> {p.name}
                </div>
                <div className="text-[10px] text-[#64748B]">
                  id={p.id} · tier={p.tier ?? "-"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="섹션 5. Pending 사람 (store 안 person)">
        {classified.pending.length === 0 ? (
          <p className="text-[#64748B]">없음</p>
        ) : (
          <ul className="space-y-1">
            {classified.pending.map((p) => (
              <li key={p.id} className="rounded bg-[#1E293B] px-2 py-1">
                <div>
                  <span className="text-[#94A3B8]">name:</span> {p.name}
                </div>
                <div className="text-[10px] text-[#64748B]">
                  id={p.id} · tier={p.tier ?? "-"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="섹션 6. Accepted 사람 (store 안 person)">
        {classified.accepted.length === 0 ? (
          <p className="text-[#64748B]">없음</p>
        ) : (
          <ul className="space-y-1">
            {classified.accepted.map((p) => {
              const r = p as Record<string, unknown>;
              const sid =
                (typeof r.userId === "string" && r.userId) ||
                (typeof r.dlUserId === "string" && r.dlUserId) ||
                (typeof r.acceptedPersonId === "string" && r.acceptedPersonId) ||
                "";
              return (
                <li key={p.id} className="rounded bg-[#1E293B] px-2 py-1">
                  <div>
                    <span className="text-[#94A3B8]">name:</span> {p.name}
                  </div>
                  <div className="text-[10px] text-[#64748B]">
                    id={p.id} · tier={p.tier ?? "-"} · serverId={sid || "-"}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="섹션 7. 중복 후보">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            local+remote 동일 token (정상)
          </p>
          {duplicates.sharedTokens.length === 0 ? (
            <p className="mt-1 text-[#64748B]">없음</p>
          ) : (
            <ul className="mt-1 space-y-1 break-all">
              {duplicates.sharedTokens.map((t) => (
                <li key={t} className="rounded bg-[#1E293B] px-2 py-1 text-[10px]">
                  {t.slice(0, 16)}...
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            동일 이름 person 다중
          </p>
          {duplicates.duplicateNames.length === 0 ? (
            <p className="mt-1 text-[#64748B]">없음</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {duplicates.duplicateNames.map((d) => (
                <li key={d.name} className="rounded bg-[#1E293B] px-2 py-1">
                  {d.name} × {d.count}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            sourcePersonId 별 pending 다중 (stale local invite 의심)
          </p>
          {duplicates.duplicatePendingBySource.length === 0 ? (
            <p className="mt-1 text-[#64748B]">없음</p>
          ) : (
            <ul className="mt-1 space-y-1 break-all">
              {duplicates.duplicatePendingBySource.map((d) => (
                <li
                  key={d.sourcePersonId}
                  className="rounded bg-[#1E293B] px-2 py-1 text-[10px]"
                >
                  {d.sourcePersonId} × {d.count}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <footer className="mt-2 text-[10px] text-[#64748B]">
        read-only. 변경/저장 없음.
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[#1E293B] bg-[#0B1220] p-3">
      <h2 className="mb-2 text-[12px] font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[#94A3B8]">{k}</span>
      <span className="font-mono text-white">{v}</span>
    </div>
  );
}

function ContentsFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
