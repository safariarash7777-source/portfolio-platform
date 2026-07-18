// lib/core/monthlyReport.ts — T1 «شناسنامهٔ بنیادی نماد» (دادهٔ ماهانهٔ ن-۳۰).
// محاسبات خالص و قطعی برای ۵ چارت سؤال‌محور صفحهٔ نماد.
// قواعد حاکم: دادهٔ ناموجود = null (هرگز درون‌یابی/عدد ساختگی)؛ ماه بدون گزارش
// = گپ واقعی؛ واحد مبالغ «میلیون ریال» (تأییدشده از سورس موتور کدال —
// relay/codal.mjs خط ۳۹۲: اعتبارسنجی مبلغ ≈ فروش×نرخ÷10^6).
// روایت‌ها فقط template‌ای و قطعی‌اند — هیچ ارزش‌داوری تجویزی.

import type { CodalN30Data } from "@/lib/fundamental/types";

/* ── انواع خروجی ─────────────────────────────────────────────────────────── */

/** نام ماه‌های جلالی برای برچسب محور (شمارهٔ ماه ۱..۱۲). */
export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
] as const;

/** یک ماه از سال مالی — value=null یعنی گزارشی برای آن ماه نیامده (گپ واقعی). */
export interface FYMonthPoint {
  /** شمارهٔ ماه جلالی ۱..۱۲ (تقویمی، نه ترتیب سال مالی). */
  monthNo: number;
  /** برچسب ماه جلالی مثل «دی». */
  monthLabel: string;
  /** کلید یکتای ماه مثل "1404-10". */
  monthKey: string;
  /** فروش ماه (میلیون ریال) — null = گزارش نیامده. */
  amount: number | null;
  /** تجمیعی از ابتدای سال مالی (میلیون ریال) — null = گزارش نیامده. */
  cumulative: number | null;
}

/** سری نرخ فروش یک (محصول×بازار) — گپ واقعی برای ماه بدون رکورد. */
export interface RateSeries {
  productName: string;
  market: "داخلی" | "صادراتی";
  label: string; // «محصول — داخلی»
  points: { monthKey: string; monthLabel: string; rate: number | null }[];
}

/** یک قلم از ترکیب فروش آخرین ماه. */
export interface MixSlice {
  name: string;
  market: "داخلی" | "صادراتی" | null; // null برای «سایر» ترکیبی
  amount: number; // میلیون ریال
  sharePct: number | null;
}

/** نقطهٔ مقایسهٔ تولید/فروش محصول اصلی. */
export interface ProdSalesPoint {
  monthKey: string;
  monthLabel: string;
  production: number;
  sales: number;
}

export interface MonthlySales {
  /** سال مالی جاری (جلالی، مثل ۱۴۰۵) و قبلی. */
  currentFY: number;
  priorFY: number | null;
  /** ۱۲ ماه سال مالی جاری به ترتیب سال مالی (ماه اول سال مالی اول). */
  currentMonths: FYMonthPoint[];
  /** همان ۱۲ اسلات برای سال مالی قبل (هم‌ترتیب با currentMonths). */
  priorMonths: FYMonthPoint[] | null;
  /** میانگین فروش ماه‌های دارای گزارش سال جاری (میلیون ریال) — null اگر هیچ. */
  avgCurrent: number | null;
  /** آخرین تجمیعی سال جاری و مقدار هم‌دورهٔ سال قبل (تا همان ماه). */
  cumulativeCurrent: number | null;
  cumulativePriorSamePoint: number | null;
  /** سری نرخ ۱–۳ (محصول×بازار) پرسهم در کل بازهٔ موجود. */
  rateSeries: RateSeries[];
  /** ترکیب فروش آخرین ماه دارای گزارش. */
  latestMonthKey: string | null;
  latestMonthLabel: string | null;
  latestMix: MixSlice[];
  latestDomesticAmount: number | null;
  latestExportAmount: number | null;
  latestExportSharePct: number | null;
  /** تولید در برابر فروش محصول اصلی (فقط ماه‌های دارای هر دو مقدار). */
  mainProductName: string | null;
  prodVsSales: ProdSalesPoint[];
  /** تعداد گزارش‌های یکتای استفاده‌شده. */
  reportCount: number;
}

