import current from "./folad-reviewed-month.json";
import prior from "./folad-reviewed-prior.json";
import type { CodalN30Data, N30ProductRow } from "./types";
import type { ReportRecord } from "./product-observation";

/** A narrow analytical supplement for a selected stored row. Old or substituted
 * revisions, unmatched cells and ambiguous rows cannot supply an observation. */
export function reviewedProductRows(data: CodalN30Data, record: ReportRecord) {
  const capture = [current, prior].find(c =>
    c.record === record.id && c.source === record.sourceUrl &&
    c.symbol === data.symbol && c.period === data.period_end &&
    c.period === record.financialPeriodEnd && c.total === data.period_total_amount);
  if (!capture) return null;
  const products: N30ProductRow[] = [];
  for (const cell of capture.rows) {
    const matches = data.products.filter(p => p.product_name === cell.product && p.sales_amount === cell.amount
      && (p.sales_qty == null || p.sales_qty === cell.quantity)
      && (p.market_basis !== "section_header" || p.market === cell.market));
    if (matches.length !== 1) continue;
    if (cell.market !== "داخلی" && cell.market !== "صادراتی") continue;
    products.push({product_name: cell.product, market:cell.market, market_basis:"section_header",
      sales_amount:cell.amount, sales_qty:cell.quantity, qty_unit:cell.unit.replace(/^هزارتن$/, "هزار تن"),
      production_qty:null, sales_rate:null});
  }
  if (!products.length) return null;
  const report: CodalN30Data = {symbol:data.symbol,report_kind:"ن-۳۰",period_end:data.period_end,
    fiscal_year:data.fiscal_year,period_total_amount:data.period_total_amount,fy_cumulative_amount:null,
    monthly_measure:"sales",unit:"میلیون ریال", products};
  return {report, record, workbook:capture.workbook, sha256:capture.sha256};
}
