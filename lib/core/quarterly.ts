// T3 — تحلیل فصلی از گزارش‌های تجمیعی ن-۱۰ (هستهٔ علمی، بدون I/O).
//
// گزارش‌های ن-۱۰ تجمیعی‌اند (۳/۶/۹/۱۲ماهه از ابتدای سال مالی).
// فصل‌سازی با «تفاضل زنجیره‌ای» در همان سال مالی:
//   Q1 = ۳ماهه، Q2 = ۶ماهه − ۳ماهه، Q3 = ۹ماهه − ۶ماهه، Q4 = ۱۲ماهه − ۹ماهه.
//
// قواعد سخت (قانون ۲ حاکم — هیچ عدد ساختگی):
// - حلقهٔ غایب در زنجیره → آن فصل null؛ هرگز تقسیم یا درون‌یابی نمی‌شود.
// - دو نسخه از یک دوره: «حسابرسی‌شده» مقدم؛ سپس اصلاحیهٔ متأخر (بزرگ‌ترین id).
// - تفاضل منفیِ نامعقول در درآمد (تعدیل گزارش قبلی) → فصل null + پرچم adjusted.
// - EPS TTM فقط با ۴ فصل متوالیِ کامل؛ در غیر این صورت نقطه‌ای وجود ندارد.
//
// واحد مبالغ: میلیون ریال (مطابق موتور پارس کدال). eps بر حسب ریال.

import { isMillionRialUnit } from "../fundamental/units";
import type { ReportScope } from "../fundamental/types";

export interface QuarterInput {
  /** شناسهٔ یکتای ردیف در codal_reports — برای تقدم اصلاحیهٔ متأخر. */
  id: number;
  /** پایان دورهٔ جلالی مثل "1404-06-31". */
  period_end: string;
  /** طول دورهٔ تجمیعی: ۳ | ۶ | ۹ | ۱۲. */
  period_months: number;
  audited: boolean;
  /** Producer evidence must be forwarded by the caller; absence is unknown. */
  unit?: string | null;
  scope?: ReportScope;
  /** سرمایه (میلیون ریال) — برای EPS TTM. */
  capital: number;
  revenue: number;
  gross_profit: number;
  operating_profit: number;
  net_profit: number;
}

/** یک فصل مشتق‌شده؛ مقادیر null یعنی زنجیرهٔ لازم موجود نبود. */
export interface DerivedQuarter {
  /** سال جلالیِ شروع زنجیره؛ در سال مالی غیرتقویمی با سال پایان متفاوت است. */
  fy: number;
  /** شمارهٔ فصل ۱..۴. */
  q: 1 | 2 | 3 | 4;
  /** برچسب مثل "Q1 1404". */
  label: string;
  /** پایان دورهٔ تجمیعیِ متناظر (جلالی) — برای یافتن قیمت پایان فصل. */
  periodEnd: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingProfit: number | null;
  netProfit: number | null;
  /** حاشیه‌ها (٪ از درآمد فصل)؛ فقط وقتی درآمد فصل > 0. */
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  /** true یعنی تفاضل منفی نامعقول در درآمد دیده شد (تعدیل) و فصل null شد. */
  adjusted: boolean;
  /** سرمایهٔ گزارش انتهای زنجیرهٔ همین فصل (میلیون ریال). */
  capital: number | null;
}

export interface TtmPoint {
  /** برچسب فصل انتهایی پنجره مثل "Q2 1404". */
  label: string;
  /** پایان دورهٔ فصل انتهایی (جلالی) — قیمت پایانی همین تاریخ ملاک است. */
  periodEnd: string;
  /** سود خالص ۴ فصل متوالی (میلیون ریال). */
  netProfitTtm: number;
  /** EPS TTM (ریال) = netProfitTtm × ۱۰۰۰ ÷ سرمایهٔ آخرین فصل پنجره. */
  epsTtm: number;
}

/* ---------- انتخاب نسخهٔ معتبر هر دوره ---------- */

/** برای هر (ماه شروع زنجیره، طول دوره) یک گزارش؛ کلید مثل 1404-07|3 است. */
export function dedupePeriods(reports: QuarterInput[]): Map<string, QuarterInput> {
  const byPeriod = new Map<string, QuarterInput>();
  for (const r of reports) {
    if (!r || !r.period_end || ![3, 6, 9, 12].includes(r.period_months)) continue;
    const chain = fiscalChainKey(r);
    if (!chain) continue;
    const key = `${chain}|${r.period_months}`;
    const prev = byPeriod.get(key);
    if (!prev) {
      byPeriod.set(key, r);
      continue;
    }
    if (r.audited && !prev.audited) byPeriod.set(key, r);
    else if (r.audited === prev.audited && r.id > prev.id) byPeriod.set(key, r);
  }
  return byPeriod;
}

