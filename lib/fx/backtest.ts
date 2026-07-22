// ارزیابی گذشته‌نگر صحت پیش‌بینی — «اگر در سال t با مدل X پیش‌بینی می‌کردیم،
// چقدر خطا داشتیم؟»
//
// روش (شبه‌برون‌نمونه‌ای — honest labeling):
//   برای هر سال شروع t: مدل از نرخ واقعی بازار در سال t لنگر می‌شود و با
//   دادهٔ کلان «واقعیِ» سال‌های t+1..t+h جلو می‌رود؛ سپس با نرخ واقعی بازار
//   همان سال‌ها مقایسه می‌شود. یعنی خطای اندازه‌گیری‌شده «خطای ساختار مدل»
//   است، نه خطای پیش‌بینی فرضیات کلان (که در زمان t معلوم نبودند).
//   این تمایز در UI صریحاً برچسب می‌خورد — هیچ ادعای بیش از واقع.
//
// مدل‌ها: ppp (تورم نسبی، همان pppSeries از لنگر t) و monetary (رشد نقدینگی
// نسبی). actual = base_rates (نرخ‌های تاریخی) + میانگین بازار زندهٔ سال جاری.
//
// توابع خالص‌اند (بدون شبکه/side effect) و در engine.test.ts با مقادیر طلایی
// دستی تست می‌شوند.

import { pppSeries, monetarySeries, type MacroRow } from "./engine";

export type BacktestModel = "ppp" | "monetary";

export interface BacktestPoint {
  /** سال هدف (شمسی) */
  year: number;
  /** افق نسبت به سال شروع (۱..h) */
  horizon: number;
  /** پیش‌بینی مدل (تومان) */
  predicted: number;
  /** نرخ واقعی بازار (تومان) */
  actual: number;
  /** خطای درصدی امضادار: (pred − actual)/actual × ۱۰۰ */
  errorPct: number;
}

export interface BacktestRun {
  model: BacktestModel;
  startYear: number;
  /** نرخ لنگر (واقعی بازار در سال شروع) */
  anchorRate: number;
  points: BacktestPoint[];
}

/** اجرای یک بک‌تست: مدل از سال t لنگر می‌شود و تا افق h با واقعیت مقایسه می‌شود. */
export function backtestRun(
  macro: MacroRow[],
  actualByYear: Record<number, number>,
  model: BacktestModel,
  startYear: number,
  horizon: number
): BacktestRun | null {
  const anchor = actualByYear[startYear];
  if (!(anchor > 0)) return null;
  const series =
    model === "ppp"
      ? pppSeries(macro, startYear, anchor)
      : monetarySeries(macro, startYear, anchor);
  const points: BacktestPoint[] = [];
  for (let k = 1; k <= horizon; k++) {
    const y = startYear + k;
    const predicted = series.get(y);
    const actual = actualByYear[y];
    if (predicted == null || !(actual > 0)) continue;
    points.push({
      year: y,
      horizon: k,
      predicted,
      actual,
      errorPct: ((predicted - actual) / actual) * 100,
    });
  }
  return points.length ? { model, startYear, anchorRate: anchor, points } : null;
}

export interface HorizonAccuracy {
  horizon: number;
  /** میانگین قدر مطلق خطای درصدی */
  mape: number;
  /** میانگین خطای امضادار (سوگیری: مثبت = مدل بالاتر از واقعیت) */
  bias: number;
  /** تعداد مشاهده */
  n: number;
}

/** جمع‌بندی MAPE/سوگیری هر مدل به تفکیک افق، روی همهٔ سال‌های شروع ممکن. */
export function accuracyByHorizon(
  macro: MacroRow[],
  actualByYear: Record<number, number>,
  model: BacktestModel,
  startYears: number[],
  horizon: number
): HorizonAccuracy[] {
  const byH = new Map<number, number[]>();
  for (const t of startYears) {
    const run = backtestRun(macro, actualByYear, model, t, horizon);
    if (!run) continue;
    for (const p of run.points) {
      const arr = byH.get(p.horizon) ?? [];
      arr.push(p.errorPct);
      byH.set(p.horizon, arr);
    }
  }
  const out: HorizonAccuracy[] = [];
  for (const [h, errs] of [...byH.entries()].sort((a, b) => a[0] - b[0])) {
    const mape = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length;
    const bias = errs.reduce((s, e) => s + e, 0) / errs.length;
    out.push({ horizon: h, mape: Math.round(mape * 100) / 100, bias: Math.round(bias * 100) / 100, n: errs.length });
  }
  return out;
}

/** سال‌های شروع معتبر: سال‌هایی که هم نرخ واقعی دارند و هم حداقل ۱ سال بعدشان داده هست. */
export function validStartYears(actualByYear: Record<number, number>, minYear = 1338): number[] {
  const years = Object.keys(actualByYear)
    .map(Number)
    .filter((y) => y >= minYear && actualByYear[y] > 0)
    .sort((a, b) => a - b);
  return years.filter((y) => years.some((y2) => y2 > y));
}
