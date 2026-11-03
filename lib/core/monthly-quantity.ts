import type { CodalN30Data, N30Market, N30ProductRow } from '@/lib/fundamental/types';

/** A historical label is not evidence of a domestic, export or service section. */
export function monthlyMarket(row: Pick<N30ProductRow, 'market' | 'market_basis'>): N30Market {
  return row.market_basis === 'section_header'
    && (row.market === 'داخلی' || row.market === 'صادراتی' || row.market === 'خدمات')
    ? row.market : 'نامشخص';
}

export type MonthlyMarketUnavailableReason = 'unverified-market' | 'incomplete-market-coverage' | 'signed-market-adjustment' | null;

/** An exact split needs verified labels and complete, reconciled monetary coverage. No tolerance is guessed.
 * Signed adjustments remain in money data; the existing positive-only mix cannot establish their exact split. */
export function monthlyMarketUnavailableReason(report: CodalN30Data): MonthlyMarketUnavailableReason {
  if (report.products.some(p => monthlyMarket(p) === 'نامشخص')) return 'unverified-market';
  if (!report.products.length || !Number.isFinite(report.period_total_amount)
    || report.products.some(p => typeof p.sales_amount !== 'number' || !Number.isFinite(p.sales_amount)))
    return 'incomplete-market-coverage';
  if (report.products.reduce((sum, p) => sum + p.sales_amount!, 0) !== report.period_total_amount) return 'incomplete-market-coverage';
  return report.products.some(p => p.sales_amount! < 0) ? 'signed-market-adjustment' : null;
}

const UNITS = new Set(['تن','کیلوگرم','گرم','عدد','هزار عدد','متر','هزار متر','متر مربع','متر مکعب','لیتر','هزار لیتر','کیلووات ساعت','مگاوات ساعت']);
function knownUnit(value: unknown): string | null {
  const unit = typeof value === 'string' ? value.trim().replace(/\s+/g,' ') : '';
  return UNITS.has(unit) ? unit : null;
}

/** Optional local hand-off contract. Consistency is checked here; binding the
 * HTML bytes and the selected stored report is a separate producer/reader gate. */
export interface MonthlyQuantityRowObservation {
  rowIndex: number;
  admitted: boolean;
  productName: string;
  market: N30Market;
  rawUnit: string;
  productionQty: number | null;
  salesQty: number | null;
}
export interface MonthlyQuantitySource {
  version: 1;
  sourceId: string;
  htmlSha256: string;
  symbol: string;
  periodEnd: string;
  tableIndex: number;
  headerRowIndex: number;
  unitColumn: 1;
  productionColumn: 13;
  salesColumn: 14;
  unitHeader: string;
  productionHeader: string;
  salesHeader: string;
  rows: MonthlyQuantityRowObservation[];
}
export interface MonthlyQuantityWitness {
  sourceId: string;
  htmlSha256: string;
  periodEnd: string;
  tableIndex: number;
  rowIndex: number;
  unitColumn: 1;
}
/** One internal producer receipt, not an independent attestation or a raw-HTML
 * archive. The reader must compare this with the actual selected database row.
 * No database row ID exists at capture time and none is invented here. */
export interface MonthlyQuantityCaptureReceipt {
  version: 1;
  symbol: string;
  report_kind: 'ن-۳۰';
  announcement_link: string;
  source_url: string;
  link_excel: string;
  response_url: string;
  period_end_jalali: string;
  parser_version: number;
  html_sha256: string;
  source: MonthlyQuantitySource;
}
/** Reader-created lineage only. Stored copies are discarded by the reader. */
export interface MonthlyQuantitySelectedBinding {
  reportId: number;
  symbol: string;
  periodEnd: string;
  sourceUrl: string;
  sourceRef: string;
  parserVersion: number;
  htmlSha256: string;
}
export type QuantityWitnessedProduct = N30ProductRow & { quantity_witness?: MonthlyQuantityWitness | null };
export type QuantityWitnessedReport = Omit<CodalN30Data, 'products'> & {
  quantity_source?: MonthlyQuantitySource | null;
  /** Absent only in the internal parser hand-off; database reads always set this. */
  quantity_binding?: MonthlyQuantitySelectedBinding | null;
  products: QuantityWitnessedProduct[];
};

