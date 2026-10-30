// P14-EDU-02: authored teaching inputs, never a stored report or live market record.
// Both layouts use this exact module. All financial derivations below reuse existing cores.
import type { CodalN30Data, CodalN10Data, SymbolFundamentals } from "../../../lib/fundamental/types";
import { deriveQuarters, ttmSeries, peOf, type QuarterInput } from "../../../lib/core/quarterly";
import type { HistoryPoint } from "../../../components/terminal/HistoryChart";

export const DATASET_ID = "P14-EDU-02";
export const STATES = ["ready", "month-gap", "no-prior", "quarter-gap", "empty", "error"] as const;
export type DemoState = typeof STATES[number];
export const SOURCE = Object.freeze({
  label: "دادهٔ تألیفی آموزشی؛ هیچ گزارش یا قیمت واقعی نیست",
  createdOn: "2026-10-31", officialReportId: null, officialUrl: null,
  publishedAt: null, collectedAt: null, revision: null,
});
type ProductFacts = [production: number | null, quantity: number | null, rate: number | null, amount: number | null];
type MonthlyFacts = [fy: number, month: number, total: number, cumulative: number, hot: ProductFacts, exported: ProductFacts, cold: ProductFacts];
const monthlyFacts: MonthlyFacts[] = [
  [1404,1,60000,60000,[1950,1800,18000000,32400],[650,600,20000000,12000],[550,520,30000000,15600]],
  [1404,2,64970,124970,[2000,1850,19000000,35150],[680,620,21000000,13020],[590,560,30000000,16800]],
  [1404,3,71360,196330,[2050,1900,20000000,38000],[710,680,22000000,14960],[620,600,30666667,18400]],
  [1404,4,77600,273930,[2150,2000,20500000,41000],[740,700,23000000,16100],[650,640,32031250,20500]],
  [1404,5,84400,358330,[2200,2050,21000000,43050],[800,750,24000000,18000],[700,680,34338235,23350]],
  [1404,6,91200,449530,[2250,2100,22000000,46200],[850,800,25000000,20000],[750,720,34722222,25000]],
  [1405,1,74100,74100,[2200,2000,20000000,40000],[760,700,23000000,16100],[650,600,30000000,18000]],
  [1405,2,81200,155300,[2250,2050,21000000,43050],[810,750,24000000,18000],[700,650,31000000,20150]],
  [1405,3,88600,243900,[2300,2100,22000000,46200],[870,800,25000000,20000],[760,700,32000000,22400]],
  [1405,4,97450,341350,[2420,2200,23000000,50600],[910,850,26000000,22100],[800,750,33000000,24750]],
  [1405,5,106700,448050,[2500,2300,24000000,55200],[970,900,27000000,24300],[860,800,34000000,27200]],
  [1405,6,116350,564400,[2650,2400,25000000,60000],[1020,950,28000000,26600],[920,850,35000000,29750]],
];
export const MONTHLY: CodalN30Data[] = monthlyFacts.map(([fy, month, total, cumulative, ...facts]) => ({
  symbol: "آموزشی", report_kind: "ن-۳۰", fiscal_year: fy,
  period_end: `${fy}-${String(month).padStart(2,"0")}-31`,
  period_total_amount: total, fy_cumulative_amount: cumulative,
  unit: "میلیون ریال", unit_basis: "تعریف صریح دادهٔ آموزشی", qty_unit: "تن",
  products: facts.map(([production_qty, sales_qty, sales_rate, sales_amount], index) => ({
    product_name: index === 2 ? "ورق سرد" : "ورق گرم", market: index === 1 ? "صادراتی" as const : "داخلی" as const,
    production_qty, sales_qty, sales_rate, sales_amount, qty_unit: "تن",
  })),
}));
// Cumulative reports. Do not treat these as independent quarters.
const periodFacts = [
  [1403,3,190000,57000,45000,32000], [1403,6,400000,122000,93000,67000],
  [1403,9,630000,196000,148000,108000], [1403,12,890000,280000,212000,156000],
  [1404,3,210000,67000,50000,39000], [1404,6,450000,146000,110000,85000],
  [1404,9,720000,240000,183000,142000], [1404,12,1030000,354000,272000,211000],
  [1405,3,260000,91000,70000,54000], [1405,6,565000,201000,155000,120000],
] as const;
export const PERIODS: QuarterInput[] = periodFacts.map(([fy, months, revenue, gross_profit, operating_profit, net_profit], index) => ({
  id: index + 1, period_end: `${fy}-${String(months).padStart(2,"0")}-${months === 12 ? "29" : months === 9 ? "30" : "31"}`,
  period_months: months, audited: months === 12, unit: "میلیون ریال", scope: "company", capital: 100000,
  revenue, gross_profit, operating_profit, net_profit,
}));
export const ANNUAL: CodalN10Data = {
  symbol: "آموزشی", company_name: "شرکت نمونهٔ صنعتی", report_kind: "ن-۱۰",
  period_end: "1404-12-29", period_months: 12, audited: true, restated_prior: false,
  unit: "میلیون ریال", capital: 100000,
  standalone: { revenue: 1030000, cogs: 676000, gross_profit: 354000, operating_profit: 272000, net_profit: 211000, eps_rial: 2110,
    prior: { revenue: 890000, cogs: 610000, gross_profit: 280000, operating_profit: 212000, net_profit: 156000, eps_rial: 1560 } },
  sales_trend_5y: [{ fy:1403, revenue:890000, cogs:610000 }, { fy:1404, revenue:1030000, cogs:676000 }],
};
const priceFacts = [12600,12800,12700,13000,13200,13100,13600,13700,13900,14000,14200,14400];
const flowFacts = [12000000000,-4000000000,0,7000000000,null,-2000000000,5000000000,9000000000,3000000000,-1000000000,6000000000,8000000000];
export const HISTORY: HistoryPoint[] = priceFacts.map((close, index) => ({ time: Date.UTC(2026,8,index+1,12)/1000, close, netFlow: flowFacts[index] }));
export const QUARTER_PRICES: Readonly<Record<string, number>> = Object.freeze({ "1403-12-29":8200, "1404-03-31":8600, "1404-06-31":9300, "1404-09-30":10500, "1404-12-29":11800, "1405-03-31":13000, "1405-06-31":14400 });
export function monthlyFor(state: DemoState, fy: number) {
  if (state === "empty" || state === "error") return [];
  return MONTHLY.filter(report => report.fiscal_year <= fy && report.fiscal_year >= fy-1)
    .filter(report => state !== "month-gap" || report.period_end !== "1405-04-31")
    .filter(report => state !== "no-prior" || report.fiscal_year === fy);
}
/** Presentation guard only: the readonly rate component does not insert absent month slots. */
export function hasMonthlyGap(reports: CodalN30Data[]): boolean {
  const keys=[...new Set(reports.map(r=>r.period_end.slice(0,7)))].sort();
  return keys.some((key,i)=>i>0 && (Number(key.slice(0,4))*12+Number(key.slice(5,7)))-(Number(keys[i-1].slice(0,4))*12+Number(keys[i-1].slice(5,7)))!==1);
}
export function quarterlyFor(state: DemoState) {
  const inputs = state === "empty" || state === "error" ? [] : PERIODS.filter(row => state !== "quarter-gap" || row.period_end !== "1404-06-31");
  const quarters = deriveQuarters(inputs), ttm = ttmSeries(quarters);
  const latestQuarter=quarters[quarters.length-1];
  const latestTtm=ttm.find(point=>point.periodEnd===latestQuarter?.periodEnd);
  // Keep every quarter slot: an unavailable TTM must break the P/E line, not vanish.
  return { inputs, quarters, ttm, peSeries: quarters.map(q => {
    const point=ttm.find(p=>p.periodEnd===q.periodEnd);
    return { label:q.label, pe:point ? peOf(QUARTER_PRICES[q.periodEnd] ?? null, point.epsTtm) : null };
  }), currentPe:latestTtm ? peOf(QUARTER_PRICES[latestTtm.periodEnd] ?? null, latestTtm.epsTtm) : null };
}
export function fundamentalsFor(state: DemoState, reports: CodalN30Data[]): SymbolFundamentals {
  const source = { title: "صورت مالی آموزشی؛ گزارش رسمی نیست", source_url: null, verified: false, scope: "company" as const, publishedAt: null };
  const latestFy=reports.length ? Math.max(...reports.map(r=>r.fiscal_year)) : null;
  const currentYear=reports.filter(r=>r.fiscal_year===latestFy);
  return { symbol: "آموزشی", n10: state === "empty" || state === "error" ? null : { data: ANNUAL, source },
    n30: currentYear.length && !hasMonthlyGap(currentYear) ? { data: currentYear, source: { ...source, title: "فعالیت ماهانهٔ آموزشی؛ گزارش رسمی نیست" } } : null };
}
export function productReports(reports: CodalN30Data[], product: string, market: string) {
  return reports.map(report => ({ ...report, products: report.products.filter(row => (product === "all" || row.product_name === product) && (market === "all" || row.market === market)) }));
}
function freeze(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
}
freeze(MONTHLY); freeze(PERIODS); freeze(ANNUAL); freeze(HISTORY);
