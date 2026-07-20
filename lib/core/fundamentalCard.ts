// کارتِ بنیادیِ نمادمحور (WP-F) — موتور خالص طبق docs/SPEC-symbol-fundamental-card.md
//
// «یک موتور، دو نما»: نمای عمومی /symbol/[symbol] (لایهٔ ۱/۲، لایهٔ ۳ محدود)
// و پنل رصد ادمین (لایهٔ ۳ کامل) هر دو از همین ماژول می‌خوانند.
//
// قیدها (اسکیل iran-market-data + Blueprint):
// - فقط خواندن؛ codal_reports append-only دست‌نخورده.
// - null صادق برای دادهٔ غایب — هیچ درون‌یابی/عدد ساختگی.
// - روایت لایهٔ ۱ فقط template قطعی (نه LLM)؛ بدون واژهٔ ممنوع
//   («سیگنال/خرید/فروش/توصیه» هرگز در خروجی این ماژول نیست — تضمین در تست).
// - واحدها (قانون D3): sales_amount/period_total_amount در codal_reports
//   «میلیون ریال» است. تبدیل متمرکز اینجا: میلیون ریال ÷ 1e4 = میلیارد تومان.
//   sales_rate «ریال بر واحد» — بدون تبدیل، فقط برچسب.
// - خروجی متن با ارقام لاتین؛ لایهٔ UI با toPersianDigits نمایش می‌دهد.

import type { CodalN30Data } from "@/lib/fundamental/types";

/* ── واحدها ── */

/** میلیون ریال → میلیارد تومان (÷ ۱۰٬۰۰۰). ورودی نامعتبر → null. */
export function mrialToBToman(mrial: number | null | undefined): number | null {
  if (typeof mrial !== "number" || !isFinite(mrial)) return null;
  return mrial / 10_000;
}

/* ── نام ماه جلالی برای روایت ── */

const JMONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/** «1404-04» → «تیر ۱۴۰۴» (ارقام لاتین؛ UI فارسی می‌کند). نامعتبر → null. */
export function jalaliMonthLabel(month: string | null | undefined): string | null {
  if (typeof month !== "string") return null;
  const m = month.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  return `${JMONTHS[mo - 1]} ${m[1]}`;
}

/* ── مدل کارت ── */

export interface CardMonth {
  /** ماه جلالی «YYYY-MM» */
  month: string;
  /** فروش ماه — میلیون ریال (واحد مبدأ) */
  totalAmount: number;
  domesticAmount: number;
  exportAmount: number;
}

export interface CardProduct {
  name: string;
  market: "داخلی" | "صادراتی";
  productionQty: number | null;
  salesQty: number | null;
  salesRate: number | null; // ریال بر واحد
  salesAmount: number | null; // میلیون ریال
}

export interface FundamentalCardData {
  symbol: string;
  /** آخرین ماه گزارش‌شده */
  latestMonth: string | null;
  /** فروش آخرین ماه — میلیارد تومان */
  latestSalesBToman: number | null;
  /** رشد YoY فروش آخرین ماه (٪، یک رقم اعشار) — حلقهٔ غایب = null */
  yoyPct: number | null;
  /** محصول اصلی (بیشترین مبلغ فروش در آخرین ماه) */
  topProductName: string | null;
  /** سهم صادرات از فروش آخرین ماه (٪) */
  exportSharePct: number | null;
  /** روایت لایهٔ ۱ — template قطعی؛ دادهٔ غایب = بند حذف */
  narrative: string | null;
  /** سری ۱۲ ماه اخیر (قدیم←جدید) برای روند لایهٔ ۲ */
  months12: CardMonth[];
  /** YoY هر ماه از سری (ماه بدون حلقهٔ سال قبل = null) */
  monthlyYoY: Array<{ month: string; yoyPct: number | null }>;
  /** شکاف تولید−فروش آخرین ماه (واحد کالا) — کشف انبارش */
  prodSalesGap: number | null;
  /** نرخ فروش محصول اصلی در آخرین ماه (ریال بر واحد) */
  topProductRate: number | null;
  /** جدول خام محصولات آخرین ماه (لایهٔ ۳) */
  latestProducts: CardProduct[];
  /** لینک منبع رسمی کدال */
  sourceUrl: string | null;
  sourceTitle: string | null;
}

/* ── محاسبات خالص ── */

