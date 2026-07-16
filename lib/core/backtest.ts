// موتور بک‌تست «قطب‌نمای بازار» — رویداد-محور، روی HistoryDay[] (بدون دادهٔ ساختگی).
//
// اصول (docs/DSS-STATE.md):
//  - هزینه‌های واقعی بازار ایران: کارمزد خرید ~۰٫۳۷۱۲٪، فروش ~۰٫۸۸٪ (شامل مالیات ۰٫۵٪)
//  - لغزش (slippage) قابل تنظیم — پیش‌فرض ۰٫۵٪ برای ورود/خروج در نمادهای نقد
//  - اجرای سیگنال در «روز بعد» (بدون look-ahead bias): سیگنال امروز → معامله با قیمت فردا
//  - دادهٔ ناموجود = روز نادیده گرفته می‌شود؛ هرگز جایگزین‌سازی ساختگی نمی‌کنیم
//  - خروجی شفاف: منحنی ارزش، فهرست معاملات، سنجه‌ها (CAGR، حداکثر افت، نرخ برد، شارپ سالانه)
//
// این موتور برای اعتبارسنجی قواعد واچ‌لیست/رژیم است — ربات معامله‌گر نیست.

import type { HistoryDay } from "./engine";

/** هزینه‌های معاملاتی بازار سهام ایران (نسبت، نه درصد). */
export interface CostModel {
  buyFee: number; // کارمزد خرید (مثلاً 0.003712)
  sellFee: number; // کارمزد فروش شامل مالیات (مثلاً 0.0088)
  slippage: number; // لغزش هر سمت (مثلاً 0.005)
}

export const IRAN_EQUITY_COSTS: CostModel = {
  buyFee: 0.003712,
  sellFee: 0.0088,
  slippage: 0.005,
};

/** صندوق‌های درآمد ثابت/کالایی کارمزد کمتری دارند. */
export const IRAN_FUND_COSTS: CostModel = {
  buyFee: 0.00116,
  sellFee: 0.00119,
  slippage: 0.002,
};

/** سیگنال روزانه: 1 = باید در بازار باشیم، 0 = نقد. (اجرا فردا انجام می‌شود) */
export type SignalFn = (days: HistoryDay[], index: number) => 0 | 1;

export interface Trade {
  entryDate: string;
  entryPrice: number; // با لغزش و کارمزد
  exitDate: string | null; // null = هنوز باز
  exitPrice: number | null;
  returnPct: number | null; // بازده خالص معامله (پس از همهٔ هزینه‌ها)
  holdingDays: number | null;
}

export interface EquityPoint {
  date: string;
  equity: number; // ارزش نرمال‌شده (شروع = 1)
  inMarket: boolean;
}

export interface BacktestMetrics {
  totalReturnPct: number | null;
  buyHoldReturnPct: number | null; // مقایسه با خرید-و-نگه‌داری
  cagrPct: number | null;
  maxDrawdownPct: number | null;
  winRatePct: number | null;
  tradeCount: number;
  avgHoldingDays: number | null;
  sharpeAnnual: number | null; // بدون نرخ بدون ریسک (نسبی برای مقایسهٔ قواعد)
  exposurePct: number | null; // درصد روزهایی که در بازار بودیم
  firstDate: string | null;
  lastDate: string | null;
}

export interface BacktestResult {
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  assumptions: string[]; // فروض — قانون سخت: هر خروجی با فروضش
}

function validDays(days: HistoryDay[]): HistoryDay[] {
  return days.filter((d) => d.close != null && d.close! > 0);
}

/**
 * بک‌تست تک‌نماد، رویداد-محور، تمام-یا-هیچ (all-in/all-out).
 * سیگنال در روز i محاسبه و با قیمت پایانی روز i+1 اجرا می‌شود.
 */
