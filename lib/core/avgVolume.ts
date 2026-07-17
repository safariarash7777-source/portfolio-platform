// میانگین حجم ۳۰ روز معاملاتی اخیر هر نماد — پایهٔ فیلتر «حجم مشکوک» (M7).
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

/**
 * میانگین حجم ۳۰ روز معاملاتی اخیر برای همهٔ نمادهای دارای داده.
 * خروجی: Map نماد → میانگین حجم (سهم). نماد با پوشش ناکافی در Map نیست.
 */
export async function getAvgVolume30(): Promise<Map<string, number>> {
  if (cacheVal && Date.now() - cacheAt < REVALIDATE_MS) return cacheVal;
  const e = env();
  if (!e) return new Map();
  const since = new Date(Date.now() - WINDOW_CAL_DAYS * 86_400_000).toISOString().slice(0, 10);
  const rows: SlimRow[] = [];
  const PAGE = 50_000;
  try {
    for (let page = 0; page < 6; page++) {
      const qs = new URLSearchParams({
        select: "id,symbol,trade_date,volume",
        trade_date: `gte.${since}`,
        volume: "not.is.null",
        order: "id.asc",
        limit: String(PAGE),
        offset: String(page * PAGE),
      });
      const res = await fetch(`${e.url}/rest/v1/symbol_history?${qs}`, {
        headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
        signal: AbortSignal.timeout(20000),
        next: { revalidate: 600 },
      });
      if (!res.ok) break;
      const batch = (await res.json()) as SlimRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
  } catch {
    return cacheVal ?? new Map();
  }
  // گروه‌بندی و dedupe (نماد+تاریخ: بزرگ‌ترین id برنده — سازگار با چند source)
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
    const vols = [...days.values()]
      .sort((a, b) => b.trade_date.localeCompare(a.trade_date))
      .slice(0, 30)
      .map((r) => (typeof r.volume === "number" && isFinite(r.volume) ? r.volume : Number(r.volume)))
      .filter((v) => isFinite(v) && v > 0);
    if (vols.length < MIN_DAYS) continue; // پوشش ناکافی → غایب از Map
    out.set(symbol, vols.reduce((a, b) => a + b, 0) / vols.length);
  }
  cacheAt = Date.now();
  cacheVal = out;
  return out;
}
