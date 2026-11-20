import reviewed from "./reviewed-units-preview.json";
import type { SalesFiling } from "./monthly-sales-screen";

// This review deployment does not mutate stored filings. Match the immutable
// original and the source witness before running ordinary revision selection.
export function previewVerifiedUnits(rows: SalesFiling[]): SalesFiling[] {
  if (process.env.VERCEL_ENV !== "preview") return rows;
  const byId = new Map(reviewed.map(proof => [proof.reportId, proof]));
  return rows.map(row => {
    const proof = byId.get(row.id);
    if (!proof || row.unit?.trim() || row.amount !== proof.amount ||
        row.symbol.trim() !== proof.symbol || row.reportSymbol.trim() !== proof.symbol ||
        row.reportPeriod !== proof.periodEnd || row.source_url.split("#")[0] !== proof.sourceUrl ||
        Number(row.months) !== 1 || (row.measure && row.measure !== "sales")) return row;
    return { ...row, unit: proof.unit };
  });
}
