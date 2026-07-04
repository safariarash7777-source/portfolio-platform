import { NextRequest, NextResponse } from "next/server";
import { getOhlc } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/market/ohlc?id=bitcoin — کندلِ روزانه برای نمودار.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ candles: [] });
  const candles = await getOhlc(id);
  return NextResponse.json({ candles });
}
