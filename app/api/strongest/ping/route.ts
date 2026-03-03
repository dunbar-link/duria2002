export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "DEPRECATED_ROUTE: internal test uses /api/path/probe-paid" },
    { status: 410 }
  );
}