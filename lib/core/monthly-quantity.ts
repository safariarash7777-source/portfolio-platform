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

/** Preserve money; quantity aggregates require a declared common denominator. */
export function withKnownMonthlyQuantities(report: CodalN30Data): CodalN30Data {
  const units = report.products.map(p => knownUnit(Object.prototype.hasOwnProperty.call(p,'qty_unit') ? p.qty_unit : report.qty_unit));
  const quantityUnit = units.length && units.every(u => u !== null && u === units[0]) ? units[0] : null;
  const moneyKnown = typeof report.unit === 'string' && report.unit.replace(/\s/g,'') === 'میلیونریال';
  return { ...report, qty_unit: quantityUnit, products: report.products.map(p => ({
    ...p,
    production_qty: quantityUnit ? p.production_qty : null,
    sales_qty: quantityUnit ? p.sales_qty : null,
    sales_rate: quantityUnit && moneyKnown ? p.sales_rate : null,
  })) };
}
