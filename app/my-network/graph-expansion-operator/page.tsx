"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type CandidateStatus =
  | "queued"
  | "reviewing"
  | "approved"
  | "rejected"
  | "seeded"
  | "archived";

type QualityLabel = "high" | "medium" | "low";

type SeedPriorityLabel = "high" | "medium" | "low";

type DuplicateLabel = "risky" | "safe";

type RecommendedAction = "approve" | "seed" | "reject" | "review";

type RiskLevel = "safe" | "review" | "dangerous";

type AutoSeedExecutionLog = {
  source?: string | null;
  mode?: string | null;
  decision?: string | null;
  reason?: string | null;
  executedAt?: string | null;
  targetPid?: string | null;
  targetName?: string | null;
  candidateId?: string | null;
  bridgePid?: string | null;
  bridgeName?: string | null;
  cost?: number | null;
  chargeAttempted?: boolean | null;
  chargeSuccess?: boolean | null;
  seedAttempted?: boolean | null;
  seedSuccess?: boolean | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  error?: string | null;
};

type AutoSeedMeta = {
  lastReason?: string | null;
  lastStatus?: string | null;
  lastAttemptedAt?: string | null;
};

type OperatorItem = {
  id: string;
  ownerUserId: string;
  status: CandidateStatus;
  targetPid: string;
  targetName: string;
  targetCategory: string | null;
  targetCountry: string | null;
  bridgePid: string | null;
  bridgeName: string | null;
  bridgeCity: string | null;
  bridgeSchool: string | null;
  bridgeCompany: string | null;
  qualityScore: number;
  qualityLabel: QualityLabel;
  seedImpactScore: number;
  seedPriorityLabel: SeedPriorityLabel;
  duplicateRisk: DuplicateLabel;
  recommendedAction: RecommendedAction;
  riskLevel: RiskLevel;
  dangerous: boolean;
  seedReady: boolean;
  autoSeed?: AutoSeedMeta | null;
  coinCost?: number | null;
  lastExecutionLog?: AutoSeedExecutionLog | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type OperatorResponse = {
  ok: boolean;
  ownerUserId: string;
  count: number;
  items: OperatorItem[];
};

type ViewFilter = "all" | "seed" | "skip" | "fail" | "pending";

type ReasonPresentation = {
  title: string;
  detail: string;
  tone: "seed" | "skip" | "fail" | "pending";
  raw: string | null;
};

type CoinPresentation = {
  label: string;
  detail: string;
  tone: "charged" | "free" | "failed" | "neutral";
  value: number | null;
};

type KpiTone = "default" | "seed" | "skip" | "fail" | "coin";

type RunMode = "preview" | "execute";

type AutoExecuteApiRow = {
  candidateId?: string;
  targetPid?: string;
  targetName?: string;
  status?: string;
  decision?: string;
  reason?: string;
  riskLevel?: string;
  recommendedAction?: string;
  priorityScore?: number;
  seedImpactScore?: number;
  seedReady?: boolean;
  executed?: boolean;
  chargeAttempted?: boolean;
  chargeSuccess?: boolean;
  seedAttempted?: boolean;
  seedSuccess?: boolean;
  coinCost?: number;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  error?: string | null;
};

type AutoExecuteApiResponse = {
  ok?: boolean;
  mode?: string;
  ownerUserId?: string;
  count?: number;
  decisions?: AutoExecuteApiRow[];
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeItem(raw: any): OperatorItem {
  return {
    id: String(raw.id ?? ""),
    ownerUserId: String(raw.ownerUserId ?? raw.owner_user_id ?? ""),
    status: String(raw.status ?? "queued") as CandidateStatus,
    targetPid: String(raw.targetPid ?? raw.target_pid ?? ""),
    targetName: String(raw.targetName ?? raw.target_name ?? "Unknown"),
    targetCategory:
      toNullableString(raw.targetCategory) ??
      toNullableString(raw.target_category),
    targetCountry:
      toNullableString(raw.targetCountry) ?? toNullableString(raw.target_country),
    bridgePid: toNullableString(raw.bridgePid) ?? toNullableString(raw.bridge_pid),
    bridgeName:
      toNullableString(raw.bridgeName) ?? toNullableString(raw.bridge_name),
    bridgeCity:
      toNullableString(raw.bridgeCity) ?? toNullableString(raw.bridge_city),
    bridgeSchool:
      toNullableString(raw.bridgeSchool) ?? toNullableString(raw.bridge_school),
    bridgeCompany:
      toNullableString(raw.bridgeCompany) ??
      toNullableString(raw.bridge_company),
    qualityScore: toNumber(raw.qualityScore ?? raw.quality_score),
    qualityLabel: String(
      raw.qualityLabel ?? raw.quality_label ?? "medium",
    ) as QualityLabel,
    seedImpactScore: toNumber(raw.seedImpactScore ?? raw.seed_impact_score),
    seedPriorityLabel: String(
      raw.seedPriorityLabel ?? raw.seed_priority_label ?? "medium",
    ) as SeedPriorityLabel,
    duplicateRisk: String(
      raw.duplicateRisk ?? raw.duplicate_risk ?? "safe",
    ) as DuplicateLabel,
    recommendedAction: String(
      raw.recommendedAction ?? raw.recommended_action ?? "review",
    ) as RecommendedAction,
    riskLevel: String(raw.riskLevel ?? raw.risk_level ?? "review") as RiskLevel,
    dangerous: toBoolean(raw.dangerous, false),
    seedReady: toBoolean(raw.seedReady ?? raw.seed_ready, false),
    autoSeed: raw.autoSeed ?? raw.auto_seed ?? null,
    coinCost: raw.coinCost ?? raw.coin_cost ?? null,
    lastExecutionLog: raw.lastExecutionLog ?? raw.last_execution_log ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getExecutionBucket(item: OperatorItem): "seed" | "skip" | "fail" | "pending" {
  const log = item.lastExecutionLog;
  const lastStatus = item.autoSeed?.lastStatus ?? null;
  const reason =
    log?.reason ?? log?.decision ?? item.autoSeed?.lastReason ?? null;

  if (item.status === "seeded") return "seed";

  if (log?.seedSuccess) return "seed";

  if (reason === "success") return "seed";

  if (
    reason === "already_seeded" ||
    reason === "duplicate_edge_reused" ||
    reason === "seed_not_ready"
  ) {
    return "skip";
  }

  if (
    log?.error ||
    reason === "seed_failed" ||
    reason === "charge_failed" ||
    reason === "rollback_failed" ||
    reason === "insufficient_balance" ||
    lastStatus === "failed"
  ) {
    return "fail";
  }

  return "pending";
}

function getBucketBadge(bucket: ReturnType<typeof getExecutionBucket>) {
  switch (bucket) {
    case "seed":
      return {
        label: "SEED",
        className:
          "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
      };
    case "skip":
      return {
        label: "SKIP",
        className:
          "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
      };
    case "fail":
      return {
        label: "FAIL",
        className: "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200",
      };
    default:
      return {
        label: "PENDING",
        className: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
      };
  }
}

function getRowTone(bucket: ReturnType<typeof getExecutionBucket>) {
  switch (bucket) {
    case "seed":
      return "bg-emerald-50/90 hover:bg-emerald-100/80 border-l-4 border-l-emerald-500";
    case "skip":
      return "bg-amber-50/90 hover:bg-amber-100/80 border-l-4 border-l-amber-500";
    case "fail":
      return "bg-rose-50/90 hover:bg-rose-100/80 border-l-4 border-l-rose-500";
    default:
      return "bg-white hover:bg-slate-50 border-l-4 border-l-slate-200";
  }
}

function getRiskBadgeClass(level: RiskLevel) {
  switch (level) {
    case "safe":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
    case "dangerous":
      return "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200";
    default:
      return "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
  }
}

function getActionBadgeClass(action: RecommendedAction) {
  switch (action) {
    case "seed":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
    case "approve":
      return "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200";
    case "reject":
      return "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
}

function getQualityBadgeClass(label: QualityLabel) {
  switch (label) {
    case "high":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
    case "low":
      return "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200";
    default:
      return "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
  }
}

function getDuplicateBadgeClass(label: DuplicateLabel) {
  switch (label) {
    case "safe":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
    default:
      return "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200";
  }
}

function getReasonToneClass(tone: ReasonPresentation["tone"]) {
  switch (tone) {
    case "seed":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
    case "skip":
      return "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
    case "fail":
      return "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
}

function getCoinToneClass(tone: CoinPresentation["tone"]) {
  switch (tone) {
    case "charged":
      return "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200";
    case "free":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
    case "failed":
      return "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
}

function getModeCardClass(mode: RunMode, selectedMode: RunMode) {
  const active = mode === selectedMode;

  if (mode === "preview") {
    return active
      ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200"
      : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40";
  }

  return active
    ? "border-rose-500 bg-rose-50 ring-2 ring-rose-200"
    : "border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/40";
}

function getFriendlyReason(item: OperatorItem): ReasonPresentation {
  const raw =
    item.lastExecutionLog?.reason ??
    item.lastExecutionLog?.decision ??
    item.autoSeed?.lastReason ??
    null;

  if (item.lastExecutionLog?.error) {
    return {
      title: "실행 중 오류 발생",
      detail: "서버 또는 실행 단계에서 에러가 발생했다. error 내용을 확인해야 한다.",
      tone: "fail",
      raw,
    };
  }

  if (item.status === "seeded" && !raw) {
    return {
      title: "이미 seed 완료 상태",
      detail: "현재 후보는 이미 seed 처리된 상태다.",
      tone: "seed",
      raw,
    };
  }

  switch (raw) {
    case "success":
      return {
        title: "정상 seed 완료",
        detail: "브리지 연결과 edge 생성이 정상적으로 완료되었다.",
        tone: "seed",
        raw,
      };

    case "duplicate_edge_reused":
      return {
        title: "기존 연결 재사용",
        detail: "동일하거나 중복된 edge가 이미 존재해서 새 연결을 만들지 않고 재사용했다.",
        tone: "skip",
        raw,
      };

    case "already_seeded":
      return {
        title: "이미 처리된 후보",
        detail: "이 후보는 이전에 seed 완료되어 이번 실행에서는 건너뛰었다.",
        tone: "skip",
        raw,
      };

    case "seed_not_ready":
      return {
        title: "아직 seed 불가",
        detail: "현재 데이터 또는 정책 조건상 바로 seed 하면 안 되는 상태다.",
        tone: "skip",
        raw,
      };

    case "rejected_by_policy":
      return {
        title: "정책 기준으로 보류",
        detail: "자동 실행 정책에 맞지 않아 운영자 검토가 필요하다.",
        tone: "skip",
        raw,
      };

    case "insufficient_balance":
      return {
        title: "코인 부족으로 실패",
        detail: "지갑 잔액이 부족해서 실행을 완료하지 못했다.",
        tone: "fail",
        raw,
      };

    case "charge_failed":
      return {
        title: "코인 차감 실패",
        detail: "seed 전에 필요한 코인 차감 처리에서 문제가 발생했다.",
        tone: "fail",
        raw,
      };

    case "seed_failed":
      return {
        title: "seed 실행 실패",
        detail: "실제 seed 또는 edge 생성 단계에서 실패했다.",
        tone: "fail",
        raw,
      };

    case "rollback_success":
      return {
        title: "실패 후 rollback 완료",
        detail: "중간 실패가 있었지만 금액 또는 상태가 정상적으로 되돌려졌다.",
        tone: "fail",
        raw,
      };

    case "rollback_failed":
      return {
        title: "rollback 실패",
        detail: "실패 후 복구까지 정상 처리되지 않아 즉시 점검이 필요하다.",
        tone: "fail",
        raw,
      };

    default: {
      const bucket = getExecutionBucket(item);

      if (bucket === "pending") {
        return {
          title: "아직 실행 전",
          detail: "자동 실행 결과가 아직 없거나 판단 대기 상태다.",
          tone: "pending",
          raw,
        };
      }

      return {
        title: raw ? `알 수 없는 사유 (${raw})` : "사유 정보 없음",
        detail: "정의되지 않은 reason 코드다. 백엔드 로그와 매핑 규칙을 확인해야 한다.",
        tone:
          bucket === "seed"
            ? "seed"
            : bucket === "skip"
              ? "skip"
              : bucket === "fail"
                ? "fail"
                : "pending",
        raw,
      };
    }
  }
}

function getCoinPresentation(item: OperatorItem): CoinPresentation {
  const reason =
    item.lastExecutionLog?.reason ??
    item.lastExecutionLog?.decision ??
    item.autoSeed?.lastReason ??
    null;

  const logCost =
    typeof item.lastExecutionLog?.cost === "number"
      ? item.lastExecutionLog.cost
      : typeof item.lastExecutionLog?.cost === "string"
        ? Number(item.lastExecutionLog.cost)
        : null;

  const rawValue =
    typeof item.coinCost === "number"
      ? item.coinCost
      : typeof item.coinCost === "string"
        ? Number(item.coinCost)
        : logCost;

  const coinValue =
    typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;

  if (reason === "charge_failed" || reason === "insufficient_balance") {
    return {
      label: "🪙 차감 실패",
      detail: coinValue && coinValue > 0 ? `예정 ${coinValue} coin` : "차감 불가",
      tone: "failed",
      value: coinValue,
    };
  }

  if (item.lastExecutionLog?.chargeSuccess && coinValue && coinValue > 0) {
    return {
      label: `🪙 -${coinValue} coin`,
      detail: "정상 차감",
      tone: "charged",
      value: coinValue,
    };
  }

  if (reason === "duplicate_edge_reused" || reason === "already_seeded") {
    return {
      label: "🪙 0 coin",
      detail: "기존 결과 재사용",
      tone: "free",
      value: 0,
    };
  }

  if (reason === "seed_not_ready" || reason === "rejected_by_policy") {
    return {
      label: "🪙 0 coin",
      detail: "실행 안 함",
      tone: "neutral",
      value: 0,
    };
  }

  if (coinValue === 0) {
    return {
      label: "🪙 0 coin",
      detail: "비용 없음",
      tone: "neutral",
      value: 0,
    };
  }

  if (coinValue && coinValue > 0) {
    return {
      label: `🪙 -${coinValue} coin`,
      detail: item.lastExecutionLog?.chargeAttempted ? "차감 시도됨" : "예상 비용",
      tone: item.lastExecutionLog?.chargeAttempted ? "charged" : "neutral",
      value: coinValue,
    };
  }

  return {
    label: "—",
    detail: "비용 정보 없음",
    tone: "neutral",
    value: null,
  };
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function StatCard(props: {
  title: string;
  value: string | number;
  subtext: string;
  tone?: KpiTone;
}) {
  const toneClass =
    props.tone === "seed"
      ? "bg-emerald-50 border-emerald-200"
      : props.tone === "skip"
        ? "bg-amber-50 border-amber-200"
        : props.tone === "fail"
          ? "bg-rose-50 border-rose-200"
          : props.tone === "coin"
            ? "bg-violet-50 border-violet-200"
            : "bg-white border-slate-200";

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", toneClass)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.title}
      </div>

      <div className="mt-2 text-3xl font-bold text-slate-900">{props.value}</div>

      <div className="mt-2 text-sm text-slate-600">{props.subtext}</div>
    </div>
  );
}

export default function GraphExpansionOperatorPage() {
  const [items, setItems] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [runMode, setRunMode] = useState<RunMode>("preview");
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<AutoExecuteApiResponse | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const response = await fetch(
        `/api/my-network/graph-expansion-operator?ownerUserId=${encodeURIComponent(
          FIXED_OWNER_USER_ID,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to load operator items: ${response.status}`);
      }

      const raw = (await response.json()) as OperatorResponse | { items?: any[] };

      const nextItems = Array.isArray((raw as any)?.items)
        ? (raw as any).items.map(normalizeItem)
        : [];

      setItems(nextItems);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error while loading data";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const bucket = getExecutionBucket(item);
      const reason = getFriendlyReason(item);
      const coin = getCoinPresentation(item);

      const matchesView =
        viewFilter === "all" ? true : getExecutionBucket(item) === viewFilter;

      const matchesStatus =
        statusFilter === "all" ? true : item.status === statusFilter;

      const keyword = searchText.trim().toLowerCase();

      const matchesSearch =
        keyword.length === 0
          ? true
          : [
              item.targetName,
              item.targetPid,
              item.bridgeName,
              item.bridgeCity,
              item.bridgeSchool,
              item.bridgeCompany,
              item.targetCategory,
              item.targetCountry,
              reason.title,
              reason.detail,
              reason.raw,
              coin.label,
              coin.detail,
              bucket,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(keyword));

      return matchesView && matchesStatus && matchesSearch;
    });
  }, [items, searchText, statusFilter, viewFilter]);

  const kpi = useMemo(() => {
    const seedItems = items.filter((item) => getExecutionBucket(item) === "seed");
    const skipItems = items.filter((item) => getExecutionBucket(item) === "skip");
    const failItems = items.filter((item) => getExecutionBucket(item) === "fail");
    const pendingItems = items.filter(
      (item) => getExecutionBucket(item) === "pending",
    );

    const completedCount =
      seedItems.length + skipItems.length + failItems.length;

    const successRate =
      completedCount === 0 ? 0 : (seedItems.length / completedCount) * 100;

    const totalCoinUsed = items.reduce((sum, item) => {
      const coin = getCoinPresentation(item);
      if (coin.tone === "charged" && typeof coin.value === "number") {
        return sum + coin.value;
      }
      return sum;
    }, 0);

    const chargedCount = items.filter((item) => {
      const coin = getCoinPresentation(item);
      return (
        coin.tone === "charged" &&
        typeof coin.value === "number" &&
        coin.value > 0
      );
    }).length;

    const avgCoinPerSeed =
      seedItems.length === 0 ? 0 : totalCoinUsed / seedItems.length;

    const failRate =
      completedCount === 0 ? 0 : (failItems.length / completedCount) * 100;

    return {
      total: items.length,
      seedCount: seedItems.length,
      skipCount: skipItems.length,
      failCount: failItems.length,
      pendingCount: pendingItems.length,
      successRate,
      failRate,
      totalCoinUsed,
      chargedCount,
      avgCoinPerSeed,
    };
  }, [items]);

  const previewSummary = useMemo(() => {
    const rows = Array.isArray(runResult?.decisions) ? runResult?.decisions : [];

    const seedCount = rows.filter(
      (row) => row.decision === "seed" || row.seedSuccess === true,
    ).length;

    const skipCount = rows.filter(
      (row) =>
        row.reason === "already_seeded" ||
        row.reason === "duplicate_edge_reused" ||
        row.reason === "seed_not_ready" ||
        row.decision === "skip",
    ).length;

    const failCount = rows.filter(
      (row) =>
        Boolean(row.error) ||
        row.reason === "seed_failed" ||
        row.reason === "charge_failed" ||
        row.reason === "rollback_failed" ||
        row.reason === "insufficient_balance",
    ).length;

    const totalCoin = rows.reduce((sum, row) => {
      const value = typeof row.coinCost === "number" ? row.coinCost : 0;
      return row.chargeSuccess ? sum + value : sum;
    }, 0);

    return {
      total: rows.length,
      seedCount,
      skipCount,
      failCount,
      totalCoin,
    };
  }, [runResult]);

  const runAutoExecute = useCallback(async () => {
    setRunLoading(true);
    setRunError(null);

    try {
      const response = await fetch(
        "/api/my-network/graph-expansion-operator/auto-execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerUserId: FIXED_OWNER_USER_ID,
            mode: runMode === "preview" ? "dry-run" : "execute",
          }),
        },
      );

      const raw = (await response.json()) as AutoExecuteApiResponse;

      if (!response.ok || raw?.ok === false) {
        throw new Error(
          typeof raw === "object" && raw && "message" in raw
            ? String((raw as any).message)
            : `Auto execute failed: ${response.status}`,
        );
      }

      setRunResult(raw);

      if (runMode === "execute") {
        void load();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error while running auto execute";
      setRunError(message);
      setRunResult(null);
    } finally {
      setRunLoading(false);
    }
  }, [load, runMode]);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1800px] px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Graph Expansion Operator
            </h1>

            <p className="mt-2 text-sm text-slate-600">Phase 5 Step 5-A</p>

            <p className="mt-1 text-sm text-slate-600">
              preview / execute 운영 모드를 분리한다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                void load();
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
              disabled={refreshing}
            >
              {refreshing ? "새로고침 중..." : "새로고침"}
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <StatCard
            title="전체 후보"
            value={kpi.total}
            subtext={`pending ${kpi.pendingCount}건`}
          />

          <StatCard
            title="SEED"
            value={kpi.seedCount}
            subtext="성공 또는 seed 완료"
            tone="seed"
          />

          <StatCard
            title="SKIP"
            value={kpi.skipCount}
            subtext="재사용 / 이미 처리 / 보류"
            tone="skip"
          />

          <StatCard
            title="FAIL"
            value={kpi.failCount}
            subtext={formatPercent(kpi.failRate)}
            tone="fail"
          />

          <StatCard
            title="성공률"
            value={formatPercent(kpi.successRate)}
            subtext="SEED / 완료 결과 기준"
            tone="seed"
          />

          <StatCard
            title="총 코인 사용"
            value={`🪙 ${kpi.totalCoinUsed}`}
            subtext="실제 차감 합계"
            tone="coin"
          />

          <StatCard
            title="차감 발생 건수"
            value={kpi.chargedCount}
            subtext="coin charged rows"
            tone="coin"
          />

          <StatCard
            title="평균 코인"
            value={
              kpi.seedCount === 0 ? "🪙 0" : `🪙 ${kpi.avgCoinPerSeed.toFixed(1)}`
            }
            subtext="seed 1건당 평균"
            tone="coin"
          />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">운영 모드</h2>
            <p className="mt-1 text-sm text-slate-600">
              preview 는 검토 전용이다. execute 는 실제 seed / 차감이 발생할 수 있다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <button
              type="button"
              onClick={() => setRunMode("preview")}
              className={cn(
                "rounded-2xl border p-5 text-left transition",
                getModeCardClass("preview", runMode),
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-bold text-slate-900">
                  Preview Mode
                </div>

                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-200">
                  dry-run
                </span>
              </div>

              <div className="mt-3 text-sm leading-6 text-slate-700">
                실제 데이터 변경 없이
                <br />
                어떤 후보가 seed / skip / fail 될지 미리 확인한다.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRunMode("execute")}
              className={cn(
                "rounded-2xl border p-5 text-left transition",
                getModeCardClass("execute", runMode),
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-bold text-slate-900">
                  Execute Mode
                </div>

                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800 ring-1 ring-inset ring-rose-200">
                  live execute
                </span>
              </div>

              <div className="mt-3 text-sm leading-6 text-slate-700">
                실제 auto-execute 를 수행한다.
                <br />
                seed 생성과 코인 차감이 반영될 수 있다.
              </div>
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runAutoExecute()}
              disabled={runLoading}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60",
                runMode === "preview"
                  ? "bg-sky-600 hover:bg-sky-500"
                  : "bg-rose-600 hover:bg-rose-500",
              )}
            >
              {runLoading
                ? runMode === "preview"
                  ? "Preview 실행 중..."
                  : "Execute 실행 중..."
                : runMode === "preview"
                  ? "Preview Run"
                  : "Execute Run"}
            </button>

            <div
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset",
                runMode === "preview"
                  ? "bg-sky-50 text-sky-800 ring-sky-200"
                  : "bg-rose-50 text-rose-800 ring-rose-200",
              )}
            >
              현재 모드: {runMode === "preview" ? "PREVIEW" : "EXECUTE"}
            </div>
          </div>

          {runError ? (
            <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {runError}
            </div>
          ) : null}

          {runResult ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                  결과 요약
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                  mode: {runResult.mode ?? "-"}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                  count: {previewSummary.total}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    seed
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-900">
                    {previewSummary.seedCount}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    skip
                  </div>
                  <div className="mt-2 text-2xl font-bold text-amber-900">
                    {previewSummary.skipCount}
                  </div>
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    fail
                  </div>
                  <div className="mt-2 text-2xl font-bold text-rose-900">
                    {previewSummary.failCount}
                  </div>
                </div>

                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                    coin
                  </div>
                  <div className="mt-2 text-2xl font-bold text-violet-900">
                    🪙 {previewSummary.totalCoin}
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-200">
                      <th className="px-3 py-2 font-semibold">타겟</th>
                      <th className="px-3 py-2 font-semibold">decision</th>
                      <th className="px-3 py-2 font-semibold">reason</th>
                      <th className="px-3 py-2 font-semibold">coin</th>
                      <th className="px-3 py-2 font-semibold">error</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(runResult.decisions ?? []).slice(0, 10).map((row, index) => (
                      <tr key={`${row.candidateId ?? "row"}-${index}`} className="border-b border-slate-100">
                        <td className="px-3 py-3 text-sm text-slate-800">
                          {row.targetName ?? row.targetPid ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-800">
                          {row.decision ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-800">
                          {row.reason ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-800">
                          {typeof row.coinCost === "number" ? `🪙 ${row.coinCost}` : "-"}
                        </td>
                        <td className="px-3 py-3 text-sm text-rose-700">
                          {row.error ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                검색
              </label>

              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="target / bridge / reason / coin 검색"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                결과 뷰
              </label>

              <select
                value={viewFilter}
                onChange={(event) => setViewFilter(event.target.value as ViewFilter)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="all">전체</option>
                <option value="seed">SEED</option>
                <option value="skip">SKIP</option>
                <option value="fail">FAIL</option>
                <option value="pending">PENDING</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                상태
              </label>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="all">전체</option>
                <option value="queued">queued</option>
                <option value="reviewing">reviewing</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="seeded">seeded</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                색상 범례
              </label>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  SEED
                </span>

                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                  SKIP
                </span>

                <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800 ring-1 ring-inset ring-rose-200">
                  FAIL
                </span>

                <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-200">
                  COIN
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-200">
                  <th className="px-4 py-3 font-semibold">결과</th>
                  <th className="px-4 py-3 font-semibold">타겟</th>
                  <th className="px-4 py-3 font-semibold">브리지</th>
                  <th className="px-4 py-3 font-semibold">추천</th>
                  <th className="px-4 py-3 font-semibold">리스크</th>
                  <th className="px-4 py-3 font-semibold">품질</th>
                  <th className="px-4 py-3 font-semibold">중복</th>
                  <th className="px-4 py-3 font-semibold">코인</th>
                  <th className="px-4 py-3 font-semibold">실행 사유</th>
                  <th className="px-4 py-3 font-semibold">마지막 실행</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      로딩 중...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-sm text-rose-600"
                    >
                      {error}
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      표시할 데이터가 없다.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const bucket = getExecutionBucket(item);
                    const bucketBadge = getBucketBadge(bucket);
                    const reason = getFriendlyReason(item);
                    const coin = getCoinPresentation(item);

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b border-slate-200 align-top transition-colors",
                          getRowTone(bucket),
                        )}
                      >
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <span
                              className={cn(
                                "inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-bold",
                                bucketBadge.className,
                              )}
                            >
                              {bucketBadge.label}
                            </span>

                            <span className="text-xs text-slate-500">
                              {item.status}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[220px]">
                            <div className="font-semibold text-slate-900">
                              {item.targetName}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              {item.targetPid}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.targetCategory ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                  {item.targetCategory}
                                </span>
                              ) : null}

                              {item.targetCountry ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                  {item.targetCountry}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[220px]">
                            <div className="font-semibold text-slate-900">
                              {item.bridgeName ?? "-"}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.bridgeCity ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                  도시 {item.bridgeCity}
                                </span>
                              ) : null}

                              {item.bridgeSchool ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                  학교 {item.bridgeSchool}
                                </span>
                              ) : null}

                              {item.bridgeCompany ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                  회사 {item.bridgeCompany}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[100px]">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                getActionBadgeClass(item.recommendedAction),
                              )}
                            >
                              {item.recommendedAction}
                            </span>

                            <div className="mt-2 text-xs text-slate-500">
                              seedReady: {item.seedReady ? "yes" : "no"}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[110px]">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                getRiskBadgeClass(item.riskLevel),
                              )}
                            >
                              {item.riskLevel}
                            </span>

                            <div className="mt-2 text-xs text-slate-500">
                              dangerous: {item.dangerous ? "yes" : "no"}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[110px]">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                getQualityBadgeClass(item.qualityLabel),
                              )}
                            >
                              {item.qualityLabel}
                            </span>

                            <div className="mt-2 text-sm font-semibold text-slate-900">
                              {item.qualityScore}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[110px]">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                getDuplicateBadgeClass(item.duplicateRisk),
                              )}
                            >
                              {item.duplicateRisk}
                            </span>

                            <div className="mt-2 text-xs text-slate-500">
                              impact: {item.seedImpactScore}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[190px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
                                  getCoinToneClass(coin.tone),
                                )}
                              >
                                {coin.label}
                              </span>
                            </div>

                            <div className="mt-3 text-sm font-medium text-slate-800">
                              {coin.detail}
                            </div>

                            {item.lastExecutionLog?.balanceBefore != null ||
                            item.lastExecutionLog?.balanceAfter != null ? (
                              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
                                잔액 {item.lastExecutionLog?.balanceBefore ?? "-"} →{" "}
                                {item.lastExecutionLog?.balanceAfter ?? "-"}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[320px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                  getReasonToneClass(reason.tone),
                                )}
                              >
                                {reason.title}
                              </span>

                              {reason.raw ? (
                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
                                  raw: {reason.raw}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 text-sm leading-6 text-slate-700">
                              {reason.detail}
                            </div>

                            {item.lastExecutionLog?.error ? (
                              <div className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-xs leading-5 text-rose-700">
                                {item.lastExecutionLog.error}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[170px] text-sm text-slate-700">
                            <div>{formatDateTime(item.lastExecutionLog?.executedAt)}</div>

                            <div className="mt-2 text-xs text-slate-500">
                              updated: {formatDateTime(item.updatedAt)}
                            </div>

                            {item.autoSeed?.lastStatus ? (
                              <div className="mt-2 text-xs text-slate-500">
                                autoSeed: {item.autoSeed.lastStatus}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}