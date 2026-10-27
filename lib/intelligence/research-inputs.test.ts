import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCodalResearchInputs, readResearchInputs, DEFAULT_REPORT_MAX_AGE_MS, type StoredResearchCodalRow } from './research-inputs';
import { prepareResearchPacket } from './research-agent';
const now = Date.parse('2026-10-17T09:00:00Z');
function row(id = 1): StoredResearchCodalRow {
  return { id, symbol: 'نمونه', report_kind: 'ن-۱۰', period_end: '2026-09-22', title: 'صورت‌های مالی', source_url: `https://codal.ir/Reports/${id}#pv2`, raw: { parser_version: 2, date_publish: '۱۴۰۵/۰۷/۲۰', time_publish: '۱۲:۰۰:۰۰' }, captured_at: '2026-10-13T10:00:00Z', published_at: null, data: {symbol:'نمونه',company_name:'خصوصی',report_kind:'ن-۱۰',period_end:'1405-06-31',period_months:6,audited:false,restated_prior:false,unit:'میلیون ریال',capital:100,standalone:{revenue:1000,cogs:600,gross_profit:400,operating_profit:300,net_profit:200}} };
}
const run = (rows: StoredResearchCodalRow[]) => prepareCodalResearchInputs(rows, ['نمونه'], now);
test('real adapter separates publication, report period and fetch clock; model receives only bands', () => {
  const out = run([row()]);
  assert.equal(out.excluded.length, 0);
  assert.equal(out.provenance[0].publishedAt, '2026-10-12T08:30:00.000Z');
  assert.equal(out.provenance[0].fetchedAt, new Date(now).toISOString());
  assert.equal(out.observations[0].ratios.gross_margin, 40);
  assert.equal(out.observations[0].ratios.revenue_growth, null);
  const packet = JSON.stringify(prepareResearchPacket(out.observations, now, DEFAULT_REPORT_MAX_AGE_MS));
  for (const privateValue of ['نمونه','خصوصی','codal.ir','2026','1405','1000']) assert.equal(packet.includes(privateValue), false);
});
test('invalid canonical amendment does not revive original report', () => {
  const old = row(9), amendment = row(2);
  amendment.title = 'صورت‌های مالی اصلاحیه'; amendment.data.unit = 'ریال';
  const out = run([old, amendment]);
  assert.equal(out.observations.length, 0);
  assert.equal(out.excluded[0].reason, 'unknown_report_unit');
});
test('company scope wins canonical selection and ambiguous-only data is rejected', () => {
  const consolidated = row(9); consolidated.title = 'صورت‌های مالی تلفیقی';
  assert.equal(run([consolidated]).excluded[0].reason, 'ambiguous_report_scope');
  assert.equal(run([row(), consolidated]).provenance[0].reportId, 1);
});
test('stale publication is not refreshed by recent capture or fetch; future and invalid dates fail', () => {
  for (const published_at of ['2025-10-12T08:30:00Z','2027-01-01T00:00:00Z','garbage']) {
    const r = row(); r.published_at = published_at;
    assert.equal(run([r]).excluded[0].reason, 'stale_or_invalid_report_date');
  }
  const r = row(); r.raw!.date_publish = '۱۴۰۵/۰۷/۳۱';
  assert.equal(run([r]).excluded[0].reason, 'stale_or_invalid_report_date');
});
test('arithmetic, missing values and invalid source fail before any model input', () => {
  const badMath = row(); (badMath.data as {standalone:{gross_profit:number}}).standalone.gross_profit = 50;
  assert.equal(run([badMath]).excluded[0].reason, 'arithmetic_mismatch');
  const missing = row(); (missing.data as {standalone:{net_profit:unknown}}).standalone.net_profit = null;
  assert.equal(run([missing]).excluded[0].reason, 'incomplete_financials');
  const injected = row(); injected.source_url = 'https://evil.test/';
  assert.equal(run([injected]).excluded[0].reason, 'unapproved_source');
});
test('known capture contradictions block model input without reviving an older revision', () => {
  for (const captured_at of ['2026-10-18T00:00:00Z', '2026-10-11T00:00:00Z', '2026-10-13', '', '2026-09-31T00:00:00Z']) {
    const original = row(9), amendment = row(2);
    amendment.title = 'صورت‌های مالی اصلاحیه'; amendment.captured_at = captured_at;
    const out = run([original, amendment]);
    assert.equal(out.observations.length, 0, captured_at);
    assert.equal(out.provenance.length, 0);
    assert.equal(out.excluded[0].reason, 'invalid_report_capture_time');
  }
});
test('publication rejects impossible Gregorian dates and incomplete clocks', () => {
  for (const published_at of ['2026-09-31T08:30:00Z', '2026-10-12T08:30Z', '2026-10-12T24:00:00Z']) {
    const r = row(); r.published_at = published_at;
    assert.equal(run([r]).excluded[0].reason, 'stale_or_invalid_report_date');
  }
});
test('unknown capture remains unknown and explicit offset clocks keep their actual instant', () => {
  const unknown = row(); unknown.captured_at = null;
  assert.equal(run([unknown]).provenance[0].capturedAt, null);
  const r = row(); r.published_at = '2026-10-12T12:00:00+03:30'; r.captured_at = '2026-10-12T12:00:00.123456+03:30';
  assert.equal(run([r]).provenance[0].capturedAt, '2026-10-12T08:30:00.123Z');
});
test('REST reader is stored-data only, fails closed on errors and truncated reads', async () => {
  let count = 0;
  const fetchImpl = (async (url, init) => {
    count++;
    assert.equal(new URL(String(url)).pathname, '/rest/v1/codal_reports');
    assert.equal(new URL(String(url)).searchParams.get('data'), null);
    assert.equal(init?.redirect, 'error');
    return Response.json([row()]);
  }) as typeof fetch;
  assert.equal((await readResearchInputs({url:'https://owned.test',anonKey:'synthetic',symbols:['نمونه'],now,fetchImpl})).observations.length, 1);
  assert.equal(count, 1);
  await assert.rejects(readResearchInputs({url:'https://owned.test',anonKey:'synthetic',symbols:['نمونه'],now,fetchImpl:async()=>Response.json(Array(400).fill(row()))}), /incomplete_research_data_response/);
  await assert.rejects(readResearchInputs({url:'https://owned.test',anonKey:'synthetic',symbols:['نمونه'],now,fetchImpl:async()=>new Response('',{status:403})}), /research_data_read_failed/);
});
