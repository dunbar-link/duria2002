export type ConnectableConfidence = "high" | "medium" | "low";
export type ConnectableSourceKind = "public_figure" | "general_person";
export type ConnectableCategory =
  | "business"
  | "sports"
  | "entertainment"
  | "culture"
  | "media"
  | "food"
  | "technology"
  | "finance"
  | "startup"
  | "public_service";

export type ConnectableRecommendationItem = {
  pid: string;
  name: string;
  score: number;
  reason: string;
  bridgeHint: string;
  confidence: ConnectableConfidence;
  sourceKind: ConnectableSourceKind;
  category: ConnectableCategory;
  imageUrl?: string | null;
  badge?: string | null;
};

type ConnectableSourceSeed = {
  pid: string;
  name: string;
  sourceKind: ConnectableSourceKind;
  category: ConnectableCategory;
  imageUrl?: string | null;
  badge?: string | null;
  signals: {
    bridgeStrength: number;
    socialProof: number;
    topicalMomentum: number;
    accessibility: number;
    trustFit: number;
  };
  bridgeHint: string;
};

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function scoreToConfidence(score: number): ConnectableConfidence {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function scoreToBadge(score: number): string | null {
  if (score >= 85) return "강추천";
  if (score >= 75) return "추천";
  return null;
}

function buildReason(seed: ConnectableSourceSeed, score: number): string {
  const { bridgeStrength, socialProof, topicalMomentum, accessibility, trustFit } =
    seed.signals;

  const reasonParts: string[] = [];

  if (bridgeStrength >= 75) {
    reasonParts.push("브리지 강도가 높습니다");
  }

  if (socialProof >= 75) {
    reasonParts.push("주변 연결 근거가 상대적으로 많습니다");
  }

  if (topicalMomentum >= 75) {
    reasonParts.push("현재 탐색 관심도가 높습니다");
  }

  if (accessibility >= 75) {
    reasonParts.push("초기 접근 가능성이 좋습니다");
  }

  if (trustFit >= 75) {
    reasonParts.push("현재 네트워크 성격과 잘 맞습니다");
  }

  if (reasonParts.length === 0) {
    if (score >= 75) {
      reasonParts.push("연결 가치가 높은 상위 후보입니다");
    } else if (score >= 60) {
      reasonParts.push("탐색 우선순위가 괜찮은 후보입니다");
    } else {
      reasonParts.push("확장 탐색용 후보입니다");
    }
  }

  return reasonParts.slice(0, 2).join(", ") + ".";
}

function calculateScore(seed: ConnectableSourceSeed): number {
  const { bridgeStrength, socialProof, topicalMomentum, accessibility, trustFit } =
    seed.signals;

  const weighted =
    bridgeStrength * 0.35 +
    trustFit * 0.2 +
    accessibility * 0.18 +
    socialProof * 0.17 +
    topicalMomentum * 0.1;

  return clampScore(weighted);
}

function stableHash(text: string): number {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
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

function getCategoryPenalty(
  selected: ConnectableRecommendationItem[],
  candidate: ConnectableRecommendationItem
): number {
  if (selected.length === 0) {
    return 0;
  }

  let penalty = 0;

  const last = selected[selected.length - 1];
  if (last.category === candidate.category) {
    penalty += 850;
  }

  const firstFour = selected.slice(0, 4);
  const sameCategoryCount = firstFour.filter(
    (item) => item.category === candidate.category
  ).length;

  if (selected.length < 4 && sameCategoryCount >= 1) {
    penalty += 600;
  }

  return penalty;
}

function getSourceKindPenalty(
  selected: ConnectableRecommendationItem[],
  candidate: ConnectableRecommendationItem
): number {
  if (selected.length === 0) {
    return 0;
  }

  const firstFour = selected.slice(0, 4);
  const publicCount = firstFour.filter(
    (item) => item.sourceKind === "public_figure"
  ).length;
  const generalCount = firstFour.filter(
    (item) => item.sourceKind === "general_person"
  ).length;

  if (selected.length < 4) {
    if (
      candidate.sourceKind === "public_figure" &&
      publicCount >= 2 &&
      generalCount === 0
    ) {
      return 650;
    }

    if (
      candidate.sourceKind === "general_person" &&
      generalCount >= 2 &&
      publicCount === 0
    ) {
      return 650;
    }
  }

  return 0;
}

function diversifyRecommendations(
  items: ConnectableRecommendationItem[],
  limit: number
): ConnectableRecommendationItem[] {
  const remaining = [...items];
  const selected: ConnectableRecommendationItem[] = [];
  const targetCount = Math.min(limit, remaining.length);

  while (selected.length < targetCount) {
    const bestIndex = remaining.reduce((bestSoFar, current, index) => {
      const best = remaining[bestSoFar];

      const currentScore =
        current.score * 1000 +
        getConfidenceWeight(current.confidence) * 100 +
        (stableHash(current.pid) % 97) -
        getCategoryPenalty(selected, current) -
        getSourceKindPenalty(selected, current);

      const bestScore =
        best.score * 1000 +
        getConfidenceWeight(best.confidence) * 100 +
        (stableHash(best.pid) % 97) -
        getCategoryPenalty(selected, best) -
        getSourceKindPenalty(selected, best);

      if (currentScore > bestScore) {
        return index;
      }

      if (currentScore === bestScore && current.score > best.score) {
        return index;
      }

      return bestSoFar;
    }, 0);

    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return selected;
}

const SOURCE_SEEDS: ConnectableSourceSeed[] = [
  {
    pid: "celeb:lee-jae-yong",
    name: "이재용",
    sourceKind: "public_figure",
    category: "business",
    bridgeHint: "삼성/산업 네트워크 인접 브리지",
    signals: {
      bridgeStrength: 95,
      socialProof: 84,
      topicalMomentum: 80,
      accessibility: 58,
      trustFit: 86,
    },
  },
  {
    pid: "celeb:son-heung-min",
    name: "손흥민",
    sourceKind: "public_figure",
    category: "sports",
    bridgeHint: "스포츠/미디어 인접 브리지",
    signals: {
      bridgeStrength: 84,
      socialProof: 92,
      topicalMomentum: 85,
      accessibility: 62,
      trustFit: 74,
    },
  },
  {
    pid: "celeb:iu",
    name: "아이유",
    sourceKind: "public_figure",
    category: "entertainment",
    bridgeHint: "엔터테인먼트/브랜드 인접 브리지",
    signals: {
      bridgeStrength: 78,
      socialProof: 89,
      topicalMomentum: 77,
      accessibility: 65,
      trustFit: 71,
    },
  },
  {
    pid: "celeb:baek-jong-won",
    name: "백종원",
    sourceKind: "public_figure",
    category: "food",
    bridgeHint: "외식/사업/방송 인접 브리지",
    signals: {
      bridgeStrength: 81,
      socialProof: 76,
      topicalMomentum: 69,
      accessibility: 72,
      trustFit: 79,
    },
  },
  {
    pid: "celeb:bts-rm",
    name: "RM",
    sourceKind: "public_figure",
    category: "culture",
    bridgeHint: "문화/글로벌 콘텐츠 브리지",
    signals: {
      bridgeStrength: 73,
      socialProof: 85,
      topicalMomentum: 74,
      accessibility: 60,
      trustFit: 70,
    },
  },
  {
    pid: "celeb:kim-yeon-koung",
    name: "김연경",
    sourceKind: "public_figure",
    category: "sports",
    bridgeHint: "스포츠/리더십 인접 브리지",
    signals: {
      bridgeStrength: 76,
      socialProof: 71,
      topicalMomentum: 66,
      accessibility: 67,
      trustFit: 77,
    },
  },
  {
    pid: "celeb:park-chan-wook",
    name: "박찬욱",
    sourceKind: "public_figure",
    category: "culture",
    bridgeHint: "영화/예술 네트워크 브리지",
    signals: {
      bridgeStrength: 68,
      socialProof: 70,
      topicalMomentum: 63,
      accessibility: 49,
      trustFit: 66,
    },
  },
  {
    pid: "celeb:han-kang",
    name: "한강",
    sourceKind: "public_figure",
    category: "culture",
    bridgeHint: "문학/출판 네트워크 브리지",
    signals: {
      bridgeStrength: 65,
      socialProof: 74,
      topicalMomentum: 67,
      accessibility: 45,
      trustFit: 69,
    },
  },
  {
    pid: "celeb:cho-jung-seok",
    name: "조정석",
    sourceKind: "public_figure",
    category: "entertainment",
    bridgeHint: "배우/콘텐츠 인접 브리지",
    signals: {
      bridgeStrength: 66,
      socialProof: 72,
      topicalMomentum: 61,
      accessibility: 57,
      trustFit: 68,
    },
  },
  {
    pid: "celeb:jang-do-yeon",
    name: "장도연",
    sourceKind: "public_figure",
    category: "media",
    bridgeHint: "예능/미디어 인접 브리지",
    signals: {
      bridgeStrength: 64,
      socialProof: 75,
      topicalMomentum: 62,
      accessibility: 63,
      trustFit: 65,
    },
  },
  {
    pid: "celeb:kim-beom-su",
    name: "김범수",
    sourceKind: "public_figure",
    category: "technology",
    bridgeHint: "기술/플랫폼 인접 브리지",
    signals: {
      bridgeStrength: 74,
      socialProof: 69,
      topicalMomentum: 60,
      accessibility: 58,
      trustFit: 78,
    },
  },
  {
    pid: "celeb:lee-soo-man",
    name: "이수만",
    sourceKind: "public_figure",
    category: "entertainment",
    bridgeHint: "엔터/프로듀싱 인접 브리지",
    signals: {
      bridgeStrength: 69,
      socialProof: 71,
      topicalMomentum: 59,
      accessibility: 48,
      trustFit: 67,
    },
  },
  {
    pid: "p:kim-hyun-soo",
    name: "김현수",
    sourceKind: "general_person",
    category: "startup",
    bridgeHint: "스타트업/실무 인접 브리지",
    signals: {
      bridgeStrength: 72,
      socialProof: 63,
      topicalMomentum: 58,
      accessibility: 77,
      trustFit: 73,
    },
  },
  {
    pid: "p:lee-so-jung",
    name: "이소정",
    sourceKind: "general_person",
    category: "media",
    bridgeHint: "브랜드/미디어 실무 브리지",
    signals: {
      bridgeStrength: 70,
      socialProof: 61,
      topicalMomentum: 57,
      accessibility: 79,
      trustFit: 71,
    },
  },
  {
    pid: "p:park-ji-hoon",
    name: "박지훈",
    sourceKind: "general_person",
    category: "finance",
    bridgeHint: "투자/재무 인접 브리지",
    signals: {
      bridgeStrength: 68,
      socialProof: 60,
      topicalMomentum: 54,
      accessibility: 76,
      trustFit: 72,
    },
  },
  {
    pid: "p:choi-yu-jin",
    name: "최유진",
    sourceKind: "general_person",
    category: "technology",
    bridgeHint: "제품/디자인 실무 브리지",
    signals: {
      bridgeStrength: 67,
      socialProof: 58,
      topicalMomentum: 55,
      accessibility: 80,
      trustFit: 70,
    },
  },
  {
    pid: "p:jung-ha-neul",
    name: "정하늘",
    sourceKind: "general_person",
    category: "public_service",
    bridgeHint: "공공/행정 인접 브리지",
    signals: {
      bridgeStrength: 66,
      socialProof: 57,
      topicalMomentum: 53,
      accessibility: 74,
      trustFit: 69,
    },
  },
  {
    pid: "p:oh-se-rin",
    name: "오세린",
    sourceKind: "general_person",
    category: "culture",
    bridgeHint: "전시/문화 실무 브리지",
    signals: {
      bridgeStrength: 65,
      socialProof: 56,
      topicalMomentum: 52,
      accessibility: 78,
      trustFit: 68,
    },
  },
  {
    pid: "p:han-min-jae",
    name: "한민재",
    sourceKind: "general_person",
    category: "business",
    bridgeHint: "사업개발/제휴 실무 브리지",
    signals: {
      bridgeStrength: 71,
      socialProof: 60,
      topicalMomentum: 56,
      accessibility: 75,
      trustFit: 74,
    },
  },
  {
    pid: "p:yoon-seo-jin",
    name: "윤서진",
    sourceKind: "general_person",
    category: "food",
    bridgeHint: "브랜드/외식 실무 브리지",
    signals: {
      bridgeStrength: 64,
      socialProof: 55,
      topicalMomentum: 51,
      accessibility: 77,
      trustFit: 67,
    },
  },
  {
    pid: "p:seo-hye-rin",
    name: "서혜린",
    sourceKind: "general_person",
    category: "entertainment",
    bridgeHint: "콘텐츠/공연 실무 브리지",
    signals: {
      bridgeStrength: 63,
      socialProof: 54,
      topicalMomentum: 52,
      accessibility: 79,
      trustFit: 66,
    },
  },
  {
    pid: "p:moon-ji-hwan",
    name: "문지환",
    sourceKind: "general_person",
    category: "sports",
    bridgeHint: "스포츠 마케팅 실무 브리지",
    signals: {
      bridgeStrength: 62,
      socialProof: 53,
      topicalMomentum: 50,
      accessibility: 76,
      trustFit: 65,
    },
  },
  {
    pid: "p:kang-da-sol",
    name: "강다솔",
    sourceKind: "general_person",
    category: "media",
    bridgeHint: "콘텐츠 제작/운영 브리지",
    signals: {
      bridgeStrength: 61,
      socialProof: 52,
      topicalMomentum: 49,
      accessibility: 78,
      trustFit: 64,
    },
  },
  {
    pid: "p:lim-ye-jun",
    name: "임예준",
    sourceKind: "general_person",
    category: "startup",
    bridgeHint: "초기 창업/투자 실무 브리지",
    signals: {
      bridgeStrength: 66,
      socialProof: 56,
      topicalMomentum: 54,
      accessibility: 74,
      trustFit: 68,
    },
  },
];

export function getConnectableRecommendations(
  ownerUserId: string,
  limit = 8
): ConnectableRecommendationItem[] {
  const ownerBias = (stableHash(ownerUserId || "anonymous") % 7) - 3;

  const scored = SOURCE_SEEDS.map((seed) => {
    const baseScore = calculateScore(seed);
    const adjustedScore = clampScore(baseScore + ownerBias);
    const confidence = scoreToConfidence(adjustedScore);

    return {
      pid: seed.pid,
      name: seed.name,
      score: adjustedScore,
      reason: buildReason(seed, adjustedScore),
      bridgeHint: seed.bridgeHint,
      confidence,
      sourceKind: seed.sourceKind,
      category: seed.category,
      imageUrl: seed.imageUrl ?? null,
      badge: seed.badge ?? scoreToBadge(adjustedScore),
    } satisfies ConnectableRecommendationItem;
  });

  const ranked = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const confidenceDiff =
      getConfidenceWeight(b.confidence) - getConfidenceWeight(a.confidence);

    if (confidenceDiff !== 0) return confidenceDiff;

    return a.name.localeCompare(b.name, "ko");
  });

  const diversified = diversifyRecommendations(
    ranked.slice(0, Math.max(limit * 4, limit)),
    Math.max(limit * 3, limit)
  );

  return diversified.slice(0, limit);
}