export function runBacktest(
  daysRaw: HistoryDay[],
  signal: SignalFn,
  costs: CostModel = IRAN_EQUITY_COSTS
): BacktestResult {
  const days = validDays(daysRaw);
  const assumptions = [
    `کارمزد خرید ${(costs.buyFee * 100).toFixed(4)}٪، فروش ${(costs.sellFee * 100).toFixed(4)}٪ (شامل مالیات)`,
    `لغزش هر سمت ${(costs.slippage * 100).toFixed(2)}٪`,
    "اجرای سیگنال با قیمت پایانی روز بعد (بدون look-ahead)",
    "تمام-یا-هیچ؛ بدون اهرم؛ سود نقدی/افزایش سرمایه لحاظ نشده (قیمت تعدیل‌نشده)",
    "روزهای بدون قیمت پایانی حذف شده‌اند — دادهٔ ساختگی وجود ندارد",
  ];

  if (days.length < 30) {
    return {
      equityCurve: [],
      trades: [],
      metrics: emptyMetrics(),
      assumptions,
    };
  }

  let equity = 1;
  let inMarket = false;
  let entryEquity = 1;
  let entryPriceNet = 0;
  let entryDate = "";
  let entryIdx = 0;

  const equityCurve: EquityPoint[] = [];
  const trades: Trade[] = [];
  let daysInMarket = 0;

  // از i=1 چون سیگنال دیروز، اجرای امروز
  for (let i = 1; i < days.length; i++) {
    const today = days[i];
    const px = today.close!;
    const want = signal(days, i - 1) === 1;

    if (want && !inMarket) {
      // خرید امروز
      entryPriceNet = px * (1 + costs.slippage) * (1 + costs.buyFee);
      entryDate = today.trade_date;
      entryEquity = equity;
      entryIdx = i;
      inMarket = true;
    } else if (!want && inMarket) {
      // فروش امروز
      const exitPriceNet = px * (1 - costs.slippage) * (1 - costs.sellFee);
      const ret = exitPriceNet / entryPriceNet - 1;
      equity = entryEquity * (1 + ret);
      trades.push({
        entryDate,
        entryPrice: round4(entryPriceNet),
        exitDate: today.trade_date,
        exitPrice: round4(exitPriceNet),
        returnPct: round2(ret * 100),
        holdingDays: i - entryIdx,
      });
      inMarket = false;
    }

    if (inMarket) {
      daysInMarket++;
      // mark-to-market با قیمت پایانی خام (هزینهٔ خروج هنگام خروج واقعی اعمال می‌شود)
      const mtm = (px * (1 - costs.slippage) * (1 - costs.sellFee)) / entryPriceNet;
      equityCurve.push({
        date: today.trade_date,
        equity: round6(entryEquity * mtm),
        inMarket: true,
      });
    } else {
      equityCurve.push({ date: today.trade_date, equity: round6(equity), inMarket: false });
    }
  }

  // معاملهٔ باز در انتها: mark-to-market نهایی
  if (inMarket) {
    const last = days[days.length - 1];
    const exitPriceNet = last.close! * (1 - costs.slippage) * (1 - costs.sellFee);
    const ret = exitPriceNet / entryPriceNet - 1;
    equity = entryEquity * (1 + ret);
    trades.push({
      entryDate,
      entryPrice: round4(entryPriceNet),
      exitDate: null,
      exitPrice: null,
      returnPct: round2(ret * 100),
      holdingDays: days.length - 1 - entryIdx,
    });
  }

  const metrics = computeMetrics(days, equityCurve, trades, daysInMarket);
  return { equityCurve, trades, metrics, assumptions };
}

