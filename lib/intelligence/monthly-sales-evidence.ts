import { maskGrowth } from "../core/engine";
import { approvedCodalUrl } from "../desk/workspace-model";
import type { MonthlySalesScreen, SalesPoint } from "../fundamental/monthly-sales-screen";
import type { ResearchPacket } from "./research-agent";

/** Two documents describe one comparison. Keep row identity and URLs local. */
export function monthlyResearchEvidence(screen: MonthlySalesScreen, symbol: string) {
  const row = screen.rows.find(r => r.symbol === symbol);
  if (!row) throw new Error("screen_row_missing");
  const documents = [row.current, row.previous].filter((p): p is SalesPoint => p !== null);
  for (const doc of documents) {
    if (!approvedCodalUrl(doc.sourceUrl) || !Number.isSafeInteger(doc.reportId)) throw new Error("invalid_source");
  }
  const growth = row.growth;
  const decision = row.passed === null ? "unavailable" : row.passed ? "passed" : "below";
  if ((growth === null) !== (row.passed === null) ||
      (growth !== null && (!Number.isFinite(growth) || documents.length !== 2))) throw new Error("invalid_screen_decision");
  const query = new URLSearchParams({period: screen.period, minGrowth: String(screen.minGrowth), symbol});
  const packet: ResearchPacket = { version: "research-v1", observations: [{
    evidence: "E1", bands: {monthly_sales_growth: maskGrowth(growth)},
  }] };
  const direction = growth === null ? "unknown" : growth > 0 ? "increased" : growth < 0 ? "decreased" : "unchanged";
  // No user-controlled text crosses into the model's instructions.
  const context = `E1 describes the year-over-year change in one month's reported amount. Direction: ${direction}. Threshold outcome: ${decision}. Current document: ${row.current ? "available":"missing or ineligible"}. Prior document: ${row.previous ? "available":"missing or ineligible"}. Explain this comparison only. Its price/volume attribution, margins and outlook are unknown. Use مبلغ گزارش‌شده for the amount. Include these limitations.`;
  return {packet, context, provenance: {evidence:"E1", symbol, period:screen.period, previousPeriod:screen.previousPeriod,
    minGrowth:screen.minGrowth, growth, passed:row.passed, reason:row.reason,
    rowPath:"/market/screener?"+query, current:row.current, previous:row.previous}};
}