/** درصد رشد با یک رقم اعشار؛ پایهٔ صفر/نامعتبر → null. */
function growth(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null;
  if (!isFinite(current) || !isFinite(prior) || prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

/** dedupe گزارش‌ها بر اساس ماه (اولین دیده‌شده برنده — ورودی باید جدیدترین-اول باشد
 * یا از قبل یکتا) و مرتب قدیم←جدید. */
function monthSeries(reports: CodalN30Data[]): Map<string, CodalN30Data> {
  const byMonth = new Map<string, CodalN30Data>();
  for (const r of reports) {
    if (!r || !Array.isArray(r.products)) continue;
    const month = String(r.period_end).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!byMonth.has(month)) byMonth.set(month, r);
  }
  return new Map([...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** کلید ماهِ همین ماه در سال قبل: «1404-04» → «1403-04». */
export function priorYearMonth(month: string): string | null {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return `${parseInt(m[1], 10) - 1}-${m[2]}`;
}

function pctOf(part: number, total: number): number | null {
  if (!isFinite(part) || !isFinite(total) || total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function fmtB(n: number): string {
  // میلیارد تومان با حداکثر یک رقم اعشار — ارقام لاتین (UI فارسی می‌کند)
  const v = Math.round(n * 10) / 10;
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);
}

function fmtPct(v: number): string {
  const a = Math.abs(v);
  return a % 1 === 0 ? a.toFixed(0) : a.toFixed(1);
}

/**
 * روایت لایهٔ ۱ — template قطعی طبق SPEC §۲:
 * «فروش [ماه]: X میلیارد تومان — Y٪ نسبت به همین ماه پارسال. عمدتاً از [محصول] و Z٪ صادرات.»
 * هر بند فقط وقتی داده‌اش هست؛ بدون داده‌ٔ فروش → کل روایت null.
 */
export function buildNarrative(d: {
  monthLabel: string | null;
  salesBToman: number | null;
  yoyPct: number | null;
  topProductName: string | null;
  exportSharePct: number | null;
}): string | null {
  if (d.monthLabel == null || d.salesBToman == null) return null;
  let s = `فروش ${d.monthLabel}: ${fmtB(d.salesBToman)} میلیارد تومان`;
  if (d.yoyPct != null) {
    s += d.yoyPct >= 0
      ? ` — ${fmtPct(d.yoyPct)} درصد بیشتر از همین ماه پارسال`
      : ` — ${fmtPct(d.yoyPct)} درصد کمتر از همین ماه پارسال`;
  }
  s += ".";
  const parts: string[] = [];
  if (d.topProductName) parts.push(`عمدتاً از ${d.topProductName}`);
  if (d.exportSharePct != null && d.exportSharePct > 0)
    parts.push(`${fmtPct(d.exportSharePct)} درصد صادراتی`);
  if (parts.length > 0) s += ` ${parts.join(" و ")}.`;
  return s;
}

/**
 * ساخت کامل دادهٔ کارت از گزارش‌های ن-۳۰ یک نماد — تابع خالص و تست‌پذیر.
 * ورودی خالی/نامعتبر → کارت با فیلدهای null (UI بخش را حذف می‌کند).
 */
export function buildFundamentalCard(
  symbol: string,
  reports: CodalN30Data[],
  source?: { title: string | null; url: string | null }
): FundamentalCardData {
  const series = monthSeries(reports);
  const monthKeys = [...series.keys()];
  const latestMonth = monthKeys.length > 0 ? monthKeys[monthKeys.length - 1] : null;
  const latest = latestMonth ? series.get(latestMonth)! : null;

  // سری ۱۲ ماه اخیر
  const months12: CardMonth[] = monthKeys.slice(-12).map((month) => {
    const r = series.get(month)!;
    let dom = 0, exp = 0;
    for (const p of r.products) {
      const amt = p.sales_amount ?? 0;
      if (p.market === "صادراتی") exp += amt;
      else dom += amt;
    }
    return {
      month,
      totalAmount: r.period_total_amount ?? dom + exp,
      domesticAmount: dom,
      exportAmount: exp,
    };
  });

  // YoY هر ماه (از کل سری، نه فقط ۱۲ ماه)
  const totalOf = (month: string): number | null => {
    const r = series.get(month);
    return r ? (r.period_total_amount ?? null) : null;
  };
  const monthlyYoY = months12.map(({ month }) => {
    const prior = priorYearMonth(month);
    return { month, yoyPct: prior ? growth(totalOf(month), totalOf(prior)) : null };
  });

  // آخرین ماه: محصول اصلی، سهم صادرات، شکاف تولید−فروش، نرخ محصول اصلی
  let topProductName: string | null = null;
  let topProductRate: number | null = null;
  let exportSharePct: number | null = null;
  let prodSalesGap: number | null = null;
  const latestProducts: CardProduct[] = [];
  if (latest) {
    let best = -Infinity;
    let exp = 0, all = 0;
    let gap = 0, gapSeen = 0;
    for (const p of latest.products) {
      latestProducts.push({
        name: p.product_name,
        market: p.market,
        productionQty: p.production_qty,
        salesQty: p.sales_qty,
        salesRate: p.sales_rate,
        salesAmount: p.sales_amount,
      });
      const amt = p.sales_amount ?? null;
      if (amt != null) {
        all += amt;
        if (p.market === "صادراتی") exp += amt;
        if (amt > best) {
          best = amt;
          topProductName = p.product_name;
          topProductRate = p.sales_rate;
        }
      }
      if (p.production_qty != null && p.sales_qty != null) {
        gap += p.production_qty - p.sales_qty;
        gapSeen++;
      }
    }
    exportSharePct = all > 0 ? pctOf(exp, all) : null;
    prodSalesGap = gapSeen > 0 ? gap : null;
  }

  const latestSalesM = latest ? (latest.period_total_amount ?? null) : null;
  const priorM = latestMonth ? priorYearMonth(latestMonth) : null;
  const yoyPct = priorM ? growth(latestSalesM, totalOf(priorM)) : null;
  const latestSalesBToman = mrialToBToman(latestSalesM);

  const narrative = buildNarrative({
    monthLabel: jalaliMonthLabel(latestMonth),
    salesBToman: latestSalesBToman,
    yoyPct,
    topProductName,
    exportSharePct,
  });

  return {
    symbol,
    latestMonth,
    latestSalesBToman,
    yoyPct,
    topProductName,
    exportSharePct,
    narrative,
    months12,
    monthlyYoY,
    prodSalesGap,
    topProductRate,
    latestProducts,
    sourceUrl: source?.url ?? null,
    sourceTitle: source?.title ?? null,
  };
}
