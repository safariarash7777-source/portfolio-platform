import { NextResponse } from "next/server";
import { getMarketData } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/market — دادهٔ بازار (کشِ ۵دقیقه). هر refresh هشدارها را ارزیابی می‌کند.
export async function GET() {
  const data = await getMarketData();
  return NextResponse.json(data);
}
