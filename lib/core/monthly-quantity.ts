import type { CodalN30Data, N30Market } from '@/lib/fundamental/types';

const UNITS = new Set(['تن','هزار تن','کیلوگرم','گرم','عدد','هزار عدد','متر','هزار متر','متر مربع','متر مکعب','لیتر','هزار لیتر','کیلووات ساعت','مگاوات ساعت']);
function knownUnit(value: unknown): string | null {
  const unit = typeof value === 'string' ? value.trim().replace(/\s+/g,' ').replace(/^هزارتن$/, 'هزار تن') : '';
  return UNITS.has(unit) ? unit : null;
}

export function monthlyMarket(value: unknown): N30Market {
  return value === 'داخلی' || value === 'صادراتی' || value === 'خدمات' ? value : 'نامشخص';
}
export function isGoodsMarket(value: unknown): value is 'داخلی' | 'صادراتی' {
  return value === 'داخلی' || value === 'صادراتی';
}

/** Preserve money; quantity aggregates require a declared common denominator. */
export function withKnownMonthlyQuantities(report: CodalN30Data): CodalN30Data {
  const units = report.products.filter(p => isGoodsMarket(p.market)).map(p => knownUnit(Object.prototype.hasOwnProperty.call(p,'qty_unit') ? p.qty_unit : report.qty_unit));
  const quantityUnit = units.length && units.every(u => u !== null && u === units[0]) ? units[0] : null;
  const moneyKnown = typeof report.unit === 'string' && report.unit.replace(/\s/g,'') === 'میلیونریال';
  return { ...report, qty_unit: quantityUnit, products: report.products.map(p => ({
    ...p,
    market: monthlyMarket(p.market),
    production_qty: quantityUnit && isGoodsMarket(p.market) ? p.production_qty : null,
    sales_qty: quantityUnit && isGoodsMarket(p.market) ? p.sales_qty : null,
    sales_rate: quantityUnit && moneyKnown && isGoodsMarket(p.market) ? p.sales_rate : null,
  })) };
}
