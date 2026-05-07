// DEPRECATED: 이 경로는 잘못된 위치에 생성된 구버전입니다.
// 정상 경로: /api/push/send
// 이 파일은 삭제하지 않고 영구 리디렉션으로 유지합니다.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.redirect(
    new URL(
      "/api/push/send",
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ),
    308,
  );
}
