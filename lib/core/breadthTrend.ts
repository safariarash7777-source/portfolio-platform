import type { ReadState } from "../read-state";
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
export async function getFlowTrendState(days = 90, fetchImpl: typeof fetch = fetch): Promise<ReadState<FlowTrendPoint[]>> {
  if (fetchImpl === fetch && cached && Date.now() - cached.at < REVALIDATE_MS) return { status: cached.value.length > 0 ? "ready" : "empty", data: cached.value.length > 0 ? cached.value : null } as ReadState<FlowTrendPoint[]>;
  const e = env();
  if (!e) return { status: "error", data: null, code: "not_configured" };
  const qs = new URLSearchParams({
    select: "jdate,net_real_flow,per_capita_buy,per_capita_sell,trade_value,pos_count,neg_count,total_traded",
    order: "jdate.desc",
    limit: String(days),
  });
  try {
    const res = await fetchImpl(`${e.url}/rest/v1/market_breadth?${qs}`, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 600 },
    });
    if (!res.ok) return { status: "error", data: null, code: "source_unavailable" }; // جدول هنوز migrate نشده → خالی صادق
    const rows = (await res.json()) as BreadthRow[];
    const value = buildFlowTrend(rows);
    if (fetchImpl === fetch) cached = { at: Date.now(), value };
    return value.length > 0 ? { status: "ready", data: value } : { status: "empty", data: null };
  } catch {
    return { status: "error", data: null, code: "source_unavailable" };
  }
}

/** Legacy consumers retain the array contract; new dashboards use the explicit read state. */
export async function getFlowTrend(days = 90): Promise<FlowTrendPoint[]> {
  const result = await getFlowTrendState(days);
  return result.status === "ready" ? result.data : [];
}
