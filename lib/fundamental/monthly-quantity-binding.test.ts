import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { capturedFoladRow } from '../../relay/fixtures/quantity-capture.mjs';
import { bindSelectedMonthlyQuantity } from './monthly-quantity-binding';
import { readFundamentalsFromSupabase, type CodalRow } from './supabase';
import { withKnownMonthlyQuantities, type QuantityWitnessedReport } from '../core/monthly-quantity';
import { buildMonthlySales } from '../core/monthlyReport';
import { jalaliYmdToGregorian } from '../core/jalali';
import MonthlySalesCharts from '../../components/symbol/MonthlySalesCharts';

Object.assign(globalThis, { React });
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
let readNumber = 0;
async function read(rows: CodalRow[], symbol = 'فولاد') {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));assert.equal(url.origin, 'https://quantity-reader.invalid');
    assert.equal(init?.method ?? 'GET', 'GET');calls++;
    assert.equal(url.searchParams.get('symbol'), `eq.${symbol}`);
    return Response.json(rows.filter(row => url.searchParams.get('report_kind') === `eq.${row.report_kind}`));
  };
  const result = await readFundamentalsFromSupabase(symbol, { environment: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://quantity-reader.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: `synthetic-quantity-${++readNumber}`,
  } });
  assert.equal(calls, 2);assert.equal(result.state, 'ready');
  return result.data!;
}
const witnessed = (row: CodalRow) => row.data as QuantityWitnessedReport;
const rawObject = (row: CodalRow) => row.raw as unknown as Record<string, unknown>;
const receipt = (row: CodalRow) => row.raw!.quantity_capture!;
function assertMoney(actual: QuantityWitnessedReport, row: CodalRow) {
  assert.equal(actual.period_total_amount, witnessed(row).period_total_amount);
  assert.equal(actual.fy_cumulative_amount, witnessed(row).fy_cumulative_amount);
  assert.deepEqual(actual.products, witnessed(row).products);
}

test('quantity lineage: actual archived bytes pass producer, selected reader, core and real chart component', async () => {
  const fixture = await capturedFoladRow(), row = fixture.row as CodalRow, before = structuredClone(row);
  const result = await read([row]), report = result.n30!.data[0] as QuantityWitnessedReport;
  assert.deepEqual(report.quantity_binding, { reportId: row.id, symbol: 'فولاد', periodEnd: '1405-06-31',
    sourceUrl: row.source_url, sourceRef: row.raw!.link_excel, parserVersion: 2,
    htmlSha256: '11c089fae22de79e4986b37677e3ce2af3f594642cff0f546b2bc0feb84c2a62' });
  assert.equal(row.period_end, jalaliYmdToGregorian(report.period_end));assertMoney(report, row);
  const checked = withKnownMonthlyQuantities(report), model = buildMonthlySales([checked])!;
  assert.equal(model.prodVsSales[0].sales, null);
  assert.deepEqual(model.quantitySeries!.map(series => [series.market, series.points[0].production, series.points[0].sales]),
    [['داخلی', 279, 238], ['صادراتی', 0, 66]]);
  assert.ok(checked.products.every(product => product.sales_rate === null));
  const html = renderToStaticMarkup(React.createElement(MonthlySalesCharts, { reports: [checked], sourceTitle: result.n30!.source.title, sourceUrl: result.n30!.source.source_url }));
  assert.ok(html.includes('محصولات گرم — کالای داخلی'));assert.ok(html.includes('محصولات گرم — کالای صادراتی'));
  assert.ok(html.includes('واحد مقدار: هزار تن'));assert.ok(html.includes('خدمات در این نمودار نیست'));
  assert.ok(html.includes('نرخ فروش با واحد معتبر موجود نیست'));
  const provenance = result.n30!.source.records![0];
  assert.equal(provenance.id, row.id);assert.equal(provenance.storedPeriodEnd, row.period_end);
  assert.equal(provenance.financialPeriodEnd, report.period_end);assert.equal(provenance.publishedDateRaw, '1405/07/01');
  assert.equal(provenance.publishedTimeRaw, '11:12:13');assert.equal(provenance.capturedAtRaw, row.captured_at);
  assert.equal(provenance.publishedAtUtc, null);assert.equal(provenance.publicationUtcConfidence, 'unknown');
  assert.deepEqual(row, before);assert.equal(fixture.counts.network, 0);
});

