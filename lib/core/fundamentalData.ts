// دادهٔ سرورِ پرست‌های بنیادی (T2-ب) — ساخت Map های YoY از codal_reports.
//
// شکل داده (راستی‌آزمایی‌شده از دیتابیس زنده):
// - report_kind مقدارهای فارسی دارد: «ن-۳۰» و «ن-۱۰».
// - ن-۳۰ data: { period_end: "1404-04-31", period_total_amount, fy_cumulative_amount, products, fiscal_year }
//   ⟵ درآمد ماه = period_total_amount (میلیون ریال).
// - ن-۱۰ data: { period_end, period_months, standalone: { revenue, ... }, unit, audited }
//   ⟵ درآمد تجمیعی دوره = standalone.revenue (واحد گزارش خود شرکت).
//
// بودجهٔ کوئری: دو درخواست PostgREST با ستون‌های محدود. کش ۱ساعته.
// اصل صداقت: نماد بدون هر دو دوره در Map نمی‌آید — false positive ممنوع.

import { unstable_cache } from "next/cache";
import { yoyGrowthPercent, type YoYMap } from "./fundamentalPresets";
import { dedupeByPeriod, latestParserRows, isConsolidatedTitle, isMillionRialUnit, type CodalRow } from "../fundamental/supabase";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface Coverage {
  rowsRead: number;
  totalRows: number | null;
  complete: boolean;
}

async function fetchCodal(reportKind: string, limit: number): Promise<{ rows: CodalRow[]; coverage: Coverage }> {
  if (!SB || !ANON) throw new Error("fundamental_read_not_configured");
  const url =
    `${SB}/rest/v1/codal_reports?select=id,symbol,report_kind,period_end,title,source_url,data,raw` +
    `&report_kind=eq.${encodeURIComponent(reportKind)}` +
    `&data=not.is.null&order=period_end.desc,id.desc&limit=${limit}`;
    const res = await fetch(url, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: "count=exact" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`fundamental_read_http_${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("fundamental_read_invalid_response");
    const count = res.headers.get("content-range")?.match(/\/(\d+)$/);
    const totalRows = count ? Number(count[1]) : null;
    return { rows, coverage: { rowsRead: rows.length, totalRows, complete: totalRows !== null && rows.length === totalRows } };
}

/** Reuse the company reader's parser/amendment/scope selection, separately per symbol. */
function selectedRows(rows: CodalRow[], monthly: boolean): CodalRow[] {
  const grouped = new Map<string, CodalRow[]>();
  for (const row of rows) {
    if (!row.symbol || !row.data) continue;
    const group = grouped.get(row.symbol) ?? [];
    group.push(monthly ? { ...row, data: { ...row.data, period_months: 1 } } : row);
    grouped.set(row.symbol, group);
  }
  return [...grouped.values()].flatMap(group => dedupeByPeriod(latestParserRows(group)));
}

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
export async function buildMonthlyYoY(): Promise<YoYMap> {
  return (await readMonthlyYoY()).values;
}
async function readMonthlyYoY(): Promise<{ values: YoYMap; coverage: Coverage }> {
  const result = await fetchCodal("ن-۳۰", 3000);
  const rows = selectedRows(result.rows, true);
  // نماد → (سال×۱۰۰+ماه) → درآمد ماه (period_total_amount، میلیون ریال)
  const bySymbol = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const d = r.data;
    if (!d || !r.symbol || !isMillionRialUnit(d["unit"])) continue;
    const pe = jym(d["period_end"]);
    const amt = num(d["period_total_amount"]);
    if (!pe || amt == null) continue;
    let m = bySymbol.get(r.symbol);
    if (!m) {
      m = new Map();
      bySymbol.set(r.symbol, m);
    }
    const key = pe.y * 100 + pe.m;
    // One canonical selected report per symbol/period.
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
  return { values: out, coverage: result.coverage };
}

/**
 * رشد درآمد فصلی YoY از ن-۱۰ (منطق تفاضل زنجیره‌ای T3):
 * فصل خالص = revenue(دورهٔ k ماهه) − revenue(دورهٔ k−3 ماههٔ همان سال مالی).
 * دورهٔ ۳ماهه خودش فصل است. فقط نمادهای دارای فصل جاری و همان فصل سال قبل.
 */
export async function buildQuarterlyYoY(): Promise<YoYMap> {
  return (await readQuarterlyYoY()).values;
}
async function readQuarterlyYoY(): Promise<{ values: YoYMap; coverage: Coverage }> {
  const result = await fetchCodal("ن-۱۰", 2000);
  const rows = selectedRows(result.rows, false);
  // نماد → (سال×۱۰۰+ماهِ پایان دوره) → {months, revenue}
  const cum = new Map<string, Map<number, { months: number; revenue: number }>>();
  for (const r of rows) {
    const d = r.data;
    // A company screener must not subtract group figures from company figures.
    if (!d || !r.symbol || isConsolidatedTitle(r.title) || !isMillionRialUnit(d["unit"])) continue;
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
  return { values: out, coverage: result.coverage };
}

/** نسخهٔ کش‌شدهٔ ۱ساعته برای صفحهٔ /data */
export async function readFundamentalYoY() {
    const [monthly, quarterly] = await Promise.all([readMonthlyYoY(), readQuarterlyYoY()]);
    return {
      monthly: Object.fromEntries(monthly.values),
      quarterly: Object.fromEntries(quarterly.values),
      coverage: { monthly: monthly.coverage, quarterly: quarterly.coverage },
    };
}
export const getFundamentalYoY = unstable_cache(
  readFundamentalYoY,
  ["fundamental-yoy-v3"],
  { revalidate: 3600 }
);
