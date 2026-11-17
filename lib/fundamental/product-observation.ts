import { reviewedProductRows } from "./reviewed-product-rows";
import { comparableMonthlyReports, dedupeByMonth, monthlyCalendarKeys } from "@/lib/core/monthlyReport";
import { monthlyMarket, withKnownMonthlyQuantities } from "@/lib/core/monthly-quantity";
import type { CodalN30Data, ReportSource, SymbolFundamentals } from "./types";

export type ReportRecord = NonNullable<ReportSource["records"]>[number];
const known = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function monthlyObservations(monthly: NonNullable<SymbolFundamentals["n30"]>) {
  const reports = dedupeByMonth(comparableMonthlyReports(monthly.data));
  const months = monthlyCalendarKeys([...reports.keys()]);
  const options = new Map<string,string>();
  for (const report of reports.values()) {
    if ((report.monthly_measure ?? "sales") !== "sales") continue;
    for (const row of report.products) {
      const market = monthlyMarket(row);
      if (market !== "داخلی" && market !== "صادراتی") continue;
      options.set(JSON.stringify([row.product_name,market]), row.product_name+" · "+market);
    }
  }
  return { months, reports, options };
}

export function observation(report: CodalN30Data | undefined, key: string, source?: ReportRecord) {
  const rows = report?.products.filter(p => JSON.stringify([p.product_name,monthlyMarket(p)]) === key);
  const row = rows?.length === 1 ? rows[0] : null;
  if (!report || !row || report.unit?.replace(/\s/g,"") !== "میلیونریال") return null;
  const checked = withKnownMonthlyQuantities({...report, products:[row]});
  const reviewed = source && reviewedProductRows(report,source)?.report.products.find(p=>
    p.product_name===row.product_name && p.market===row.market);
  const unit = reviewed?.qty_unit ?? checked.qty_unit ?? null;
  const qty = reviewed?.sales_qty ?? checked.products[0].sales_qty;
  const amount = known(row.sales_amount) ? row.sales_amount : null;
  const rate = known(qty) && qty > 0 && amount !== null && amount >= 0 && unit
    ? amount * 1_000_000 / qty : null;
  return { amount, qty: known(qty) ? qty : null, unit, rate };
}

export function changes(current: ReturnType<typeof observation>, prior: ReturnType<typeof observation>) {
  if (current?.amount == null || prior?.amount == null) return null;
  const delta = current.amount - prior.amount;
  if (current.rate == null || prior.rate == null || current.qty == null || prior.qty == null || !current.unit || current.unit !== prior.unit) {
    return { delta, rateEffect: null, quantityEffect: null };
  }
  // Symmetric decomposition, splitting the interaction equally; effects are in million rial.
  const rateEffect = (current.rate-prior.rate)*(current.qty+prior.qty)/2_000_000;
  const quantityEffect = (current.qty-prior.qty)*(current.rate+prior.rate)/2_000_000;
  return { delta, rateEffect, quantityEffect };
}

export function evidenceRecord(records: ReportSource["records"], period?: string) {
  const matches = period ? records?.filter(record => record.financialPeriodEnd === period) : [];
  return matches?.length === 1 ? matches[0] : null;
}
