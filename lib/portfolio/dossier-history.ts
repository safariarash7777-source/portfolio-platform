import type { createClient } from "../supabase/server";
import { withDeadline } from "../deadline";
import { positionFromStored } from "./balanceSheet";
import type { HoldingPosition } from "./contracts";
import { valuePositions } from "./valuation";
import { paymentReferenceDay } from "./paymentSchedule";
import { dateInput } from "./financialInput";

export type DossierVersion = { id: string; version: number; date: string };
export type HistoryPoint = DossierVersion & { amount: number | null; estimated: boolean; pricedAmount?: number | null; pricedCount?: number; assetCount?: number };
export const DOSSIER_VERSION_LIMIT = 6;
const MAX_ROWS = 500;
type Client = Awaited<ReturnType<typeof createClient>>;

/** Reconstruct ONLY what the owner had declared when that immutable version
 * was recorded. Never apply today's quote to yesterday's quantity. Unknowns
 * are gaps, not zero. This is a recorded asset value, not profit or return. */
export function historicalValue(version: DossierVersion, positions: readonly HoldingPosition[]): HistoryPoint {
  const time = Date.parse(version.date);
  // valuation_as_of is a calendar DATE in the member UI; created_at is an instant.
  // Comparing at UTC midnight incorrectly drops records made just after midnight in Iran.
  const recordedDay = paymentReferenceDay(new Date(time));
  const valid = recordedDay !== null && positions.length > 0 && positions.every(p => {
    if (p.valuationMode !== "declared" || !p.valuationAsOf) return false;
    try { return dateInput(p.valuationAsOf) <= recordedDay; } catch { return false; }
  });
  const declared = positions.filter(p => {
    try { return recordedDay !== null && p.valuationMode === "declared" && !!p.valuationAsOf && dateInput(p.valuationAsOf) <= recordedDay; } catch { return false; }
  });
  const coverage = valuePositions(declared, [], new Date(time));
  const valuation = valid ? coverage : null;
  return { ...version, amount: valuation?.fullCoverage ? valuation.totalValue : null, estimated: coverage.estimatedCount > 0, pricedAmount: coverage.subtotal, pricedCount: coverage.positions.filter(p => p.value !== null).length, assetCount: positions.length };
}

/** Only called with version IDs from an authenticated member's bounded,
 * owner-filtered snapshot history. No second source, service role, admin access,
 * table creation or repeated per-version round trips. */
export async function readDossierHistory(client: Client, ownerId: string, ownerHistory: readonly DossierVersion[], currentPositions: readonly HoldingPosition[]) {
  const versions = ownerHistory.slice(0, DOSSIER_VERSION_LIMIT);
  if (!ownerId) return { state: "unavailable" as const, points: [] };
  if (!versions.length) return { state: "empty" as const, points: [] };
  const [current, ...prior] = versions;
  const latest = historicalValue(current, currentPositions);
  if (!prior.length) return { state: "ready" as const, points: [latest] };
  const failed = { state: "unavailable" as const, points: [latest] };
  try {
    return await withDeadline(async signal => {
      const ids = prior.map(v => v.id);
      const { data, error, count } = await client.from("member_holding_positions")
        .select("version_id,position_key,symbol,manual_label,asset_class,qty,unit,as_of,title,ownership_pct,valuation_mode,declared_value,valuation_source,valuation_as_of,valuation_status,member_holding_versions!inner(user_id)", { count: "exact" })
        .eq("member_holding_versions.user_id", ownerId)
        .in("version_id", ids).limit(MAX_ROWS + 1).abortSignal(signal);
      // Require the full capped batch; never report a subtotal from truncated pages.
      if (error || !Array.isArray(data) || count !== data.length || count > MAX_ROWS) return failed;
      const byId = new Map(ids.map(id => [id, [] as HoldingPosition[]]));
      for (const row of data) {
        const bucket = byId.get(row.version_id);
        if (!bucket) return failed;
        bucket.push(positionFromStored(row));
      }
      return { state: "ready" as const, points: [...prior.map(v => historicalValue(v, byId.get(v.id)!)), latest].sort((a,b) => a.version - b.version) };
    }, 2500);
  } catch { return failed; }
}