function thousandTonnes(value: unknown): boolean {
  return typeof value === 'string' && value.trim().replace(/[\s\u200c]+/g, ' ').replace(/^هزارتن$/, 'هزار تن') === 'هزار تن';
}
function index(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function cell(value: unknown): value is number | null { return value === null || (typeof value === 'number' && Number.isFinite(value)); }

/** A new quantity unit needs the matching observed row, not merely a unit label.
 * No rate denominator is inferred, and no caller-supplied witness authenticates itself. */
function quantityRow(report: CodalN30Data, product: N30ProductRow): MonthlyQuantityRowObservation | null {
  const source = (report as QuantityWitnessedReport).quantity_source;
  const witness = (product as QuantityWitnessedProduct).quantity_witness;
  if (!source || !witness || source.version !== 1 || !Object.prototype.hasOwnProperty.call(product, 'qty_unit')) return null;
  if (Object.prototype.hasOwnProperty.call(report, 'quantity_binding')) {
    const binding = (report as QuantityWitnessedReport).quantity_binding;
    if (!binding || !Number.isSafeInteger(binding.reportId) || binding.reportId <= 0
      || binding.symbol !== report.symbol || binding.periodEnd !== report.period_end
      || binding.sourceRef !== source.sourceId || binding.htmlSha256 !== source.htmlSha256
      || typeof binding.sourceUrl !== 'string' || !binding.sourceUrl
      || !Number.isSafeInteger(binding.parserVersion) || binding.parserVersion <= 0) return null;
  }
  if (typeof source.sourceId !== 'string' || !source.sourceId || source.sourceId.trim() !== source.sourceId || source.sourceId.length > 4096
    || typeof source.htmlSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.htmlSha256)
    || typeof source.symbol !== 'string' || !source.symbol.trim() || source.symbol.trim() !== source.symbol
    || typeof source.periodEnd !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(source.periodEnd)
    || source.symbol !== report.symbol || source.periodEnd !== report.period_end
    || !index(source.tableIndex) || !index(source.headerRowIndex) || source.unitColumn !== 1 || source.productionColumn !== 13 || source.salesColumn !== 14
    || source.unitHeader !== 'واحد' || typeof source.productionHeader !== 'string' || !source.productionHeader.includes('تولید')
    || typeof source.salesHeader !== 'string' || !['تعداد فروش', 'مقدار فروش', 'مقدار'].includes(source.salesHeader)
    || !Array.isArray(source.rows)) return null;
  if (witness.sourceId !== source.sourceId || witness.htmlSha256 !== source.htmlSha256 || witness.periodEnd !== source.periodEnd
    || witness.tableIndex !== source.tableIndex || witness.unitColumn !== 1 || !index(witness.rowIndex) || witness.rowIndex <= source.headerRowIndex) return null;
  const rows = source.rows.filter(row => row?.rowIndex === witness.rowIndex);
  if (rows.length !== 1) return null;
  const row = rows[0];
  const sameUnit = typeof row.rawUnit === 'string' && typeof product.qty_unit === 'string'
    && (row.rawUnit.trim().replace(/\s+/g, ' ') === product.qty_unit.trim().replace(/\s+/g, ' ')
      || (thousandTonnes(row.rawUnit) && thousandTonnes(product.qty_unit)));
  return row.admitted === true && row.productName === product.product_name && row.market === monthlyMarket(product) && sameUnit
    && cell(row.productionQty) && cell(row.salesQty)
    && Object.is(row.productionQty, product.production_qty) && Object.is(row.salesQty, product.sales_qty) ? row : null;
}
export function hasThousandTonneQuantityWitness(report: CodalN30Data, product: N30ProductRow): boolean {
  return ['داخلی', 'صادراتی'].includes(monthlyMarket(product)) && thousandTonnes(product.qty_unit) && quantityRow(report, product) !== null;
}

/** Preserve money; quantity aggregates require a declared common denominator. */
export function withKnownMonthlyQuantities(report: CodalN30Data): CodalN30Data {
  const units = report.products.map(p => {
    const claimed = knownUnit(Object.prototype.hasOwnProperty.call(p,'qty_unit') ? p.qty_unit : report.qty_unit);
    const hasWitnessContract = (report as QuantityWitnessedReport).quantity_source != null || (p as QuantityWitnessedProduct).quantity_witness != null;
    return hasWitnessContract && !quantityRow(report, p) ? null : claimed;
  });
  // Existing rate eligibility remains the exact old unit contract. A new
  // quantity-only witness must never expand it or certify a rate numerator.
  const legacyUnit = units.length && units.every(u => u !== null && u === units[0]) ? units[0] : null;
  const witnessedThousandTonnes = report.products.length > 0 && report.products.every(p => hasThousandTonneQuantityWitness(report, p));
  const quantityUnit = legacyUnit ?? (witnessedThousandTonnes ? 'هزار تن' : null);
  const moneyKnown = typeof report.unit === 'string' && report.unit.replace(/\s/g,'') === 'میلیونریال';
  return { ...report, qty_unit: quantityUnit, products: report.products.map(p => ({
    ...p,
    production_qty: legacyUnit || hasThousandTonneQuantityWitness(report, p) ? p.production_qty : null,
    sales_qty: legacyUnit || hasThousandTonneQuantityWitness(report, p) ? p.sales_qty : null,
    sales_rate: legacyUnit && moneyKnown ? p.sales_rate : null,
  })) };
}