/** هویت زنجیره از ماه اول دورهٔ تجمیعی، بدون تخمین رقم یا پایان سال مالی.
 * سال تنها کافی نیست: دو زنجیره با ماه شروع متفاوت می‌توانند در یک سال باشند.
 * برای سال مالی شهریور: 1404-09/3 و 1405-06/12 هر دو کلید 1404-07 دارند. */
export function fiscalChainKey(r: Pick<QuarterInput, "period_end" | "period_months">): string | null {
  const m = String(r.period_end).match(/^(1[34]\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!m || ![3, 6, 9, 12].includes(r.period_months)) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // شروع دوره = (y, mo) منهای months ماه + ۱ ماه (ماه اول دوره)
  const total = y * 12 + (mo - 1) - r.period_months + 1;
  const startYear = Math.floor(total / 12);
  return `${startYear}-${String(total % 12 + 1).padStart(2, "0")}`;
}

export function fyOf(r: Pick<QuarterInput, "period_end" | "period_months">): number {
  return Number(fiscalChainKey(r)?.slice(0, 4)) || 0;
}

/* ---------- فصل‌سازی با تفاضل زنجیره‌ای ---------- */

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function comparable(r: QuarterInput | undefined): r is QuarterInput {
  return !!r && r.scope === "company" && isMillionRialUnit(r.unit);
}

function difference(current: unknown, prior: unknown): number | null {
  if (!finiteNumber(current) || !finiteNumber(prior)) return null;
  const value = current - prior;
  return Number.isFinite(value) ? value : null;
}

function toQuarter(
  fy: number,
  q: 1 | 2 | 3 | 4,
  cur: QuarterInput | undefined,
  prev: QuarterInput | undefined,
): DerivedQuarter {
  const label = `Q${q} ${fy}`;
  const empty: DerivedQuarter = {
    fy,
    q,
    label,
    periodEnd: cur?.period_end ?? "",
    revenue: null,
    grossProfit: null,
    operatingProfit: null,
    netProfit: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    adjusted: false,
    capital: comparable(cur) && finiteNumber(cur.capital) && cur.capital > 0 ? cur.capital : null,
  };
  if (!comparable(cur)) return empty;
  if (q === 1) {
    // Q1 مستقیم از گزارش ۳ماهه
    return finalize(empty, cur.revenue, cur.gross_profit, cur.operating_profit, cur.net_profit);
  }
  if (!comparable(prev)) return empty; // حلقهٔ غایب/ناسازگار → null
  const rev = difference(cur.revenue, prev.revenue);
  if (rev !== null && rev < 0) {
    // تعدیل گزارش قبلی — فصل نامعتبر است؛ پرچم بزنیم و null بدهیم.
    return { ...empty, adjusted: true };
  }
  return finalize(
    empty,
    rev,
    difference(cur.gross_profit, prev.gross_profit),
    difference(cur.operating_profit, prev.operating_profit),
    difference(cur.net_profit, prev.net_profit),
  );
}

function finalize(
  base: DerivedQuarter,
  revenue: number | null,
  gross: number | null,
  op: number | null,
  net: number | null,
): DerivedQuarter {
  const margin = (value: unknown) => {
    if (!finiteNumber(revenue) || revenue <= 0 || !finiteNumber(value)) return null;
    const ratio = (value / revenue) * 100;
    return Number.isFinite(ratio) ? ratio : null;
  };
  return {
    ...base,
    revenue: finiteNumber(revenue) ? revenue : null,
    grossProfit: finiteNumber(gross) ? gross : null,
    operatingProfit: finiteNumber(op) ? op : null,
    netProfit: finiteNumber(net) ? net : null,
    grossMargin: margin(gross), operatingMargin: margin(op), netMargin: margin(net),
  };
}

/** فصل‌سازی همهٔ سال‌های مالی موجود؛ خروجی مرتب از قدیم به جدید. */
export function deriveQuarters(reports: QuarterInput[]): DerivedQuarter[] {
  const byPeriod = dedupePeriods(reports);
  const chains = new Set<string>();
  for (const key of byPeriod.keys()) chains.add(key.split("|")[0]);
  const out: DerivedQuarter[] = [];
  for (const chain of [...chains].sort()) {
    const fy = Number(chain.slice(0, 4));
    const m3 = byPeriod.get(`${chain}|3`);
    const m6 = byPeriod.get(`${chain}|6`);
    const m9 = byPeriod.get(`${chain}|9`);
    const m12 = byPeriod.get(`${chain}|12`);
    if (!m3 && !m6 && !m9 && !m12) continue;
    out.push(toQuarter(fy, 1, m3, undefined));
    out.push(toQuarter(fy, 2, m6, m3));
    out.push(toQuarter(fy, 3, m9, m6));
    out.push(toQuarter(fy, 4, m12, m9));
  }
  // فصل‌های انتهایی که هنوز گزارش ندارند (آیندهٔ سال جاری) حذف می‌شوند:
  // از انتها تا اولین فصل دارای دادهٔ واقعی یا پرچم adjusted، فصل‌های تمام-null بدون گزارش حذف.
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.revenue === null && !last.adjusted && last.periodEnd === "") out.pop();
    else break;
  }
  return out;
}

