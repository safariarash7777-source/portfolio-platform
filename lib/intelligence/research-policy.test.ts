import test from 'node:test';
import assert from 'node:assert/strict';
import { researchRunDigest, researchRequestDigest, inferenceAdmission, requestIdentityAdmission, REQUEST_IDENTITY_VERSION, researchDestinationDigest } from './research-policy';
import type { ResearchObservation } from './research-agent';
import type { ResearchProvenance } from './research-inputs';
const now = Date.parse('2026-10-17T12:10:00Z');
test('same hour replay reuses digest but next hourly review is independent', () => {
  assert.equal(researchRunDigest([],now),researchRunDigest([],now+60000));
  assert.notEqual(researchRunDigest([],now),researchRunDigest([],now+3600000));
});
test('attempt ledger limits concurrent changed-input calls and rolling day at midnight', () => {
  assert.equal(inferenceAdmission([],now),'allowed');
  assert.equal(inferenceAdmission([{at:new Date(now-60000).toISOString()}],now),'hour_limit');
  const entries=Array.from({length:24},(_,i)=>({at:new Date(now-i*3600000).toISOString()}));
  assert.equal(inferenceAdmission(entries,now),'day_limit');
  assert.equal(inferenceAdmission([{at:'invalid'}],now),'invalid_ledger');
  assert.equal(inferenceAdmission([{at:new Date(now+3600000).toISOString()}],now),'invalid_ledger');
});

const observation: ResearchObservation = { id: 'codal:17', source: 'codal', sourceUrl: 'https://codal.ir/report',
  observedAt: '2026-10-16T12:00:00.000Z', period: '1405/06/31/6',
  ratios: { gross_margin: 0.2, operating_margin: null, net_margin: null, revenue_growth: null, net_profit_growth: null, pe_ttm: null } };
const source: ResearchProvenance = { evidence: 'E1', symbol: 'نمونه', reportId: 17, sourceUrl: observation.sourceUrl,
  periodEnd: '1405/06/31', periodMonths: 6, publishedAt: observation.observedAt, capturedAt: null,
  fetchedAt: '2026-10-17T12:10:00.000Z', unit: 'میلیون ریال', scope: 'company' };
const request = (row = observation, provenance = source, instructions = 'fixed research contract') => researchRequestDigest([row], [provenance], instructions);

test('fixed source version and cutoff reuse identity across hours, days and new read receipts', () => {
  for (const fetchedAt of ['2026-10-17T13:10:00.000Z', '2026-10-18T12:10:00.000Z']) {
    assert.equal(request(), request(observation, { ...source, fetchedAt }));
  }
  assert.equal(source.capturedAt, null);
});

test('new source revision, changed observations and changed instructions remain distinct requests', () => {
  assert.notEqual(request(), request({ ...observation, id: 'codal:18' }, { ...source, reportId: 18 }));
  assert.notEqual(request(), request(observation, { ...source, capturedAt: '2026-10-17T00:00:00.000Z' }));
  assert.notEqual(request(), request({ ...observation, ratios: { ...observation.ratios, gross_margin: 0.3 } }));
  assert.notEqual(request(), request(observation, source, 'new research contract'));
});

test('request identity rejects missing or incorrectly bound source versions before inference', () => {
  assert.throws(() => researchRequestDigest([], [], 'fixed'), /invalid_request_identity/);
  assert.throws(() => researchRequestDigest([observation], [], 'fixed'), /invalid_request_identity/);
  for (const changed of [{ reportId: 18 }, { evidence: 'E2' }, { publishedAt: '2026-10-17T00:00:00Z' }, { sourceUrl: 'https://codal.ir/other' }]) {
    assert.throws(() => request(observation, { ...source, ...changed }), /unbound_request_source/);
  }
});

test('identity migration holds historical attempts for review and never resets their state or counters', () => {
  const legacy = { version: 2, entries: { old: { status: 'started' } }, attempts: [{ at: '2026-10-20T14:09:23Z' }] };
  const before = JSON.stringify(legacy);
  assert.equal(requestIdentityAdmission(legacy), 'legacy_identity_requires_review');
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(requestIdentityAdmission({ ...legacy, requestIdentity: REQUEST_IDENTITY_VERSION }), 'allowed');
  assert.equal(requestIdentityAdmission({ version: 2, entries: {}, attempts: [] }), 'allowed');
  assert.equal(requestIdentityAdmission({ version: 1, entries: {} }), 'invalid_ledger');
  assert.equal(requestIdentityAdmission({ version: 2, entries: {}, attempts: legacy.attempts }), 'legacy_identity_requires_review');
});

test('reviewed aliases reuse only an existing stored legacy outcome; missing, pending and chained aliases fail closed', () => {
  const current = 'a'.repeat(64), old = 'b'.repeat(64), older = 'c'.repeat(64);
  const stored = { status: 'stored', id: '12345678-1234-1234-1234-123456789abc' };
  assert.equal(researchDestinationDigest(current, { entries: {} }), current);
  assert.equal(researchDestinationDigest(current, { requestAliases: { [current]: old }, entries: { [old]: stored } }), old);
  for (const entries of [{}, { [old]: { status: 'started' } }, { [old]: { status: 'stored', id: 'bad' } }]) {
    assert.throws(() => researchDestinationDigest(current, { requestAliases: { [current]: old }, entries }), /invalid_reviewed_request_alias/);
  }
  assert.throws(() => researchDestinationDigest(current, { requestAliases: { [current]: old, [old]: older }, entries: { [old]: stored } }), /invalid_reviewed_request_alias/);
});
