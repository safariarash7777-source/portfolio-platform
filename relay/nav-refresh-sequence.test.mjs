import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNavRefreshSequence } from './nav-refresh-sequence.mjs';

test('overlapping cycles share one primary and completion excludes failed primary symbols', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const sent = [];
  const refresh = createNavRefreshSequence(async (funds, attempted) => {
    attempted.add(funds[0].id);
    sent.push(funds[0].id); // this source request failed; do not try it again in completion
    await gate;
  }, async (funds, attempted) => {
    for (const fund of funds.filter(f => !attempted.has(f.id))) sent.push(fund.id);
  });
  const funds = [{ id:'A' }, { id:'B' }];
  const first = refresh(funds), second = refresh(funds);
  assert.equal(first, second);
  await Promise.resolve();
  assert.deepEqual(sent, ['A']);
  release(); await first;
  assert.deepEqual(sent, ['A', 'B']);
  await refresh(funds);
  assert.deepEqual(sent, ['A', 'B', 'A', 'B']);
});

test('primary crash does not run completion; next scheduled cycle can recover', async () => {
  let failed = true, completions = 0;
  const refresh = createNavRefreshSequence(async () => {
    if (failed) throw new Error('local transport deferral');
  }, async () => { completions++; });
  await assert.rejects(refresh([]), /deferral/);
  assert.equal(completions, 0);
  failed = false; await refresh([]);
  assert.equal(completions, 1);
});

test('deployed entrypoint schedules only shared sequence and primary requests are metered', () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  const build = source.slice(source.indexOf('async function buildPayload()'));
  assert.match(build, /refreshNavSequence\(sf\.funds\)/);
  assert.doesNotMatch(build, /refreshNav(?:s|Completion)\(sf\.funds\)/);
  const primary = source.slice(source.indexOf('async function refreshNavs'), source.indexOf('async function refreshNavCompletion'));
  assert.match(primary, /countLegacy\("nav-primary", "standard"\)/);
  assert.match(primary, /producer: "nav-primary"/);
  assert.match(primary, /attempted\.add\(f\.id\)/);
  const completion = source.slice(source.indexOf('async function refreshNavCompletion'), source.indexOf('function applyNav'));
  assert.match(completion, /!attempted\.has\(f\.id\)/);
});
