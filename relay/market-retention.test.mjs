import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_FAMILIES, retainMarketFamilies, retainCommoditySnapshot, familyKnown, mergeStoredBaseline, validStoredSnapshot, sourceErrorCategory } from './market-retention.mjs';
const now = 1770000000000;
const fixture = receipt => Object.fromEntries([
  ...MARKET_FAMILIES.map(k => [k, k === 'indices' ? { total: 123, date: '1404-11-14', time: '10:00:00' } : [{ id: k, price: 123, sourceDate: '1404-11-14', sourceTime: '10:00:00' }]]),
  ['fetchedAt', receipt],
]);
const outcomes = ok => Object.fromEntries(MARKET_FAMILIES.map(k => [k, { ok, error: ok ? null : 'timeout' }]));

test('commodity survives restart failure with its own receipt and never borrows a core clock', () => {
  const previous = { ...fixture(now), commodities: [{ id: 'TEST', price: 12, unit: 'USD/test', date: 'synthetic' }], commodityFetchedAt: now - 5000 };
  const status = { enabled: true, lastFetchAt: null, lastError: 'timeout' };
  const retained = retainCommoditySnapshot(previous, { commodities: [] }, status, now);
  assert.deepEqual(retained.commodities, previous.commodities);
  assert.equal(retained.commodityFetchedAt, now - 5000);
  assert.equal(retained.commodityState, 'stale');
  assert.equal(retainCommoditySnapshot({ ...previous, commodityFetchedAt: null }, {}, status, now).commodityFetchedAt, null);
  assert.equal(retainCommoditySnapshot(null, {}, status, now).commodityState, 'unavailable');
  assert.equal(retainCommoditySnapshot(previous, {}, { ...status, enabled: false }, now).commodityState, 'disabled');
});

test('commodity success uses this cycle; failed refresh retains original receipt; legacy receipt is specific', () => {
  const candidate = { commodities: [{ id: 'TEST', price: null, unit: null }] };
  const status = { enabled: true, lastFetchAt: now - 100, lastError: null };
  assert.deepEqual(retainCommoditySnapshot(null, candidate, status, now), { ...candidate, commodityFetchedAt: now - 100, commodityState: 'received' });
  assert.equal(retainCommoditySnapshot(null, candidate, { ...status, lastError: 'schema' }, now).commodityState, 'stale');
  const stored = { ...candidate, snapshotQuality: { auxiliary: { commodities: { receivedAt: now - 1000 } } } };
  const merged = mergeStoredBaseline(fixture(now), stored);
  assert.equal(merged.commodityFetchedAt, now - 1000);
  assert.equal(merged.commodityState, 'stale');
  assert.equal(retainCommoditySnapshot(null, candidate, { ...status, lastFetchAt: now + 1 }, now).commodityFetchedAt, null);
});

test('retains rows/source clocks immutably, and gives fresh history only to successful families', () => {
  const previous = fixture(now - 60000), candidate = fixture(now);
  const original = JSON.stringify({ previous, candidate });
  const result = retainMarketFamilies(previous, candidate, { ...outcomes(false), options: { ok: true } }, now);
  assert.equal(JSON.stringify({ previous, candidate }), original);
  assert.deepEqual(result.payload.stocks, previous.stocks);
  assert.deepEqual(result.fresh.stocks, []);
  assert.equal(result.fresh.indices, null);
  assert.deepEqual(result.fresh.options, candidate.options);
  assert.equal(result.payload.fetchedAt, now - 60000);
  assert.equal(result.payload.snapshotQuality.families.options.receivedAt, now);
  result.payload.stocks[0].price = 1;
  assert.equal(previous.stocks[0].price, 123);
});

test('unknown legacy empty arrays do not become known successful emptiness', () => {
  const previous = fixture(now - 60000); previous.stocks = [];
  const r = retainMarketFamilies(previous, fixture(now), outcomes(false), now);
  assert.equal(r.payload.snapshotQuality.families.stocks.state, 'unavailable');
  assert.equal(r.payload.snapshotQuality.families.stocks.receivedAt, null);
  assert.equal(familyKnown(previous, 'stocks'), false);
});

test('a known authoritative empty family remains known after later failure', () => {
  const candidate = fixture(now); candidate.stocks = [];
  const first = retainMarketFamilies(null, candidate, outcomes(true), now).payload;
  const next = retainMarketFamilies(first, fixture(now + 1000), outcomes(false), now + 1000);
  assert.equal(next.payload.snapshotQuality.families.stocks.state, 'stale');
  assert.equal(next.payload.snapshotQuality.families.stocks.receivedAt, now);
  assert.deepEqual(next.payload.stocks, []);
});

test('null, missing and future receipts stay unknown rather than using attempt time', () => {
  for (const receipt of [null, undefined, now + 1000]) {
    const r = retainMarketFamilies(fixture(receipt), fixture(now), outcomes(false), now);
    assert.equal(r.payload.fetchedAt, null);
    assert.equal(r.payload.snapshotQuality.families.stocks.receivedAt, null);
  }
});

test('successful outcomes with wrong data shape are rejected', () => {
  const candidate = fixture(now); candidate.currency = {}; candidate.indices = [];
  const r = retainMarketFamilies(fixture(now - 1000), candidate, outcomes(true), now);
  assert.equal(r.complete, false);
  assert.equal(r.payload.snapshotQuality.families.currency.state, 'stale');
  assert.equal(r.payload.snapshotQuality.families.indices.state, 'stale');
});

test('restart merge fills only unknown families and preserves current known or authoritative empty data', () => {
  const candidate = fixture(now); candidate.options = [];
  const current = retainMarketFamilies(null, candidate, { ...outcomes(false), options: { ok: true } }, now).payload;
  const stored = fixture(now - 60000);
  const merged = mergeStoredBaseline(current, stored);
  assert.deepEqual(merged.options, []);
  assert.equal(merged.snapshotQuality.families.options.state, 'empty');
  assert.deepEqual(merged.stocks, stored.stocks);
  assert.equal(merged.snapshotQuality.families.stocks.receivedAt, now - 60000);
  assert.deepEqual(current.stocks, []);
});

test('persisted baseline rejects malformed payloads while accepting complete legacy shape', () => {
  for (const p of [null, [], {}, { stocks: [] }, { ...fixture(now), funds: null }]) assert.equal(validStoredSnapshot(p), false);
  assert.equal(validStoredSnapshot(fixture(now)), true);
});

test('error categories never disclose raw provider exception text', () => {
  assert.equal(sourceErrorCategory('timeout https://provider.invalid/?key=synthetic'), 'timeout');
  assert.equal(sourceErrorCategory('HTTP 403 token=synthetic'), 'http');
  assert.equal(sourceErrorCategory('family schema invalid'), 'schema');
  assert.equal(sourceErrorCategory('arbitrary private message'), 'source-failed');
});
