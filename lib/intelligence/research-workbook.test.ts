import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyWorkbook, parseWorkbook, reviewWorkbook, isCalendarDate, isSourceUrl, workbookMarkdown, SCENARIO_KEYS } from './research-workbook';
function complete() {
  const w = emptyWorkbook();
  w.title = 'نمونهٔ آزمون'; w.question = 'چه تغییری رخ داده؟'; w.horizon = 'یک فصل';
  w.evidence = [{ id: 'e1', statement: 'شاهد آزمایشی', sourceUrl: 'https://example.org/report', observedOn: '2026-09-01', publishedOn: '2026-09-02' }];
  w.interpretation = 'تفسیر مبتنی بر e1'; w.counterEvidence = 'محدودیت آزمون'; w.portfolioImpact = 'اثر نامشخص'; w.reviewOn = '2026-10-01';
  for (const key of SCENARIO_KEYS) w.scenarios[key] = { assumptions: 'فرض', mechanism: 'مسیر اثر', invalidation: 'ابطال' };
  return w;
}
test('empty draft cannot appear structurally complete', () => assert.ok(reviewWorkbook(emptyWorkbook()).length > 10));
test('each scenario invalidation is independently required', () => {
  const w = complete(); assert.deepEqual(reviewWorkbook(w), []);
  w.scenarios.downside.invalidation = ' '; assert.equal(reviewWorkbook(w)[0].field, 'downside-invalidation');
});
test('unknown dates are not filled with today and impossible dates fail', () => {
  assert.equal(isCalendarDate('2026-02-30'), false); assert.equal(isCalendarDate('2024-02-29'), true);
  const w = complete(); w.evidence[0].publishedOn = ''; assert.equal(reviewWorkbook(w)[0].field, 'published-e1');
});
test('credential URLs and executable schemes are rejected', () => {
  for (const url of ['javascript:alert(1)', 'file:///a', 'https://user:password@example.org', '//example.org']) assert.equal(isSourceUrl(url), false);
});
test('import ignores forged approval and preserves evidence references', () => {
  const w = complete(); w.evidence[0].id = 'source-17'; w.interpretation = 'source-17';
  const parsed = parseWorkbook(JSON.stringify({ ...w, status: 'published', approvedBy: 'admin' }));
  assert.equal('status' in parsed, false); assert.deepEqual(parsed.evidence.map(e => e.id), ['source-17']);
});
test('bounded import rejects malformed nested types and excessive size', () => {
  for (const value of [null, [], { ...complete(), scenarios: {} }, { ...complete(), title: 2 }, { ...complete(), evidence: Array(31).fill({}) }]) assert.throws(() => parseWorkbook(JSON.stringify(value)));
  assert.throws(() => parseWorkbook(' '.repeat(8000001)));
});
test('export and import preserve a draft without granting review status', () => {
  const w = complete(); assert.deepEqual(parseWorkbook(JSON.stringify(w)), w);
  assert.match(workbookMarkdown(w), /بازبینی انسانی انجام نشده/);
  assert.match(workbookMarkdown(w), /پیش‌نویس داخلی/);
});

test('duplicate evidence IDs are rejected rather than changing references', () => { const w = complete(); w.evidence.push({ ...w.evidence[0] }); assert.throws(() => parseWorkbook(JSON.stringify(w))); });
