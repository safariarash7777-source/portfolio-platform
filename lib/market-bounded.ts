import { getMarketData, getCachedGlobalMarket, type MarketData } from "./market";
import { getIrMarket, getCachedIrMarket, getLastIrDiag, type IrMarket } from "./market-ir";
import { withDeadline } from "./deadline";

export interface SourceAvailability {
  state: "ready" | "stale" | "error" | "timeout";
  sourceAt: number | null;
  readAt: number;
}
export async function readGlobalMarket(): Promise<{ data: MarketData; availability: SourceAvailability }> {
  try {
    const data = await withDeadline(() => getMarketData(), 2000);
    return { data, availability: { state: data.ok ? "ready" : data.crypto.length ? "stale" : "error", sourceAt: data.fetchedAt || null, readAt: Date.now() } };
  } catch {
    const previous = getCachedGlobalMarket();
    return { data: { ...(previous ?? { crypto: [], goldGlobal: [], fetchedAt: 0 }), ok: false }, availability: { state: previous ? "stale" : "timeout", sourceAt: previous?.fetchedAt ?? null, readAt: Date.now() } };
  }
}
export async function readIranMarket(): Promise<{ data: IrMarket | null; availability: SourceAvailability }> {
  try {
    const data = await withDeadline(() => getIrMarket(), 5100);
    const failed = getLastIrDiag()?.error;
    return { data, availability: { state: !data ? failed === "DeadlineError" ? "timeout" : "error" : failed ? "stale" : "ready", sourceAt: data?.fetchedAt ?? null, readAt: Date.now() } };
  } catch {
    const data = getCachedIrMarket();
    return { data, availability: { state: data ? "stale" : "timeout", sourceAt: data?.fetchedAt ?? null, readAt: Date.now() } };
  }
}
