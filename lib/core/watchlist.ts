// واچ‌لیست امتیازی + رژیم بازار — دادهٔ سروری برای صفحات ترمینال.
// همهٔ محاسبات از موتور واحد (engine/backtest/regime)؛ این ماژول فقط ارکستراسیون است.
//
// عملکرد: برای هر نماد دارای تاریخچه، ۴۰۰ روز اخیر خوانده می‌شود (کش ۱۰ دقیقه‌ای
// در history.ts) و محور روند + نقدینگی + بک‌تست قاعدهٔ روند دوگانه محاسبه می‌شود.

import { getHistorySymbols, getSymbolHistory } from "./history";
import { trendAxis, liquidityAxis, type AxisScore, type HistoryDay } from "./engine";
import { runBacktest, dualSmaSignal, type BacktestMetrics } from "./backtest";
import { computeRegime, type RegimeResult } from "./regime";

export interface WatchRow {
  symbol: string;
  lastDate: string | null;
  lastClose: number | null;
  trend: AxisScore;
  liquidity: AxisScore;
  /** میانگین وزنی روند ۵۵٪ / نقدینگی ۴۵٪ (بدون بنیادی — واچ‌لیست تکنیکال-جریانی) */
  techScore: number | null;
  /** بک‌تست قاعدهٔ SMA20>SMA60 روی ۴۰۰ روز اخیر — برای سنجش «قاعده‌پذیری» نماد */
  bt: BacktestMetrics | null;
}

export interface WatchlistData {
  regime: RegimeResult;
  rows: WatchRow[];
  asOf: string | null;
}

let cached: { at: number; value: WatchlistData } | null = null;
const TTL = 10 * 60 * 1000;

export async function buildWatchlist(): Promise<WatchlistData> {
  if (cached && Date.now() - cached.at < TTL) return cached.value;

  const symbols = await getHistorySymbols();
  const histories = await Promise.all(
    symbols.map(async (s) => ({ symbol: s, days: await getSymbolHistory(s, 400) }))
  );

  const regime = computeRegime(histories.filter((h) => h.days.length >= 60));

  const rows: WatchRow[] = histories
    .filter((h) => h.days.length >= 30)
    .map(({ symbol, days }) => {
      const trend = trendAxis(days);
      const liquidity = liquidityAxis(days);
      const parts: Array<[number, number]> = [];
      if (trend.score != null) parts.push([trend.score, 0.55]);
      if (liquidity.score != null) parts.push([liquidity.score, 0.45]);
      const wsum = parts.reduce((a, [, w]) => a + w, 0);
      const techScore =
        wsum > 0 ? Math.round(parts.reduce((a, [s, w]) => a + s * w, 0) / wsum) : null;

      let bt: BacktestMetrics | null = null;
      if (days.length >= 120) {
        bt = runBacktest(days, dualSmaSignal(20, 60)).metrics;
      }

      const lastValid = [...days].reverse().find((d: HistoryDay) => d.close != null);
      return {
        symbol,
        lastDate: lastValid?.trade_date ?? null,
        lastClose: lastValid?.close ?? null,
        trend,
        liquidity,
        techScore,
        bt,
      };
    })
    .sort((a, b) => (b.techScore ?? -1) - (a.techScore ?? -1));

  const value: WatchlistData = { regime, rows, asOf: regime.as_of };
  cached = { at: Date.now(), value };
  return value;
}