/* ---------- P/E TTM ---------- */

/** نقاط EPS TTM: فقط پنجره‌های ۴ فصل «متوالی و کامل» (netProfit همهٔ ۴ فصل موجود).
 * متوالی یعنی (fy, q) پشت‌سرهم بدون گپ. */
export function ttmSeries(quarters: DerivedQuarter[]): TtmPoint[] {
  const seq = quarters.filter((q) => q.periodEnd !== "" || q.revenue !== null || q.adjusted);
  const out: TtmPoint[] = [];
  for (let i = 3; i < seq.length; i++) {
    const win = [seq[i - 3], seq[i - 2], seq[i - 1], seq[i]];
    // توالی بدون گپ
    let consecutive = true;
    for (let k = 1; k < 4; k++) {
      const a = win[k - 1];
      const b = win[k];
      const expectedQ = a.q === 4 ? 1 : a.q + 1;
      const expectedFy = a.q === 4 ? a.fy + 1 : a.fy;
      const monthIndex = (end: string) => Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7));
      if (b.q !== expectedQ || b.fy !== expectedFy || monthIndex(b.periodEnd) - monthIndex(a.periodEnd) !== 3) {
        consecutive = false;
        break;
      }
    }
    if (!consecutive) continue;
    if (win.some((w) => !finiteNumber(w.netProfit))) continue; // ۴ فصل کامل شرط سخت
    const last = win[3];
    if (!last.capital || last.capital <= 0 || !last.periodEnd) continue;
    const netTtm = win.reduce((s, w) => s + (w.netProfit as number), 0);
    const epsTtm = (netTtm * 1000) / last.capital;
    if (!Number.isFinite(netTtm) || !Number.isFinite(epsTtm)) continue;
    out.push({
      label: last.label,
      periodEnd: last.periodEnd,
      netProfitTtm: netTtm,
      // سرمایه میلیون ریال، سهم ۱۰۰۰ریالی → تعداد سهم = capital×۱۰۰۰؛
      // EPS = سود(میلیون ریال)×۱۰^۶ ÷ (capital×۱۰۰۰) = سود×۱۰۰۰÷capital (ریال).
      epsTtm,
    });
  }
  return out;
}

/** P/E یک نقطه: قیمت (ریال) ÷ EPS TTM (ریال)؛ فقط EPS مثبت. */
export function peOf(priceRial: number | null, epsTtm: number): number | null {
  if (priceRial == null || !isFinite(priceRial) || priceRial <= 0) return null;
  if (!isFinite(epsTtm) || epsTtm <= 0) return null;
  return priceRial / epsTtm;
}

/** میانگین سادهٔ مقادیر غیر-null؛ کمتر از ۲ مقدار → null. */
export function avgOf(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null && isFinite(x));
  if (v.length < 2) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

/** میانگین متحرک ۴فصلهٔ یک سری حاشیه؛ نقطهٔ i فقط وقتی هر ۴ مقدار اخیر موجود باشد. */
export function rolling4(values: Array<number | null>): Array<number | null> {
  return values.map((_, i) => {
    if (i < 3) return null;
    const win = values.slice(i - 3, i + 1);
    if (win.some((x) => x == null || !isFinite(x))) return null;
    return (win as number[]).reduce((s, x) => s + x, 0) / 4;
  });
}
