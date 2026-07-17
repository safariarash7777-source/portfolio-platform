// روند طلا و دلار — تصمیم T8: استفاده از ir_market_history (نمونه‌های ۳۰ دقیقه‌ای رله).
// خواندن server-side با کلید anon (RLS خواندن عمومی) + کش حافظه‌ای کوتاه.
// خروجی: یک نقطه به‌ازای هر روز (آخرین نمونهٔ روز) برای سری‌های انتخابی.
// قانون سخت: دادهٔ ناموجود → آرایهٔ خالی؛ هیچ عدد ساختگی.

export interface TrendPoint {
  date: string; // YYYY-MM-DD (UTC)
  price: number; // تومان
}

export interface TrendSeries {
  id: string;
  faName: string;
  unit: string;
  points: TrendPoint[];
}

interface HistRow {
  captured_at: string;
  section: string;
  payload: Array<{
    id?: string;
    faName?: string;
    price?: number;
    unit?: string;
  }>;
}

const REVALIDATE_MS = 10 * 60 * 1000;
let cached: { at: number; value: TrendSeries[] } | null = null;

/** سری‌های هدف: طلای ۱۸ عیار (بازار طلا) و دلار (بازار ارز). */
const TARGETS: Array<{ section: string; id: string }> = [
  { section: "gold", id: "IR_GOLD_18K" },
  { section: "currency", id: "USD" },
];

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

/**
 * استخراج «آخرین نمونهٔ هر روز» برای هر سری هدف از ردیف‌های تاریخچه — تابع خالص.
 * ردیف‌ها باید صعودی بر اساس captured_at باشند تا آخرین نمونه برنده شود.
 */
export function extractDailySeries(rows: HistRow[]): TrendSeries[] {
  const bySeries = new Map<string, { faName: string; unit: string; byDate: Map<string, number> }>();

  for (const t of TARGETS) bySeries.set(`${t.section}|${t.id}`, { faName: t.id, unit: "toman", byDate: new Map() });

  for (const row of rows) {
    if (!Array.isArray(row.payload)) continue;
    const date = row.captured_at?.slice(0, 10);
    if (!date) continue;
    for (const t of TARGETS) {
      if (row.section !== t.section) continue;
      const item = row.payload.find((p) => p.id === t.id);
      if (!item || typeof item.price !== "number" || !isFinite(item.price) || item.price <= 0) continue;
      const s = bySeries.get(`${t.section}|${t.id}`)!;
      if (item.faName) s.faName = item.faName;
      if (item.unit) s.unit = item.unit;
      s.byDate.set(date, item.price); // ردیف‌های بعدی (جدیدتر) جایگزین می‌شوند
    }
  }

  const out: TrendSeries[] = [];
  for (const t of TARGETS) {
    const s = bySeries.get(`${t.section}|${t.id}`)!;
    const points = [...s.byDate.entries()]
      .map(([date, price]) => ({ date, price }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (points.length > 0) out.push({ id: t.id, faName: s.faName, unit: s.unit, points });
  }
  return out;
}

/** خواندن تاریخچهٔ gold/currency از Supabase و ساخت سری روزانه. */
export async function getGoldUsdTrend(days = 180): Promise<TrendSeries[]> {
  if (cached && Date.now() - cached.at < REVALIDATE_MS) return cached.value;
  const e = env();
  if (!e) return [];

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const qs = new URLSearchParams({
    select: "captured_at,section,payload",
    section: "in.(gold,currency)",
    captured_at: `gte.${since}`,
    order: "captured_at.asc",
    limit: "20000",
  });

  try {
    const res = await fetch(`${e.url}/rest/v1/ir_market_history?${qs}`, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as HistRow[];
    const value = extractDailySeries(rows);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return [];
  }
}
