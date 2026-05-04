"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type BridgePerson = {
  pid: string;
  name: string;
};

type ChainNode = {
  pid: string;
  name: string;
  kind: "me" | "bridge" | "target" | "unknown";
};

type DiscoverViewModel = {
  reachable: boolean;
  targetPid: string;
  targetName: string;
  stepCount: number;
  bridges: BridgePerson[];
  pathPreviewText: string;
  chainNodes: ChainNode[];
  raw: unknown;
};

type SavedPathSummary = {
  targetName: string;
  targetPid: string;
  firstBridgeName: string;
  coreBridgeName: string;
};

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeTargetPid(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

function normalizeTargetName(value: string): string {
  return value.trim();
}

function normalizePersonName(value: string, fallback = "연결점") {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function looksLikeNoPathMessage(message: string): boolean {
  const text = message.trim().toLowerCase();

  if (!text) return false;

  const patterns = [
    "path unavailable",
    "no path",
    "no path yet",
    "not found",
    "연결 경로를 찾지 못",
    "아직 연결 경로",
    "아직 연결 없음",
    "경로 없음",
  ];

  return patterns.some((pattern) => text.includes(pattern));
}

function looksLikeInstitutionPid(pid: string) {
  const text = pid.trim().toLowerCase();

  if (!text) return false;

  return [
    "org:",
    "company:",
    "school:",
    "univ:",
    "university:",
    "institution:",
    "corp:",
    "agency:",
    "gov:",
  ].some((prefix) => text.startsWith(prefix));
}

function looksLikeInstitutionName(name: string) {
  const text = name.trim().toLowerCase();

  if (!text) return false;

  const keywords = [
    "university",
    "college",
    "school",
    "company",
    "corporation",
    "agency",
    "office",
    "ministry",
    "hospital",
    "foundation",
    "association",
    "institute",
    "센터",
    "학교",
    "대학교",
    "대학",
    "회사",
    "기관",
    "공사",
    "공단",
    "재단",
    "협회",
    "병원",
    "법원",
    "검찰청",
    "경찰서",
    "구청",
    "시청",
    "도청",
    "주식회사",
  ];

  return keywords.some((keyword) => text.includes(keyword));
}

function isPersonLikeNode(pid: string, name: string) {
  return !looksLikeInstitutionPid(pid) && !looksLikeInstitutionName(name);
}

function dedupeBridgeList(list: BridgePerson[]) {
  const seen = new Set<string>();
  const result: BridgePerson[] = [];

  for (const item of list) {
    const key = `${item.pid}::${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function mapPersonCandidate(item: any): BridgePerson | null {
  if (!item || typeof item !== "object") return null;

  const pid = pickFirstText(
    item?.pid,
    item?.personPid,
    item?.person_pid,
    item?.bridgePid,
    item?.bridge_pid,
    item?.id
  );

  const name = pickFirstText(
    item?.name,
    item?.personName,
    item?.person_name,
    item?.bridgeName,
    item?.bridge_name,
    item?.displayName,
    item?.display_name,
    item?.label,
    item?.title
  );

  if (!pid && !name) return null;
  if (!isPersonLikeNode(pid, name)) return null;

  return {
    pid: pid || `bridge-${name || "unknown"}`,
    name: normalizePersonName(name, "브리지"),
  };
}

function extractPresentedPathText(raw: any): string {
  const directText = pickFirstText(
    raw?.presentedPathText,
    raw?.presented_path_text,
    raw?.presentedPath,
    raw?.presented_path,
    raw?.summary?.presentedPathText,
    raw?.summary?.presented_path_text,
    raw?.summary?.presentedPath,
    raw?.summary?.presented_path,
    raw?.data?.presentedPathText,
    raw?.data?.presented_path_text,
    raw?.data?.presentedPath,
    raw?.data?.presented_path,
    raw?.result?.presentedPathText,
    raw?.result?.presented_path_text,
    raw?.result?.presentedPath,
    raw?.result?.presented_path
  );

  if (directText) return directText;

  const arrayCandidates = [
    ...toArray(raw?.presentedPath),
    ...toArray(raw?.presented_path),
    ...toArray(raw?.summary?.presentedPath),
    ...toArray(raw?.summary?.presented_path),
    ...toArray(raw?.data?.presentedPath),
    ...toArray(raw?.data?.presented_path),
    ...toArray(raw?.result?.presentedPath),
    ...toArray(raw?.result?.presented_path),
  ];

  if (arrayCandidates.length === 0) {
    return "";
  }

  const labels = arrayCandidates
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      return pickFirstText(
        (item as any).name,
        (item as any).label,
        (item as any).title,
        (item as any).displayName,
        (item as any).display_name,
        (item as any).targetName,
        (item as any).target_name,
        (item as any).pid
      );
    })
    .filter(Boolean);

  return labels.join(" → ");
}

function extractReachable(raw: any): boolean {
  const explicitNoPathSignals = [
    toText(raw?.userMessage),
    toText(raw?.message),
    toText(raw?.error),
    toText(raw?.errorMessage),
    toText(raw?.summary?.userMessage),
    toText(raw?.summary?.message),
    toText(raw?.summary?.error),
    toText(raw?.summary?.errorMessage),
    toText(raw?.data?.userMessage),
    toText(raw?.data?.message),
    toText(raw?.data?.error),
    toText(raw?.data?.errorMessage),
    toText(raw?.result?.userMessage),
    toText(raw?.result?.message),
    toText(raw?.result?.error),
    toText(raw?.result?.errorMessage),
  ];

  if (explicitNoPathSignals.some((message) => looksLikeNoPathMessage(message))) {
    return false;
  }

  const explicitFlags = [
    raw?.reachable,
    raw?.pathFound,
    raw?.path_found,
    raw?.summary?.reachable,
    raw?.summary?.pathFound,
    raw?.summary?.path_found,
    raw?.data?.reachable,
    raw?.data?.pathFound,
    raw?.data?.path_found,
    raw?.result?.reachable,
    raw?.result?.pathFound,
    raw?.result?.path_found,
  ];

  if (explicitFlags.some((value) => value === false)) {
    return false;
  }

  const presentedPathText = extractPresentedPathText(raw);
  if (presentedPathText.includes("→")) {
    return true;
  }

  const pathArrays = [
    raw?.path,
    raw?.summary?.path,
    raw?.data?.path,
    raw?.result?.path,
    raw?.nodes,
    raw?.summary?.nodes,
    raw?.data?.nodes,
    raw?.result?.nodes,
  ];

  return pathArrays.some((arr) => Array.isArray(arr) && arr.length > 1);
}

function normalizeChainNode(item: any): ChainNode | null {
  if (typeof item === "string") {
    const name = item.trim();
    if (!name) return null;

    if (!isPersonLikeNode("", name)) return null;

    return {
      pid: `node-${name}`,
      name,
      kind: "unknown",
    };
  }

  if (!item || typeof item !== "object") return null;

  const pid = pickFirstText(
    item?.pid,
    item?.personPid,
    item?.person_pid,
    item?.id,
    item?.nodeId,
    item?.node_id
  );

  const name = pickFirstText(
    item?.name,
    item?.personName,
    item?.person_name,
    item?.displayName,
    item?.display_name,
    item?.label,
    item?.title
  );

  if (!pid && !name) return null;
  if (!isPersonLikeNode(pid, name)) return null;

  const roleText = pickFirstText(
    item?.kind,
    item?.role,
    item?.type,
    item?.nodeType,
    item?.node_type
  ).toLowerCase();

  let kind: ChainNode["kind"] = "unknown";

  if (["me", "self", "source", "start"].includes(roleText)) {
    kind = "me";
  } else if (["target", "end", "destination"].includes(roleText)) {
    kind = "target";
  } else if (["bridge", "intermediate", "connector"].includes(roleText)) {
    kind = "bridge";
  }

  return {
    pid: pid || `node-${name || "unknown"}`,
    name: normalizePersonName(name, "연결점"),
    kind,
  };
}

function extractPathNodeCandidates(raw: any): unknown[] {
  const directNodeArrays = [
    ...toArray(raw?.path),
    ...toArray(raw?.nodes),
    ...toArray(raw?.summary?.path),
    ...toArray(raw?.summary?.nodes),
    ...toArray(raw?.data?.path),
    ...toArray(raw?.data?.nodes),
    ...toArray(raw?.result?.path),
    ...toArray(raw?.result?.nodes),
  ];

  if (directNodeArrays.length > 0) {
    return directNodeArrays;
  }

  const segmentArrays = [
    ...toArray(raw?.segments),
    ...toArray(raw?.summary?.segments),
    ...toArray(raw?.data?.segments),
    ...toArray(raw?.result?.segments),
  ];

  if (segmentArrays.length === 0) {
    return [];
  }

  const nodes: unknown[] = [];

  for (const segment of segmentArrays) {
    if (!segment || typeof segment !== "object") continue;

    const fromCandidate =
      (segment as any).from ??
      (segment as any).source ??
      (segment as any).start ??
      (segment as any).fromNode ??
      (segment as any).from_node;

    const toCandidate =
      (segment as any).to ??
      (segment as any).target ??
      (segment as any).end ??
      (segment as any).toNode ??
      (segment as any).to_node;

    if (fromCandidate) nodes.push(fromCandidate);
    if (toCandidate) nodes.push(toCandidate);
  }

  return nodes;
}

function dedupeChainNodes(nodes: ChainNode[]) {
  const result: ChainNode[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const key = `${node.pid}::${node.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(node);
  }

  return result;
}

function extractChainNodes(
  raw: any,
  fallbackTargetPid: string,
  fallbackTargetName: string
): ChainNode[] {
  const nodeCandidates = extractPathNodeCandidates(raw);

  const normalizedNodes = dedupeChainNodes(
    nodeCandidates.map(normalizeChainNode).filter(Boolean) as ChainNode[]
  );

  if (normalizedNodes.length > 0) {
    const lastIndex = normalizedNodes.length - 1;

    return normalizedNodes.map((node, index) => {
      if (index === 0 && node.kind === "unknown") {
        return { ...node, kind: "me" };
      }

      if (index === lastIndex && node.kind === "unknown") {
        return { ...node, kind: "target" };
      }

      if (index > 0 && index < lastIndex && node.kind === "unknown") {
        return { ...node, kind: "bridge" };
      }

      return node;
    });
  }

  const previewText = extractPresentedPathText(raw);

  if (previewText.includes("→")) {
    const previewNodes = previewText
      .split("→")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((name, index, list) => ({
        pid: `path-${index}-${name}`,
        name,
        kind:
          index === 0
            ? ("me" as const)
            : index === list.length - 1
            ? ("target" as const)
            : ("bridge" as const),
      }))
      .filter((node) => isPersonLikeNode(node.pid, node.name));

    return previewNodes;
  }

  if (fallbackTargetPid || fallbackTargetName) {
    const fallbackNode = {
      pid: fallbackTargetPid || `target-${fallbackTargetName}`,
      name: fallbackTargetName || fallbackTargetPid || "타겟",
      kind: "target" as const,
    };

    return isPersonLikeNode(fallbackNode.pid, fallbackNode.name)
      ? [fallbackNode]
      : [];
  }

  return [];
}

function extractBridgeList(raw: any): BridgePerson[] {
  const explicitBridgeCandidates = [
    ...toArray(raw?.bridges),
    ...toArray(raw?.bridgePeople),
    ...toArray(raw?.bridge_people),
    ...toArray(raw?.summary?.bridges),
    ...toArray(raw?.summary?.bridgePeople),
    ...toArray(raw?.summary?.bridge_people),
    ...toArray(raw?.data?.bridges),
    ...toArray(raw?.data?.bridgePeople),
    ...toArray(raw?.data?.bridge_people),
    ...toArray(raw?.result?.bridges),
    ...toArray(raw?.result?.bridgePeople),
    ...toArray(raw?.result?.bridge_people),
  ];

  const explicitBridges = explicitBridgeCandidates
    .map(mapPersonCandidate)
    .filter(Boolean) as BridgePerson[];

  if (explicitBridges.length > 0) {
    return dedupeBridgeList(explicitBridges).slice(0, 4);
  }

  const chainNodes = extractChainNodes(raw, "", "");

  if (chainNodes.length >= 3) {
    const derivedBridges = chainNodes
      .slice(1, -1)
      .filter((node) => node.kind === "bridge")
      .map((node) => ({ pid: node.pid, name: node.name }));

    return dedupeBridgeList(derivedBridges).slice(0, 4);
  }

  return [];
}

function buildPathPreviewText(
  raw: any,
  chainNodes: ChainNode[],
  fallbackTargetName: string
) {
  const directText = extractPresentedPathText(raw);

  if (directText) {
    const filteredNames = directText
      .split("→")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((name) => isPersonLikeNode("", name));

    if (filteredNames.length > 0) {
      return filteredNames.join(" → ");
    }
  }

  if (chainNodes.length > 1) {
    return chainNodes.map((node) => node.name).join(" → ");
  }

  return fallbackTargetName ? `나 → ${fallbackTargetName}` : "";
}

function buildViewModel(
  raw: any,
  fallbackTargetPid: string,
  fallbackTargetName: string
): DiscoverViewModel {
  const targetPid = pickFirstText(
    raw?.targetPid,
    raw?.target_pid,
    raw?.summary?.targetPid,
    raw?.summary?.target_pid,
    raw?.data?.targetPid,
    raw?.data?.target_pid,
    raw?.result?.targetPid,
    raw?.result?.target_pid,
    fallbackTargetPid
  );

  const targetName = pickFirstText(
    raw?.targetName,
    raw?.target_name,
    raw?.summary?.targetName,
    raw?.summary?.target_name,
    raw?.data?.targetName,
    raw?.data?.target_name,
    raw?.result?.targetName,
    raw?.result?.target_name,
    fallbackTargetName
  );

  const reachable = extractReachable(raw);
  const chainNodes = reachable
    ? extractChainNodes(raw, fallbackTargetPid, fallbackTargetName)
    : [];
  const bridges = reachable ? extractBridgeList(raw) : [];
  const pathPreviewText = reachable
    ? buildPathPreviewText(raw, chainNodes, targetName || fallbackTargetName)
    : "";

  const stepCount =
    chainNodes.length > 1 ? chainNodes.length - 1 : reachable ? 0 : 0;

  return {
    reachable,
    targetPid,
    targetName: targetName || fallbackTargetName || targetPid,
    stepCount,
    bridges,
    pathPreviewText,
    chainNodes,
    raw,
  };
}

function AvatarTile({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();

  const sizeClass =
    size === "sm"
      ? "h-10 w-10 rounded-xl text-sm"
      : size === "lg"
      ? "h-16 w-16 rounded-[20px] text-2xl"
      : "h-12 w-12 rounded-2xl text-lg";

  return (
    <div
      className={`flex items-center justify-center bg-white font-semibold text-neutral-800 shadow-sm ring-1 ring-black/8 ${sizeClass}`}
    >
      {initial}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-neutral-950 px-5 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-neutral-300"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-white px-5 text-[15px] font-semibold text-neutral-900 shadow-sm ring-1 ring-black/8 transition active:scale-[0.99]"
    >
      {children}
    </button>
  );
}

function StatusChip({ reachable }: { reachable: boolean }) {
  return reachable ? (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
      <span>🟢</span>
      <span>경로 있음</span>
    </div>
  ) : (
    <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
      <span>🟠</span>
      <span>경로 없음</span>
    </div>
  );
}

function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto h-[calc(100dvh-16px)] max-h-[844px] w-full max-w-[390px] rounded-[32px] border border-black/10 bg-[#f3f3f1] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
      <div className="flex h-full w-full overflow-hidden rounded-[28px] border border-black/8 bg-[#f7f7f5]">
        {children}
      </div>
    </div>
  );
}

function CompactInputCard({
  targetPid,
  targetName,
  loading,
  onTargetPidChange,
  onTargetNameChange,
  onSubmit,
}: {
  targetPid: string;
  targetName: string;
  loading: boolean;
  onTargetPidChange: (value: string) => void;
  onTargetNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="border-b border-black/6 bg-white px-4 py-3">
      <div className="mb-2">
        <div className="text-sm font-semibold text-neutral-900">타겟 설정</div>
        <div className="mt-1 text-[11px] text-neutral-500">
          실제 사람 기준으로 연결 경로를 확인해요
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-neutral-500">
            target pid
          </label>
          <input
            value={targetPid}
            onChange={(e) => onTargetPidChange(e.target.value)}
            placeholder="예: celeb:jay-y-lee"
            className="h-10 w-full rounded-2xl border-0 bg-neutral-100 px-4 text-sm text-neutral-900 outline-none ring-1 ring-black/6 placeholder:text-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-neutral-500">
            target name
          </label>
          <input
            value={targetName}
            onChange={(e) => onTargetNameChange(e.target.value)}
            placeholder="예: 이재용"
            className="h-10 w-full rounded-2xl border-0 bg-neutral-100 px-4 text-sm text-neutral-900 outline-none ring-1 ring-black/6 placeholder:text-neutral-400"
          />
        </div>

        <PrimaryButton onClick={onSubmit} disabled={loading}>
          {loading ? "확인 중..." : "경로 확인"}
        </PrimaryButton>
      </div>
    </section>
  );
}

function EmptyStateCard({ onStart }: { onStart: () => void }) {
  return (
    <section className="px-4 py-4">
      <div className="rounded-[28px] border border-black/8 bg-white px-5 py-7 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-neutral-100 text-3xl">
          📱
        </div>

        <div className="mt-4 text-[18px] font-semibold text-neutral-950">
          모바일 Path 시작
        </div>

        <div className="mt-2 text-sm leading-6 text-neutral-500">
          기관이 아니라
          <br />
          실제 사람 기준으로 연결 여부를 확인하세요.
        </div>

        <div className="mt-5">
          <PrimaryButton onClick={onStart}>경로 확인하기</PrimaryButton>
        </div>
      </div>
    </section>
  );
}

function CompactFailureCard({
  targetName,
  targetPid,
}: {
  targetName: string;
  targetPid: string;
}) {
  return (
    <section className="px-4 py-4">
      <div className="rounded-[30px] border border-black/8 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <StatusChip reachable={false} />
          <div className="text-lg">🧭</div>
        </div>

        <div className="mt-4 flex flex-col items-center text-center">
          <AvatarTile name={targetName || targetPid || "?"} size="lg" />

          <div className="mt-3 text-[10px] tracking-[0.18em] text-neutral-400">
            TARGET
          </div>

          <div className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-neutral-950">
            {targetName || "이름 없음"}
          </div>

          <div className="mt-1 max-w-full truncate text-sm text-neutral-500">
            {targetPid || "target pid 없음"}
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-black/6 bg-neutral-50 px-4 py-3.5">
          <div className="text-center text-[11px] text-neutral-500">현재 상태</div>
          <div className="mt-1 text-center text-4xl font-semibold tracking-tight text-neutral-950">
            0
          </div>
          <div className="mt-1 text-center text-sm text-neutral-500">
            아직 연결 가능한 사람 경로가 없어요
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-black/6 bg-neutral-50 px-4 py-3.5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-white text-2xl shadow-sm ring-1 ring-black/6">
            🧩
          </div>

          <div className="mt-3 text-lg font-semibold text-neutral-950">
            아직 연결 없음
          </div>

          <div className="mt-1 text-sm leading-6 text-neutral-500">
            내 던바의 수 안 사람들을 더 입력하면
            <br />
            소개 가능한 실제 사람 경로가 늘어나요.
          </div>
        </div>
      </div>
    </section>
  );
}

function BridgeSummaryCard({ bridges }: { bridges: BridgePerson[] }) {
  const mainBridge = bridges[0] ?? null;
  const extraBridges = bridges.slice(1);

  if (!mainBridge) {
    return (
      <div className="rounded-2xl bg-white px-4 py-4 text-sm leading-7 text-neutral-500 shadow-sm ring-1 ring-black/6">
        아직 첫 연결 사람을 특정하지 못했어요. 사람 중심 경로만 보여줘요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <AvatarTile name={mainBridge.name} />
          </div>

          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <div className="truncate text-base font-semibold text-neutral-900">
                {mainBridge.name}
              </div>
              <div className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                첫 연결
              </div>
            </div>

            <div className="mt-1 text-sm leading-6 text-neutral-600">
              먼저 부탁하거나 소개 가능성을 확인할 실제 사람
            </div>
          </div>
        </div>
      </div>

      {extraBridges.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {extraBridges.map((bridge, index) => (
            <div
              key={`${bridge.pid}-${bridge.name}`}
              className="rounded-full bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-black/6"
            >
              {index === extraBridges.length - 1 ? "핵심 " : ""}
              {bridge.name}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChainMeaningCard({
  chainNodes,
  pathPreviewText,
}: {
  chainNodes: ChainNode[];
  pathPreviewText: string;
}) {
  const visibleNodes = chainNodes.slice(0, 5);

  if (!pathPreviewText && visibleNodes.length === 0) {
    return null;
  }

  const bridgeNodes = visibleNodes.filter((node) => node.kind === "bridge");
  const firstBridge = bridgeNodes[0] ?? null;
  const coreBridge =
    bridgeNodes.length >= 2
      ? bridgeNodes[bridgeNodes.length - 1]
      : bridgeNodes[0] ?? null;
  const targetNode =
    visibleNodes.find((node) => node.kind === "target") ??
    visibleNodes[visibleNodes.length - 1] ??
    null;

  return (
    <div className="mt-4 rounded-[24px] border border-black/6 bg-neutral-50 px-4 py-4">
      <div className="text-center text-[11px] text-neutral-500">
        사람 중심 연결 구조
      </div>

      <div className="mt-4 flex flex-col items-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="rounded-full bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/6">
            나
          </div>

          {firstBridge ? (
            <>
              <div className="text-sm text-neutral-400">→</div>
              <div className="flex flex-col items-center">
                <div className="rounded-full bg-white px-3 py-2 text-xs font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-300">
                  {firstBridge.name}
                </div>
                <div className="mt-1 text-[10px] font-medium text-neutral-500">
                  첫 연결
                </div>
              </div>
            </>
          ) : null}
        </div>

        {coreBridge && coreBridge.pid !== firstBridge?.pid ? (
          <>
            <div className="mt-3 text-base leading-none text-neutral-300">↓</div>

            <div className="flex flex-col items-center">
              <div className="rounded-full bg-amber-100 px-5 py-3 text-sm font-semibold text-amber-800 shadow-[0_8px_20px_rgba(245,158,11,0.18)] ring-1 ring-amber-200">
                {coreBridge.name}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-amber-700">
                핵심 브리지
              </div>
            </div>
          </>
        ) : null}

        {targetNode ? (
          <>
            <div className="mt-3 text-base leading-none text-neutral-300">↓</div>

            <div className="rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm ring-1 ring-neutral-900">
              {targetNode.name}
            </div>
          </>
        ) : null}
      </div>

      {pathPreviewText ? (
        <div className="mt-4 rounded-2xl bg-white px-3 py-3 text-center text-sm leading-7 text-neutral-600 shadow-sm ring-1 ring-black/6">
          {pathPreviewText}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-center text-[12px] leading-6 text-neutral-500">
        학교·회사·기관은 배경 정보로만 쓰고
        <br />
        실제 사람 소개 체인만 보여줘요
      </div>
    </div>
  );
}

function CompactSuccessCard({
  targetName,
  targetPid,
  stepCount,
  bridges,
  pathPreviewText,
  chainNodes,
}: {
  targetName: string;
  targetPid: string;
  stepCount: number;
  bridges: BridgePerson[];
  pathPreviewText: string;
  chainNodes: ChainNode[];
}) {
  return (
    <section className="px-4 py-4">
      <div className="rounded-[30px] border border-black/8 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <StatusChip reachable />
          <div className="text-lg">🔗</div>
        </div>

        <div className="mt-4 flex flex-col items-center text-center">
          <AvatarTile name={targetName || targetPid || "?"} size="lg" />

          <div className="mt-3 text-[10px] tracking-[0.18em] text-neutral-400">
            TARGET
          </div>

          <div className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-neutral-950">
            {targetName || "이름 없음"}
          </div>

          <div className="mt-1 max-w-full truncate text-sm text-neutral-500">
            {targetPid || "target pid 없음"}
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-black/6 bg-neutral-50 px-4 py-3.5">
          <div className="text-center text-[11px] text-neutral-500">연결 단계</div>
          <div className="mt-1 text-center text-4xl font-semibold tracking-tight text-neutral-950">
            {stepCount > 0 ? stepCount : "-"}
          </div>
          <div className="mt-1 text-center text-sm text-neutral-500">
            실제 사람 기준 단계예요
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-black/6 bg-neutral-50 px-4 py-3.5">
          <div className="mb-3 text-center text-[11px] text-neutral-500">
            첫 연결과 핵심 브리지
          </div>

          <BridgeSummaryCard bridges={bridges} />
        </div>

        <ChainMeaningCard
          chainNodes={chainNodes}
          pathPreviewText={pathPreviewText}
        />
      </div>
    </section>
  );
}

function ScrollViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="min-h-full w-full">{children}</div>
    </div>
  );
}

function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-black/6 bg-[#f7f7f5] px-4 py-3">
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ActionSheet({
  open,
  firstBridgeName,
  coreBridgeName,
  onClose,
  onSavePath,
}: {
  open: boolean;
  firstBridgeName: string;
  coreBridgeName: string;
  onClose: () => void;
  onSavePath: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="시트 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />

      <div className="relative w-full max-w-[390px] rounded-t-[28px] bg-white px-4 pb-5 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300" />

        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            Path Action
          </div>
          <div className="mt-1 text-lg font-semibold text-neutral-950">
            소개 통로 보기
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-[22px] border border-black/6 bg-neutral-50 px-4 py-3">
            <div className="text-[11px] text-neutral-500">첫 연결</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">
              {firstBridgeName}
            </div>
            <div className="mt-1 text-sm leading-6 text-neutral-500">
              가장 먼저 부탁하거나 소개 가능성을 확인할 실제 사람
            </div>
          </div>

          <div className="rounded-[22px] border border-black/6 bg-neutral-50 px-4 py-3">
            <div className="text-[11px] text-neutral-500">핵심 브리지</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">
              {coreBridgeName}
            </div>
            <div className="mt-1 text-sm leading-6 text-neutral-500">
              타겟에 더 가까운 실제 사람 중심 연결점
            </div>
          </div>

          <button
            type="button"
            onClick={onSavePath}
            className="w-full rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white"
          >
            이 통로 저장
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MobilePathClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTargetPid = searchParams.get("targetPid") ?? "";
  const initialTargetName = searchParams.get("targetName") ?? "";

  const [targetPid, setTargetPid] = useState(initialTargetPid);
  const [targetName, setTargetName] = useState(initialTargetName);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [result, setResult] = useState<DiscoverViewModel | null>(null);
  const [submittedTargetPid, setSubmittedTargetPid] = useState("");
  const [submittedTargetName, setSubmittedTargetName] = useState("");
  const [showInputCard, setShowInputCard] = useState(() => !initialTargetPid);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [saveToast, setSaveToast] = useState("");

  const autoRequestedRef = useRef(false);

  const hasResult = !!result;
  const isReachable = !!result?.reachable;

  const cameFromHomeTarget = useMemo(() => {
    return !!normalizeTargetPid(initialTargetPid);
  }, [initialTargetPid]);

  const handleTargetPidChange = useCallback((value: string) => {
    setTargetPid(value);
    setResult(null);
    setErrorText("");
  }, []);

  const handleTargetNameChange = useCallback((value: string) => {
    setTargetName(value);
    setResult(null);
    setErrorText("");
  }, []);

  const discover = useCallback(async () => {
    const normalizedTargetPid = normalizeTargetPid(targetPid);
    const normalizedTargetName = normalizeTargetName(targetName);

    if (!normalizedTargetPid) {
      setErrorText("target pid를 넣어주세요.");
      setResult(null);
      setShowInputCard(true);
      return;
    }

    setLoading(true);
    setErrorText("");
    setTargetPid(normalizedTargetPid);
    setSubmittedTargetPid(normalizedTargetPid);
    setSubmittedTargetName(normalizedTargetName);

    try {
      const response = await fetch("/api/path/discover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUserId: FIXED_OWNER_USER_ID,
          targetPid: normalizedTargetPid,
        }),
      });

      const json = await response.json();

      if (!response.ok || json?.ok === false) {
        const message =
          toText(json?.userMessage) ||
          toText(json?.error) ||
          "경로를 확인하지 못했어요.";

        setErrorText(message);
        setResult(
          buildViewModel(
            {
              userMessage: message,
              targetPid: normalizedTargetPid,
              targetName: normalizedTargetName,
            },
            normalizedTargetPid,
            normalizedTargetName
          )
        );
        return;
      }

      const vm = buildViewModel(
        json,
        normalizedTargetPid,
        normalizedTargetName
      );

      setResult(vm);
    } catch {
      const message = "네트워크 오류가 발생했어요.";
      setErrorText(message);
      setResult(
        buildViewModel(
          {
            userMessage: message,
            targetPid: normalizedTargetPid,
            targetName: normalizedTargetName,
          },
          normalizedTargetPid,
          normalizedTargetName
        )
      );
    } finally {
      setLoading(false);
    }
  }, [targetPid, targetName]);

  useEffect(() => {
    const pidFromQuery = normalizeTargetPid(initialTargetPid);
    const nameFromQuery = normalizeTargetName(initialTargetName);

    if (!pidFromQuery) return;
    if (autoRequestedRef.current) return;

    autoRequestedRef.current = true;
    setTargetPid(pidFromQuery);
    setTargetName(nameFromQuery);
    setShowInputCard(false);
  }, [initialTargetPid, initialTargetName]);

  useEffect(() => {
    const pidFromQuery = normalizeTargetPid(initialTargetPid);

    if (!pidFromQuery) return;
    if (!autoRequestedRef.current) return;
    if (hasResult || loading) return;
    if (normalizeTargetPid(targetPid) !== pidFromQuery) return;

    discover();
  }, [initialTargetPid, targetPid, hasResult, loading, discover]);

  useEffect(() => {
    if (!saveToast) return;

    const timer = setTimeout(() => {
      setSaveToast("");
    }, 1800);

    return () => clearTimeout(timer);
  }, [saveToast]);

  const currentTargetName = useMemo(() => {
    if (result?.targetName) return result.targetName;
    if (submittedTargetName) return submittedTargetName;
    if (targetName.trim()) return normalizeTargetName(targetName);
    if (submittedTargetPid) return submittedTargetPid;
    if (targetPid.trim()) return normalizeTargetPid(targetPid);
    return "타겟";
  }, [result, submittedTargetName, targetName, submittedTargetPid, targetPid]);

  const currentTargetPid = useMemo(() => {
    if (result?.targetPid) return result.targetPid;
    if (submittedTargetPid) return submittedTargetPid;
    return normalizeTargetPid(targetPid);
  }, [result, submittedTargetPid, targetPid]);

  const primaryBridgeName = useMemo(() => {
    return result?.bridges?.[0]?.name || "사람 경로";
  }, [result]);

  const coreBridgeName = useMemo(() => {
    if (!result?.bridges?.length) return "핵심 브리지";
    return result.bridges[result.bridges.length - 1]?.name || "핵심 브리지";
  }, [result]);

  const primaryActionLabel = useMemo(() => {
    if (result?.bridges?.[0]?.name) {
      return `${result.bridges[0].name} 통해 연결 보기`;
    }

    return "사람 경로 보기";
  }, [result]);

  const topSummaryCard = cameFromHomeTarget && hasResult && !showInputCard;

  function handleSavePath() {
    const payload: SavedPathSummary = {
      targetName: currentTargetName,
      targetPid: currentTargetPid,
      firstBridgeName: primaryBridgeName,
      coreBridgeName,
    };

    try {
      const raw = window.localStorage.getItem("dunbar-link-saved-paths");
      const prev = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(prev) ? prev : [];

      next.unshift({
        ...payload,
        savedAt: Date.now(),
      });

      window.localStorage.setItem(
        "dunbar-link-saved-paths",
        JSON.stringify(next.slice(0, 20))
      );
      setSaveToast("통로를 저장했어요.");
    } catch {
      setSaveToast("저장은 안 됐지만 통로는 확인했어요.");
    }

    setActionSheetOpen(false);
  }

  return (
    <main className="flex min-h-screen justify-center bg-[#ececeb] px-2 py-2 text-neutral-950">
      <MobileShell>
        <div className="flex h-full w-full flex-col">
          <header className="border-b border-black/6 bg-[#f7f7f5] px-4 py-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-400">
              Mobile Path
            </div>

            <h1 className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-neutral-950">
              빠른 연결
            </h1>

            <p className="mt-2 text-sm leading-6 text-neutral-500">
              설명보다 행동.
              <br />
              실제 사람 소개 통로만 보여줘요.
            </p>
          </header>

          {topSummaryCard ? (
            <section className="border-b border-black/6 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                    HOME TARGET
                  </div>
                  <div className="mt-1 truncate text-base font-semibold text-neutral-950">
                    {currentTargetName}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {currentTargetPid}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowInputCard((prev) => !prev)}
                  className="shrink-0 rounded-full bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700 ring-1 ring-black/6"
                >
                  {showInputCard ? "입력 접기" : "다른 타겟"}
                </button>
              </div>
            </section>
          ) : null}

          {!topSummaryCard || showInputCard ? (
            <CompactInputCard
              targetPid={targetPid}
              targetName={targetName}
              loading={loading}
              onTargetPidChange={handleTargetPidChange}
              onTargetNameChange={handleTargetNameChange}
              onSubmit={discover}
            />
          ) : null}

          <ScrollViewport>
            {errorText && !hasResult ? (
              <div className="px-4 pt-4">
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorText}
                </div>
              </div>
            ) : null}

            {!hasResult ? <EmptyStateCard onStart={discover} /> : null}

            {hasResult && isReachable ? (
              <CompactSuccessCard
                targetName={currentTargetName}
                targetPid={currentTargetPid}
                stepCount={result?.stepCount ?? 0}
                bridges={result?.bridges ?? []}
                pathPreviewText={result?.pathPreviewText ?? ""}
                chainNodes={result?.chainNodes ?? []}
              />
            ) : null}

            {hasResult && !isReachable ? (
              <CompactFailureCard
                targetName={currentTargetName}
                targetPid={currentTargetPid}
              />
            ) : null}
          </ScrollViewport>

          {hasResult ? (
            <StickyActionBar>
              {isReachable ? (
                <>
                  <PrimaryButton
                    onClick={() => {
                      setActionSheetOpen(true);
                    }}
                  >
                    {primaryActionLabel}
                  </PrimaryButton>

                  <div className="grid grid-cols-2 gap-2">
                    <SecondaryButton
                      onClick={() => {
                        setShowInputCard((prev) => !prev);
                      }}
                    >
                      {showInputCard ? "입력 접기" : "다른 타겟"}
                    </SecondaryButton>

                    <SecondaryButton
                      onClick={() => {
                        router.push("/dashboard");
                      }}
                    >
                      홈으로
                    </SecondaryButton>
                  </div>
                </>
              ) : (
                <>
                  <PrimaryButton
                    onClick={() => {
                      router.push("/dashboard/people");
                    }}
                  >
                    인맥 추가
                  </PrimaryButton>

                  <div className="grid grid-cols-2 gap-2">
                    <SecondaryButton
                      onClick={() => {
                        setShowInputCard((prev) => !prev);
                      }}
                    >
                      {showInputCard ? "입력 접기" : "다른 타겟"}
                    </SecondaryButton>

                    <SecondaryButton
                      onClick={() => {
                        router.push("/dashboard");
                      }}
                    >
                      홈으로
                    </SecondaryButton>
                  </div>
                </>
              )}
            </StickyActionBar>
          ) : null}
        </div>
      </MobileShell>

      <ActionSheet
        open={actionSheetOpen}
        firstBridgeName={primaryBridgeName}
        coreBridgeName={coreBridgeName}
        onClose={() => setActionSheetOpen(false)}
        onSavePath={handleSavePath}
      />

      {saveToast ? (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {saveToast}
        </div>
      ) : null}
    </main>
  );
}