function computeMetrics(
  days: HistoryDay[],
  curve: EquityPoint[],
  trades: Trade[],
  daysInMarket: number
): BacktestMetrics {
  if (curve.length === 0) return emptyMetrics();

  const finalEquity = curve[curve.length - 1].equity;
  const totalReturnPct = (finalEquity - 1) * 100;

  const firstClose = days[1]?.close ?? null;
  const lastClose = days[days.length - 1]?.close ?? null;
  const buyHoldReturnPct =
    firstClose != null && lastClose != null ? (lastClose / firstClose - 1) * 100 : null;

  const firstDate = curve[0].date;
  const lastDate = curve[curve.length - 1].date;
  const years =
    (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (365.25 * 24 * 3600 * 1000);
  const cagrPct = years > 0.5 ? (Math.pow(finalEquity, 1 / years) - 1) * 100 : null;

  // حداکثر افت
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    const dd = (peak - p.equity) / peak;
    if (dd > maxDd) maxDd = dd;
  }

  const closed = trades.filter((t) => t.returnPct != null);
  const wins = closed.filter((t) => (t.returnPct ?? 0) > 0).length;
  const winRatePct = closed.length > 0 ? (wins / closed.length) * 100 : null;
  const holds = closed.filter((t) => t.holdingDays != null).map((t) => t.holdingDays!);
  const avgHoldingDays =
    holds.length > 0 ? holds.reduce((a, b) => a + b, 0) / holds.length : null;

  // شارپ سالانه از بازده روزانهٔ منحنی
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].equity > 0) rets.push(curve[i].equity / curve[i - 1].equity - 1);
  }
  let sharpeAnnual: number | null = null;
  if (rets.length > 30) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
    sharpeAnnual = sd > 0 ? round2((mean / sd) * Math.sqrt(240)) : null; // ~۲۴۰ روز معاملاتی
  }

  return {
    totalReturnPct: round2(totalReturnPct),
    buyHoldReturnPct: buyHoldReturnPct != null ? round2(buyHoldReturnPct) : null,
    cagrPct: cagrPct != null ? round2(cagrPct) : null,
    maxDrawdownPct: round2(maxDd * 100),
    winRatePct: winRatePct != null ? round2(winRatePct) : null,
    tradeCount: trades.length,
    avgHoldingDays: avgHoldingDays != null ? round2(avgHoldingDays) : null,
    sharpeAnnual,
    exposurePct: curve.length > 0 ? round2((daysInMarket / curve.length) * 100) : null,
    firstDate,
    lastDate,
  };
}

function emptyMetrics(): BacktestMetrics {
  return {
    totalReturnPct: null,
    buyHoldReturnPct: null,
    cagrPct: null,
    maxDrawdownPct: null,
    winRatePct: null,
    tradeCount: 0,
    avgHoldingDays: null,
    sharpeAnnual: null,
    exposurePct: null,
    firstDate: null,
    lastDate: null,
  };
}

// ── قواعد آمادهٔ سیگنال (برای رژیم/واچ‌لیست) ─────────────────────────────────

/** میانگین سادهٔ قیمت پایانی پنجرهٔ n روز منتهی به index (شامل خودش). */
export function sma(days: HistoryDay[], index: number, n: number): number | null {
  if (index + 1 < n) return null;
  let sum = 0;
  for (let i = index - n + 1; i <= index; i++) {
    const c = days[i].close;
    if (c == null) return null;
    sum += c;
  }
  return sum / n;
}

/** قاعدهٔ تقاطع میانگین: قیمت بالای SMA(n) → در بازار. */
export function smaCrossSignal(n: number): SignalFn {
  return (days, i) => {
    const m = sma(days, i, n);
    const c = days[i].close;
    if (m == null || c == null) return 0;
    return c > m ? 1 : 0;
  };
}

/** قاعدهٔ روند دوگانه: SMA سریع بالای SMA کند → در بازار. */
export function dualSmaSignal(fast: number, slow: number): SignalFn {
  return (days, i) => {
    const f = sma(days, i, fast);
    const s = sma(days, i, slow);
    if (f == null || s == null) return 0;
    return f > s ? 1 : 0;
  };
}

/** قاعدهٔ جریان پول: میانگین خالص ورود حقیقی n روزه مثبت + قیمت بالای SMA(m). */
export function flowTrendSignal(flowWindow: number, smaWindow: number): SignalFn {
  return (days, i) => {
    if (i + 1 < flowWindow) return 0;
    let sum = 0;
    let cnt = 0;
    for (let k = i - flowWindow + 1; k <= i; k++) {
      const b = days[k].individual_buy_value;
      const s = days[k].individual_sell_value;
      if (b != null && s != null) {
        sum += b - s;
        cnt++;
      }
    }
    if (cnt < Math.ceil(flowWindow / 2)) return 0;
    const m = sma(days, i, smaWindow);
    const c = days[i].close;
    if (m == null || c == null) return 0;
    return sum > 0 && c > m ? 1 : 0;
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
