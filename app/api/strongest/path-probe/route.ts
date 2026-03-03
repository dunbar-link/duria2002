export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * 내부 테스트(데모)에서는 사용하지 않는 구 라우트.
 * 타입 이슈로 빌드가 깨지지 않도록 명시적으로 비활성화.
 * (정식 strongest + userId 파싱은 베타 이후 정리)
 */
export async function POST() {
  return NextResponse.json(
    { error: "DEPRECATED_ROUTE: use /api/path/probe-paid instead" },
    { status: 410 }
  );
}