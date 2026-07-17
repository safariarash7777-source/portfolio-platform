// نرخ دلار روزانه (fx_rates) — T6. خواندن server-side با کلید anon (RLS خواندن عمومی).
// جدول append-only است و رله روزی یک نرخ درج می‌کند.
// قانون سخت: جدول/داده غایب → null؛ هیچ تبدیل تقریبی بی‌منبع.

export interface FxRate {
  rate_date: string; // YYYY-MM-DD
  usd_toman: number;
  source: string;
}

const REVALIDATE_MS = 30 * 60 * 1000;
let cached: { at: number; value: FxRate[] } | null = null;

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

/** آخرین نرخ‌های دلار (نزولی بر اساس تاریخ). جدول غایب/خطا → آرایهٔ خالی. */
export async function getFxRates(limit = 400): Promise<FxRate[]> {
  if (cached && Date.now() - cached.at < REVALIDATE_MS) return cached.value;
  const e = env();
  if (!e) return [];
  try {
    const res = await fetch(
      `${e.url}/rest/v1/fx_rates?select=rate_date,usd_toman,source&order=rate_date.desc&limit=${limit}`,
      {
        headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
        signal: AbortSignal.timeout(10000),
        next: { revalidate: 1800 },
      }
    );
    if (!res.ok) return []; // 404 = جدول هنوز ساخته نشده — حالت خالی صادقانه
    const rows = (await res.json()) as FxRate[];
    const value = rows.filter((r) => typeof r.usd_toman === "number" && r.usd_toman > 0);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return [];
  }
}

/** آخرین نرخ موجود (تومان) یا null. */
export function latestRate(rates: FxRate[]): FxRate | null {
  return rates.length > 0 ? rates[0] : null;
}

/**
 * میانگین نرخ دلار هر سال میلادی — تابع خالص برای نمای دلاری سری‌های سالانه.
 * خروجی: Map از «سال میلادی» به میانگین (تومان). سال بدون داده در خروجی نیست.
 */
export function yearlyAverages(rates: FxRate[]): Map<number, number> {
  const byYear = new Map<number, { sum: number; n: number }>();
  for (const r of rates) {
    const y = Number(r.rate_date?.slice(0, 4));
    if (!Number.isFinite(y) || !(r.usd_toman > 0)) continue;
    const cur = byYear.get(y) ?? { sum: 0, n: 0 };
    cur.sum += r.usd_toman;
    cur.n += 1;
    byYear.set(y, cur);
  }
  const out = new Map<number, number>();
  for (const [y, { sum, n }] of byYear) out.set(y, sum / n);
  return out;
}
