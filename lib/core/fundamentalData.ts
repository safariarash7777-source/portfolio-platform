import { withDeadline } from "../deadline";
// دادهٔ سرورِ پرست‌های بنیادی (T2-ب) — ساخت Map های YoY از codal_reports.
//
// شکل داده (راستی‌آزمایی‌شده از دیتابیس زنده):
// - report_kind مقدارهای فارسی دارد: «ن-۳۰» و «ن-۱۰».
// - ن-۳۰ data: { period_end: "1404-04-31", period_total_amount, fy_cumulative_amount, products, fiscal_year }
//   ⟵ درآمد ماه = period_total_amount (میلیون ریال).
// - ن-۱۰ data: { period_end, period_months, standalone: { revenue, ... }, unit, audited }
//   ⟵ درآمد تجمیعی دوره = standalone.revenue (واحد گزارش خود شرکت).
//
// دو خواندن مستقل با صفحه‌بندی و ستون‌های محدود؛ کش فقط نتیجهٔ کامل، ۱ساعته.
// اصل صداقت: نماد بدون هر دو دوره در Map نمی‌آید — false positive ممنوع.

import { createCompleteReader, PagedReadError, readAllPages } from "../supabase/paged-read";
import { yoyGrowthPercent, type YoYMap } from "./fundamentalPresets";

export interface CodalRow {
  id: number;
  captured_at: string;
  symbol: string | null;
  data: Record<string, unknown> | null;
}

/** Fetch the whole filtered append-only set, then apply amendment precedence. */
export async function fetchCodal(reportKind: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new PagedReadError("configuration", 0);
  const result = await withDeadline(signal => readAllPages<CodalRow>({
    url, anon, table: "codal_reports", select: "id,captured_at,symbol,data",
    filters: { report_kind: `eq.${reportKind}` }, signal,
  }), 15000);
  if (result.data.some(row => typeof row.captured_at !== "string" || !Number.isFinite(Date.parse(row.captured_at)))) {
    throw new PagedReadError("invalid_capture_time", 0);
  }
  result.data.sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at) || b.id - a.id);
  return result;
}
const readMonthly = createCompleteReader(() => fetchCodal("ن-۳۰"), () => [] as CodalRow[], 3600000);
const readQuarterly = createCompleteReader(() => fetchCodal("ن-۱۰"), () => [] as CodalRow[], 3600000);
function num(x: unknown): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

/** جلالی «YYYY-MM-DD» یا «YYYY/MM/DD» → {y, m} — نامعتبر null */
function jym(s: unknown): { y: number; m: number } | null {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})[\/-](\d{1,2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (!(y > 1300 && y < 1500) || !(mo >= 1 && mo <= 12)) return null;
  return { y, m: mo };
}

/**
 * رشد درآمد ماهانهٔ YoY از ن-۳۰:
 * برای هر نماد، آخرین ماه گزارش‌شده و همان ماهِ سال قبل — هر دو باید موجود باشند.
 */
export function monthlyYoYFromRows(rows: readonly CodalRow[]): YoYMap {
  // نماد → (سال×۱۰۰+ماه) → درآمد ماه (period_total_amount، میلیون ریال)
  const bySymbol = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const d = r.data;
    if (!d || !r.symbol) continue;
    const pe = jym(d["period_end"]);
    const amt = num(d["period_total_amount"]);
    if (!pe || amt == null) continue;
    let m = bySymbol.get(r.symbol);
    if (!m) {
      m = new Map();
      bySymbol.set(r.symbol, m);
    }
    const key = pe.y * 100 + pe.m;
    // rows به ترتیب captured_at نزولی — اولین دیده‌شده جدیدترین نسخه (اصلاحیه) است
    if (!m.has(key)) m.set(key, amt);
  }
  const out: YoYMap = new Map();
  for (const [sym, months] of bySymbol) {
    const keys = [...months.keys()].sort((a, b) => b - a);
    if (keys.length === 0) continue;
    const latest = keys[0];
    const prior = latest - 100; // همان ماه سال قبل
    const g = yoyGrowthPercent(months.get(latest), months.get(prior));
    if (g != null) out.set(sym, g);
  }
  return out;
}

/**
 * رشد درآمد فصلی YoY از ن-۱۰ (منطق تفاضل زنجیره‌ای T3):
 * فصل خالص = revenue(دورهٔ k ماهه) − revenue(دورهٔ k−3 ماههٔ همان سال مالی).
 * دورهٔ ۳ماهه خودش فصل است. فقط نمادهای دارای فصل جاری و همان فصل سال قبل.
 */
export function quarterlyYoYFromRows(rows: readonly CodalRow[]): YoYMap {
  // نماد → (سال×۱۰۰+ماهِ پایان دوره) → {months, revenue}
  const cum = new Map<string, Map<number, { months: number; revenue: number }>>();
  for (const r of rows) {
    const d = r.data;
    if (!d || !r.symbol) continue;
    const pe = jym(d["period_end"]);
    const pm = num(d["period_months"]);
    const st = (d["standalone"] ?? null) as Record<string, unknown> | null;
    const rev = st ? num(st["revenue"]) : null;
    if (!pe || pm == null || rev == null) continue;
    let m = cum.get(r.symbol);
    if (!m) {
      m = new Map();
      cum.set(r.symbol, m);
    }
    const key = pe.y * 100 + pe.m;
    if (!m.has(key)) m.set(key, { months: pm, revenue: rev });
  }
  const out: YoYMap = new Map();
  for (const [sym, periods] of cum) {
    const quarterOf = (key: number): number | null => {
      const cur = periods.get(key);
      if (!cur) return null;
      if (cur.months === 3) return cur.revenue;
      // دورهٔ ۳ ماه کوتاه‌تر همان سال مالی
      let py = Math.floor(key / 100);
      let pmm = (key % 100) - 3;
      if (pmm <= 0) {
        pmm += 12;
        py -= 1;
      }
      const prev = periods.get(py * 100 + pmm);
      if (!prev || prev.months !== cur.months - 3) return null;
      return cur.revenue - prev.revenue;
    };
    const keys = [...periods.keys()].sort((a, b) => b - a);
    if (keys.length === 0) continue;
    const latest = keys[0];
    const g = yoyGrowthPercent(quarterOf(latest), quarterOf(latest - 100));
    if (g != null) out.set(sym, g);
  }
  return out;
}

/** Compatible radar readers never compute from a partial scan. */
export async function buildMonthlyYoY(): Promise<YoYMap> {
  return monthlyYoYFromRows((await readMonthly()).data);
}
export async function buildQuarterlyYoY(): Promise<YoYMap> {
  return quarterlyYoYFromRows((await readQuarterly()).data);
}

/** Cache only complete report sets for an hour; errors carry coverage alongside values. */
export async function getFundamentalYoY() {
  const [monthly, quarterly] = await Promise.all([readMonthly(), readQuarterly()]);
  return {
    monthly: Object.fromEntries(monthlyYoYFromRows(monthly.data)),
    quarterly: Object.fromEntries(quarterlyYoYFromRows(quarterly.data)),
    coverage: { monthly: monthly.coverage, quarterly: quarterly.coverage },
  };
}
/** Independent on-demand kinds; one slow kind never holds the other. */
export async function getFundamentalKind(kind: "monthly" | "quarterly") {
  const result = await (kind === "monthly" ? readMonthly() : readQuarterly());
  return { ...result, data: Object.fromEntries(kind === "monthly" ? monthlyYoYFromRows(result.data) : quarterlyYoYFromRows(result.data)) };
}
