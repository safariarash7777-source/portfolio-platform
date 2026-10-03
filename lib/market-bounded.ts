import { getMarketData, getCachedGlobalMarket, type MarketData } from "./market";
import { getIrMarket, getCachedIrMarket, getLastIrDiag, type IrMarket } from "./market-ir";
import { withDeadline } from "./deadline";
import { iranReadQuality, validTimestamp, type IranReadQuality } from "./market-quality";

export interface SourceAvailability {
  state: "ready" | "stale" | "error" | "timeout" | "unknown-time" | "partial";
  /** Compatibility alias for receipt time, never a price-source clock. */
  sourceAt: number | null;
  receivedAt: number | null;
  validAt: number | null;
  readAt: number;
  reason?: IranReadQuality["reason"] | "read-error" | "read-timeout";
  families?: IranReadQuality["families"];
}
export async function readGlobalMarket(): Promise<{ data: MarketData; availability: SourceAvailability }> {
  try {
    const data = await withDeadline(() => getMarketData(), 2000);
    return { data, availability: { state: data.ok ? "ready" : data.crypto.length ? "stale" : "error", sourceAt: validTimestamp(data.fetchedAt), receivedAt: validTimestamp(data.fetchedAt), validAt: null, readAt: Date.now() } };
  } catch {
    const previous = getCachedGlobalMarket();
    return { data: { ...(previous ?? { crypto: [], goldGlobal: [], fetchedAt: 0 }), ok: false }, availability: { state: previous ? "stale" : "timeout", sourceAt: validTimestamp(previous?.fetchedAt), receivedAt: validTimestamp(previous?.fetchedAt), validAt: null, readAt: Date.now() } };
  }
}
export async function readIranMarket(): Promise<{ data: IrMarket | null; availability: SourceAvailability }> {
  try {
    const data = await withDeadline(() => getIrMarket(), 5100);
    const failed = getLastIrDiag()?.error;
    const readAt = Date.now(), quality = iranReadQuality(data, readAt);
    return { data, availability: { ...quality, state: !data ? failed === "DeadlineError" ? "timeout" : "error" : failed ? "stale" : quality.state, reason: failed ? failed === "DeadlineError" ? "read-timeout" : "read-error" : quality.reason, sourceAt: quality.receivedAt, readAt } };
  } catch {
    const data = getCachedIrMarket();
    const readAt = Date.now(), quality = iranReadQuality(data, readAt);
    return { data, availability: { ...quality, state: data ? "stale" : "timeout", reason: "read-timeout", sourceAt: quality.receivedAt, readAt } };
  }
}