test('quantity lineage: a stored binding cannot bypass a missing receipt or donate another database ID', async () => {
  const row = (await capturedFoladRow(702)).row as CodalRow;
  const valid = bindSelectedMonthlyQuantity(row, row.symbol);
  witnessed(row).quantity_binding = { ...valid.quantity_binding!, reportId: 999999 };
  assert.equal(bindSelectedMonthlyQuantity(row, row.symbol).quantity_binding!.reportId, 702);
  delete row.raw!.quantity_capture;
  const result = await read([row]), report = result.n30!.data[0] as QuantityWitnessedReport;
  assert.equal(report.quantity_binding, null);assert.equal(result.n30!.source.records![0].id, 702);
  assertMoney(report, row);
  const checked = withKnownMonthlyQuantities(report);
  assert.ok(checked.products.every(product => product.production_qty === null && product.sales_qty === null && product.sales_rate === null));
  const model = buildMonthlySales([checked])!;
  assert.ok(model.quantitySeries!.every(series => series.points.every(point => point.sales === null)));
});

test('quantity lineage: every missing or mismatched selected identity, period, version, source and snapshot fails closed', async () => {
  const initial = (await capturedFoladRow()).row as CodalRow;
  const cases: Array<[string, (row: CodalRow) => void]> = [
    ['invalid ID', row => { row.id = 0; }], ['row symbol', row => { row.symbol = 'دیگر'; }],
    ['data symbol', row => { row.data.symbol = 'دیگر'; }], ['receipt symbol', row => { receipt(row).symbol = 'دیگر'; }],
    ['report kind', row => { row.report_kind = 'ن-۱۰'; }], ['data kind', row => { row.data.report_kind = 'ن-۱۰'; }],
    ['receipt kind', row => { (receipt(row) as unknown as { report_kind: string }).report_kind = 'ن-۱۰'; }],
    ['Gregorian period', row => { row.period_end = '2026-09-21'; }], ['Jalali stored as Gregorian', row => { row.period_end = '1405-06-31'; }],
    ['raw Jalali period', row => { row.raw!.period_end_jalali = '1405-05-31'; }],
    ['receipt period', row => { receipt(row).period_end_jalali = '1405-05-31'; }],
    ['financial period', row => { row.data.period_end = '1405-05-31'; }],
    ['source period', row => { witnessed(row).quantity_source!.periodEnd = '1405-05-31'; }],
    ['missing receipt', row => { delete row.raw!.quantity_capture; }], ['null raw', row => { row.raw = null; }],
    ['malformed receipt', row => { rawObject(row).quantity_capture = []; }],
    ['missing raw version', row => { delete row.raw!.parser_version; }], ['version mismatch', row => { receipt(row).parser_version = 3; }],
    ['source URL suffix', row => { row.source_url = row.source_url!.replace('#pv2', '#pv3'); }],
    ['announcement', row => { row.raw!.announcement_link += '-other'; }], ['receipt source URL', row => { receipt(row).source_url += '-other'; }],
    ['padded announcement', row => { row.raw!.announcement_link = ` ${row.raw!.announcement_link}`;receipt(row).announcement_link = row.raw!.announcement_link;row.source_url = `${row.raw!.announcement_link}#pv2`;receipt(row).source_url = row.source_url; }],
    ['Excel reference', row => { row.raw!.link_excel += '?other'; }], ['source reference', row => { witnessed(row).quantity_source!.sourceId += '?other'; }],
    ['response URL', row => { receipt(row).response_url = 'https://untrusted.invalid/source'; }],
    ['hash', row => { receipt(row).html_sha256 = '0'.repeat(64); }], ['missing source', row => { delete witnessed(row).quantity_source; }],
    ['snapshot value', row => { receipt(row).source.rows[0].salesQty!++; }],
    ['snapshot null versus zero', row => { receipt(row).source.rows[0].productionQty = null; }],
    ['snapshot rows missing', row => { receipt(row).source.rows.pop(); }],
    ['snapshot extra field', row => { Object.assign(receipt(row).source, { unexpected: true }); }],
    ['snapshot missing field', row => { delete (receipt(row).source as unknown as { salesColumn?: number }).salesColumn; }],
    ['snapshot unit column', row => { (receipt(row).source as unknown as { unitColumn: number }).unitColumn = 2; }],
  ];
  for (const [name, mutate] of cases) {
    const row = structuredClone(initial);mutate(row);
    const before = structuredClone(row), bound = bindSelectedMonthlyQuantity(row, initial.symbol);
    assert.equal(bound.quantity_binding, null, name);assertMoney(bound, row);
    assert.ok(withKnownMonthlyQuantities(bound).products.every(product => product.production_qty === null && product.sales_qty === null && product.sales_rate === null), name);
    assert.deepEqual(row, before, name);
  }
  assert.equal(bindSelectedMonthlyQuantity(initial, 'نماد دیگر').quantity_binding, null);
});

