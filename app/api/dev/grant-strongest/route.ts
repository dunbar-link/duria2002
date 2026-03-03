export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "DEPRECATED_ROUTE: internal test build" },
    { status: 410 }
  );
}