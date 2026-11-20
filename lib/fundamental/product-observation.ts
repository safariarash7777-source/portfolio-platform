import { FOOLAD_HOT_DOMESTIC_KEY, FOOLAD_HOT_DOMESTIC_RATES } from "./foolad-rate-evidence";
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

export function companyMonthlyModel(fundamentals: SymbolFundamentals) {
  const monthly = fundamentals.n30;
  if (!monthly) return null;
  const reviewed = fundamentals.reviewedProductReports ?? [];
  const restored = reviewed.map(item => item.report);
  const model = monthlyObservations({
    ...monthly,
    data: [...restored, ...monthly.data.filter(report => !restored.some(r => r.period_end === report.period_end))],
  });
  const sourceFor = (report?: CodalN30Data) =>
    reviewed.find(item => item.report === report)?.record ?? evidenceRecord(monthly.source.records, report?.period_end);
  return { ...model, sourceFor };
}

export type CompanyComparison = { product: string; month: string; compare: "year" | "previous" };
/** The query changes display only; no query value is used in a data-store read. */
export function companyComparisonSeed(fundamentals: SymbolFundamentals, query: Record<string, unknown>): CompanyComparison | null {
  const { product, month, compare } = query;
  // Reject duplicate values (arrays), partial requests and requests for blank calendar gaps.
  if (typeof product !== "string" || product.length > 300 || typeof month !== "string"
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || (compare !== "year" && compare !== "previous")) return null;
  const model = companyMonthlyModel(fundamentals);
  const report = model?.reports.get(month);
  if (!model?.options.has(product) || observation(report, product, model.sourceFor(report) ?? undefined)?.amount == null) return null;
  return { product, month, compare };
}

export function observation(report: CodalN30Data | undefined, key: string, source?: ReportRecord) {
  const rows = report?.products.filter(p => JSON.stringify([p.product_name,monthlyMarket(p)]) === key);
  const row = rows?.length === 1 ? rows[0] : null;
  if (!report || !row || report.unit?.replace(/\s/g,"") !== "میلیونریال") return null;
  const checked = withKnownMonthlyQuantities({...report, products:[row]});
  const reviewed = source && reviewedProductRows(report,source)?.report.products.find(p=>
    p.product_name===row.product_name && p.market===row.market);
  const amount = known(row.sales_amount) ? row.sales_amount : null;
  const observedUnit = reviewed?.qty_unit ?? checked.qty_unit ?? null;
  const observedQty = reviewed?.sales_qty ?? checked.products[0].sales_qty;
  const reportedRate = report.symbol === "فولاد" && key === FOOLAD_HOT_DOMESTIC_KEY
    ? FOOLAD_HOT_DOMESTIC_RATES.find(cell => source?.id === cell.id && source.sourceUrl === cell.source
      && source.financialPeriodEnd === cell.period && report.period_end === cell.period
      && amount === cell.amount
      && (row.sales_qty == null || row.sales_qty === cell.quantity)
      && (observedQty == null || observedQty === cell.quantity)
      && (observedUnit == null || observedUnit === "هزار تن")
      && (row.qty_unit == null || row.qty_unit.replace(/\s/g, "") === "هزارتن")) ?? null : null;
  // A source-bound workbook supplies the exact printed quantity when the
  // normalized view has no verified quantity. It never overwrites disagreement.
  const unit = observedUnit ?? (reportedRate ? "هزار تن" : null);
  const qty = observedQty ?? reportedRate?.quantity ?? null;
  const rate = known(qty) && qty > 0 && amount !== null && amount >= 0 && unit
    ? amount * 1_000_000 / qty : null;
  return { amount, qty: known(qty) ? qty : null, unit, rate, reportedRate };
}

type SalesObservation = Pick<NonNullable<ReturnType<typeof observation>>, "amount" | "qty" | "unit" | "rate">;
export function changes(current: SalesObservation | null | undefined, prior: SalesObservation | null | undefined) {
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
