import type { ConnectableCandidateStateMap } from "./home-page-types";
import type {
  ConnectableCandidate,
  ConnectableCandidateSource,
  ConnectableCategory,
  ConnectableConfidence,
  ConnectableSourceKind,
} from "./connectable-candidate-types";

const EXPLORED_FULL_PENALTY_WINDOW_MS = 12 * 60 * 60 * 1000;
const DEFER_FULL_PENALTY_WINDOW_MS = 6 * 60 * 60 * 1000;
const DISMISSED_RECOVERY_WINDOW_MS = 48 * 60 * 60 * 1000;

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

function normalizeConfidence(
  confidence: ConnectableConfidence | null | undefined,
  score: number
): ConnectableConfidence {
  if (confidence === "high" || confidence === "medium" || confidence === "low") {
    return confidence;
  }

  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeSourceKind(
  sourceKind: ConnectableSourceKind | null | undefined
): ConnectableSourceKind {
  if (sourceKind === "general_person" || sourceKind === "public_figure") {
    return sourceKind;
  }

  return "public_figure";
}

function normalizeCategory(
  category: ConnectableCategory | null | undefined
): ConnectableCategory {
  switch (category) {
    case "business":
    case "sports":
    case "entertainment":
    case "culture":
    case "media":
    case "food":
    case "technology":
    case "finance":
    case "startup":
    case "public_service":
      return category;
    default:
      return "media";
  }
}

function normalizeCandidate(
  raw: ConnectableCandidateSource
): ConnectableCandidate | null {
  const pid = raw.pid?.trim();
  const name = raw.name?.trim();

  if (!pid || !name) {
    return null;
  }

  const score = clampScore(typeof raw.score === "number" ? raw.score : 0);

  return {
    pid,
    name,
    score,
    reason: normalizeText(raw.reason, "연결 가치가 높은 후보입니다."),
    bridgeHint: normalizeText(raw.bridgeHint, "브리지 정보 확인 가능"),
    confidence: normalizeConfidence(raw.confidence, score),
    sourceKind: normalizeSourceKind(raw.sourceKind),
    category: normalizeCategory(raw.category),
    imageUrl: raw.imageUrl ?? null,
    badge: raw.badge ?? null,
  };
}

function dedupeByPid(candidates: ConnectableCandidate[]): ConnectableCandidate[] {
  const map = new Map<string, ConnectableCandidate>();

  for (const candidate of candidates) {
    const existing = map.get(candidate.pid);

    if (!existing) {
      map.set(candidate.pid, candidate);
      continue;
    }

    if (candidate.score > existing.score) {
      map.set(candidate.pid, candidate);
    }
  }

  return Array.from(map.values());
}

function getConfidenceWeight(confidence: ConnectableConfidence): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 1;
  }
}

