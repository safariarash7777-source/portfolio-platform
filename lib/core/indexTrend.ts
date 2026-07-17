// روند شاخص کل و هم‌وزن — M5 «رصد بازار». منبع: جدول append-only مبتنی بر index_history
// (روزی یک ردیف EOD که رله درج می‌کند). خواندن server-side با کلید anon (RLS خواندن عمومی).
// قانون سخت: جدول نساخته/داده ناکافی → آرایهٔ خالی؛ هیچ عدد ساختگی.

export interface IndexHistRow {
  jdate: string; // تاریخ جلالی متن منبع، مثل «1405/04/27»
  total_index: number;
  equal_weight_index: number | null;
  trade_value: number | null;
}

export interface IndexSeriesPoint {
  jdate: string;
  value: number;
}

export interface IndexSeries {
  id: "total" | "equal_weight";
  faName: string;
  points: IndexSeriesPoint[];
}

/**
 * ردیف‌های index_history → دو سری مرتب صعودی (شاخص کل + هم‌وزن).
 * ردیف نامعتبر (شاخص ناموجود/غیرمثبت) حذف؛ jdate تکراری فقط اولین بار (جدول unique است
 * اما این تابع pure باید مقاوم باشد).
 */
export function buildIndexSeries(rows: IndexHistRow[]): IndexSeries[] {
  const seen = new Set<string>();
  const clean = rows
    .filter((r) => {
      if (!r?.jdate || seen.has(r.jdate)) return false;
      if (!isFinite(Number(r.total_index)) || Number(r.total_index) <= 0) return false;
      seen.add(r.jdate);
      return true;
    })
    .sort((a, b) => a.jdate.localeCompare(b.jdate)); // «1405/04/27» رشته‌ای مرتب‌شونده است

  const total: IndexSeriesPoint[] = clean.map((r) => ({ jdate: r.jdate, value: Number(r.total_index) }));
  const ew: IndexSeriesPoint[] = clean
    .filter((r) => r.equal_weight_index != null && isFinite(Number(r.equal_weight_index)) && Number(r.equal_weight_index) > 0)
    .map((r) => ({ jdate: r.jdate, value: Number(r.equal_weight_index) }));

  const out: IndexSeries[] = [];
  if (total.length) out.push({ id: "total", faName: "شاخص کل", points: total });
  if (ew.length) out.push({ id: "equal_weight", faName: "شاخص هم‌وزن", points: ew });
  return out;
}

const REVALIDATE_MS = 10 * 60 * 1000;
let cached: { at: number; value: IndexSeries[] } | null = null;

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
}

/** آخرین `days` ردیف EOD شاخص. جدول نساخته/خطا → []. */
export async function getIndexTrend(days = 180): Promise<IndexSeries[]> {
  if (cached && Date.now() - cached.at < REVALIDATE_MS) return cached.value;
  const e = env();
  if (!e) return [];
  try {
    const qs = new URLSearchParams({
      select: "jdate,total_index,equal_weight_index,trade_value",
      order: "jdate.desc",
      limit: String(days),
    });
    const res = await fetch(`${e.url}/rest/v1/index_history?${qs}`, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return []; // 404 = جدول نساخته (phase14) — حالت خالی صادقانه
    const rows = (await res.json()) as IndexHistRow[];
    const value = buildIndexSeries(rows);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return [];
  }
}
