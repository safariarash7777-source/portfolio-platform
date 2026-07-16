// خوانندهٔ server-side جدول symbol_history از Supabase (PostgREST).
// همان الگوی lib/fundamental/supabase.ts: fetch مستقیم REST با کلید anon
// (RLS خواندن عمومی دارد) + کش حافظه‌ای کوتاه. خروجی: HistoryDay[] صعودی بر اساس تاریخ.
//
// نکته: جدول append-only است و ممکن است یک trade_date چند بار درج شده باشد
// (بک‌فیل + رلهٔ روزانه). dedupe: جدیدترین id برای هر trade_date برنده است.

import type { HistoryDay } from "./engine";

interface HistoryRow extends HistoryDay {
  id: number;
  symbol: string;
}

const REVALIDATE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: HistoryDay[] }>();

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

const SELECT_COLS =
  "id,symbol,trade_date,close,last_price,volume,value_traded," +
  "individual_buy_value,individual_sell_value,individual_buy_count," +
  "individual_sell_count,legal_buy_value,legal_sell_value,buyer_power";

/**
 * آخرین `days` روز معاملاتی نماد را برمی‌گرداند، مرتب صعودی بر اساس تاریخ.
 * دادهٔ ناموجود = آرایهٔ خالی (هرگز دادهٔ ساختگی).
 */
export async function getSymbolHistory(
  symbol: string,
  days = 400
): Promise<HistoryDay[]> {
  const key = `${symbol}|${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REVALIDATE_MS) return hit.value;

  const e = env();
  if (!e) return [];

  // چون ممکن است یک تاریخ چند نسخه داشته باشد، کمی بیشتر می‌خوانیم و dedupe می‌کنیم.
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    symbol: `eq.${symbol}`,
    order: "trade_date.desc,id.desc",
    limit: String(Math.min(days * 2, 4000)),
  });

  let rows: HistoryRow[] = [];
  try {
    const res = await fetch(`${e.url}/rest/v1/symbol_history?${qs}`, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    rows = (await res.json()) as HistoryRow[];
  } catch {
    return [];
  }

  // dedupe: اولین ردیف هر trade_date (چون order = date desc, id desc → جدیدترین id)
  const byDate = new Map<string, HistoryRow>();
  for (const r of rows) {
    if (!byDate.has(r.trade_date)) byDate.set(r.trade_date, r);
  }

  const out: HistoryDay[] = [...byDate.values()]
    .slice(0, days)
    .map((r) => ({
      trade_date: r.trade_date,
      close: numOrNull(r.close),
      last_price: numOrNull(r.last_price),
      volume: numOrNull(r.volume),
      value_traded: numOrNull(r.value_traded),
      individual_buy_value: numOrNull(r.individual_buy_value),
      individual_sell_value: numOrNull(r.individual_sell_value),
      individual_buy_count: numOrNull(r.individual_buy_count),
      individual_sell_count: numOrNull(r.individual_sell_count),
      legal_buy_value: numOrNull(r.legal_buy_value),
      legal_sell_value: numOrNull(r.legal_sell_value),
      buyer_power: numOrNull(r.buyer_power),
    }))
    .reverse(); // صعودی

  cache.set(key, { at: Date.now(), value: out });
  return out;
}

/** فهرست نمادهایی که در symbol_history داده دارند (برای صفحهٔ فهرست ترمینال). */
export async function getHistorySymbols(): Promise<string[]> {
  const key = "__symbols__";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REVALIDATE_MS) {
    return hit.value as unknown as string[];
  }
  const e = env();
  if (!e) return [];
  try {
    // PostgREST: select distinct از طریق group by با select=symbol
    const res = await fetch(
      `${e.url}/rest/v1/symbol_history?select=symbol&order=symbol.asc&limit=10000`,
      {
        headers: {
          apikey: e.anon,
          Authorization: `Bearer ${e.anon}`,
          // فقط تاریخ‌های اخیر تا حجم پاسخ کوچک بماند
          Range: "0-9999",
        },
        signal: AbortSignal.timeout(10000),
        next: { revalidate: 600 },
      }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ symbol: string }>;
    const uniq = [...new Set(rows.map((r) => r.symbol))].sort((a, b) =>
      a.localeCompare(b, "fa")
    );
    cache.set(key, { at: Date.now(), value: uniq as unknown as HistoryDay[] });
    return uniq;
  } catch {
    return [];
  }
}

function numOrNull(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(x);
  return isFinite(n) ? n : null;
}
