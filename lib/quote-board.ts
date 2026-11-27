import { sourceTime } from "./market-quality";
import type { IrRow } from "./market-ir";
import type { TrendSeries } from "./core/trend";

const TROY_OZ_G = 31.1034768;
const COIN_PURE_G = 7.3197; // same physical specification used in the FX desk
const ALIGN_MS = 30 * 60 * 1000;
const STORED_LIMIT = 72 * 60 * 60 * 1000;
export interface QuoteBubble { amount: number; percent: number; basis: "world-spot" | "domestic-gold"; quality: "aligned" | "stored"; }

export function buildQuoteBubbles(gold: IrRow[], currency: IrRow[], now = Date.now()): Record<string, QuoteBubble | null> {
  const by = (rows: IrRow[], id: string, unit: IrRow["unit"]) => rows.find(r => r.id === id && r.unit === unit && Number.isFinite(r.price) && r.price > 0);
  const gram = by(gold, "IR_GOLD_18K", "toman"), coin = by(gold, "IR_COIN_EMAMI", "toman");
  const spot = by(gold, "XAUUSD", "usd"), fx = by(currency, "USD", "toman");
  const get = (quote: IrRow | undefined, inputs: (IrRow | undefined)[], fair: number, basis: QuoteBubble["basis"]): QuoteBubble | null => {
    if (!quote || !(fair > 0) || !Number.isFinite(fair)) return null;
    const clocks = [quote, ...inputs].map(i => sourceTime(i?.sourceDate, i?.sourceTime));
    if (!clocks.every((t): t is number => t !== null && t <= now && now - t <= STORED_LIMIT)) return null;
    const oldest = Math.min(...clocks);
    if (Math.max(...clocks) - oldest > ALIGN_MS) return null;
    return { amount: Math.round(quote.price - fair), percent: Math.round((quote.price / fair - 1) * 10000) / 100, basis, quality: now - oldest > ALIGN_MS ? "stored" : "aligned" };
  };
  return {
    IR_GOLD_18K: get(gram, [spot, fx], spot && fx ? spot.price * fx.price * .75 / TROY_OZ_G : NaN, "world-spot"),
    IR_COIN_EMAMI: get(coin, [gram], gram ? gram.price * COIN_PURE_G / .75 : NaN, "domestic-gold"),
  };
}

export type QuoteGroup = "gold" | "currency" | "funds" | "stocks" | "crypto";
export interface Quote { id: string; faName: string; price: number; unit?: "toman" | "usd"; changePercent?: number | null; change?: number | null; change24h?: number | null; symbol?: string; sourceDate?: string | null; sourceTime?: string | null; }
export interface QuoteBoardFeed {
  ir?: Partial<Record<QuoteGroup, Quote[]>> & { commodities?: Quote[] } | null;
  crypto?: Quote[]; goldGlobal?: Quote[];
  quoteBubbles?: Record<string, QuoteBubble | null>; quoteTrends?: TrendSeries[]; fetchedAt?: number;
  availability?: { iran?: { families?: Partial<Record<QuoteGroup, { state: string; retained?: boolean; sourceState?: string | null }>> }; global?: { state: string } };
}
export const QUOTE_GROUPS: { id: QuoteGroup; label: string }[] = [
  { id: "gold", label: "طلا و سکه" }, { id: "currency", label: "ارز" },
  { id: "crypto", label: "رمزارز" }, { id: "funds", label: "صندوق‌ها" }, { id: "stocks", label: "سهام" },
];
export const QUOTE_ORDER = ["USD", "IR_GOLD_18K", "IR_COIN_EMAMI", "bitcoin"];
const globalRows = (rows: Quote[] = []) => rows.map(q => ({...q, unit: "usd" as const}));
export function quoteGroups(feed: QuoteBoardFeed | null) {
  return QUOTE_GROUPS.map(g => {
    // Keep equivalent listings from different supported instruments distinct, e.g. XAUUSD and PAXG.
    const local = feed?.ir?.[g.id] ?? [];
    const global = g.id === "gold" ? globalRows(feed?.goldGlobal) : g.id === "crypto" ? globalRows(feed?.crypto) : [];
    const known = new Set(global.map(q => q.id));
    return {...g, rows: [...local.filter(q => !known.has(q.id)), ...global].filter(q => Number.isFinite(q.price) && q.price > 0)};
  });
}
export function quoteDirection(previous: number | undefined, next: number): "up" | "down" | null {
  return previous == null || previous === next ? null : previous < next ? "up" : "down";
}

export function acceptsQuoteTick(feed: QuoteBoardFeed, group: QuoteGroup, current: Quote, previous: Quote | undefined, now = Date.now()): boolean {
  if (!previous) return false;
  const global = feed.crypto?.some(r=>r.id===current.id) || feed.goldGlobal?.some(r=>r.id===current.id);
  if (global) return feed.availability?.global?.state === "ready";
  const family = feed.availability?.iran?.families?.[group];
  if (!family || family.retained || family.sourceState === "stale" || family.sourceState === "unavailable") return false;
  const curr = sourceTime(current.sourceDate,current.sourceTime), prev = sourceTime(previous.sourceDate,previous.sourceTime);
  return curr !== null && curr <= now && now-curr <= ALIGN_MS && (prev === null || curr >= prev);
}
