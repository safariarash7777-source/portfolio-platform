import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoveragePlan, metadataCsv } from './coverage-plan-core.mjs';

const observedAt = '2026-10-02T06:00:00Z';
const day = '2026-09-29';
const p = { verified: true, observedAt, sourceRef: 'synthetic:official-metadata' };
const symbol = id => ({ id, capability: { ...p, type2: true } });
const gap = id => ({ ...p, symbol: id, day, present: false, traded: true, completeRead: true });
const input = () => ({ observedAt, dataClass: 'SYNTHETIC', universeComplete: true, days: [day],
  symbols: [symbol('نمادالف'), symbol('نمادب')], cells: [gap('نمادالف'), gap('نمادب')],
  calendar: [{ ...p, day, state: 'open' }], initialState: { done: { 'نمادالف': 200 } }, maxAttempts: 3 });

test('matrix requires evidence and does not classify holidays from weekday', () => {
  const x = input(); x.cells = []; x.calendar = []; const before = structuredClone(x);
  const a = buildCoveragePlan(x);
  assert.equal(a.counts.unknown, 2); assert.equal(a.tasks.length, 0);
  assert.deepEqual(x, before); assert.equal(a.budget.completionDays, null);
});
test('covered, holiday, no-trade, gap, adjusted and excluded symbols remain distinct', () => {
  const x = input(); x.days.push('2026-09-30', '2026-10-01');
  x.calendar.push({ ...p, day: '2026-09-30', state: 'closed' });
  x.cells.push({ ...p, symbol: 'نمادالف', day: '2026-10-01', traded: false },
    { ...p, symbol: 'نمادب', day: '2026-10-01', present: true, seriesType: 2, rowRef: 'synthetic:row:1' });
  x.symbols.push(symbol('نمادالف2'), symbol('نمادب۳'), symbol('نمادالف٤'), symbol('نمادالفح'));
  const a = buildCoveragePlan(x);
  assert.equal(a.counts.holiday, 2); assert.equal(a.counts['no-trade'], 1); assert.equal(a.counts.covered, 1);
  assert.equal(a.counts.unsupported, 12); assert.equal(a.counts.gap, 2); assert.equal(a.tasks.length, 2);
  x.cells.find(c => c.present === true).seriesType = 3;
  assert.equal(buildCoveragePlan(x).counts.unsupported, 13);
});
test('contradictory metadata, incomplete read or unverified trade does not become a gap', () => {
  for (const change of [{ completeRead: false }, { verified: false }, { traded: null }]) {
    const x = input(); Object.assign(x.cells[0], change); assert.equal(buildCoveragePlan(x).tasks.length, 1);
  }
  const x = input(); x.calendar[0].state = 'closed';
  assert.equal(buildCoveragePlan(x).counts.unknown, 2);
});
test('legacy done never hides a new range gap; plan is stable and rejects ambiguous input', () => {
  const x = input(); const a = buildCoveragePlan(x);
  x.symbols.reverse(); x.cells.reverse(); assert.equal(buildCoveragePlan(x).planDigest, a.planDigest);
  assert.equal(a.tasks.length, 2); assert.equal(a.legacyDone['نمادالف'], 200);
  x.cells.push(x.cells[0]); assert.throws(() => buildCoveragePlan(x), /duplicate cell/);
  assert.throws(() => buildCoveragePlan({ ...input(), days: ['2026-02-30'] }), /valid Gregorian/);
});
test('NAV blacklist and unknown causes persist; stale/zero/unverified NAV is never current', () => {
  const x = input(); x.funds = [{ id: 'صندوقالف', membership: { ...p, active: true, cs_id: 68 }, navCapability: { ...p, supported: true } },
    { id: 'صندوقب', membership: { ...p, active: true, cs_id: 68 }, navCapability: { ...p, supported: true }, nav: { ...p, valid: true, positiveVerified: false, ratioPlausibleVerified: true, unit: 'rial', sourceAt: observedAt } }];
  x.blacklist = [{ symbol: 'صندوقالف' }]; const before = structuredClone(x.blacklist);
  const a = buildCoveragePlan(x);
  assert.equal(a.nav[0].status, 'preserved_blacklist'); assert.equal(a.nav[0].cause, null); assert.equal(a.nav[0].lastCheckedAt, null);
  assert.equal(a.nav[1].status, 'candidate_deferred'); assert.equal(a.budget.plannedNAVRequests, 0);
  assert.deepEqual(x.blacklist, before);
  x.funds[1].nav.positiveVerified = true; assert.equal(buildCoveragePlan(x).nav[1].status, 'valid_current');
  x.funds[1].membership.verified = false; assert.equal(buildCoveragePlan(x).nav[1].status, 'unknown');
  x.funds[1].membership.verified = true;
  x.funds[1].nav.sourceAt = '2026-09-29T06:00:00Z'; assert.equal(buildCoveragePlan(x).nav[1].status, 'candidate_deferred');
});
test('CSV escapes formula-like external metadata and no full universe is claimed from aggregates', () => {
  assert.ok(metadataCsv([{ symbol: '=CMD', reason: 'a,b' }], ['symbol', 'reason']).includes("\"'=CMD\""));
  const x = input(); x.symbols = []; x.cells = []; x.universeComplete = false;
  const plan = buildCoveragePlan(x); assert.equal(plan.tasks.length, 0); assert.deepEqual(plan.missingUniverseDays, [day]);
  assert.equal(plan.universeComplete, false); assert.equal(plan.liveGate.enabled, false);
});
