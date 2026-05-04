import { NextRequest, NextResponse } from "next/server";
import { getConnectableRecommendations } from "@/lib/connectable-recommendations/connectable-recommendation-engine";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 48;

export async function GET(req: NextRequest) {
  try {
    const ownerUserId =
      req.nextUrl.searchParams.get("ownerUserId")?.trim() ||
      "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

    const rawLimit = req.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT);
    const parsedLimit = Number(rawLimit);

    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsedLimit)))
      : DEFAULT_LIMIT;

    const items = getConnectableRecommendations(ownerUserId, limit);

    return NextResponse.json({
      ok: true,
      items,
      meta: {
        ownerUserId,
        limit,
        returned: items.length,
        source: "connectable-recommendation-engine",
      },
    });
  } catch (error) {
    console.error("[GET /api/connectable-recommendations] failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: "CONNECTABLE_RECOMMENDATIONS_FAILED",
        userMessage: "연결 가능 후보를 불러오지 못했습니다.",
        items: [],
      },
      { status: 500 }
    );
  }
}