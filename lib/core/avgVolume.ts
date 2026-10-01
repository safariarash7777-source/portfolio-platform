import { createCompleteReader, PagedReadError, readAllPages } from "../supabase/paged-read";
import { withDeadline } from "../deadline";
// میانگین حجم ۳۰ روز معاملاتی اخیر هر نماد — پایهٔ فیلتر «حجم مشکوک» (M7).
// + avgVolumeWindow خالص و getAvgVolume10 برای پنل رصد ادمین (SPEC-admin-market-radar §4).
//
// منبع: symbol_history (عمومی‌خوان). فقط نمادهایی که ≥MIN_DAYS روز دادهٔ حجم
// معتبر دارند در Map می‌آیند — صداقت داده: پوشش ناقص یعنی غیبت از فیلتر، نه صفر.
// کش ۱۰ دقیقه‌ای در سطح ماژول (همان الگوی bulkReturns).

const REVALIDATE_MS = 10 * 60 * 1000;
const WINDOW_CAL_DAYS = 45; // ~۳۰ روز معاملاتی
const MIN_DAYS = 20;        // حداقل روزِ دادهٔ حجم برای محاسبهٔ میانگین معتبر

interface SlimRow {
  id: number;
  symbol: string;
  trade_date: string;
  volume: number | null;
}

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

/**
 * میانگین حجم ۳۰ روز معاملاتی اخیر برای همهٔ نمادهای دارای داده.
 * خروجی: Map نماد ← میانگین حجم (سهم). نماد با پوشش ناکافی در Map نیست.
 */
const read30 = createCompleteReader(() => loadAverage(WINDOW_CAL_DAYS, 30, MIN_DAYS, false), () => new Map<string, number>(), REVALIDATE_MS);
const read10 = createCompleteReader(() => loadAverage(20, 10, 7, true), () => new Map<string, number>(), REVALIDATE_MS);
export const getAvgVolume30Read = () => read30();
export async function getAvgVolume30(): Promise<Map<string, number>> { return (await read30()).data; }
export async function getAvgVolume10(): Promise<Map<string, number>> { return (await read10()).data; }

async function loadAverage(calDays: number, days: number, minDays: number, excludeLatest: boolean) {
  const e = env();
  if (!e) throw new PagedReadError("configuration", 0);
  const since = new Date(Date.now() - calDays * 86_400_000).toISOString().slice(0, 10);
  const result = await withDeadline(signal => readAllPages<SlimRow>({
    ...e, table: "symbol_history", select: "id,symbol,trade_date,volume",
    filters: { trade_date: `gte.${since}`, volume: "not.is.null" }, signal,
  }), 15000);
  return { ...result, data: buildAvgMap(result.data, days, minDays, excludeLatest) };
}

/**
 * ساخت Map میانگین حجم از ردیف‌های خام (خالص — تست‌پذیر).
 * dedupe: نماد+تاریخ ← بزرگ‌ترین id برنده (سازگار با چند source).
 * excludeLatest: آخرین روز هر نماد از میانگین خارج می‌شود (برای نسبت حجمِ امروز/میانگینِ قبل).
 */
export function buildAvgMap(
  rows: SlimRow[],
  windowDays: number,
  minDays: number,
  excludeLatest: boolean
): Map<string, number> {
  const bySymbol = new Map<string, Map<string, SlimRow>>();
  for (const r of rows) {
    if (!r.symbol || !r.trade_date) continue;
    let m = bySymbol.get(r.symbol);
    if (!m) { m = new Map(); bySymbol.set(r.symbol, m); }
    const prev = m.get(r.trade_date);
    if (!prev || r.id > prev.id) m.set(r.trade_date, r);
  }
  const out = new Map<string, number>();
  for (const [symbol, days] of bySymbol) {
    let sorted = [...days.values()].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    if (excludeLatest) sorted = sorted.slice(1);
    const vols = sorted
      .slice(0, windowDays)
      .map((r) => (typeof r.volume === "number" && isFinite(r.volume) ? r.volume : Number(r.volume)))
      .filter((v) => isFinite(v) && v > 0);
    if (vols.length < minDays) continue; // پوشش ناکافی → غایب از Map
    out.set(symbol, vols.reduce((a, b) => a + b, 0) / vols.length);
  }
  return out;
}

export type { SlimRow };
