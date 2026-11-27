import { homeMarketSummary } from "@/lib/public-design/home-market-summary";
import { NextResponse } from "next/server";
import { readGlobalMarket, readIranMarket } from "@/lib/market-bounded";
import { withValidNav } from "@/lib/market-quality";
import { buildQuoteBubbles, type Quote } from "@/lib/quote-board";
import { getGoldUsdTrend } from "@/lib/core/trend";
import { getLastIrDiag } from "@/lib/market-ir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/market — دادهٔ بازار (کشِ ۵دقیقه). هر refresh هشدارها را ارزیابی می‌کند.
// ir: دادهٔ بازارِ ایران از رلهٔ داخلی (اختیاری؛ بدون IR_MARKET_RELAY_URL → null).
// ?diag=1 → فیلدِ irDiag با خلاصهٔ عیب‌یابیِ اتصالِ رله (بدونِ سکرت) اضافه می‌شود؛
//           برای فهمیدنِ اینکه چرا ir=null است (env؟ توکن؟ رلهٔ خاموش؟ منبعِ خالی؟).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const withTrends = params.get("quoteTrends") === "1";
  const [global, iran, quoteTrends] = await Promise.all([readGlobalMarket(), readIranMarket(), withTrends ? getGoldUsdTrend(14).catch(() => []) : Promise.resolve(undefined)]);
  const now = Date.now();
  const scope = params.get("quoteScope");
  const ir = scope === "board" || scope === "domestic" ? iran.data : iran.data && { ...iran.data, funds: iran.data.funds.map(fund => withValidNav(fund, null, now)) };
  const body: Record<string, unknown> = { ...global.data, ir, quoteBubbles: buildQuoteBubbles(ir?.gold ?? [], ir?.currency ?? [], now), quoteTrends, partial: global.availability.state !== "ready" || iran.availability.state !== "ready", availability: { global: global.availability, iran: iran.availability } };
  if (scope === "domestic") {
    return NextResponse.json({
      ir: ir ? { gold: ir.gold, currency: ir.currency } : null,
      quoteBubbles: body.quoteBubbles, quoteTrends, availability: { iran: iran.availability },
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (params.has("headline")) body.headline = homeMarketSummary(iran.data, iran.availability);
  if (params.get("diag") === "1") {
    body.irDiag = getLastIrDiag();
  }
  if (scope === "board") {
    const compact = (rows: Quote[]) => rows.map(({ id, faName, price, unit, sourceDate, sourceTime, symbol, change24h, change, changePercent }) =>
      ({ id, faName, price, unit, sourceDate, sourceTime, symbol, change24h, change, changePercent }));
    body.ir = ir && { gold: compact(ir.gold), currency: compact(ir.currency), crypto: compact(ir.crypto),
      stocks: compact(ir.stocks), funds: compact(ir.funds) };
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
