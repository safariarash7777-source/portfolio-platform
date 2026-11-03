import type { CodalRow } from './supabase';
import type { CodalN30Data } from './types';
import type { MonthlyQuantitySelectedBinding, QuantityWitnessedReport } from '../core/monthly-quantity';
import { jalaliYmdToGregorian } from '../core/jalali';
import { approvedCodalUrl } from '../desk/workspace-model';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const sourceFields = ['version', 'sourceId', 'htmlSha256', 'symbol', 'periodEnd', 'tableIndex', 'headerRowIndex',
  'unitColumn', 'productionColumn', 'salesColumn', 'unitHeader', 'productionHeader', 'salesHeader', 'rows'] as const;
const rowFields = ['rowIndex', 'admitted', 'productName', 'market', 'rawUnit', 'productionQty', 'salesQty'] as const;
function sameScalars(a: Record<string, unknown>, b: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every(key => Object.prototype.hasOwnProperty.call(a, key) && Object.prototype.hasOwnProperty.call(b, key)
    && (a[key] === null || ['string', 'number', 'boolean'].includes(typeof a[key])) && Object.is(a[key], b[key]));
}
/** JSONB may reorder object keys. Compare the complete bounded contract by field,
 * preserving row order and null/zero distinctions; no new hash is manufactured. */
function sameSnapshot(a: unknown, b: unknown): boolean {
  if (!object(a) || !object(b) || Object.keys(a).length !== sourceFields.length || Object.keys(b).length !== sourceFields.length
    || !sameScalars(a, b, sourceFields.filter(key => key !== 'rows')) || !Array.isArray(a.rows) || !Array.isArray(b.rows)
    || a.rows.length !== b.rows.length) return false;
  const rows = b.rows;
  return a.rows.every((row, index) => object(row) && object(rows[index]) && Object.keys(row).length === rowFields.length
    && Object.keys(rows[index]).length === rowFields.length && sameScalars(row, rows[index], rowFields));
}
function sameDownload(sourceRef: unknown, responseUrl: unknown): boolean {
  if (typeof sourceRef !== 'string' || typeof responseUrl !== 'string' || sourceRef.trim() !== sourceRef) return false;
  try {
    const requested = new URL(sourceRef), received = new URL(responseUrl);
    return requested.protocol === 'https:' && requested.hostname === 'excel.codal.ir'
      && !requested.username && !requested.password && !requested.hash
      && /^\/service\/Excel\/GetAll\/[^/]+\/0$/.test(requested.pathname) && requested.href === received.href;
  } catch { return false; }
}

/** Applied only after canonical report selection. This enforces consistency with
 * one selected row, not independent source authentication or an HTML archive. */
export function bindSelectedMonthlyQuantity(row: CodalRow, requestedSymbol: string): QuantityWitnessedReport {
  const report = row.data as CodalN30Data;
  const source = (report as QuantityWitnessedReport).quantity_source;
  const raw = row.raw, receipt: unknown = raw?.quantity_capture;
  const claimedWitness = source != null || (report as QuantityWitnessedReport).products.some(product => product.quantity_witness != null)
    || receipt != null || Object.prototype.hasOwnProperty.call(report, 'quantity_binding');
  if (!claimedWitness) return report;
  let binding: MonthlyQuantitySelectedBinding | null = null;
  const version = raw?.parser_version;
  const announcement = raw?.announcement_link;
  const period = report.period_end;
  const expectedUrl = typeof announcement === 'string' && Number.isSafeInteger(version) && version! > 0
    ? version === 1 ? announcement : `${announcement}#pv${version}` : null;
  if (object(receipt) && source && source.version === 1 && receipt.version === 1
    && Number.isSafeInteger(row.id) && row.id > 0 && row.report_kind === 'ن-۳۰' && report.report_kind === 'ن-۳۰'
    && typeof requestedSymbol === 'string' && requestedSymbol.trim().length > 0
    && row.symbol === requestedSymbol && report.symbol === row.symbol && source.symbol === row.symbol && receipt.symbol === row.symbol
    && receipt.report_kind === row.report_kind && expectedUrl !== null && row.source_url === expectedUrl
    && typeof announcement === 'string' && announcement.trim() === announcement && announcement.length > 0
    && approvedCodalUrl(announcement) !== null && receipt.announcement_link === announcement && receipt.source_url === row.source_url
    && receipt.parser_version === version && receipt.link_excel === raw?.link_excel && source.sourceId === raw?.link_excel
    && sameDownload(raw?.link_excel, receipt.response_url)
    && typeof period === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(period) && raw?.period_end_jalali === period
    && source.periodEnd === period && receipt.period_end_jalali === period
    && jalaliYmdToGregorian(period) !== null && jalaliYmdToGregorian(period) === row.period_end
    && typeof source.htmlSha256 === 'string' && /^[a-f0-9]{64}$/.test(source.htmlSha256)
    && receipt.html_sha256 === source.htmlSha256 && sameSnapshot(receipt.source, source)) {
    binding = { reportId: row.id, symbol: row.symbol, periodEnd: period, sourceUrl: row.source_url!,
      sourceRef: source.sourceId, parserVersion: version!, htmlSha256: source.htmlSha256 };
  }
  // Overwrite any stored claim, including an apparently valid foreign row ID.
  // Preserve all raw numbers, units, source evidence and selection; downstream
  // quantity validation treats explicit null as a failed new-witness binding.
  return { ...report, quantity_binding: binding };
}
