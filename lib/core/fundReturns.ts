// بازدهٔ دوره‌ای نماد/صندوق از symbol_history — M6 رصد بازار.
//
// اصل صداقت داده: بازده فقط وقتی محاسبه می‌شود که «نقطهٔ مبنا» واقعاً در
// تاریخچه موجود باشد؛ دادهٔ ناقص → null (در UI «—»). هیچ درون‌یابی، هیچ
// نزدیک‌ترین-همسایهٔ بی‌قید — مبنا باید حداکثر TOLERANCE_DAYS روز قدیمی‌تر از
// پنجرهٔ خواسته‌شده باشد وگرنه بازده گزارش نمی‌شود.
//
// قیمت مبنا: close (پایانی) و اگر null بود last_price — همان ترتیب بقیهٔ هسته.
// واحد قیمت (ریال/تومان) اهمیت ندارد چون بازده نسبی است؛ فقط باید هر دو نقطه
// از یک ستون بیایند (این تابع همین کار را می‌کند).

import type { HistoryDay } from "./engine";

/** پنجره‌های استاندارد M6 (روز تقویمی). */
export const RETURN_WINDOWS = { w1: 7, m1: 30, m3: 90 } as const;
export type ReturnWindowKey = keyof typeof RETURN_WINDOWS;

/** Actual endpoints and columns, independent of the requested window label. */
export interface PriceReturnObservation {
  value: number;
  periodStart: string;
  periodEnd: string;
  startField: "close" | "last_price";
  endField: "close" | "last_price";
  method: "unadjusted-price";
  source: "symbol_history";
}

/** حداکثر فاصلهٔ مجاز نقطهٔ مبنا از ابتدای پنجره (روز تقویمی).
 *  تعطیلات آخر هفته + رسمی را پوشش می‌دهد بدون آنکه بازدهٔ پنجرهٔ خیلی کوتاه‌تر
 *  را به‌جای پنجرهٔ خواسته‌شده جا بزند. */
export const TOLERANCE_DAYS = 10;

export interface PeriodicReturns {
  /** بازدهٔ ۱ هفته (٪) — null یعنی دادهٔ کافی نیست */
  w1: number | null;
  /** بازدهٔ ۱ ماه (٪) */
  m1: number | null;
  /** بازدهٔ ۳ ماه (٪) */
  m3: number | null;
  /** تعداد روزهای دادهٔ موجود (برای برچسب پوشش در UI) */
  daysAvailable: number;
  observations?: Record<ReturnWindowKey, PriceReturnObservation | null>;
}

function price(d: HistoryDay): number | null {
  if (typeof d.close === "number" && isFinite(d.close) && d.close > 0) return d.close;
  if (typeof d.last_price === "number" && isFinite(d.last_price) && d.last_price > 0) return d.last_price;
  return null;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

function validTradeDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

/**
 * بازدهٔ یک پنجره (٪) از تاریخچهٔ صعودی.
 * مبنا = آخرین روزِ دارای قیمت که «حداقل windowDays» قبل از آخرین روز است و
 * حداکثر windowDays+TOLERANCE_DAYS قبل — وگرنه null.
 */
export function periodReturn(history: HistoryDay[], windowDays: number): number | null {
  return periodReturnObservation(history, windowDays)?.value ?? null;
}

export function periodReturnObservation(history: HistoryDay[], windowDays: number): PriceReturnObservation | null {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  if (!Array.isArray(history) || history.length < 2) return null;
  // History is documented as ascending. Invalid/rolled-over days or reversed
  // endpoints cannot be presented as an observed return period.
  if (history.some((day, index) => !validTradeDate(day.trade_date)
    || (index > 0 && history[index - 1].trade_date >= day.trade_date))) return null;
  // آخرین روز دارای قیمت
  let lastIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (price(history[i]) != null) { lastIdx = i; break; }
  }
  if (lastIdx < 1) return null;
  const last = history[lastIdx];
  const lastPrice = price(last)!;
  // نقطهٔ مبنا: جدیدترین روزی که فاصله‌اش ≥ windowDays است
  for (let i = lastIdx - 1; i >= 0; i--) {
    const d = history[i];
    const gap = dayDiff(last.trade_date, d.trade_date);
    if (gap < windowDays) continue;
    if (gap > windowDays + TOLERANCE_DAYS) return null; // مبنای معتبر در بازهٔ مجاز نیست
    const base = price(d);
    if (base == null) continue; // روز بی‌قیمت — قدیمی‌تر را بررسی کن (هنوز در تلورانس)
    const value = ((lastPrice - base) / base) * 100;
    if (!Number.isFinite(value)) return null;
    return {
      value, periodStart: d.trade_date, periodEnd: last.trade_date,
      startField: d.close != null && Number.isFinite(d.close) && d.close > 0 ? "close" : "last_price",
      endField: last.close != null && Number.isFinite(last.close) && last.close > 0 ? "close" : "last_price",
      method: "unadjusted-price", source: "symbol_history",
    };
  }
  return null;
}

/** بازده‌های استاندارد ۱ه/۱م/۳م + شمار روزهای موجود. */
export function periodicReturns(history: HistoryDay[]): PeriodicReturns {
  const clean = Array.isArray(history) ? history : [];
  const observations = {
    w1: periodReturnObservation(clean, RETURN_WINDOWS.w1),
    m1: periodReturnObservation(clean, RETURN_WINDOWS.m1),
    m3: periodReturnObservation(clean, RETURN_WINDOWS.m3),
  };
  return {
    w1: observations.w1?.value ?? null,
    m1: observations.m1?.value ?? null,
    m3: observations.m3?.value ?? null,
    daysAvailable: clean.length,
    observations,
  };
}

/** مقایسه‌گر nulls-last برای مرتب‌سازی ستون بازده (صعودی/نزولی). */
export function compareNullsLast(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;  // null همیشه آخر — مستقل از جهت
  if (b == null) return -1;
  return (a - b) * dir;
}