test('quantity lineage: JSONB key order is immaterial, but snapshot row order and values must match', async () => {
  const row = (await capturedFoladRow()).row as CodalRow;
  const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  rawObject(row).quantity_capture = reorder(receipt(row));
  assert.equal(bindSelectedMonthlyQuantity(row, row.symbol).quantity_binding!.reportId, row.id);
  receipt(row).source.rows.reverse();
  assert.equal(bindSelectedMonthlyQuantity(row, row.symbol).quantity_binding, null);
});

test('quantity lineage: selected amendment without a receipt never borrows an older valid capture', async () => {
  const older = (await capturedFoladRow(710)).row as CodalRow, newer = structuredClone(older);
  newer.id = 711;newer.title += ' (اصلاحیه)';newer.raw!.announcement_link += '-amendment';
  newer.source_url = `${newer.raw!.announcement_link}#pv2`;delete newer.raw!.quantity_capture;
  witnessed(newer).period_total_amount = 12345;
  const result = await read([older, newer]), data = result.n30!.data as QuantityWitnessedReport[];
  assert.equal(data.length, 1);assert.equal(data[0].period_total_amount, 12345);
  assert.equal(data[0].quantity_binding, null);assert.equal(result.n30!.source.records![0].id, 711);
  assert.equal(result.n30!.source.records![0].amendment, true);
  assert.ok(withKnownMonthlyQuantities(data[0]).products.every(product => product.sales_qty === null));
});

test('quantity lineage: latest parser selection cannot reuse a previous version receipt', async () => {
  const older = (await capturedFoladRow(720)).row as CodalRow, newer = structuredClone(older);
  newer.id = 721;newer.raw!.parser_version = 3;newer.source_url = newer.source_url!.replace('#pv2', '#pv3');
  const result = await read([older, newer]);
  assert.equal(result.n30!.source.records![0].id, 721);assert.equal(result.n30!.source.records![0].parserVersion, 3);
  assert.equal((result.n30!.data[0] as QuantityWitnessedReport).quantity_binding, null);
});

test('quantity lineage: per-product value validation remains independent of a consistent selected-row receipt', async () => {
  const row = (await capturedFoladRow()).row as CodalRow;
  witnessed(row).products.find(product => product.product_name === 'محصولات گرم' && product.market === 'داخلی')!.sales_qty!++;
  const bound = bindSelectedMonthlyQuantity(row, row.symbol);
  assert.ok(bound.quantity_binding, 'Binding proves consistency of lineage, not all financial values');
  const model = buildMonthlySales([withKnownMonthlyQuantities(bound)])!;
  assert.equal(model.quantitySeries!.find(series => series.market === 'داخلی')!.points[0].sales, null);
  assert.equal(model.quantitySeries!.find(series => series.market === 'صادراتی')!.points[0].sales, 66);
});

test('quantity lineage: legacy units and raw money retain the exact existing behavior', async () => {
  for (const unit of ['تن','کیلوگرم','گرم','عدد','هزار عدد','متر','هزار متر','متر مربع','متر مکعب','لیتر','هزار لیتر','کیلووات ساعت','مگاوات ساعت',' تن ']) {
    const row = (await capturedFoladRow()).row as CodalRow;
    delete row.raw!.quantity_capture;delete witnessed(row).quantity_source;
    witnessed(row).products = [{ product_name: 'قدیمی', market: 'داخلی', market_basis: 'section_header', qty_unit: unit,
      production_qty: 0, sales_qty: 2, sales_rate: 20, sales_amount: 40 }];
    const bound = bindSelectedMonthlyQuantity(row, row.symbol);
    assert.equal(bound, row.data);assert.equal(bound.quantity_binding, undefined);
    const checked = withKnownMonthlyQuantities(bound);
    assert.equal(checked.products[0].production_qty, 0);assert.equal(checked.products[0].sales_rate, 20);
    assert.equal(checked.qty_unit, unit.trim());assert.equal(checked.period_total_amount, witnessed(row).period_total_amount);
  }
});
