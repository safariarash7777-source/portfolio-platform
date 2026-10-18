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

const REVALIDATE_MS = 60 * 1000;
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
export interface SymbolHistoryRead {
  data: HistoryDay[];
  state: "ready" | "empty" | "error";
}

/** Compatibility getter for existing calculations, CSV and terminal callers. */
export async function getSymbolHistory(symbol: string, days = 400): Promise<HistoryDay[]> {
  return (await readSymbolHistory(symbol, days)).data;
}

/** The routed page distinguishes unavailable/incomplete reads from verified empty history. */
export async function readSymbolHistory(
  symbol: string,
  days = 400
): Promise<SymbolHistoryRead> {
  const key = `${symbol}|${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REVALIDATE_MS) return { data: hit.value, state: hit.value.length ? "ready" : "empty" };

  const e = env();
  if (!e) return { data: [], state: "error" };

  if (!Number.isSafeInteger(days) || days <= 0) return { data: [], state: "error" };
  const qs = new URLSearchParams({ select: SELECT_COLS, symbol: `eq.${symbol}` });
  const rows = await readUniqueHistoryRows<HistoryRow>(e, qs, days);
  if (rows === null) return { data: [], state: "error" }; // Never cache incomplete reads.

  const out: HistoryDay[] = rows
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
  return { data: out, state: out.length ? "ready" : "empty" };
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
    // فقط ۳۰ روز اخیر — هر نماد فعال حتماً در این بازه ردیف دارد و حجم پاسخ کوچک می‌ماند
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const res = await fetch(
      `${e.url}/rest/v1/symbol_history?select=symbol&trade_date=gte.${since}&limit=10000`,
      {
        headers: {
          apikey: e.anon,
          Authorization: `Bearer ${e.anon}`,
        },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
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

/** Keyset pagination survives server row caps and duplicate append-only versions.
 * null means failed/incomplete; [] means a verified empty response. A short page
 * is not EOF because PostgREST may impose a cap smaller than our requested limit.
 */
export async function readUniqueHistoryRows<T extends { id: number; trade_date: string }>(
  credentials: { url: string; anon: string }, query: URLSearchParams, days: number,
  eligible: (row: T) => boolean = () => true,
): Promise<T[] | null> {
  const byDate = new Map<string, T>();
  const signal = AbortSignal.timeout(20_000);
  let cursor: T | null = null;
  let accepted = 0;
  try {
    for (let page = 0; page < 24; page++) {
      const qs = new URLSearchParams(query);
      qs.set('order', 'trade_date.desc,id.desc'); qs.set('limit', '500');
      if (cursor) qs.set('or', `(trade_date.lt.${cursor.trade_date},and(trade_date.eq.${cursor.trade_date},id.lt.${cursor.id}))`);
      const response = await fetch(`${credentials.url}/rest/v1/symbol_history?${qs}`, {
        headers: { apikey: credentials.anon, Authorization: `Bearer ${credentials.anon}` },
        signal, cache: 'no-store', redirect: 'error',
      });
      if (!response.ok) return null;
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length > 500) return null;
      if (!rows.length) return [...byDate.values()];
      for (const item of rows) {
        const row = item as T;
        if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.trade_date !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(row.trade_date) || !Number.isFinite(Date.parse(row.trade_date)) ||
          new Date(row.trade_date).toISOString().slice(0,10) !== row.trade_date) return null;
        if (cursor && (row.trade_date > cursor.trade_date || (row.trade_date === cursor.trade_date && row.id >= cursor.id))) return null;
        cursor = row;
        if (!byDate.has(row.trade_date)) {
          byDate.set(row.trade_date, row);
          if (eligible(row)) accepted++;
        }
        if (accepted >= days) return [...byDate.values()];
      }
    }
  } catch { return null; }
  return null; // Explicit scan bound reached without proving requested coverage or EOF.
}
