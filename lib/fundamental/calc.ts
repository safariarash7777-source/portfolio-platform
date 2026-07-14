// ماژول محاسبات بنیادی (WP4-۲) — TS خالص، قطعی، بدون وابستگی، تست‌دار.
// قانون ۱ بریف: مدل زبانی هرگز عدد محاسبه نمی‌کند — همهٔ اعداد این‌جا با کد
// حساب می‌شوند و «روایت»ها فقط قالب جملهٔ ثابت + جای‌گذاری همین اعدادند.
// اگر ورودیِ محاسبه‌ای موجود نیست، خروجی null است — عدد جایگزین ممنوع (قانون ۳/۷).

import type { CodalN10Data, SalesTrendRow } from "./types";

/** درصد با یک رقم اعشار؛ تقسیم بر صفر → null. */
export function pct(numerator: number, denominator: number): number | null {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** رشد نسبت به مقدار قبلی، درصد با یک رقم اعشار؛ پایهٔ صفر/نامعتبر → null. */
export function growthPct(current: number, prior: number): number | null {
  if (!isFinite(current) || !isFinite(prior) || prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

export interface Margins {
  gross: number | null;
  operating: number | null;
  net: number | null;
}

/** حاشیه‌های سود سه‌گانه از یک صورت سود و زیان. */
export function margins(s: {
  revenue: number;
  gross_profit: number;
  operating_profit: number;
  net_profit: number;
}): Margins {
  return {
    gross: pct(s.gross_profit, s.revenue),
    operating: pct(s.operating_profit, s.revenue),
    net: pct(s.net_profit, s.revenue),
  };
}

export interface TrendPoint {
  fy: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  revenueGrowthPct: number | null; // نسبت به سال قبلِ موجود در سری
}

/** روند چندساله: سود ناخالص، حاشیه و رشد فروش هر سال — از دادهٔ رسمی گزارش. */
export function salesTrend(rows: SalesTrendRow[]): TrendPoint[] {
  const sorted = [...rows].sort((a, b) => a.fy - b.fy);
  return sorted.map((r, i) => ({
    fy: r.fy,
    revenue: r.revenue,
    cogs: r.cogs,
    grossProfit: r.revenue - r.cogs,
    grossMarginPct: pct(r.revenue - r.cogs, r.revenue),
    revenueGrowthPct: i > 0 ? growthPct(r.revenue, sorted[i - 1].revenue) : null,
  }));
}

/** تعداد سال‌های متوالی رشد فروش در انتهای سری (برای روایت template-ای). */
export function consecutiveGrowthYears(points: TrendPoint[]): number {
  let n = 0;
  for (let i = points.length - 1; i >= 1; i--) {
    const g = points[i].revenueGrowthPct;
    if (g !== null && g > 0) n++;
    else break;
  }
  return n;
}

export interface N10Derived {
  margins: Margins;
  priorMargins: Margins | null;
  revenueGrowthPct: number | null;
  netProfitGrowthPct: number | null;
  epsGrowthPct: number | null;
  effectiveTaxRatePct: number | null;
  financeCostToRevenuePct: number | null;
  /** سهم «سایر درآمدهای عملیاتی» (عمدتاً تسعیر ارز) از سود عملیاتی. */
  otherOpIncomeShareOfOpPct: number | null;
  trend: TrendPoint[];
}

/** همهٔ مشتق‌های استاندارد ن-۱۰ در یک پاس — ورودی ناقص → فیلد null. */
export function deriveN10(d: CodalN10Data): N10Derived {
  const s = d.standalone;
  const p = s.prior ?? null;
  return {
    margins: margins(s),
    priorMargins: p ? margins(p) : null,
    revenueGrowthPct: p ? growthPct(s.revenue, p.revenue) : null,
    netProfitGrowthPct: p ? growthPct(s.net_profit, p.net_profit) : null,
    epsGrowthPct:
      p && s.eps_rial != null && p.eps_rial != null ? growthPct(s.eps_rial, p.eps_rial) : null,
    effectiveTaxRatePct:
      s.tax != null && s.pretax_profit != null ? pct(s.tax, s.pretax_profit) : null,
    financeCostToRevenuePct: s.finance_cost != null ? pct(s.finance_cost, s.revenue) : null,
    otherOpIncomeShareOfOpPct:
      s.other_op_income != null ? pct(s.other_op_income, s.operating_profit) : null,
    trend: d.sales_trend_5y ? salesTrend(d.sales_trend_5y) : [],
  };
}

// ---------------------------------------------------------------------------
// روایت‌های template-ای (قانون ۱): قالب جملهٔ ثابت + عدد محاسبه‌شده.
// اگر شرط قالب برقرار نیست، جمله تولید نمی‌شود (null) — جملهٔ جایگزین ممنوع.
// خروجی این توابع «متن خام با ارقام لاتین» است؛ لایهٔ UI با toPersianDigits
// نمایش می‌دهد تا قاعدهٔ فرمت متمرکز بماند.
// ---------------------------------------------------------------------------

function faNum(n: number): string {
  // فقط جدا‌کنندهٔ هزارگان؛ تبدیل رقم به فارسی در لایهٔ UI انجام می‌شود.
  return n.toLocaleString("en-US");
}

function pctText(v: number): string {
  return `${Math.abs(v) % 1 === 0 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)} درصد`;
}

/** روایت رشد فروش سال جاری. */
export function narrativeRevenueGrowth(derived: N10Derived, fyLabel: string): string | null {
  const g = derived.revenueGrowthPct;
  if (g === null) return null;
  if (g > 0) return `فروش سال ${fyLabel} نسبت به سال قبل ${pctText(g)} رشد کرده است.`;
  if (g < 0) return `فروش سال ${fyLabel} نسبت به سال قبل ${pctText(g)} کاهش یافته است.`;
  return null;
}

/** روایت روند حاشیهٔ ناخالص (بهبود/افت نسبت به سال قبل). */
export function narrativeGrossMargin(derived: N10Derived): string | null {
  const cur = derived.margins.gross;
  const prev = derived.priorMargins?.gross ?? null;
  if (cur === null || prev === null) return null;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff > 0)
    return `حاشیهٔ سود ناخالص از ${pctText(prev)} به ${pctText(cur)} بهبود یافته است.`;
  if (diff < 0)
    return `حاشیهٔ سود ناخالص از ${pctText(prev)} به ${pctText(cur)} کاهش یافته است.`;
  return null;
}

/** روایت سال‌های متوالی رشد فروش از جدول روند. */
export function narrativeConsecutiveGrowth(derived: N10Derived): string | null {
  const n = consecutiveGrowthYears(derived.trend);
  if (n < 2) return null;
  return `فروش شرکت ${faNum(n)} سال پیاپی رشد کرده است.`;
}

/** روایت سهم درآمد تسعیر ارز از سود عملیاتی — شفافیت کیفیت سود. */
export function narrativeFxShare(derived: N10Derived): string | null {
  const share = derived.otherOpIncomeShareOfOpPct;
  if (share === null || share < 5) return null;
  return `حدود ${pctText(share)} از سود عملیاتی از «سایر درآمدهای عملیاتی» (عمدتاً تسعیر ارز) است، نه فروش محصول.`;
}

/** روایت رشد سود خالص و EPS. */
export function narrativeNetProfit(derived: N10Derived, fyLabel: string): string | null {
  const g = derived.netProfitGrowthPct;
  if (g === null) return null;
  if (g > 0) return `سود خالص سال ${fyLabel} نسبت به سال قبل ${pctText(g)} رشد کرده است.`;
  if (g < 0) return `سود خالص سال ${fyLabel} نسبت به سال قبل ${pctText(g)} کاهش یافته است.`;
  return null;
}
