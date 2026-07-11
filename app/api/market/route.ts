import { NextResponse } from "next/server";
import { getMarketData } from "@/lib/market";
import { getIrMarket } from "@/lib/market-ir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/market — دادهٔ بازار (کشِ ۵دقیقه). هر refresh هشدارها را ارزیابی می‌کند.
// ir: دادهٔ بازارِ ایران از رلهٔ داخلی (اختیاری؛ بدون IR_MARKET_RELAY_URL → null).
export async function GET() {
  const [data, ir] = await Promise.all([getMarketData(), getIrMarket()]);
  return NextResponse.json({ ...data, ir });
}
