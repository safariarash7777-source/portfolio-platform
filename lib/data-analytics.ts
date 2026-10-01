import { getAvgVolume30Read } from "./core/avgVolume";
import { getFundamentalKind } from "./core/fundamentalData";
import type { ReadCoverage } from "./supabase/paged-read";

export const ANALYTIC_KINDS = ["volume", "monthly", "quarterly"] as const;
export type AnalyticKind = typeof ANALYTIC_KINDS[number];
export interface AnalyticsResponse {
  kind: AnalyticKind;
  data: Record<string, number>;
  coverage: ReadCoverage;
  provenance: { table: string; scope: "public-anon-rls"; version: 1; ttlMs: number; filter: string };
}
export async function readAnalytics(kind: AnalyticKind): Promise<AnalyticsResponse> {
  const result = kind === "volume" ? await getAvgVolume30Read() : await getFundamentalKind(kind);
  return {
    kind, data: result.data instanceof Map ? Object.fromEntries(result.data) : result.data,
    coverage: result.coverage,
    provenance: { table: kind === "volume" ? "symbol_history" : "codal_reports", scope: "public-anon-rls", version: 1,
      ttlMs: kind === "volume" ? 600000 : 3600000,
      filter: kind === "volume" ? "45 calendar days; non-null volume; latest 30 trading days; minimum 20" : `report_kind=ن-${kind === "monthly" ? "۳۰" : "۱۰"}` },
  };
}
