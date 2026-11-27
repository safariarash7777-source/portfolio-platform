import { homeMarketSummary } from "@/lib/public-design/home-market-summary";
import { NextResponse } from "next/server";
import { readGlobalMarket, readIranMarket } from "@/lib/market-bounded";
import { withValidNav } from "@/lib/market-quality";
import { buildQuoteBubbles } from "@/lib/quote-board";
import { getGoldUsdTrend } from "@/lib/core/trend";
import { getLastIrDiag } from "@/lib/market-ir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/market — دادهٔ بازار (کشِ ۵دقیقه). هر refresh هشدارها را ارزیابی می‌کند.
// ir: دادهٔ بازارِ ایران از رلهٔ داخلی (اختیاری؛ بدون IR_MARKET_RELAY_URL → null).
// ?diag=1 → فیلدِ irDiag با خلاصهٔ عیب‌یابیِ اتصالِ رله (بدونِ سکرت) اضافه می‌شود؛
//           برای فهمیدنِ اینکه چرا ir=null است (env؟ توکن؟ رلهٔ خاموش؟ منبعِ خالی؟).
export async function GET(req: Request) {
  const withTrends = new URL(req.url).searchParams.get("quoteTrends") === "1";
  const [global, iran, quoteTrends] = await Promise.all([readGlobalMarket(), readIranMarket(), withTrends ? getGoldUsdTrend(14).catch(() => []) : Promise.resolve(undefined)]);
  const now = Date.now();
  const ir = iran.data && { ...iran.data, funds: iran.data.funds.map(fund => withValidNav(fund, null, now)) };
  const body: Record<string, unknown> = { ...global.data, ir, quoteBubbles: buildQuoteBubbles(ir?.gold ?? [], ir?.currency ?? [], now), quoteTrends, partial: global.availability.state !== "ready" || iran.availability.state !== "ready", availability: { global: global.availability, iran: iran.availability } };
  if (new URL(req.url).searchParams.get("quoteScope") === "domestic") {
    return NextResponse.json({
      ir: ir ? { gold: ir.gold, currency: ir.currency } : null,
      quoteBubbles: body.quoteBubbles, quoteTrends, availability: { iran: iran.availability },
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (new URL(req.url).searchParams.has("headline")) body.headline = homeMarketSummary(iran.data, iran.availability);
  if (new URL(req.url).searchParams.get("diag") === "1") {
    body.irDiag = getLastIrDiag();
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