function stableHash(text: string): number {
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function buildUiMixScore(candidate: ConnectableCandidate): number {
  const scorePart = candidate.score * 1000;
  const confidencePart = getConfidenceWeight(candidate.confidence) * 100;
  const stableNoise = stableHash(candidate.pid) % 97;

  return scorePart + confidencePart + stableNoise;
}

function clampRatio(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getPenaltyProgress(
  startedAtMs: number,
  fullWindowMs: number,
  nowMs: number
): number {
  if (!Number.isFinite(startedAtMs)) {
    return 1;
  }

  const elapsed = Math.max(0, nowMs - startedAtMs);
  const ratio = 1 - elapsed / fullWindowMs;
  return clampRatio(ratio);
}

function getDismissedPenalty(
  dismissedUntilMs: number,
  nowMs: number
): number {
  if (!Number.isFinite(dismissedUntilMs)) {
    return -5000;
  }

  if (dismissedUntilMs > nowMs) {
    return -7000;
  }

  const elapsedAfterUnlock = nowMs - dismissedUntilMs;
  const recoveryRatio = 1 - elapsedAfterUnlock / DISMISSED_RECOVERY_WINDOW_MS;
  return Math.round(-2200 * clampRatio(recoveryRatio));
}

function getStatePenalty(
  candidate: ConnectableCandidate,
  stateMap?: ConnectableCandidateStateMap,
  nowMs = Date.now()
): number {
  if (!stateMap) {
    return 0;
  }

  const entityId = `connectable:${candidate.pid}`;
  const record = stateMap[entityId];

  if (!record) {
    return 0;
  }

  switch (record.status) {
    case "added_to_layer":
      return -100000;

    case "dismissed": {
      const dismissedUntilMs = record.dismissedUntil
        ? Date.parse(record.dismissedUntil)
        : Number.NaN;

      return getDismissedPenalty(dismissedUntilMs, nowMs);
    }

    case "deferred": {
      const deferredUntilMs = record.deferredUntil
        ? Date.parse(record.deferredUntil)
        : Number.NaN;

      if (Number.isFinite(deferredUntilMs) && deferredUntilMs > nowMs) {
        const remaining = deferredUntilMs - nowMs;
        const ratio = clampRatio(remaining / DEFER_FULL_PENALTY_WINDOW_MS);
        return Math.round(-2600 * ratio);
      }

      return 0;
    }

    case "explored": {
      const exploredAtMs = record.exploredAt
        ? Date.parse(record.exploredAt)
        : Number.NaN;

      const ratio = getPenaltyProgress(
        exploredAtMs,
        EXPLORED_FULL_PENALTY_WINDOW_MS,
        nowMs
      );

      return Math.round(-900 * ratio);
    }

    case "recommended":
    default:
      return 0;
  }
}

type RankedCandidateWithScore = {
  candidate: ConnectableCandidate;
  baseUiScore: number;
  finalUiScore: number;
};

function getCategoryRepeatPenalty(
  selected: RankedCandidateWithScore[],
  candidate: RankedCandidateWithScore
): number {
  if (selected.length === 0) {
    return 0;
  }

  let penalty = 0;
  const last = selected[selected.length - 1];

  if (last.candidate.category === candidate.candidate.category) {
    penalty += 900;
  }

  const firstFour = selected.slice(0, 4);
  const sameCategoryInFirstFour = firstFour.filter(
    (item) => item.candidate.category === candidate.candidate.category
  ).length;

  if (selected.length < 4 && sameCategoryInFirstFour >= 1) {
    penalty += 650;
  }

  return penalty;
}

function getSourceKindBalancePenalty(
  selected: RankedCandidateWithScore[],
  candidate: RankedCandidateWithScore
): number {
  if (selected.length === 0) {
    return 0;
  }

  const firstFour = selected.slice(0, 4);
  const publicCount = firstFour.filter(
    (item) => item.candidate.sourceKind === "public_figure"
  ).length;
  const generalCount = firstFour.filter(
    (item) => item.candidate.sourceKind === "general_person"
  ).length;

  if (selected.length < 4) {
    if (
      candidate.candidate.sourceKind === "public_figure" &&
      publicCount >= 2 &&
      generalCount === 0
    ) {
      return 700;
    }

    if (
      candidate.candidate.sourceKind === "general_person" &&
      generalCount >= 2 &&
      publicCount === 0
    ) {
      return 700;
    }
  }

  return 0;
}

function getDiversityPenalty(
  selected: RankedCandidateWithScore[],
  candidate: RankedCandidateWithScore
): number {
  return (
    getCategoryRepeatPenalty(selected, candidate) +
    getSourceKindBalancePenalty(selected, candidate)
  );
}

function diversifyCandidates(
  ranked: RankedCandidateWithScore[],
  limit: number
): RankedCandidateWithScore[] {
  const remaining = [...ranked];
  const selected: RankedCandidateWithScore[] = [];
  const targetCount = Math.min(limit, remaining.length);

  while (selected.length < targetCount) {
    const bestIndex = remaining.reduce((bestSoFar, current, index) => {
      const best = remaining[bestSoFar];
      const currentScore =
        current.finalUiScore - getDiversityPenalty(selected, current);
      const bestScore =
        best.finalUiScore - getDiversityPenalty(selected, best);

      if (currentScore > bestScore) {
        return index;
      }

      if (currentScore === bestScore && current.baseUiScore > best.baseUiScore) {
        return index;
      }

      return bestSoFar;
    }, 0);

    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return selected;
}

/**
 * 핵심 규칙
 * 1) 추천 자체는 score 중심
 * 2) 상태 히스토리를 반영한다
 * 3) 같은 카테고리/같은 종류 후보가 첫 화면에 몰리지 않게 한다
 * 4) 홈 추천이 쉽게 바닥나지 않도록 더 넓은 후보 풀에서 다양하게 선택한다
 */
export function rankConnectableCandidates(
  raws: ConnectableCandidateSource[],
  limit = 8,
  stateMap?: ConnectableCandidateStateMap
): ConnectableCandidate[] {
  const normalized = raws
    .map(normalizeCandidate)
    .filter((item): item is ConnectableCandidate => item !== null);

  const deduped = dedupeByPid(normalized);

  const ranked: RankedCandidateWithScore[] = deduped.map((candidate) => {
    const baseUiScore = buildUiMixScore(candidate);
    const penalty = getStatePenalty(candidate, stateMap);

    return {
      candidate,
      baseUiScore,
      finalUiScore: baseUiScore + penalty,
    };
  });

  const filtered = ranked
    .filter((item) => item.finalUiScore > -90000)
    .sort((a, b) => {
      const aBucket = Math.floor(a.candidate.score / 10);
      const bBucket = Math.floor(b.candidate.score / 10);

      if (bBucket !== aBucket) {
        return bBucket - aBucket;
      }

      if (b.finalUiScore !== a.finalUiScore) {
        return b.finalUiScore - a.finalUiScore;
      }

      if (b.baseUiScore !== a.baseUiScore) {
        return b.baseUiScore - a.baseUiScore;
      }

      return a.candidate.name.localeCompare(b.candidate.name, "ko");
    });

  const diversified = diversifyCandidates(
    filtered,
    Math.min(filtered.length, Math.max(limit * 2, limit))
  );

  return diversified.slice(0, limit).map((item) => item.candidate);
}

export function buildFallbackConnectableCandidates(): ConnectableCandidateSource[] {
  return [
    {
      pid: "celeb:lee-jae-yong",
      name: "이재용",
      score: 92,
      reason: "현재 네트워크 기준으로 연결 잠재력이 높습니다.",
      bridgeHint: "삼성 계열 인접 연결 2~3단계",
      confidence: "high",
      sourceKind: "public_figure",
      category: "business",
      badge: "추천",
    },
    {
      pid: "celeb:son-heung-min",
      name: "손흥민",
      score: 88,
      reason: "브리지 후보 수가 많아 연결 탐색 가치가 있습니다.",
      bridgeHint: "스포츠/미디어 인접 연결",
      confidence: "high",
      sourceKind: "public_figure",
      category: "sports",
    },
    {
      pid: "celeb:iu",
      name: "아이유",
      score: 84,
      reason: "대중 인지도 대비 경로 탐색 효율이 좋습니다.",
      bridgeHint: "엔터테인먼트 브리지 가능",
      confidence: "medium",
      sourceKind: "public_figure",
      category: "entertainment",
    },
    {
      pid: "celeb:baek-jong-won",
      name: "백종원",
      score: 79,
      reason: "사업/미디어 접점이 많아 탐색 우선도가 있습니다.",
      bridgeHint: "외식/방송 연결 후보",
      confidence: "medium",
      sourceKind: "public_figure",
      category: "food",
    },
    {
      pid: "celeb:bts-rm",
      name: "RM",
      score: 76,
      reason: "브랜드/문화권 접점이 높습니다.",
      bridgeHint: "문화/콘텐츠 연결 후보",
      confidence: "medium",
      sourceKind: "public_figure",
      category: "culture",
    },
    {
      pid: "celeb:kim-yeon-koung",
      name: "김연경",
      score: 73,
      reason: "스포츠 네트워크 기반 탐색 가치가 있습니다.",
      bridgeHint: "스포츠 인접 브리지",
      confidence: "medium",
      sourceKind: "public_figure",
      category: "sports",
    },
    {
      pid: "celeb:park-chan-wook",
      name: "박찬욱",
      score: 68,
      reason: "영화/예술 네트워크에서 경로 탐색 가능성이 있습니다.",
      bridgeHint: "콘텐츠 업계 브리지",
      confidence: "low",
      sourceKind: "public_figure",
      category: "culture",
    },
    {
      pid: "celeb:han-kang",
      name: "한강",
      score: 64,
      reason: "문화/출판 연결 측면에서 가치가 있습니다.",
      bridgeHint: "문학/출판 인접 연결",
      confidence: "low",
      sourceKind: "public_figure",
      category: "culture",
    },
    {
      pid: "p:kim-hyun-soo",
      name: "김현수",
      score: 72,
      reason: "실무형 네트워크 확장에 유리한 일반 후보입니다.",
      bridgeHint: "스타트업/실무 인접 브리지",
      confidence: "medium",
      sourceKind: "general_person",
      category: "startup",
    },
    {
      pid: "p:lee-so-jung",
      name: "이소정",
      score: 70,
      reason: "콘텐츠/브랜드 실무 연결 가능성이 있습니다.",
      bridgeHint: "브랜드/미디어 실무 브리지",
      confidence: "medium",
      sourceKind: "general_person",
      category: "media",
    },
    {
      pid: "p:park-ji-hoon",
      name: "박지훈",
      score: 69,
      reason: "비즈니스/재무 네트워크에서 활용 가치가 있습니다.",
      bridgeHint: "투자/재무 인접 브리지",
      confidence: "medium",
      sourceKind: "general_person",
      category: "finance",
    },
    {
      pid: "p:choi-yu-jin",
      name: "최유진",
      score: 67,
      reason: "제품/디자인 인접 연결 후보입니다.",
      bridgeHint: "제품/디자인 실무 브리지",
      confidence: "low",
      sourceKind: "general_person",
      category: "technology",
    },
  ];
}