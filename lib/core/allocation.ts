// تخصیص دارایی چندنماده — بک‌تست سبد با ریبالانس ادواری.
//
// روش (شفاف، بدون look-ahead):
//  - چند دارایی با وزن هدف (مثلاً سهام ۴۵٪ / صندوق طلا ۳۰٪ / درآمد ثابت ۲۵٪)
//  - تاریخ‌های مشترک: فقط روزهایی که همهٔ دارایی‌ها قیمت پایانی دارند
//  - ریبالانس هر N روز معاملاتی (پیش‌فرض ۶۳ ≈ فصلی) با هزینهٔ معامله روی جابه‌جایی
//  - سنجه‌ها: بازده کل، CAGR، حداکثر افت، نوسان سالانه، شارپ (نرخ بدون ریسک ۰ برای مقایسهٔ نسبی)
//  - قانون سخت: دادهٔ ناموجود = حذف تاریخ؛ هرگز پرکردن مصنوعی (no forward-fill fabrication)
//
// این ماژول پایهٔ «Asset Allocation» چشم‌انداز است؛ نتیجهٔ آن «چارچوب تحلیلی» است نه توصیه.

import type { HistoryDay } from "./engine";
import { IRAN_EQUITY_COSTS, type CostModel } from "./backtest";

export interface AssetSeries {
  /** نام دارایی، مثلاً «فولاد» یا «طلا (صندوق)» */
  name: string;
  /** وزن هدف 0..1؛ مجموع وزن‌ها باید ~۱ باشد */
  weight: number;
  days: HistoryDay[];
  costs?: CostModel;
}

export interface AllocationPoint {
  date: string;
  /** ارزش سبد (پایه ۱۰۰) */
  value: number;
  /** ارزش سبد بدون ریبالانس (خرید و نگه‌داری با همان وزن اولیه) */
  holdValue: number;
}

export interface AllocationMetrics {
  totalReturnPct: number;
  holdReturnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  annualVolatilityPct: number | null;
  sharpe: number | null;
  rebalanceCount: number;
  totalCostPct: number;
  startDate: string;
  endDate: string;
  tradingDays: number;
}

export interface AllocationResult {
  points: AllocationPoint[];
  metrics: AllocationMetrics | null;
  assumptions: string[];
  /** نام دارایی‌هایی که به‌خاطر دادهٔ ناکافی حذف شدند */
  dropped: string[];
}

/** تقاطع تاریخ‌ها: فقط روزهایی که همهٔ دارایی‌ها close معتبر دارند. */
function alignSeries(assets: AssetSeries[]): { dates: string[]; prices: number[][] } {
  const maps = assets.map((a) => {
    const m = new Map<string, number>();
    for (const d of a.days) {
      if (d.close != null && d.close > 0) m.set(d.trade_date, d.close);
    }
    return m;
  });
  const first = maps[0];
  const dates: string[] = [];
  for (const date of first.keys()) {
    if (maps.every((m) => m.has(date))) dates.push(date);
  }
  dates.sort();
  const prices = dates.map((dt) => maps.map((m) => m.get(dt)!));
  return { dates, prices };
}

/**
 * بک‌تست سبد چنددارایی با ریبالانس ادواری.
 * @param rebalanceEvery هر چند روز معاملاتی ریبالانس شود (۰ = هرگز)
 */
