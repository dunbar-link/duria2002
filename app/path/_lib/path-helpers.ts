import type {
  DiscoverPathNode,
  SearchApiItem,
  SearchPerson,
} from "./path-types";

export function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (
    typeof value === "string" &&
    value.trim() &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value);
  }

  return null;
}

export function getErrorGuide(errorText: string, userMessage?: string) {
  const normalizedUserMessage = normalizeText(userMessage);
  if (normalizedUserMessage) return normalizedUserMessage;

  const raw = normalizeText(errorText).toUpperCase();

  if (!raw) return "경로를 다시 확인해주세요.";

  if (raw.includes("INSUFFICIENT_COINS")) {
    return "코인이 부족합니다. 테스트 계정 지갑을 충전한 뒤 다시 시도해주세요.";
  }

  if (raw.includes("WALLET") && raw.includes("NOT")) {
    return "지갑이 아직 없습니다. dl_wallets 에 테스트 지갑을 먼저 만들어주세요.";
  }

  if (raw.includes("TARGET")) {
    return "타겟 정보가 올바르지 않습니다. 다시 선택해주세요.";
  }

  if (raw.includes("PATH") && raw.includes("NOT")) {
    return "아직 연결 경로를 찾지 못했습니다. 내 인맥을 더 입력한 뒤 다시 시도해주세요.";
  }

  return errorText || "경로 탐색 중 오류가 발생했습니다.";
}

export function buildPathLine(path: DiscoverPathNode[]) {
  if (!Array.isArray(path) || path.length === 0) return "Path unavailable";
  return path.map((node) => node.name || "Unknown").join(" → ");
}

export function getLastPathNode(path: DiscoverPathNode[]) {
  if (!Array.isArray(path) || path.length === 0) return null;
  return path[path.length - 1] ?? null;
}

export function getTargetBadge(category: string) {
  const normalized = normalizeText(category).toLowerCase();

  if (normalized.includes("celeb")) return "Celebrity";
  if (normalized.includes("public")) return "Public Figure";
  if (normalized.includes("person")) return "Person";

  return category || "Target";
}

export function isNoPathMessage(message: string) {
  const raw = normalizeText(message).toUpperCase();

  if (!raw) return false;

  return (
    raw.includes("PATH") ||
    raw.includes("연결 경로를 찾지 못했습니다") ||
    raw.includes("아직 연결 경로를 찾지 못했습니다") ||
    raw.includes("내 인맥을 더 입력")
  );
}

export function getConfidenceTone(label: string) {
  const normalized = normalizeText(label).toLowerCase();

  if (normalized.includes("excellent")) {
    return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  }

  if (normalized.includes("good")) {
    return "bg-blue-100 text-blue-700 ring-blue-200";
  }

  if (normalized.includes("fair")) {
    return "bg-amber-100 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function slugifyFileName(value: string) {
  return (
    normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "dunbar-link-share"
  );
}

export function mapSearchItem(item: SearchApiItem): SearchPerson | null {
  const pid = normalizeText(item.pid);

  if (!pid) {
    return null;
  }

  const rawCategory = normalizeText(item.category);
  const derivedCategory =
    rawCategory ||
    (item.isCelebrity === true || item.is_celebrity === true
      ? "celebrity"
      : pid.startsWith("celeb:")
      ? "celebrity"
      : "person");

  return {
    pid,
    displayName:
      normalizeText(item.displayName) ||
      normalizeText(item.display_name) ||
      pid,
    category: derivedCategory,
    country: normalizeText(item.country) || undefined,
    city: item.city ?? null,
    company: item.company ?? null,
    school: item.school ?? null,
  };
}

export async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}