import { NextRequest, NextResponse } from "next/server";
import { mapRpcResult } from "@/lib/path/pathMapper";
import { getSupabaseEnvDebug } from "@/lib/supabase-admin";
import { runPathProbe } from "@/lib/path/pathService";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type LooseRecord = Record<string, unknown>;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
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

function classifyRouteError(message: string) {
  const normalized = normalizeText(message).toUpperCase();

  if (normalized.includes("INSUFFICIENT_COINS")) {
    return {
      errorCode: "INSUFFICIENT_COINS" as const,
      userMessage:
        "코인이 부족합니다. 테스트 계정 지갑을 충전한 뒤 다시 시도해주세요.",
    };
  }

  if (
    normalized.includes("WALLET") &&
    (normalized.includes("NOT FOUND") ||
      normalized.includes("MISSING") ||
      normalized.includes("NO WALLET"))
  ) {
    return {
      errorCode: "WALLET_NOT_FOUND" as const,
      userMessage:
        "지갑이 아직 없습니다. 테스트 계정용 dl_wallets 행을 먼저 만들어주세요.",
    };
  }

  if (
    normalized.includes("TARGET") &&
    (normalized.includes("REQUIRED") ||
      normalized.includes("MISSING") ||
      normalized.includes("INVALID"))
  ) {
    return {
      errorCode: "TARGET_REQUIRED" as const,
      userMessage:
        "타겟 정보가 올바르지 않습니다. 추천 카드 또는 검색에서 다시 선택해주세요.",
    };
  }

  if (
    normalized.includes("NOT FOUND") ||
    normalized.includes("NO PATH") ||
    normalized.includes("PATH_NOT_FOUND")
  ) {
    return {
      errorCode: "PATH_NOT_FOUND" as const,
      userMessage:
        "아직 연결 경로를 찾지 못했습니다. 내 인맥을 더 입력하거나 브리지 신호를 늘린 뒤 다시 시도해주세요.",
    };
  }

  return {
    errorCode: "RPC_ERROR" as const,
    userMessage: message || "경로 탐색 중 오류가 발생했습니다.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      ownerUserId?: string;
      targetPid?: string;
      cost?: number;
      maxHops?: number;
    };

    const ownerUserId =
      normalizeText(body?.ownerUserId) || FIXED_OWNER_USER_ID;
    const targetPid = normalizeText(body?.targetPid);
    const cost =
      typeof body?.cost === "number" && Number.isFinite(body.cost)
        ? body.cost
        : 10;
    const maxHops =
      typeof body?.maxHops === "number" && Number.isFinite(body.maxHops)
        ? body.maxHops
        : 6;

    if (!ownerUserId) {
      return NextResponse.json(
        {
          ok: false,
          error: "ownerUserId is required.",
          errorCode: "INVALID_REQUEST",
          userMessage: "ownerUserId 가 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (!targetPid) {
      return NextResponse.json(
        {
          ok: false,
          error: "targetPid is required.",
          errorCode: "TARGET_REQUIRED",
          userMessage: "타겟을 먼저 선택해주세요.",
        },
        { status: 400 }
      );
    }

    const rawData = await runPathProbe({
      userId: ownerUserId,
      targetPid,
      cost,
      maxHops,
    });

    const raw =
      typeof rawData === "object" && rawData !== null && !Array.isArray(rawData)
        ? (rawData as LooseRecord)
        : {};

    const result = mapRpcResult(raw);

    const balanceBefore = pickNumber(
      raw,
      ["balance_before", "wallet_before"],
      null
    );
    const balanceAfter = pickNumber(
      raw,
      ["balance_after", "wallet_after"],
      null
    );

    return NextResponse.json({
      ok: true,
      result,
      bestPath: result.bestPath,
      allPaths: result.allPaths,
      path: result.path,
      stepCount: result.stepCount,
      firstConnectorPid: result.firstConnectorPid,
      firstConnectorName: result.firstConnectorName,
      score: result.score,
      presentedPathText: result.presentedPathText,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      debug: {
        rpc: "dl_path_probe_paid",
        supabase: getSupabaseEnvDebug(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown discover route error.";
    const classified = classifyRouteError(message);

    return NextResponse.json(
      {
        ok: false,
        error: message,
        errorCode: classified.errorCode,
        userMessage: classified.userMessage,
        debug: {
          supabase: getSupabaseEnvDebug(),
        },
      },
      { status: 500 }
    );
  }
}