export function runAllocation(
  assetsIn: AssetSeries[],
  rebalanceEvery = 63
): AllocationResult {
  const assumptions = [
    "فقط روزهایی که همهٔ دارایی‌ها قیمت پایانی معتبر دارند (تقاطع تاریخ‌ها؛ بدون پرکردن مصنوعی)",
    `ریبالانس هر ${rebalanceEvery > 0 ? rebalanceEvery : "—"} روز معاملاتی به وزن هدف`,
    "هزینهٔ معامله فقط روی مقدار جابه‌جاشده در ریبالانس (کارمزد خرید/فروش هر دارایی)",
    "شارپ با نرخ بدون ریسک صفر — فقط برای مقایسهٔ نسبی سبدها",
    "نتیجه چارچوب تحلیلی است؛ توصیهٔ خرید/فروش نیست",
  ];

  const dropped: string[] = [];
  const assets = assetsIn.filter((a) => {
    const ok = a.days.filter((d) => d.close != null && d.close > 0).length >= 60;
    if (!ok) dropped.push(a.name);
    return ok;
  });

  if (assets.length < 2) {
    return { points: [], metrics: null, assumptions, dropped };
  }

  // نرمال‌سازی وزن‌ها
  const wsum = assets.reduce((a, x) => a + x.weight, 0);
  const weights = assets.map((a) => (wsum > 0 ? a.weight / wsum : 1 / assets.length));
  const costs = assets.map((a) => a.costs ?? IRAN_EQUITY_COSTS);

  const { dates, prices } = alignSeries(assets);
  if (dates.length < 60) {
    return { points: [], metrics: null, assumptions, dropped };
  }

  const START = 100;
  // واحدهای هر دارایی (ارزش پایه × وزن ÷ قیمت روز اول)
  let units = weights.map((w, j) => (START * w) / prices[0][j]);
  const holdUnits = [...units];

  let totalCostPct = 0;
  let rebalanceCount = 0;
  const points: AllocationPoint[] = [];

  for (let i = 0; i < dates.length; i++) {
    const p = prices[i];
    let value = 0;
    let holdValue = 0;
    for (let j = 0; j < units.length; j++) {
      value += units[j] * p[j];
      holdValue += holdUnits[j] * p[j];
    }

    // ریبالانس در پایان روز (اجرای عملی: قیمت پایانی همان روز، بدون look-ahead به آینده)
    if (rebalanceEvery > 0 && i > 0 && i % rebalanceEvery === 0) {
      let cost = 0;
      const newUnits = units.map((_, j) => 0);
      for (let j = 0; j < units.length; j++) {
        const target = value * weights[j];
        const current = units[j] * p[j];
        const delta = target - current;
        // کارمزد روی مقدار جابه‌جاشده: خرید یا فروش
        const fee = delta > 0 ? costs[j].buyFee : costs[j].sellFee;
        cost += Math.abs(delta) * fee;
        newUnits[j] = target / p[j];
      }
      value -= cost;
      totalCostPct += (cost / value) * 100;
      // بعد از کسر هزینه، واحدها با ارزش جدید بازتنظیم می‌شوند
      for (let j = 0; j < newUnits.length; j++) {
        units[j] = (value * weights[j]) / p[j];
      }
      rebalanceCount++;
    }

    points.push({ date: dates[i], value, holdValue });
  }

  // ── سنجه‌ها ──
  const first = points[0];
  const lastP = points[points.length - 1];
  const totalReturnPct = ((lastP.value - first.value) / first.value) * 100;
  const holdReturnPct = ((lastP.holdValue - first.holdValue) / first.holdValue) * 100;

  const years = points.length / 245; // ~۲۴۵ روز معاملاتی در سال (بورس ایران)
  const cagrPct =
    years >= 0.5 ? (Math.pow(lastP.value / first.value, 1 / years) - 1) * 100 : null;

  let peak = -Infinity;
  let maxDD = 0;
  for (const pt of points) {
    if (pt.value > peak) peak = pt.value;
    const dd = ((peak - pt.value) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const rets: number[] = [];
  for (let i = 1; i < points.length; i++) {
    rets.push(points[i].value / points[i - 1].value - 1);
  }
  let annualVolatilityPct: number | null = null;
  let sharpe: number | null = null;
  if (rets.length >= 30) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    const dailyVol = Math.sqrt(variance);
    annualVolatilityPct = dailyVol * Math.sqrt(245) * 100;
    sharpe = dailyVol > 0 ? (mean / dailyVol) * Math.sqrt(245) : null;
  }

  const round2 = (x: number | null): number | null =>
    x == null ? null : Math.round(x * 100) / 100;

  return {
    points,
    metrics: {
      totalReturnPct: round2(totalReturnPct)!,
      holdReturnPct: round2(holdReturnPct)!,
      cagrPct: round2(cagrPct),
      maxDrawdownPct: round2(maxDD)!,
      annualVolatilityPct: round2(annualVolatilityPct),
      sharpe: round2(sharpe),
      rebalanceCount,
      totalCostPct: round2(totalCostPct)!,
      startDate: first.date,
      endDate: lastP.date,
      tradingDays: points.length,
    },
    assumptions,
    dropped,
  };
}
