import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBrsTransport } from './brsapi-transport.mjs';
const provider = 'https://api.brsapi.ir/fixture';
function fakeTransport({ oversleep = 0, onFetch } = {}) {
  let clock = 0;
  const starts = [], sleeps = [];
  const transport = createBrsTransport({ now: () => clock,
    sleep: async ms => { sleeps.push(ms); clock += ms + oversleep; },
    fetchImpl: async (url, init) => {
      assert.equal(init.redirect, 'error'); starts.push(clock);
      return onFetch ? onFetch(url, init, starts.length) : {};
    } });
  return { transport, starts, sleeps, setClock(value) { clock = value; }, getClock() { return clock; } };
}
test('cold start waits a full window; simultaneous calls remain spaced', async () => {
  const f = fakeTransport();
  await Promise.all(Array.from({ length: 5 }, () => f.transport.fetch(provider)));
  assert.equal(f.starts[0], 300000); assert.equal(f.sleeps[0], 300000);
  assert.equal(f.starts.length, 5); assert.ok(f.starts.slice(1).every((v, i) => v - f.starts[i] >= 300));
  assert.equal(f.transport.metrics().coldStartPolicy, 'full_window_defer');
  assert.equal(f.transport.metrics().priorProcessWindow, 'unknown');
  assert.equal(f.transport.metrics().globalEnforced, false);
});
test('cold window starts at construction; readiness does not spend a request', async () => {
  const f = fakeTransport(); f.setClock(200000);
  await f.transport.waitUntilReady();
  assert.equal(f.getClock(), 300000); assert.equal(f.transport.metrics().sent, 0);
  await f.transport.fetch(provider);
  assert.deepEqual(f.starts, [300000]); assert.equal(f.sleeps[0], 100000);
});
test('rolling windows include failures, retries and different provider keys/hosts', async () => {
  const f = fakeTransport({ onFetch: (_u, _i, n) => { if (n === 2) throw Error('fixture failure'); return {}; } });
  let rejected = 0;
  for (let i = 0; i < 601; i++) {
    try { await f.transport.fetch(i % 2 ? 'https://brsapi.ir/commodity?key=fixture-one' : 'https://api.brsapi.ir/market?key=fixture-two'); }
    catch { rejected++; }
  }
  assert.equal(rejected, 1); assert.equal(f.starts.length, 601); assert.equal(f.transport.metrics().sent, 601);
  for (let i = 300; i < f.starts.length; i++) assert.ok(f.starts[i] - f.starts[i - 300] >= 300000);
  for (let i = 20; i < f.starts.length; i++) assert.ok(f.starts[i] - f.starts[i - 20] >= 1000);
  assert.equal(f.starts[300], f.starts[0] + 300000);
  assert.doesNotMatch(JSON.stringify(f.transport.metrics()), /fixture-one|fixture-two|key=/);
});
test('oversleep cannot bunch subsequent starts', async () => {
  const f = fakeTransport({ oversleep: 500 });
  await Promise.all(Array.from({ length: 20 }, () => f.transport.fetch(provider)));
  assert.equal(f.starts.length, 20); assert.ok(f.starts[0] >= 300000);
  assert.ok(f.starts.slice(1).every((v, i) => v - f.starts[i] >= 300));
});
test('early wakeups recheck the clock without an unsafe test override', async () => {
  let clock = 0; const starts = [];
  const t = createBrsTransport({ now: () => clock,
    sleep: async ms => { clock += Math.max(1, Math.floor(ms / 2)); },
    fetchImpl: async () => { starts.push(clock); return {}; } });
  await t.fetch(provider); await t.fetch(provider);
  assert.ok(starts[0] >= 300000); assert.ok(starts[1] - starts[0] >= 300);
});
test('already-aborted and cold-start-aborted calls consume no attempts', async () => {
  let clock = 0, sends = 0;
  const before = new AbortController(); before.abort('PRIVATE_ABORT_REASON');
  const during = new AbortController();
  const t = createBrsTransport({ now: () => clock,
    sleep: async ms => { clock += Math.min(ms, 10); during.abort('PRIVATE_ABORT_REASON'); },
    fetchImpl: async () => { sends++; return {}; } });
  for (const signal of [before.signal, during.signal]) await assert.rejects(t.fetch(provider, { signal }), e => {
    assert.equal(e.code, 'brs_transport_aborted'); assert.equal(e.message, 'brs_transport_aborted'); return true;
  });
  assert.equal(sends, 0); assert.equal(t.metrics().sent, 0);
});
test('backward or nonfinite clocks poison this instance without sending', async () => {
  for (const bad of [-1, NaN, Infinity]) {
    const f = fakeTransport(); await f.transport.fetch(provider); f.setClock(bad);
    await assert.rejects(f.transport.fetch(provider), /brs_transport_clock_invalid/); f.setClock(900000);
    await assert.rejects(f.transport.fetch(provider), /brs_transport_clock_invalid/);
    assert.equal(f.starts.length, 1); assert.equal(f.transport.metrics().clockValid, false);
  }
  const f = fakeTransport(); await f.transport.fetch(provider); f.setClock(f.getClock() - 1);
  await assert.rejects(f.transport.fetch(provider), /brs_transport_clock_invalid/); assert.equal(f.starts.length, 1);
});
test('a new process-local instance must wait a fresh full window', async () => {
  let clock = 0; const starts = [];
  const options = { now: () => clock, sleep: async ms => { clock += ms; }, fetchImpl: async () => { starts.push(clock); return {}; } };
  await createBrsTransport(options).fetch(provider); const restartAt = clock;
  const restarted = createBrsTransport(options); await restarted.fetch(provider);
  assert.equal(starts[1], restartAt + 300000); assert.equal(restarted.metrics().windowScope, 'process_lifetime');
  assert.equal(restarted.metrics().globalEnforced, false);
});
test('queue remains bounded and queued cancellations cannot send', async () => {
  let clock = 0, release, sends = 0; const abort = new AbortController();
  const t = createBrsTransport({ now: () => clock,
    sleep: ms => new Promise(resolve => { release = () => { clock += ms; resolve(); }; }),
    fetchImpl: async () => { sends++; return {}; } });
  const requests = [t.fetch(provider), ...Array.from({ length: 255 }, () => t.fetch(provider, { signal: abort.signal }))];
  await assert.rejects(t.fetch(provider), /brs_transport_queue_full/); assert.equal(t.metrics().pending, 256);
  await Promise.resolve(); abort.abort(); release();
  const results = await Promise.allSettled(requests);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(sends, 1);
  await Promise.resolve(); await Promise.resolve(); assert.equal(t.metrics().pending, 0);
});
test('non-provider reads bypass a waiting provider; custom provider hosts join', async () => {
  let clock = 0, release; const observed = [];
  const t = createBrsTransport({ extraBases: ['https://provider.example/Api'], now: () => clock,
    sleep: ms => new Promise(resolve => { release = () => { clock += ms; resolve(); }; }),
    fetchImpl: async (url, init) => { observed.push({ url, init }); return 'ok'; } });
  const waiting = t.fetch('https://provider.example/Api/feed'); await Promise.resolve();
  assert.equal(await t.fetch('https://db.example/rest/v1/data'), 'ok'); assert.equal(t.metrics().sent, 0);
  release(); await waiting; assert.equal(t.metrics().sent, 1); assert.equal(observed[1].init.redirect, 'error');
});
test('sleep failures are sanitized and do not trigger a send or retry', async () => {
  let sends = 0, waits = 0;
  const t = createBrsTransport({ now: () => 0,
    sleep: async () => { waits++; throw Error('PRIVATE_WAIT_DETAIL'); }, fetchImpl: async () => { sends++; return {}; } });
  await assert.rejects(t.fetch(provider), e => { assert.equal(e.code, 'brs_transport_wait_failed'); assert.equal(e.message, 'brs_transport_wait_failed'); return true; });
  assert.equal(waits, 1); assert.equal(sends, 0);
});
test('all production producers use the shared transport with client disabled too', () => {
  for (const name of ['server', 'options', 'commodity', 'ime', 'codal', 'candle-backfill', 'symbol-detail'])
    assert.match(readFileSync(new URL('./' + name + '.mjs', import.meta.url), 'utf8'), /import \{ brsFetch as fetch \} from "\.\/brsapi-transport.mjs"/);
  assert.match(readFileSync(new URL('./brsapi-client.mjs', import.meta.url), 'utf8'), /o.fetchImpl \|\| brsFetch/);
});
