import type { ExploreTeaserItem } from "../_components/dashboard-explore-teaser-stack";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";
const HOME_RECOMMENDATION_REQUEST_LIMIT = 8;

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

function extractReachable(raw: any): boolean {
  if (raw?.ok === false) {
    return false;
  }

  if (raw?.result?.ok === false) {
    return false;
  }

  const directStepCount =
    typeof raw?.stepCount === "number" && Number.isFinite(raw.stepCount)
      ? raw.stepCount
      : typeof raw?.result?.stepCount === "number" &&
          Number.isFinite(raw.result.stepCount)
        ? raw.result.stepCount
        : 0;

  if (directStepCount > 0) {
    return true;
  }

  const pathCandidates = [
    raw?.path,
    raw?.result?.path,
    raw?.bestPath?.people,
    raw?.result?.bestPath?.people,
  ];

  return pathCandidates.some((value) => Array.isArray(value) && value.length > 1);
}

function extractPersonStepCount(raw: any): number {
  const directStepCount =
    typeof raw?.stepCount === "number" && Number.isFinite(raw.stepCount)
      ? raw.stepCount
      : typeof raw?.result?.stepCount === "number" &&
          Number.isFinite(raw.result.stepCount)
        ? raw.result.stepCount
        : 0;

  if (directStepCount > 0) {
    return directStepCount;
  }

  const pathCandidates = [
    raw?.path,
    raw?.result?.path,
    raw?.bestPath?.people,
    raw?.result?.bestPath?.people,
  ];

  for (const value of pathCandidates) {
    if (Array.isArray(value) && value.length > 1) {
      return value.length - 1;
    }
  }

  return 0;
}


export function buildHomeRecommendationCandidates(): HomeRecommendationCandidate[] {
  return [
    {
      id: "jay-y-lee",
      targetPid: "celeb:jay-y-lee",
      targetName: "이재용",
      avatarEmoji: "🧥",
      priority: 98,
      sourceTag: "기업",
    },
    {
      id: "elon-musk",
      targetPid: "celeb:elon-musk",
      targetName: "Elon Musk",
      avatarEmoji: "⭐",
      priority: 96,
      sourceTag: "테크",
    },
    {
      id: "sundar-pichai",
      targetPid: "celeb:sundar-pichai",
      targetName: "Sundar Pichai",
      avatarEmoji: "💼",
      priority: 92,
      sourceTag: "테크",
    },
    {
      id: "sam-altman",
      targetPid: "celeb:sam-altman",
      targetName: "Sam Altman",
      avatarEmoji: "🧠",
      priority: 91,
      sourceTag: "AI",
    },
    {
      id: "mark-zuckerberg",
      targetPid: "celeb:mark-zuckerberg",
      targetName: "Mark Zuckerberg",
      avatarEmoji: "📘",
      priority: 88,
      sourceTag: "플랫폼",
    },
    {
      id: "satya-nadella",
      targetPid: "celeb:satya-nadella",
      targetName: "Satya Nadella",
      avatarEmoji: "🪟",
      priority: 87,
      sourceTag: "기업",
    },
    {
      id: "tim-cook",
      targetPid: "celeb:tim-cook",
      targetName: "Tim Cook",
      avatarEmoji: "🍎",
      priority: 86,
      sourceTag: "기업",
    },
    {
      id: "jensen-huang",
      targetPid: "celeb:jensen-huang",
      targetName: "Jensen Huang",
      avatarEmoji: "⚙️",
      priority: 85,
      sourceTag: "반도체",
    },
  ].slice(0, HOME_RECOMMENDATION_REQUEST_LIMIT);
}

function getRecommendationScore(stepCount: number, priority: number) {
  const closenessScore = Math.max(0, 12 - stepCount) * 100;
  return closenessScore + priority;
}

function mapCandidateToTeaserItem(
  candidate: HomeRecommendationCandidate,
  raw: any,
): ExploreTeaserItem | null {
  if (!extractReachable(raw)) {
    return null;
  }

  const stepCount =
    typeof raw?.stepCount === "number" && Number.isFinite(raw.stepCount)
      ? raw.stepCount
      : typeof raw?.result?.stepCount === "number" &&
          Number.isFinite(raw.result.stepCount)
        ? raw.result.stepCount
        : extractPersonStepCount(raw);

  if (!stepCount || stepCount <= 0) {
    return null;
  }

  const resolvedName =
    pickFirstText(
      raw?.targetName,
      raw?.target_name,
      raw?.summary?.targetName,
      raw?.summary?.target_name,
      raw?.data?.targetName,
      raw?.data?.target_name,
      raw?.result?.targetName,
      raw?.result?.target_name,
    ) || candidate.targetName;

  const firstConnectorName = pickFirstText(
    raw?.firstConnectorName,
    raw?.first_connector_name,
    raw?.result?.firstConnectorName,
    raw?.result?.first_connector_name,
    raw?.bestPath?.firstConnectorName,
    raw?.bestPath?.first_connector_name,
    raw?.result?.bestPath?.firstConnectorName,
    raw?.result?.bestPath?.first_connector_name,
  );

  const connectorLabel =
    firstConnectorName && firstConnectorName !== resolvedName
      ? `${firstConnectorName}을 통해 연결 가능`
      : "직접 연결 가능";

  return {
    id: candidate.id,
    name: resolvedName,
    hopsLabel: `${stepCount}단계`,
    connectorLabel,
    avatarEmoji: candidate.avatarEmoji,
    targetPid: candidate.targetPid,
    targetName: resolvedName,
    stepCount,
    score: getRecommendationScore(stepCount, candidate.priority),
    sourceTag: candidate.sourceTag,
  };
}

export async function fetchRecommendationForCandidate(
  candidate: HomeRecommendationCandidate,
): Promise<ExploreTeaserItem | null> {
  try {
    const response = await fetch("/api/path/discover", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerUserId: FIXED_OWNER_USER_ID,
        targetPid: candidate.targetPid,
      }),
    });

    const json = await response.json();

    if (!response.ok || json?.ok === false) {
      return null;
    }

    return mapCandidateToTeaserItem(candidate, json);
  } catch {
    return null;
  }
}


type HomeRecommendationCandidate = {
  id: string;
  targetPid: string;
  targetName: string;
  avatarEmoji: string;
  priority: number;
  sourceTag: string;
};