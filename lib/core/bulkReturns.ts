// بازدهٔ دوره‌ای گروهی از symbol_history — M6 رصد بازار.
//
// چرا bulk: صفحهٔ صندوق‌ها ~۱۵۰ نماد دارد؛ ۱۵۰ درخواست جدا به PostgREST هم کند
// است هم بی‌ادب. یک کوئری: همهٔ ردیف‌های ~۱۰۵ روز اخیر (پنجرهٔ ۳ماهه + تلورانس)
// فقط با ستون‌های لازم، بعد گروه‌بندی سمت سرور Next و محاسبهٔ بازده خالص.
//
// صداقت داده: نمادی که تاریخچه ندارد در Map نمی‌آید → UI «—» نشان می‌دهد.

import type { HistoryDay } from "./engine";
import { periodicReturns, type PeriodicReturns, RETURN_WINDOWS, TOLERANCE_DAYS } from "./fundReturns";

const REVALIDATE_MS = 10 * 60 * 1000;
let cacheAt = 0;
let cacheVal: Map<string, PeriodicReturns> | null = null;

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

interface SlimRow {
  id: number;
  symbol: string;
  trade_date: string;
  close: number | null;
  last_price: number | null;
}

/**
 * بازده‌های دوره‌ای همهٔ نمادهای دارای داده در ~۱۰۵ روز اخیر.
 * خروجی: Map نماد → PeriodicReturns. نماد بدون داده در Map نیست.
 */
export async function getBulkReturns(): Promise<Map<string, PeriodicReturns>> {
  if (cacheVal && Date.now() - cacheAt < REVALIDATE_MS) return cacheVal;
  const e = env();
  if (!e) return new Map();

  const sinceDays = RETURN_WINDOWS.m3 + TOLERANCE_DAYS + 5;
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);

  // صفحه‌بندی — جدول بزرگ می‌شود (بک‌فیل کندل کل بازار). سقف امن ۸ صفحهٔ ۵۰k.
  const rows: SlimRow[] = [];
  const PAGE = 50_000;
  try {
    for (let page = 0; page < 8; page++) {
      const qs = new URLSearchParams({
        select: "id,symbol,trade_date,close,last_price",
        trade_date: `gte.${since}`,
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

  // گروه‌بندی نماد → روزها (dedupe هر trade_date: بزرگ‌ترین id برنده)
  const bySymbol = new Map<string, Map<string, SlimRow>>();
  for (const r of rows) {
    if (!r.symbol || !r.trade_date) continue;
    let m = bySymbol.get(r.symbol);
    if (!m) { m = new Map(); bySymbol.set(r.symbol, m); }
    const prev = m.get(r.trade_date);
    if (!prev || r.id > prev.id) m.set(r.trade_date, r);
  }

  const out = new Map<string, PeriodicReturns>();
  for (const [symbol, days] of bySymbol) {
    const hist: HistoryDay[] = [...days.values()]
      .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
      .map((r) => ({
        trade_date: r.trade_date,
        close: numOrNull(r.close),
        last_price: numOrNull(r.last_price),
        volume: null, value_traded: null,
        individual_buy_value: null, individual_sell_value: null,
        individual_buy_count: null, individual_sell_count: null,
        legal_buy_value: null, legal_sell_value: null, buyer_power: null,
      }));
    out.set(symbol, periodicReturns(hist));
  }

  cacheAt = Date.now();
  cacheVal = out;
  return out;
}

function numOrNull(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(x);
  return isFinite(n) ? n : null;
}
