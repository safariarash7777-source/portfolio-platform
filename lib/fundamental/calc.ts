// ماژول محاسبات بنیادی (WP4-۲) — TS خالص، قطعی، بدون وابستگی، تست‌دار.
// قانون ۱ بریف: مدل زبانی هرگز عدد محاسبه نمی‌کند — همهٔ اعداد این‌جا با کد
// حساب می‌شوند و «روایت»ها فقط قالب جملهٔ ثابت + جای‌گذاری همین اعدادند.
// اگر ورودیِ محاسبه‌ای موجود نیست، خروجی null است — عدد جایگزین ممنوع (قانون ۳/۷).

import type { CodalN10Data, CodalN30Data, SalesTrendRow } from "./types";

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

/* ── مشتق‌های ن-۳۰ (فعالیت ماهانه) — چارت‌های ۴–۶ (T5) ────────────────────── */

export interface N30MonthPoint {
  /** ماه جلالی مثل "1404-10" (از period_end جلالی داخل data). */
  month: string;
  totalAmount: number; // میلیون ریال
  domesticAmount: number;
  exportAmount: number;
}

export interface N30ProductAgg {
  name: string;
  amount: number; // جمع مبلغ فروش در بازه (میلیون ریال)
  sharePct: number | null;
}

export interface N30ProductMonth {
  month: string;
  rate: number | null; // نرخ فروش (ریال بر واحد)
  salesQty: number | null;
  productionQty: number | null;
}

export interface N30Derived {
  /** سری ماهانهٔ یکتاشده و مرتب (قدیم ← جدید). */
  months: N30MonthPoint[];
  /** سهم محصولات از فروش کل بازه (نزولی، حداکثر ۷ + «سایر»). */
  productMix: N30ProductAgg[];
  /** سهم صادرات از فروش کل بازه — null اگر فروش کل صفر. */
  exportSharePct: number | null;
  /** سری ماهانهٔ نرخ/مقدار برای محصول پرفروش‌ترین بازه. */
  topProductName: string | null;
  topProductMonths: N30ProductMonth[];
  /** تولید در برابر فروش کل ماهانه (فقط محصولات هم‌واحد با محصول اول). */
  prodVsSales: { month: string; production: number; sales: number }[];
}

/** مشتق‌های ن-۳۰ از چند گزارش ماهانه — ورودی تکراری/ناقص حذف می‌شود؛
 * هیچ عدد جایگزینی ساخته نمی‌شود (قانون ۳). */
export function deriveN30(reports: CodalN30Data[]): N30Derived {
  // یکتاسازی بر اساس ماه جلالی (period_end داخل data، مثل "1404-10-30").
  const byMonth = new Map<string, CodalN30Data>();
  for (const r of reports) {
    if (!r || !Array.isArray(r.products)) continue;
    const month = String(r.period_end).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!byMonth.has(month)) byMonth.set(month, r);
  }
  const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const months: N30MonthPoint[] = sorted.map(([month, r]) => {
    let dom = 0, exp = 0;
    for (const p of r.products) {
      const amt = p.sales_amount ?? 0;
      if (p.market === "صادراتی") exp += amt;
      else dom += amt;
    }
    return { month, totalAmount: r.period_total_amount ?? dom + exp, domesticAmount: dom, exportAmount: exp };
  });

  // تجمیع محصولی در کل بازه.
  const prodTotals = new Map<string, number>();
  for (const [, r] of sorted) {
    for (const p of r.products) {
      if (!p.product_name || p.sales_amount == null) continue;
      prodTotals.set(p.product_name, (prodTotals.get(p.product_name) ?? 0) + p.sales_amount);
    }
  }
  const grand = [...prodTotals.values()].reduce((a, b) => a + b, 0);
  const rankedAll = [...prodTotals.entries()].sort((a, b) => b[1] - a[1]);
  const top7 = rankedAll.slice(0, 7);
  const rest = rankedAll.slice(7).reduce((a, [, v]) => a + v, 0);
  const productMix: N30ProductAgg[] = top7.map(([name, amount]) => ({
    name, amount, sharePct: pct(amount, grand),
  }));
  if (rest > 0) productMix.push({ name: "سایر", amount: rest, sharePct: pct(rest, grand) });

  const exportTotal = months.reduce((a, m) => a + m.exportAmount, 0);
  const allTotal = months.reduce((a, m) => a + m.domesticAmount + m.exportAmount, 0);

  // محصول پرفروش‌ترین: سری نرخ/مقدار ماهانه.
  const topProductName = rankedAll[0]?.[0] ?? null;
  const topProductMonths: N30ProductMonth[] = topProductName
    ? sorted.map(([month, r]) => {
        const p = r.products.find((x) => x.product_name === topProductName) ?? null;
        return {
          month,
          rate: p?.sales_rate ?? null,
          salesQty: p?.sales_qty ?? null,
          productionQty: p?.production_qty ?? null,
        };
      })
    : [];

  // تولید در برابر فروش — جمع مقادیر همهٔ محصولات دارای هر دو مقدار
  // (واحدهای متفاوت در یک نماد معمولاً یکسان‌اند؛ اگر مقدار نبود آن ماه حذف).
  const prodVsSales = sorted
    .map(([month, r]) => {
      let production = 0, sales = 0, seen = 0;
      for (const p of r.products) {
        if (p.production_qty == null || p.sales_qty == null) continue;
        production += p.production_qty;
        sales += p.sales_qty;
        seen++;
      }
      return seen > 0 ? { month, production, sales } : null;
    })
    .filter((x): x is { month: string; production: number; sales: number } => x !== null);

  return {
    months,
    productMix,
    exportSharePct: allTotal > 0 ? pct(exportTotal, allTotal) : null,
    topProductName,
    topProductMonths,
    prodVsSales,
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
