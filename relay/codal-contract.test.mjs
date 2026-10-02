// Explicit synthetic statements only; no issuer figures or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeN10 } from './codal.mjs';
import { computeRatios } from '../lib/core/engine.ts';
import { margins } from '../lib/fundamental/calc.ts';
import { deriveQuarters } from '../lib/core/quarterly.ts';

const meta = { symbol: 'بانک‌مصنوعی', company_name: 'fixture', period_end: '1404-12-29', period_months: 12, audited: false };
const bank = (header, gross = '40') => [
  ...(header ? [[header]] : []),
  ['درآمد تسهیلات اعطایی', '150', '120'], ['درآمد عملیاتی', '100', '80'],
  ['هزینه سود سپرده', '-60', '-50'],
  ...(gross === undefined ? [] : [['سود(زیان) ناخالص', gross, '30']]),
  ['سود(زیان) عملیاتی', '25', '20'], ['سود(زیان) خالص', '20', '15'],
  ['سود(زیان) خالص هر سهم (ریال)', '2', '1'], ['سرمایه', '10', '10'],
];
const withoutGross = () => bank(null).filter(r => !r[0].includes('ناخالص'));
const toEngine = d => ({ ...d.standalone, capital: d.capital, period_months: d.period_months, audited: d.audited, eps_rial: d.standalone.eps_rial });

test('missing bank gross stays null through parser, ratios, and annual margins', () => {
  const input = [withoutGross()]; const before = structuredClone(input);
  const d = normalizeN10(input, meta);
  assert.equal(d.standalone.gross_profit, null);
  assert.equal(d.standalone.prior.gross_profit, null);
  assert.equal(d.standalone.net_profit, 20);
  assert.equal(computeRatios(toEngine(d)).gross_margin, null);
  assert.equal(margins(d.standalone).gross, null);
  assert.deepEqual(input, before);
});
test('unreadable current gross does not borrow prior gross or synthesize zero', () => {
  const d = normalizeN10([bank(null, '-')], meta);
  assert.equal(d.standalone.gross_profit, null);
  assert.equal(d.standalone.prior.gross_profit, 30);
});
test('observed zero remains zero; missing metric does not corrupt independent metrics', () => {
  const d = normalizeN10([bank(null, '-')], meta);
  const f = { ...toEngine(d), gross_profit: 0 };
  assert.equal(computeRatios(f).gross_margin, 0);
  assert.equal(computeRatios(toEngine(d)).net_margin, 20);
  assert.equal(margins({ ...d.standalone, gross_profit: 0 }).gross, 0);
});
test('quarterly gross stays unknown if either cumulative gross is missing', () => {
  const q = { id: 1, period_end: '1404-03-31', period_months: 3, audited: false, capital: 10, revenue: 100, gross_profit: null, operating_profit: 25, net_profit: 20 };
  const h = { ...q, id: 2, period_end: '1404-06-31', period_months: 6, revenue: 220, gross_profit: 90, operating_profit: 60, net_profit: 50 };
  const out = deriveQuarters([q, h]);
  assert.equal(out[0].grossProfit, null); assert.equal(out[0].grossMargin, null);
  assert.equal(out[1].grossProfit, null); assert.equal(out[1].grossMargin, null);
  assert.equal(out[1].netProfit, 30);
});
test('explicit unsupported amount unit rejects statement, preserves input EPS token', () => {
  const input = [bank('واحد مبلغ: هزار ریال؛ واحد EPS: ریال')]; const before = structuredClone(input);
  assert.equal(normalizeN10(input, meta), null);
  assert.deepEqual(input, before);
  assert.equal(input[0].find(r => r[0].includes('خالص هر سهم'))[1], '2');
});
test('conflicting amount declarations reject; unrelated table cannot override selected statement', () => {
  assert.equal(normalizeN10([bank('ارقام به میلیون ریال؛ واحد مبلغ: هزار ریال')], meta), null);
  assert.equal(normalizeN10([[['ارقام به میلیون ریال']], bank('واحد مبلغ: هزار ریال')], meta), null);
  assert.equal(normalizeN10([bank('واحد مبلغ: تومان')], meta), null);
  assert.equal(normalizeN10([bank('واحد مبلغ: هزار ریال واحد EPS: ریال')], meta), null);
});
test('million amount plus separate rial EPS accepted; EPS-only unit is no amount proof', () => {
  assert.equal(normalizeN10([bank('واحد مبلغ: میلیون ریال؛ واحد EPS: ریال')], meta).unit, 'میلیون ریال');
  const d = normalizeN10([bank('واحد EPS: ریال')], meta);
  assert.equal(d.standalone.eps_rial, 2);
  assert.equal(d.unit_assessment, 'legacy_unverified');
});
