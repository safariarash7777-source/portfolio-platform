import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BrsApiClient } from './brsapi-client.mjs';
import { readProviderJson } from './capitalization-response.mjs';
import { isSubTicker, isRightsIssue } from './symbols-util.mjs';
const raw = '[{"l18":"synthetic-stock","l30":"Synthetic","cs_id":1,"pl":1000,"pc":900,"mv":90071992547409931,"marketValueExact":"spoofed","time":"12:30:00"}]';
function clientFor(text) {
  let calls = 0, now = 1000;
  const client = new BrsApiClient({ base: 'https://offline.invalid', key: 'example-local', now: () => now,
    sleep: async ms => { now += ms; }, fetchImpl: async () => { calls++; return new Response(text); } });
  return { client, calls: () => calls };
}
test('two existing endpoints preserve all legacy fields and reconstruct only exact-cap metadata', async () => {
  for (const endpoint of ['Tsetmc/AllSymbols.php', 'Tsetmc/Symbol.php']) {
    const parsed = await readProviderJson(new Response(raw), endpoint);
    const { marketValueExact, ...legacy } = parsed[0];
    const original = JSON.parse(raw)[0]; delete original.marketValueExact;
    assert.deepEqual(legacy, original); assert.equal(marketValueExact, '90071992547409931');
  }
  const other = await readProviderJson(new Response(raw), 'Tsetmc/Index.php');
  assert.deepEqual(other, JSON.parse(raw));
  for (const mv of ['null', '-3', '1.25', '"100 IRR"']) {
    const text = `{"mv":${mv},"marketValueExact":"spoofed"}`;
    const parsed = await readProviderJson(new Response(text), 'Tsetmc/Symbol.php');
    assert.equal(parsed.marketValueExact, null); assert.deepEqual(parsed.mv, JSON.parse(text).mv);
  }
});
test('actual budget client shares one natural request for concurrent and cached consumers', async () => {
  const h = clientFor(raw);
  const request = { endpoint: 'Tsetmc/AllSymbols.php', params: { type: 1 }, producer: 'synthetic-test', dedupeTtlMs: 60000 };
  const [a, b] = await Promise.all([h.client.request(request), h.client.request(request)]);
  const c = await h.client.request(request);
  assert.equal(h.calls(), 1); assert.equal(a, b); assert.equal(a, c);
  assert.equal(c[0].marketValueExact, '90071992547409931');
});
const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('// ── BrsApi: سهام + صندوق‌ها');
const end = source.indexOf('// ── BrsApi: NAV صندوق‌ها', start);
const clockStart = source.indexOf('function sourceClock(item)');
const clockEnd = source.indexOf('\nasync function buildPayload()', clockStart);
assert.ok(start >= 0 && end > start && clockStart >= 0 && clockEnd > clockStart);
const mapperSource = source.slice(start, end) + source.slice(clockStart, clockEnd);
test('actual AllSymbols mapper propagates exact cap through serialized snapshot on budget and legacy paths', async () => {
  for (const budget of [true, false]) {
    const h = clientFor(raw); let legacyCalls = 0, legacyCounts = 0;
    const mapper = runInNewContext(mapperSource + '\nfetchStocksAndFunds;', {
      BRSAPI_KEY: 'example-local', BRSAPI_BASE: 'https://offline.invalid', HDRS: {},
      brsClient: () => budget ? h.client : null, status: { sources: {} }, isSubTicker, isRightsIssue, readProviderJson,
      recoveredFrom: () => false, wasFailing: {}, errMsg: error => error.message, console: { error() {}, log() {} },
      AbortSignal, countLegacy: async () => { legacyCounts++; },
      fetch: async () => { legacyCalls++; return new Response(raw); },
    });
    const result = await mapper();
    const persisted = JSON.parse(JSON.stringify({ stocks: result.stocks }));
    assert.equal(persisted.stocks[0].marketValueExact, '90071992547409931');
    assert.equal(persisted.stocks[0].marketValue, JSON.parse(raw)[0].mv);
    assert.equal(persisted.stocks[0].sourceDate, undefined);
    assert.equal(h.calls() + legacyCalls, 1); assert.equal(legacyCounts, budget ? 0 : 1);
  }
});
test('actual Symbol cache preserves numeric mv and exact cap without a second request', async () => {
  for (const budget of [true, false]) {
    const originalFetch = globalThis.fetch;
    let legacyCalls = 0;
    const text = raw.slice(1, -1);
    const h = clientFor(text);
    globalThis.fetch = async url => { assert.equal(new URL(url).hostname, 'offline.invalid'); legacyCalls++; return new Response(text); };
    try {
      const api = await import(`./symbol-detail.mjs?capitalization=${budget}`);
      const options = { base: 'https://offline.invalid', key: 'example-local', headers: {}, client: budget ? h.client : undefined, countLegacy: async () => {} };
      const first = await api.getSymbolDetail('synthetic-stock', options);
      const cached = await api.getSymbolDetail('synthetic-stock', options);
      assert.equal(first.ok, true); assert.equal(cached.ok, true);
      assert.equal(first.data.marketValueExact, '90071992547409931');
      assert.equal(first.data.mv, JSON.parse(text).mv);
      assert.equal(cached.data.marketValueExact, first.data.marketValueExact);
      assert.equal(h.calls() + legacyCalls, 1);
    } finally { globalThis.fetch = originalFetch; }
  }
});
