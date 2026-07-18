// خواندن تاریخچهٔ market_breadth (روزی یک ردیف EOD رله) برای روند جریان پول حقیقی.
// الگوی getIndexTrend: خواندن server-side با کلید anon + کش حافظه‌ای کوتاه.
// قانون سخت: جدول هنوز ساخته‌نشده/خالی → آرایهٔ خالی (حالت خالی صادق در UI)؛ هیچ عدد ساختگی.
import { buildFlowTrend, type BreadthRow, type FlowTrendPoint } from "./marketToday";

const REVALIDATE_MS = 10 * 60 * 1000;
let cached: { at: number; value: FlowTrendPoint[] } | null = null;

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

/** روند خالص خرید حقیقی از market_breadth — حداکثر `days` ردیف آخر، مرتب صعودی. */
export async function getFlowTrend(days = 90): Promise<FlowTrendPoint[]> {
  if (cached && Date.now() - cached.at < REVALIDATE_MS) return cached.value;
  const e = env();
  if (!e) return [];
  const qs = new URLSearchParams({
    select: "jdate,net_real_flow,per_capita_buy,per_capita_sell,trade_value,pos_count,neg_count,total_traded",
    order: "jdate.desc",
    limit: String(days),
  });
  try {
    const res = await fetch(`${e.url}/rest/v1/market_breadth?${qs}`, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 600 },
    });
    if (!res.ok) return []; // جدول هنوز migrate نشده → خالی صادق
    const rows = (await res.json()) as BreadthRow[];
    const value = buildFlowTrend(rows);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return [];
  }
}
