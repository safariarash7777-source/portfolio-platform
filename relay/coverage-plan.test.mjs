import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoveragePlan, dryRunCoverage, createOfflineCoverageBudget, metadataCsv } from '../scripts/ops/coverage-plan-core.mjs';
import { PersistentDailyBudget } from './brsapi-client.mjs';

const observedAt = '2026-10-02T06:00:00Z';
const day = '2026-09-29';
const p = { verified: true, observedAt, sourceRef: 'synthetic:official-metadata' };
const symbol = id => ({ id, capability: { ...p, type2: true } });
const gap = id => ({ ...p, symbol: id, day, present: false, traded: true, completeRead: true });
const input = () => ({ observedAt, dataClass: 'SYNTHETIC', universeComplete: true, days: [day],
  symbols: [symbol('نمادالف'), symbol('نمادب')], cells: [gap('نمادالف'), gap('نمادب')],
  calendar: [{ ...p, day, state: 'open' }], initialState: { done: { 'نمادالف': 200 } }, maxAttempts: 3 });
const fixture = id => ({ status: 200, dataClass: 'SYNTHETIC', seriesType: 2, symbol: id, days: [day] });
const clock = () => { let time = Date.parse(observedAt); return { now: () => time, advance: ms => { time += ms; } }; };
const ledger = (used = 0, ceiling = 10) => ({ dataClass: 'SYNTHETIC', days: { '2026-10-02': { verified: true, leased: used, hardCeiling: ceiling } } });
const budget = (store, c, ceiling = 10) => createOfflineCoverageBudget({ ledger: store, softBudget: ceiling, hardCeiling: ceiling, now: c.now });

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
test('unknown shared baseline permits zero simulated sends and zero state completion', async () => {
  const c = clock(); const l = ledger(); l.days['2026-10-02'].verified = false;
  const a = await dryRunCoverage(buildCoveragePlan(input()), { budget: budget(l, c), clock: c });
  assert.equal(a.simulatedRequests, 0); assert.equal(a.stopReason, 'shared_baseline_or_store_unknown');
  assert.equal(a.budget.remaining, null); assert.equal(a.transport.sent, 0); assert.equal(a.completedTaskIds.length, 0);
});
test('shared limit stops mid-plan, survives restart and resumes only after a verified new day', async () => {
  const plan = buildCoveragePlan(input()); const c = clock(); const l = ledger(0, 1);
  const responses = Object.fromEntries(plan.tasks.map(t => [t.symbol, fixture(t.symbol)]));
  const first = await dryRunCoverage(plan, { budget: budget(l, c, 1), clock: c, responses });
  assert.equal(first.simulatedRequests, 1); assert.equal(first.pendingTaskIds.length, 1);
  const restarted = await dryRunCoverage(plan, { budget: budget(l, c, 1), clock: c, responses, checkpoint: first.checkpoint });
  assert.equal(restarted.simulatedRequests, 0); assert.equal(l.days['2026-10-02'].leased, 1);
  c.advance(86400_000);
  const unknownDay = await dryRunCoverage(plan, { budget: budget(l, c, 1), clock: c, responses, checkpoint: first.checkpoint });
  assert.equal(unknownDay.simulatedRequests, 0);
  l.days['2026-10-03'] = { verified: true, leased: 0, hardCeiling: 1 };
  const resumed = await dryRunCoverage(plan, { budget: budget(l, c, 1), clock: c, responses, checkpoint: first.checkpoint });
  assert.equal(resumed.completedTaskIds.length, 2); assert.equal(resumed.checkpoint.simulatedRows.length, 2);
  assert.equal(resumed.priorRowsPreserved, true); assert.equal(resumed.legacyDonePreserved, true);
});
test('replay makes zero duplicate rows and zero additional budget requests', async () => {
  const plan = buildCoveragePlan(input()); const c = clock(); const l = ledger(); const b = budget(l, c);
  const responses = Object.fromEntries(plan.tasks.map(t => [t.symbol, fixture(t.symbol)]));
  const first = await dryRunCoverage(plan, { budget: b, clock: c, responses });
  assert.equal(first.transport.spacingMs, 100); assert.ok(first.transport.minStartGapMs >= 100);
  const replay = await dryRunCoverage(plan, { budget: b, clock: c, responses, checkpoint: first.checkpoint });
  assert.equal(replay.simulatedRequests, 0); assert.equal(replay.checkpoint.simulatedRows.length, 2); assert.equal(l.days['2026-10-02'].leased, 2);
  assert.equal(first.upstreamRequests, 0); assert.equal(first.historyWrites, 0); assert.equal(first.blacklistWrites, 0);
});
test('empty/partial/wrong-series response never marks whole range done; retries bounded', async () => {
  const x = input(); x.maxAttempts = 1; const plan = buildCoveragePlan(x); const c = clock(); const l = ledger(); const b = budget(l, c);
  const responses = { 'نمادالف': { ...fixture('نمادالف'), days: [] }, 'نمادب': { ...fixture('نمادب'), seriesType: 3 } };
  const first = await dryRunCoverage(plan, { budget: b, clock: c, responses });
  assert.equal(first.completedTaskIds.length, 0); assert.equal(first.checkpoint.simulatedRows.length, 0);
  assert.equal(first.stopReason, 'declared_attempt_cap');
  const again = await dryRunCoverage(plan, { budget: b, clock: c, responses, checkpoint: first.checkpoint });
  assert.equal(again.simulatedRequests, 0);
});
test('two simulated consumers share allocations; store failure gives no emergency units', async () => {
  const c = clock(); const l = ledger(8, 10); const a = budget(l, c); const b = budget(l, c);
  await Promise.all([a.ensure(), b.ensure()]); assert.equal(a.reserve('bulk'), true); assert.equal(b.reserve('bulk'), true);
  const next = budget(l, c); await next.ensure(); assert.equal(next.reserve('bulk'), false);
  l.failRPC = true; const outage = budget(l, c); await outage.ensure(); assert.equal(outage.reserve('critical'), false); assert.equal(outage.snapshot().remaining, null);
});
test('reject foreign live budget, tampered plan and checkpoint outside selected range', async () => {
  const plan = buildCoveragePlan(input()); const c = clock(); const b = budget(ledger(), c);
  const foreign = new PersistentDailyBudget({ store: { lease() { throw new Error('must never be called'); } }, softBudget: 10, hardCeiling: 10 });
  await assert.rejects(() => dryRunCoverage(plan, { budget: foreign, clock: c }), /isolated PR178/);
  await assert.rejects(() => dryRunCoverage({ ...plan, mode: 'LIVE' }, { budget: b, clock: c }), /identity/);
  const first = await dryRunCoverage(plan, { budget: b, clock: c, maxRequests: 0 });
  first.checkpoint.simulatedRows.push({ symbol: 'خارج', day, dataClass: 'SYNTHETIC' });
  await assert.rejects(() => dryRunCoverage(plan, { budget: b, clock: c, checkpoint: first.checkpoint }), /invalid or duplicate/);
});
test('CSV escapes formula-like external metadata and no full universe is claimed from aggregates', () => {
  assert.ok(metadataCsv([{ symbol: '=CMD', reason: 'a,b' }], ['symbol', 'reason']).includes("\"'=CMD\""));
  const x = input(); x.symbols = []; x.cells = []; x.universeComplete = false;
  const plan = buildCoveragePlan(x); assert.equal(plan.tasks.length, 0); assert.deepEqual(plan.missingUniverseDays, [day]);
  assert.equal(plan.universeComplete, false); assert.equal(plan.liveGate.enabled, false);
});
test('partial range resumes append-only; persisted ledger cannot rewind with checkpoint', async () => {
  const x = input(); x.days.push('2026-09-30'); x.calendar.push({ ...p, day: '2026-09-30', state: 'open' });
  x.cells.push({ ...gap('نمادالف'), day: '2026-09-30' });
  const plan = buildCoveragePlan(x); const c = clock(); const l = ledger(); const b = budget(l, c);
  const first = await dryRunCoverage(plan, { budget: b, clock: c, responses: { 'نمادالف': fixture('نمادالف') }, maxRequests: 1 });
  assert.equal(first.completedTaskIds.length, 0); assert.equal(first.checkpoint.simulatedRows.length, 1);
  await assert.rejects(() => dryRunCoverage(plan, { budget: budget(ledger(), c), clock: c, checkpoint: first.checkpoint }), /reset or rewound/);
  const responses = { 'نمادالف': { ...fixture('نمادالف'), days: [day, '2026-09-30'] } };
  const next = await dryRunCoverage(plan, { budget: budget(l, c), clock: c, checkpoint: first.checkpoint, responses, maxRequests: 1 });
  assert.equal(next.completedTaskIds.length, 1); assert.equal(next.checkpoint.simulatedRows.length, 2);
  assert.equal(next.priorRowsPreserved, true); assert.equal(l.days['2026-10-02'].leased, 2);
});
test('declared scope daily cap persists through restart independently of larger shared allowance', async () => {
  const x = input(); x.dailyRequestCap = 1; const plan = buildCoveragePlan(x); const c = clock(); const l = ledger();
  const responses = Object.fromEntries(plan.tasks.map(t => [t.symbol, fixture(t.symbol)]));
  const first = await dryRunCoverage(plan, { budget: budget(l, c), clock: c, responses });
  assert.equal(first.simulatedRequests, 1); assert.equal(first.stopReason, 'declared_daily_request_cap');
  const restartClock = clock();
  const resumed = await dryRunCoverage(plan, { budget: budget(l, restartClock), clock: restartClock, checkpoint: first.checkpoint, responses });
  assert.equal(resumed.simulatedRequests, 0); assert.equal(l.days['2026-10-02'].leased, 1);
});
test('pacing crossing Tehran midnight cannot spend the old day; resumed clock retains send gap', async () => {
  const plan = buildCoveragePlan(input()); const c = clock(); const l = ledger();
  c.advance(Date.parse('2026-10-02T20:29:59.950Z') - c.now());
  const stopped = await dryRunCoverage(plan, { budget: budget(l, c), clock: c });
  assert.equal(stopped.simulatedRequests, 0); assert.equal(l.days['2026-10-02'].leased, 0);
  assert.equal(stopped.budget.day, '2026-10-03');
  const x = input(); x.symbols = [x.symbols[0]]; x.cells = [x.cells[0]];
  const scoped = buildCoveragePlan(x), firstClock = clock(), shared = ledger();
  const partial = await dryRunCoverage(scoped, { budget: budget(shared, firstClock), clock: firstClock, responses: { 'نمادالف': { ...fixture('نمادالف'), days: [] } } });
  const restartClock = clock();
  const next = await dryRunCoverage(scoped, { budget: budget(shared, restartClock), clock: restartClock, checkpoint: partial.checkpoint, responses: { 'نمادالف': fixture('نمادالف') } });
  assert.ok(Date.parse(next.checkpoint.events[1].at) - Date.parse(next.checkpoint.events[0].at) >= 100);
});
