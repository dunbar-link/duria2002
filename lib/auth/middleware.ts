/**
 * INTERNAL TEST BUILD STUB
 * - jwt/strongest 미들웨어 로직은 베타 이후 복구
 * - 이 파일은 구 코드에서 import될 수 있어 빌드 통과를 위해 남겨둠
 */

import { NextResponse, type NextRequest } from "next/server";

export function authMiddleware(_req: NextRequest) {
  return NextResponse.next();
}