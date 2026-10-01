import { buildPriceMap, resolvePricesByPosition, type SymbolHistoryRow } from "./prices";
import { valuePosition } from "./rebalance";
import type { HoldingPosition, PricePoint, CoverageGap } from "./contracts";
export interface ValuedPosition { position: HoldingPosition; price: PricePoint | null; value: number | null; weightPct: number | null }
/** Shared by the holdings page and dashboard. A target is not required to value assets. */
export function valuePositions(positions: readonly HoldingPosition[], rows: readonly SymbolHistoryRow[], now: Date, maxAgeDays = 3) {
  const prices = resolvePricesByPosition(positions, buildPriceMap(rows));
  const gaps: CoverageGap[] = [];
  const valued: ValuedPosition[] = positions.map(position => {
    const priced = valuePosition(position, prices.get(position.positionKey), { now, maxPriceAgeDays: maxAgeDays, maxPriceFutureDays: 1 });
    if ("gap" in priced) {
      gaps.push(priced.gap);
      return { position, price: null, value: null, weightPct: null };
    }
    return { position, price: priced.price, value: priced.value, weightPct: null };
  });
  const priced = valued.filter(p => p.value !== null);
  const subtotal = priced.length ? priced.reduce((sum, p) => sum + p.value!, 0) : null;
  const fullCoverage = positions.length > 0 && gaps.length === 0 && subtotal !== null && Number.isFinite(subtotal);
  if (fullCoverage && subtotal! > 0) for (const p of valued) p.weightPct = p.value! / subtotal! * 100;
  return { positions: valued, gaps, fullCoverage, totalValue: fullCoverage ? subtotal : null, subtotal: subtotal !== null && Number.isFinite(subtotal) ? subtotal : null };
}
export interface ValueSnapshot { as_of: string; value: number; source?: string; fullCoverage?: boolean; valuationValid?: boolean }
/** Only a change in recorded value, never a return or profit. */
export function snapshotValueChange(snapshots: readonly ValueSnapshot[]) {
  if (snapshots.length < 2) return null;
  const first = snapshots[0], last = snapshots.at(-1)!;
  const valid = (s: ValueSnapshot) => s.valuationValid === true && s.fullCoverage === true && !!s.source?.trim()
    && Number.isFinite(s.value) && s.value >= 0 && Number.isFinite(Date.parse(s.as_of));
  if (!valid(first) || !valid(last) || Date.parse(last.as_of) <= Date.parse(first.as_of)) return null;
  const change = last.value - first.value;
  return Number.isFinite(change) ? { change, from: first.as_of, to: last.as_of } : null;
}
