import {
  DiscoverErrorCode,
  DiscoverNode,
  DiscoverPathCandidate,
  DiscoverResult,
} from "./pathTypes";

type LooseRecord = Record<string, unknown>;

function pickString(row: LooseRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function pickNumber(
  row: LooseRecord,
  keys: string[],
  fallback: number | null = null
) {
  for (const key of keys) {
    const value = row?.[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim() &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }

  return fallback;
}

function pickBoolean(row: LooseRecord, keys: string[], fallback = false) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return fallback;
}

function safeRecordArray(value: unknown): LooseRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is LooseRecord =>
      typeof item === "object" && item !== null && !Array.isArray(item)
  );
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
    "region:",
    "city:",
    "district:",
    "team:",
    "group:",
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
    "center",
    "centre",
    "district",
    "city hall",
    "town hall",
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
    "지역",
    "지자체",
  ];

  return keywords.some((keyword) => text.includes(keyword));
}

function isPersonLikeNode(pid: string, name: string) {
  if (!pid.trim()) {
    return false;
  }

  if (!name.trim()) {
    return false;
  }

  return !looksLikeInstitutionPid(pid) && !looksLikeInstitutionName(name);
}

function mapNode(row: LooseRecord): DiscoverNode {
  const pid = pickString(row, ["pid", "personPid", "person_pid", "id"], "");
  const name = pickString(
    row,
    [
      "name",
      "display_name",
      "displayName",
      "personName",
      "person_name",
      "label",
    ],
    pid || "Unknown"
  );

  return {
    pid,
    name,
    city: pickString(row, ["city"], "") || null,
    school: pickString(row, ["school"], "") || null,
    company: pickString(row, ["company"], "") || null,
    isCelebrity:
      pickBoolean(row, ["isCelebrity", "is_celebrity"], false) ||
      pid.toLowerCase().startsWith("celeb:"),
  };
}

function buildConfidenceLabel(confidence: number | null, fallback: string) {
  if (fallback) return fallback;
  if (confidence === null) return "";
  if (confidence >= 85) return "Excellent Path";
  if (confidence >= 60) return "Good Path";
  if (confidence >= 35) return "Fair Path";
  return "Weak Path";
}

function classifyError(error: string, found: boolean) {
  const normalized = (error || "").trim().toUpperCase();

  if (!normalized && found) {
    return { code: "NONE" as DiscoverErrorCode, msg: "" };
  }

  if (!normalized && !found) {
    return {
      code: "PATH_NOT_FOUND" as DiscoverErrorCode,
      msg: "아직 연결 경로를 찾지 못했습니다. 내 인맥을 더 입력하거나 브리지 신호를 늘린 뒤 다시 시도해주세요.",
    };
  }

  if (normalized.includes("INSUFFICIENT_COINS")) {
    return {
      code: "INSUFFICIENT_COINS" as DiscoverErrorCode,
      msg: "코인이 부족합니다. 테스트 계정 지갑을 충전한 뒤 다시 시도해주세요.",
    };
  }

  if (
    normalized.includes("WALLET") &&
    (normalized.includes("NOT FOUND") ||
      normalized.includes("MISSING") ||
      normalized.includes("NO WALLET"))
  ) {
    return {
      code: "WALLET_NOT_FOUND" as DiscoverErrorCode,
      msg: "지갑이 아직 없습니다. 테스트 계정용 dl_wallets 행을 먼저 만들어주세요.",
    };
  }

  if (
    normalized.includes("TARGET") &&
    (normalized.includes("REQUIRED") ||
      normalized.includes("MISSING") ||
      normalized.includes("INVALID"))
  ) {
    return {
      code: "TARGET_REQUIRED" as DiscoverErrorCode,
      msg: "타겟 정보가 올바르지 않습니다. 추천 카드 또는 검색에서 다시 선택해주세요.",
    };
  }

  if (
    normalized.includes("NOT FOUND") ||
    normalized.includes("NO PATH") ||
    normalized.includes("PATH_NOT_FOUND") ||
    normalized.includes("FOUND=FALSE")
  ) {
    return {
      code: "PATH_NOT_FOUND" as DiscoverErrorCode,
      msg: "아직 연결 경로를 찾지 못했습니다. 내 인맥을 더 입력하거나 브리지 신호를 늘린 뒤 다시 시도해주세요.",
    };
  }

  return {
    code: "RPC_ERROR" as DiscoverErrorCode,
    msg: error || "경로 탐색 중 오류가 발생했습니다.",
  };
}

