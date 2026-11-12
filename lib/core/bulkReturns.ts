// بازدهٔ دوره‌ای گروهی از symbol_history — M6 رصد بازار.
//
// چرا bulk: صفحهٔ صندوق‌ها ~۱۵۰ نماد دارد؛ ۱۵۰ درخواست جدا به PostgREST هم کند
// است. یک مسیر گروهیِ صفحه‌بندی‌شده: ردیف‌های ~۱۰۵ روز اخیر (۳ماهه + تلورانس)
// فقط با ستون‌های لازم، بعد گروه‌بندی سمت سرور Next و محاسبهٔ بازده خالص.
//
// صداقت داده: نمادی که تاریخچه ندارد در Map نمی‌آید → UI «—» نشان می‌دهد.

import type { HistoryDay } from "./engine";
import { periodicReturns, type PeriodicReturns, RETURN_WINDOWS, TOLERANCE_DAYS } from "./fundReturns";

const REVALIDATE_MS = 60 * 1000;
let cacheAt = 0;
let cacheVal: Map<string, PeriodicReturns> | null = null;
let cacheKey = "";

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
export async function getBulkReturns(symbols?: readonly string[]): Promise<Map<string, PeriodicReturns>> {
  const e = env();
  if (!e) return new Map();
  if (symbols && (symbols.length > 1000 || symbols.some(s => typeof s !== "string" || !s || s.length > 100 || /[\x00-\x1f]/.test(s)))) return new Map();
  const selected = symbols ? [...new Set(symbols)].sort() : null;
  if (selected?.length === 0) return new Map();
  const key = JSON.stringify([e.url, e.anon, selected]);
  if (cacheVal && cacheKey === key && Date.now() - cacheAt < REVALIDATE_MS) return cacheVal;

  const sinceDays = RETURN_WINDOWS.m3 + TOLERANCE_DAYS + 5;
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);

  // Keyset pagination survives PostgREST's row cap and concurrent new inserts.
  // Never publish a partial window or silently reuse an expired result on failure.
  const rows: SlimRow[] = [];
  const PAGE = 1000;
  try {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    const groups: (string[] | null)[] = selected
      ? Array.from({ length: Math.ceil(selected.length / 50) }, (_, i) => selected.slice(i * 50, (i + 1) * 50))
      : [null];
    let cursor = 0;
    const readGroup = async (group: string[] | null) => {
    let before: number | null = null;
    for (;;) {
      const qs = new URLSearchParams({
        select: "id,symbol,trade_date,close,last_price",
        trade_date: `gte.${since}`,
        order: "id.desc",
        limit: String(PAGE),
      });
      if (group) qs.set("symbol", `in.(${group.map(s => JSON.stringify(s)).join(",")})`);
      if (before !== null) qs.set("id", `lt.${before}`);
      const res = await fetch(`${e.url}/rest/v1/symbol_history?${qs}`, {
        headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
        signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error("history_read_failed");
      const batch = (await res.json()) as SlimRow[];
      if (!Array.isArray(batch) || (group && batch.some(r => !group.includes(r.symbol)))) throw new Error("history_scope_invalid");
      if (batch.length === 0) break;
      const next = batch[batch.length - 1].id;
      if (!Number.isSafeInteger(next) || (before !== null && next >= before)) throw new Error("history_cursor_invalid");
      before = next;
      rows.push(...batch);
      if (rows.length > 400_000) throw new Error("history_limit");
    }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(4, groups.length) }, async () => {
        while (cursor < groups.length) { const group = groups[cursor++]; await readGroup(group); }
      }));
    } finally { controller.abort(); }
  } catch {
    return new Map();
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
  cacheKey = key;
  cacheVal = out;
  return out;
}

function numOrNull(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(x);
  return isFinite(n) ? n : null;
}
