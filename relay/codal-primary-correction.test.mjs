import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeN30, normalizeN10, PARSER_VERSION, COVERAGE_PARSER_VERSION } from './codal.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/folad-primary-tables.json', import.meta.url), 'utf8'));
const meta = { symbol: 'فولاد', period_end: '1405-06-31' };

test('actual Folad N30 preserves section markets, explicit thousand-tonne units and unchanged arithmetic', () => {
  const parsed = normalizeN30(fixture.n30, meta);
  const amounts = Object.fromEntries(['داخلی', 'صادراتی', 'خدمات'].map(market => [market,
    parsed.products.filter(p => p.market === market).reduce((sum, p) => sum + p.sales_amount, 0)]));
  assert.deepEqual(amounts, { داخلی: 432531365, صادراتی: 79130673, خدمات: 127756122 });
  assert.equal(parsed.products.filter(p => p.market === 'صادراتی').length, 4);
  assert.equal(parsed.products.filter(p => p.market === 'خدمات').length, 1);
  assert.ok(parsed.products.every(p => p.market_basis === 'section_header'));
  assert.equal(parsed.qty_unit, 'هزار تن');
  assert.ok(parsed.products.every(p => p.qty_unit === 'هزار تن'));
  assert.equal(parsed.period_total_amount, 639418160);
  assert.equal(parsed.fy_cumulative_amount, 2509422184);
  assert.equal(parsed.unit_basis, 'header+arithmetic');
  assert.equal(parsed.products[0].sales_qty, 138);
  assert.equal(parsed.products[0].sales_rate, 1084861500000);
});

test('unknown or absent section cannot inherit domestic classification, including short section labels', () => {
  const tables = structuredClone(fixture.n30);
  tables[0][2] = ['بخش جدید:'];
  const parsed = normalizeN30(tables, meta);
  assert.equal(parsed.products[0].market, 'نامشخص');
  assert.equal(parsed.products[0].market_basis, 'unknown');
  assert.equal(parsed.products.filter(p => p.market === 'صادراتی').length, 4);
  tables[0].splice(2, 1);
  assert.equal(normalizeN30(tables, meta).products[0].market, 'نامشخص');
});

test('actual N10 comparative header records restatement without changing basic EPS', () => {
  const parsed = normalizeN10(fixture.n10, { ...meta, period_end: '1405-03-31', period_months: 3 });
  assert.equal(parsed.restated_prior, true);
  assert.equal(parsed.standalone.eps_rial, 63);
  const unmarked = structuredClone(fixture.n10);
  unmarked[0][0][2] = 'دوره منتهی به ۱۴۰۴/۰۳/۳۱';
  assert.equal(normalizeN10(unmarked, meta).restated_prior, false);
});

test('new parser identity does not raise historical coverage floor', () => {
  assert.equal(PARSER_VERSION, 3);
  assert.equal(COVERAGE_PARSER_VERSION, 2);
});