function safeNodeArray(value: unknown): DiscoverNode[] {
  const mapped = safeRecordArray(value)
    .map(mapNode)
    .filter((node) => isPersonLikeNode(node.pid, node.name));

  if (mapped.length === 0) {
    return [];
  }

  const deduped: DiscoverNode[] = [];
  const seen = new Set<string>();

  for (const node of mapped) {
    const key = `${node.pid}::${node.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(node);
  }

  return deduped;
}

function extractTierNumbers(candidate: LooseRecord): number[] {
  const directTierKeys = ["tiers", "edgeTiers", "edge_tiers"];

  for (const key of directTierKeys) {
    const value = candidate?.[key];
    if (Array.isArray(value)) {
      const numeric = value
        .map((item) => {
          if (typeof item === "number" && Number.isFinite(item)) {
            return item;
          }
          if (
            typeof item === "string" &&
            item.trim() &&
            !Number.isNaN(Number(item))
          ) {
            return Number(item);
          }
          return null;
        })
        .filter((item): item is number => item !== null);

      if (numeric.length > 0) {
        return numeric;
      }
    }
  }

  const edgeCollections = [
    candidate?.edges,
    candidate?.links,
    candidate?.segments,
  ];

  for (const collection of edgeCollections) {
    if (!Array.isArray(collection)) {
      continue;
    }

    const numeric = collection
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }

        return pickNumber(item as LooseRecord, ["tier", "cost", "weight"], null);
      })
      .filter((item): item is number => item !== null);

    if (numeric.length > 0) {
      return numeric;
    }
  }

  return [];
}

function buildPresentedPath(nodes: DiscoverNode[]) {
  return nodes.map((node) => node.name).join(" → ");
}

function getSourceNode(nodes: DiscoverNode[]) {
  return nodes.length > 0 ? nodes[0] : null;
}

function getTargetNode(nodes: DiscoverNode[]) {
  return nodes.length > 0 ? nodes[nodes.length - 1] : null;
}

function isValidFirstConnectorCandidate(params: {
  node: DiscoverNode | null;
  sourceNode: DiscoverNode | null;
  targetNode: DiscoverNode | null;
}) {
  const { node, sourceNode, targetNode } = params;

  if (!node) {
    return false;
  }

  if (!node.pid.trim() || !node.name.trim()) {
    return false;
  }

  if (!isPersonLikeNode(node.pid, node.name)) {
    return false;
  }

  if (sourceNode && node.pid === sourceNode.pid) {
    return false;
  }

  if (targetNode && node.pid === targetNode.pid) {
    return false;
  }

  return true;
}

function getFirstConnector(nodes: DiscoverNode[]) {
  const sourceNode = getSourceNode(nodes);
  const targetNode = getTargetNode(nodes);

  if (nodes.length <= 2) {
    return {
      firstConnectorPid: null,
      firstConnectorName: null,
      firstConnectorNode: null as DiscoverNode | null,
    };
  }

  for (let index = 1; index < nodes.length - 1; index += 1) {
    const candidate = nodes[index] ?? null;

    if (
      isValidFirstConnectorCandidate({
        node: candidate,
        sourceNode,
        targetNode,
      })
    ) {
      return {
        firstConnectorPid: candidate?.pid || null,
        firstConnectorName: candidate?.name || null,
        firstConnectorNode: candidate,
      };
    }
  }

  return {
    firstConnectorPid: null,
    firstConnectorName: null,
    firstConnectorNode: null as DiscoverNode | null,
  };
}

function buildFirstConnectorEvidence(node: DiscoverNode | null) {
  if (!node) {
    return null;
  }

  if (node.company) {
    return {
      type: "company" as const,
      label: `${node.company} 네트워크 연결`,
    };
  }

  if (node.school) {
    return {
      type: "school" as const,
      label: `${node.school} 기반 연결`,
    };
  }

  if (node.city) {
    return {
      type: "city" as const,
      label: `${node.city} 인접 네트워크`,
    };
  }

  return {
    type: "unknown" as const,
    label: "주변 연결 기반",
  };
}

function calculateCandidateScore(params: {
  stepCount: number;
  tierAverage: number | null;
  confidence: number | null;
  bottleneckTrust: number | null;
  avgTrust: number | null;
}) {
  const { stepCount, tierAverage, confidence, bottleneckTrust, avgTrust } = params;

  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    return Number(confidence.toFixed(1));
  }

  const normalizedBottleneck =
    typeof bottleneckTrust === "number" && Number.isFinite(bottleneckTrust)
      ? bottleneckTrust
      : 0;

  const normalizedAvgTrust =
    typeof avgTrust === "number" && Number.isFinite(avgTrust)
      ? avgTrust
      : 0;

  const tierBonus =
    typeof tierAverage === "number" && Number.isFinite(tierAverage)
      ? Math.max(0, 10 - tierAverage) * 2
      : 0;

  const stepPenalty = Math.max(stepCount - 1, 0) * 6;

  const computed =
    normalizedBottleneck * 55 +
    normalizedAvgTrust * 45 +
    tierBonus -
    stepPenalty;

  return Number(computed.toFixed(1));
}

function isUsableCandidate(candidate: DiscoverPathCandidate | null) {
  if (!candidate) {
    return false;
  }

  if (!Array.isArray(candidate.people) || candidate.people.length < 2) {
    return false;
  }

  const sourceNode = candidate.people[0] ?? null;
  const targetNode = candidate.people[candidate.people.length - 1] ?? null;

  if (!sourceNode || !targetNode) {
    return false;
  }

  if (candidate.people.length === 2) {
    return true;
  }

  return Boolean(candidate.firstConnectorPid && candidate.firstConnectorName);
}

function buildPathCandidate(candidate: LooseRecord): DiscoverPathCandidate | null {
  const people = safeNodeArray(
    candidate.path ?? candidate.nodes ?? candidate.people ?? []
  );

  if (people.length < 2) {
    return null;
  }

  const stepCount = Math.max(people.length - 1, 0);

  const tierNumbers = extractTierNumbers(candidate);
  const tierAverage =
    tierNumbers.length > 0
      ? tierNumbers.reduce((sum, value) => sum + value, 0) / tierNumbers.length
      : null;

  const candidateConfidence = pickNumber(
    candidate,
    ["confidence", "confidence_score"],
    null
  );

  const candidateBottleneck = pickNumber(
    candidate,
    ["bottleneckTrust", "bottleneck_trust"],
    null
  );

  const candidateAvgTrust = pickNumber(
    candidate,
    ["avgTrust", "avg_trust"],
    null
  );

  const score = calculateCandidateScore({
    stepCount,
    tierAverage,
    confidence: candidateConfidence,
    bottleneckTrust: candidateBottleneck,
    avgTrust: candidateAvgTrust,
  });

  const { firstConnectorPid, firstConnectorName, firstConnectorNode } =
    getFirstConnector(people);

  const firstConnectorEvidence = buildFirstConnectorEvidence(firstConnectorNode);

  return {
    people,
    stepCount,
    firstConnectorPid,
    firstConnectorName,
    firstConnectorEvidence,
    tierAverage,
    score,
    presentedPath: buildPresentedPath(people),
  };
}

function extractCandidateRecords(raw: LooseRecord): LooseRecord[] {
  const directKeys = [
    "allPaths",
    "all_paths",
    "paths",
    "candidates",
    "results",
    "pathCandidates",
    "path_candidates",
    "candidatePaths",
    "candidate_paths",
    "multiPaths",
    "multi_paths",
  ];

  for (const key of directKeys) {
    const records = safeRecordArray(raw?.[key]);
    if (records.length > 0) {
      return records;
    }
  }

  const nestedContainers = [
    raw?.result,
    raw?.data,
    raw?.payload,
    raw?.response,
    raw?.pathsMeta,
    raw?.path_meta,
  ];

  for (const container of nestedContainers) {
    if (!container || typeof container !== "object" || Array.isArray(container)) {
      continue;
    }

    const record = container as LooseRecord;

    for (const key of directKeys) {
      const records = safeRecordArray(record?.[key]);
      if (records.length > 0) {
        return records;
      }
    }
  }

  return [raw];
}

function sortPaths(paths: DiscoverPathCandidate[]) {
  return [...paths].sort((left, right) => {
    const leftHasConnector = Boolean(left.firstConnectorPid && left.firstConnectorName);
    const rightHasConnector = Boolean(
      right.firstConnectorPid && right.firstConnectorName
    );

    if (leftHasConnector !== rightHasConnector) {
      return leftHasConnector ? -1 : 1;
    }

    if (left.stepCount !== right.stepCount) {
      return left.stepCount - right.stepCount;
    }

    const leftScore =
      typeof left.score === "number" && Number.isFinite(left.score)
        ? left.score
        : -Infinity;
    const rightScore =
      typeof right.score === "number" && Number.isFinite(right.score)
        ? right.score
        : -Infinity;

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const leftTier =
      typeof left.tierAverage === "number" && Number.isFinite(left.tierAverage)
        ? left.tierAverage
        : Infinity;
    const rightTier =
      typeof right.tierAverage === "number" && Number.isFinite(right.tierAverage)
        ? right.tierAverage
        : Infinity;

    if (leftTier !== rightTier) {
      return leftTier - rightTier;
    }

    return left.presentedPath.localeCompare(right.presentedPath);
  });
}

function assignRecommendationTypes(paths: DiscoverPathCandidate[]) {
  if (paths.length === 0) {
    return [];
  }

  const assigned: DiscoverPathCandidate[] = paths.map((path) => ({
    ...path,
    recommendationType: "BACKUP",
  }));

  assigned[0] = {
    ...assigned[0],
    recommendationType: "PRIMARY",
  };

  let fastestIndex = -1;
  let strongestIndex = -1;

  for (let index = 0; index < assigned.length; index += 1) {
    const candidate = assigned[index];

    if (index !== 0) {
      if (
        fastestIndex === -1 ||
        candidate.stepCount < assigned[fastestIndex].stepCount ||
        (candidate.stepCount === assigned[fastestIndex].stepCount &&
          candidate.score > assigned[fastestIndex].score)
      ) {
        fastestIndex = index;
      }

      if (
        strongestIndex === -1 ||
        candidate.score > assigned[strongestIndex].score ||
        (candidate.score === assigned[strongestIndex].score &&
          candidate.stepCount < assigned[strongestIndex].stepCount)
      ) {
        strongestIndex = index;
      }
    }
  }

  if (assigned.length > 1) {
    assigned[1] = {
      ...assigned[1],
      recommendationType: "BALANCED",
    };
  }

  if (fastestIndex > 0) {
    assigned[fastestIndex] = {
      ...assigned[fastestIndex],
      recommendationType: "FASTEST",
    };
  }

  if (strongestIndex > 0) {
    assigned[strongestIndex] = {
      ...assigned[strongestIndex],
      recommendationType: "STRONGEST",
    };
  }

  return assigned;
}

export function mapRpcResult(raw: LooseRecord): DiscoverResult {
  const found = pickBoolean(raw, ["found"], false);
  const error = pickString(raw, ["error"], "");
  const errorMeta = classifyError(error, found);

  const sortedPaths = sortPaths(
    extractCandidateRecords(raw)
      .map((candidate) => buildPathCandidate(candidate))
      .filter((candidate): candidate is DiscoverPathCandidate =>
        isUsableCandidate(candidate)
      )
  );

  const allPaths = assignRecommendationTypes(sortedPaths);

  const bestPath = allPaths[0] ?? null;
  const confidence = pickNumber(raw, ["confidence", "confidence_score"], null);

  return {
    ok: found && errorMeta.code === "NONE",
    found,
    cost: pickNumber(raw, ["cost"], null),
    hops: pickNumber(raw, ["hops"], bestPath?.stepCount ?? null),
    avgTrust: pickNumber(raw, ["avgTrust", "avg_trust"], null),
    bottleneckTrust: pickNumber(
      raw,
      ["bottleneckTrust", "bottleneck_trust"],
      null
    ),
    confidence,
    confidenceLabel: buildConfidenceLabel(
      confidence,
      pickString(raw, ["confidenceLabel", "confidence_label"], "")
    ),
    error,
    errorCode: errorMeta.code,
    userMessage: errorMeta.msg,
    path: bestPath?.people ?? [],
    stepCount: bestPath?.stepCount ?? 0,
    firstConnectorPid: bestPath?.firstConnectorPid ?? null,
    firstConnectorName: bestPath?.firstConnectorName ?? null,
    firstConnectorEvidence: bestPath?.firstConnectorEvidence ?? null,
    tierAverage: bestPath?.tierAverage ?? null,
    score: bestPath?.score ?? null,
    presentedPathText: bestPath?.presentedPath ?? "",
    bestPath,
    allPaths,
  };
}