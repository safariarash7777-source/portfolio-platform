// میانگین حجم ۳۰ روز معاملاتی اخیر هر نماد — پایهٔ فیلتر «حجم مشکوک» (M7).
// + avgVolumeWindow خالص و getAvgVolume10 برای پنل رصد ادمین (SPEC-admin-market-radar §4).
//
// منبع: symbol_history (عمومی‌خوان). فقط نمادهایی که ≥MIN_DAYS روز دادهٔ حجم
// معتبر دارند در Map می‌آیند — صداقت داده: پوشش ناقص یعنی غیبت از فیلتر، نه صفر.
// کش ۱۰ دقیقه‌ای در سطح ماژول (همان الگوی bulkReturns).

const REVALIDATE_MS = 10 * 60 * 1000;
const WINDOW_CAL_DAYS = 45; // ~۳۰ روز معاملاتی
const MIN_DAYS = 20;        // حداقل روزِ دادهٔ حجم برای محاسبهٔ میانگین معتبر

let cacheAt = 0;
let cacheVal: Map<string, number> | null = null;

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

let cache10At = 0;
let cache10Val: Map<string, number> | null = null;
const WINDOW_CAL_DAYS_10 = 20; // ~۱۱-۱۲ روز معاملاتی (۱۰ قبلی + آخرین روز)
const MIN_DAYS_10 = 7;

/**
 * میانگین حجم ۳۰ روز معاملاتی اخیر برای همهٔ نمادهای دارای داده.
 * خروجی: Map نماد ← میانگین حجم (سهم). نماد با پوشش ناکافی در Map نیست.
 */
export async function getAvgVolume30(): Promise<Map<string, number>> {
  if (cacheVal && Date.now() - cacheAt < REVALIDATE_MS) return cacheVal;
  const rows = await fetchSlimRows(WINDOW_CAL_DAYS);
  if (rows == null) return cacheVal ?? new Map();
  const out = buildAvgMap(rows, 30, MIN_DAYS, false);
  cacheAt = Date.now();
  cacheVal = out;
  return out;
}

/**
 * میانگین حجم ۱۰ روز معاملاتی قبل از آخرین روز (خود آخرین روز خارج از میانگین) —
 * مخرج «نسبت حجم» پنل رصد (SPEC §1: volume / avg(volume, ۱۰ روز قبل)).
 * نماد با پوشش < MIN_DAYS_10 در Map نیست — null صادق.
 */
export async function getAvgVolume10(): Promise<Map<string, number>> {
  if (cache10Val && Date.now() - cache10At < REVALIDATE_MS) return cache10Val;
  const rows = await fetchSlimRows(WINDOW_CAL_DAYS_10);
  if (rows == null) return cache10Val ?? new Map();
  const out = buildAvgMap(rows, 10, MIN_DAYS_10, true);
  cache10At = Date.now();
  cache10Val = out;
  return out;
}

/** fetch صفحه‌بندی‌شدهٔ ردیف‌های سبک از symbol_history — null یعنی خطای شبکه. */
async function fetchSlimRows(calDays: number): Promise<SlimRow[] | null> {
  const e = env();
  if (!e) return [];
  const since = new Date(Date.now() - calDays * 86_400_000).toISOString().slice(0, 10);
  const rows: SlimRow[] = [];
  // سقف PostgREST روی این پروژه ۱۰۰۰ ردیف است (max-rows)؛ صفحه‌بندی با کرسر id
  // (offset عمیق روی جدول ۲M ردیفی timeout می‌دهد).
  const PAGE = 1_000;
  let cursor = 0;
  try {
    for (let page = 0; page < 60; page++) {
      const qs = new URLSearchParams({
        select: "id,symbol,trade_date,volume",
        trade_date: `gte.${since}`,
        volume: "not.is.null",
        id: `gt.${cursor}`,
        order: "id.asc",
        limit: String(PAGE),
      });
      // 500 گذرای PostgREST (فشار لحظه‌ای) — تا ۳ تلاش با وقفه
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${e.url}/rest/v1/symbol_history?${qs}`, {
          headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
          signal: AbortSignal.timeout(20000),
          next: { revalidate: 600 },
        });
        if (res.ok) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (!res || !res.ok) break;
      const batch = (await res.json()) as SlimRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      cursor = batch[batch.length - 1].id;
    }
  } catch {
    return null;
  }
  return rows;
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