/* ── ابزار ───────────────────────────────────────────────────────────────── */

function pct(numerator: number, denominator: number): number | null {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** کلید ماه "YYYY-MM" از period_end جلالی؛ نامعتبر → null. */
export function monthKeyOf(periodEnd: string): string | null {
  const m = String(periodEnd).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}`;
}

/** یکتاسازی گزارش‌ها بر اساس ماه — ورودی باید از جدید به قدیم مرتب باشد
 * (اولین دیده‌شده برنده است = جدیدترین اصلاحیه). گزارش با جمع صفر وقتی
 * نسخهٔ دیگری از همان ماه موجود است کنار گذاشته می‌شود. */
export function dedupeByMonth(reports: CodalN30Data[]): Map<string, CodalN30Data> {
  const byMonth = new Map<string, CodalN30Data>();
  for (const r of reports) {
    if (!r || !Array.isArray(r.products)) continue;
    const key = monthKeyOf(r.period_end);
    if (!key) continue;
    const prev = byMonth.get(key);
    if (!prev) { byMonth.set(key, r); continue; }
    // اگر نسخهٔ نگه‌داشته جمعِ صفر دارد و این نسخه جمع ناصفر، جایگزین شود.
    const prevTotal = prev.period_total_amount ?? 0;
    const curTotal = r.period_total_amount ?? 0;
    if (prevTotal === 0 && curTotal > 0) byMonth.set(key, r);
  }
  return byMonth;
}

/** ترتیب ماه‌های یک سال مالی که با ماه startMonth شروع می‌شود (۱..۱۲). */
export function fyMonthOrder(startMonth: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12; i++) out.push(((startMonth - 1 + i) % 12) + 1);
  return out;
}

/** استنتاج ماه شروع سال مالی از داده: ماه بعدِ ماهِ fy_cumulative≈period_total
 * قابل‌اتکا نیست؛ به‌جای آن از fiscal_year موتور استفاده می‌کنیم:
 * موتور fiscal_year را سال جلالیِ period_end می‌گذارد، پس برای شرکت با سال مالی
 * غیرمنطبق (مثلاً منتهی به شهریور) ماه‌های نیمهٔ دوم سالِ قبل هم همان fiscal_year
 * را می‌گیرند؟ خیر — موتور صرفاً پیشوند سال را می‌گیرد. راه قطعی و صادق:
 * گروه‌بندی بر اساس «سال مالی = سالِ جلالیِ period_end» و محور تقویمی فروردین…اسفند.
 * برای شرکت‌های سال مالی غیرمنطبق، تجمیعی fy_cumulative_amount خودِ گزارش
 * مرجع است (ازابتدای «سال مالی» واقعی شرکت) و صادقانه همان را نشان می‌دهیم. */
export function groupByFY(byMonth: Map<string, CodalN30Data>): Map<number, Map<number, CodalN30Data>> {
  const byFY = new Map<number, Map<number, CodalN30Data>>();
  for (const [key, r] of byMonth) {
    const y = Number(key.slice(0, 4));
    const mo = Number(key.slice(5, 7));
    if (!byFY.has(y)) byFY.set(y, new Map());
    byFY.get(y)!.set(mo, r);
  }
  return byFY;
}

function buildFYMonths(fy: number, months: Map<number, CodalN30Data> | undefined): FYMonthPoint[] {
  const out: FYMonthPoint[] = [];
  for (let mo = 1; mo <= 12; mo++) {
    const r = months?.get(mo) ?? null;
    out.push({
      monthNo: mo,
      monthLabel: JALALI_MONTHS[mo - 1],
      monthKey: `${fy}-${String(mo).padStart(2, "0")}`,
      amount: r ? (r.period_total_amount ?? null) : null,
      cumulative: r ? (r.fy_cumulative_amount ?? null) : null,
    });
  }
  return out;
}

/* ── محاسبهٔ اصلی ────────────────────────────────────────────────────────── */

/** ساخت مدل کامل «شناسنامهٔ فروش ماهانه» از گزارش‌های ن-۳۰ یک نماد.
 * ورودی: گزارش‌ها از جدید به قدیم (خروجی supabase.ts همین است).
 * خروجی null یعنی هیچ گزارش قابل‌استفاده‌ای وجود ندارد — بخش رندر نشود. */
export function buildMonthlySales(reports: CodalN30Data[]): MonthlySales | null {
  const byMonth = dedupeByMonth(reports ?? []);
  if (byMonth.size === 0) return null;

  const byFY = groupByFY(byMonth);
  const years = [...byFY.keys()].sort((a, b) => b - a);
  const currentFY = years[0];
  const priorFY = years.length > 1 ? years[1] : null;

  const currentMonths = buildFYMonths(currentFY, byFY.get(currentFY));
  const priorMonths = priorFY !== null ? buildFYMonths(priorFY, byFY.get(priorFY)) : null;

  const curVals = currentMonths.filter((m) => m.amount !== null).map((m) => m.amount as number);
  const avgCurrent = curVals.length > 0
    ? Math.round(curVals.reduce((a, b) => a + b, 0) / curVals.length)
    : null;

  // تجمیعی: آخرین ماهِ دارای گزارش سال جاری + هم‌نقطهٔ سال قبل (همان شمارهٔ ماه).
  let cumulativeCurrent: number | null = null;
  let cumulativePriorSamePoint: number | null = null;
  let lastReportedMonthNo: number | null = null;
  for (let i = currentMonths.length - 1; i >= 0; i--) {
    if (currentMonths[i].cumulative !== null) {
      cumulativeCurrent = currentMonths[i].cumulative;
      lastReportedMonthNo = currentMonths[i].monthNo;
      break;
    }
  }
  if (lastReportedMonthNo !== null && priorMonths) {
    const same = priorMonths.find((m) => m.monthNo === lastReportedMonthNo);
    cumulativePriorSamePoint = same?.cumulative ?? null;
  }

  // سری نرخ ۱–۳ (محصول×بازار) پرسهم؛ گپ واقعی برای ماه بدون رکورد.
  const sortedKeys = [...byMonth.keys()].sort();
  const comboTotals = new Map<string, { name: string; market: "داخلی" | "صادراتی"; amount: number }>();
  for (const key of sortedKeys) {
    const r = byMonth.get(key)!;
    for (const p of r.products) {
      if (!p.product_name || p.sales_amount == null) continue;
      const market: "داخلی" | "صادراتی" = p.market === "صادراتی" ? "صادراتی" : "داخلی";
      const ck = `${p.product_name}|${market}`;
      const prev = comboTotals.get(ck);
      if (prev) prev.amount += p.sales_amount;
      else comboTotals.set(ck, { name: p.product_name, market, amount: p.sales_amount });
    }
  }
  const topCombos = [...comboTotals.values()].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const rateSeries: RateSeries[] = topCombos.map((c) => ({
    productName: c.name,
    market: c.market,
    label: `${c.name} — ${c.market}`,
    points: sortedKeys.map((key) => {
      const r = byMonth.get(key)!;
      const p = r.products.find(
        (x) => x.product_name === c.name && (x.market === "صادراتی" ? "صادراتی" : "داخلی") === c.market,
      );
      const mo = Number(key.slice(5, 7));
      return { monthKey: key, monthLabel: JALALI_MONTHS[mo - 1], rate: p?.sales_rate ?? null };
    }),
  }));

  // ترکیب فروش آخرین ماه دارای گزارش.
  const latestKey = sortedKeys.length > 0 ? sortedKeys[sortedKeys.length - 1] : null;
  let latestMix: MixSlice[] = [];
  let latestDomesticAmount: number | null = null;
  let latestExportAmount: number | null = null;
  let latestExportSharePct: number | null = null;
  let latestMonthLabel: string | null = null;
  if (latestKey) {
    const r = byMonth.get(latestKey)!;
    latestMonthLabel = JALALI_MONTHS[Number(latestKey.slice(5, 7)) - 1];
    let dom = 0, exp = 0;
    const items: { name: string; market: "داخلی" | "صادراتی"; amount: number }[] = [];
    for (const p of r.products) {
      if (!p.product_name || p.sales_amount == null || p.sales_amount <= 0) continue;
      const market: "داخلی" | "صادراتی" = p.market === "صادراتی" ? "صادراتی" : "داخلی";
      if (market === "صادراتی") exp += p.sales_amount; else dom += p.sales_amount;
      items.push({ name: p.product_name, market, amount: p.sales_amount });
    }
    const total = dom + exp;
    latestDomesticAmount = dom;
    latestExportAmount = exp;
    latestExportSharePct = total > 0 ? pct(exp, total) : null;
    const ranked = items.sort((a, b) => b.amount - a.amount);
    const top = ranked.slice(0, 6);
    const rest = ranked.slice(6).reduce((a, x) => a + x.amount, 0);
    latestMix = top.map((x) => ({
      name: x.name, market: x.market, amount: x.amount, sharePct: pct(x.amount, total),
    }));
    if (rest > 0) latestMix.push({ name: "سایر", market: null, amount: rest, sharePct: pct(rest, total) });
  }

  // تولید در برابر فروش محصول اصلی (پرسهم‌ترین محصول صرف‌نظر از بازار).
  const prodTotals = new Map<string, number>();
  for (const key of sortedKeys) {
    for (const p of byMonth.get(key)!.products) {
      if (!p.product_name || p.sales_amount == null) continue;
      prodTotals.set(p.product_name, (prodTotals.get(p.product_name) ?? 0) + p.sales_amount);
    }
  }
  const mainProductName = [...prodTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const prodVsSales: ProdSalesPoint[] = [];
  if (mainProductName) {
    for (const key of sortedKeys) {
      const r = byMonth.get(key)!;
      let production = 0, sales = 0, seen = false;
      for (const p of r.products) {
        if (p.product_name !== mainProductName) continue;
        if (p.production_qty == null || p.sales_qty == null) continue;
        production += p.production_qty;
        sales += p.sales_qty;
        seen = true;
      }
      if (seen) {
        prodVsSales.push({
          monthKey: key,
          monthLabel: JALALI_MONTHS[Number(key.slice(5, 7)) - 1],
          production,
          sales,
        });
      }
    }
  }

  return {
    currentFY,
    priorFY,
    currentMonths,
    priorMonths,
    avgCurrent,
    cumulativeCurrent,
    cumulativePriorSamePoint,
    rateSeries,
    latestMonthKey: latestKey,
    latestMonthLabel,
    latestMix,
    latestDomesticAmount,
    latestExportAmount,
    latestExportSharePct,
    mainProductName,
    prodVsSales,
    reportCount: byMonth.size,
  };
}

/* ── روایت‌های template‌ای (متن خام با ارقام لاتین؛ UI فارسی‌سازی می‌کند) ── */

function pctText(v: number): string {
  const a = Math.abs(v);
  return `${a % 1 === 0 ? a.toFixed(0) : a.toFixed(1)} درصد`;
}

/** روایت چارت ۱: فروش آخرین ماه نسبت به میانگین سال جاری. */
export function narrativeMonthlyVsAvg(m: MonthlySales): string | null {
  if (m.avgCurrent === null || m.avgCurrent === 0 || !m.latestMonthLabel) return null;
  let latestAmount: number | null = null;
  for (let i = m.currentMonths.length - 1; i >= 0; i--) {
    if (m.currentMonths[i].amount !== null) { latestAmount = m.currentMonths[i].amount; break; }
  }
  if (latestAmount === null) return null;
  const diff = pct(latestAmount - m.avgCurrent, m.avgCurrent);
  if (diff === null || diff === 0) return null;
  return diff > 0
    ? `فروش ${m.latestMonthLabel} حدود ${pctText(diff)} بالاتر از میانگین ماهانهٔ سال ${m.currentFY} است.`
    : `فروش ${m.latestMonthLabel} حدود ${pctText(diff)} پایین‌تر از میانگین ماهانهٔ سال ${m.currentFY} است.`;
}

/** روایت چارت ۲: تجمیعی سال جاری در برابر هم‌دورهٔ سال قبل. */
export function narrativeCumulative(m: MonthlySales): string | null {
  if (m.cumulativeCurrent === null || m.cumulativePriorSamePoint === null || m.cumulativePriorSamePoint === 0) return null;
  const g = pct(m.cumulativeCurrent - m.cumulativePriorSamePoint, Math.abs(m.cumulativePriorSamePoint));
  if (g === null || g === 0) return null;
  return g > 0
    ? `فروش تجمیعی از ابتدای سال مالی ${m.currentFY} نسبت به دورهٔ مشابه سال قبل ${pctText(g)} بیشتر است.`
    : `فروش تجمیعی از ابتدای سال مالی ${m.currentFY} نسبت به دورهٔ مشابه سال قبل ${pctText(g)} کمتر است.`;
}

/** روایت چارت ۳: نرخ فروش آخرین ماهِ سری اول نسبت به میانگین کل بازه. */
export function narrativeRate(m: MonthlySales): string | null {
  const s = m.rateSeries[0];
  if (!s) return null;
  const vals = s.points.filter((p) => p.rate !== null).map((p) => p.rate as number);
  if (vals.length < 2) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg === 0) return null;
  let last: { monthLabel: string; rate: number } | null = null;
  for (let i = s.points.length - 1; i >= 0; i--) {
    if (s.points[i].rate !== null) { last = { monthLabel: s.points[i].monthLabel, rate: s.points[i].rate as number }; break; }
  }
  if (!last) return null;
  const diff = pct(last.rate - avg, avg);
  if (diff === null || diff === 0) return null;
  return diff > 0
    ? `نرخ فروش ${s.productName} در ${last.monthLabel} حدود ${pctText(diff)} بالاتر از میانگین بازهٔ گزارش‌شده است.`
    : `نرخ فروش ${s.productName} در ${last.monthLabel} حدود ${pctText(diff)} پایین‌تر از میانگین بازهٔ گزارش‌شده است.`;
}

/** روایت چارت ۴: سهم صادرات آخرین ماه. */
export function narrativeMix(m: MonthlySales): string | null {
  if (m.latestExportSharePct === null || !m.latestMonthLabel) return null;
  if (m.latestExportSharePct === 0)
    return `در ${m.latestMonthLabel} فروش صادراتی گزارش نشده و کل فروش داخلی است.`;
  return `در ${m.latestMonthLabel} حدود ${pctText(m.latestExportSharePct)} از فروش صادراتی بوده است.`;
}

/** روایت چارت ۵: انبارش/تخلیهٔ موجودی محصول اصلی در آخرین ماه. */
export function narrativeProdVsSales(m: MonthlySales): string | null {
  const last = m.prodVsSales.length > 0 ? m.prodVsSales[m.prodVsSales.length - 1] : null;
  if (!last || !m.mainProductName || last.sales === 0) return null;
  const ratio = pct(last.production - last.sales, last.sales);
  if (ratio === null || ratio === 0) return null;
  return ratio > 0
    ? `در ${last.monthLabel} تولید ${m.mainProductName} حدود ${pctText(ratio)} بیشتر از فروش بوده است (افزایش موجودی).`
    : `در ${last.monthLabel} تولید ${m.mainProductName} حدود ${pctText(ratio)} کمتر از فروش بوده است (فروش از موجودی).`;
}
