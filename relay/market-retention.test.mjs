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


test('restart NAV: successful fresh fund prices retain untouched NAV receipts, not fresh history NAV', () => {
  const previous = fixture(now - 3600000), candidate = fixture(now);
  previous.funds = [{ id: 'a', price: 100, unit: 'toman', nav: 100, navIssue: 101, navDate: '1404-11-14', navTime: '10:00:00', navReceivedAt: now - 3600000 }];
  candidate.funds = [{ id: 'a', price: 110, unit: 'toman', sourceDate: '1404-11-14', sourceTime: '11:00:00' }];
  const result = retainMarketFamilies(previous, candidate, outcomes(true), now);
  const row = result.payload.funds[0];
  assert.equal(row.nav, 100); assert.equal(row.navIssue, 101); assert.equal(row.price, 110);
  assert.equal(row.unit, 'toman'); assert.equal(row.navDate, '1404-11-14'); assert.equal(row.navTime, '10:00:00');
  assert.equal(row.navReceivedAt, now - 3600000); assert.equal(row.navRetained, true); assert.equal(row.bubblePercent, null);
  assert.equal(result.payload.snapshotQuality.families.funds.receivedAt, now);
  assert.equal(result.fresh.funds[0].nav, undefined); assert.equal(candidate.funds[0].nav, undefined);
});

test('restart NAV: new accepted NAV wins; explicit empty/invalid unit/ratio/expired receipt never revives old NAV', () => {
  const previous = fixture(now), candidate = fixture(now);
  const old = { id: 'a', unit: 'toman', price: 100, nav: 100, navReceivedAt: now - 1000 };
  previous.funds = [old]; candidate.funds = [{ id: 'a', unit: 'toman', price: 110, nav: 105, navDate: '1404-11-14', navReceivedAt: now }];
  assert.deepEqual(retainMarketFamilies(previous, candidate, outcomes(true), now).payload.funds, candidate.funds);
  candidate.funds = [];
  assert.deepEqual(retainMarketFamilies(previous, candidate, outcomes(true), now).payload.funds, []);
  for (const patch of [{unit:'rial'}, {nav:true}, {nav:0}, {navReceivedAt:now-24*3600000-1}, {navStatus:'invalid-unit'}]) {
    previous.funds=[{...old,...patch}];candidate.funds=[{id:'a',unit:'toman',price:110}];
    assert.equal(retainMarketFamilies(previous,candidate,outcomes(true),now).payload.funds[0].nav,undefined);
  }
  previous.funds=[old];candidate.funds=[{id:'a',unit:'toman',price:300}];
  assert.equal(retainMarketFamilies(previous,candidate,outcomes(true),now).payload.funds[0].nav,undefined);
});

test('restart NAV: unknown/invalid/future NAV receipt cannot retain a NAV through fresh snapshots', () => {
  for (const received of [undefined,null,0,'123',NaN,Infinity,now+1]) {
    const previous=fixture(now-1000),candidate=fixture(now);
    previous.funds=[{id:'a',unit:'toman',price:100,nav:100,navDate:null,navTime:null,navReceivedAt:received}];
    candidate.funds=[{id:'a',unit:'toman',price:110}];
    let result=retainMarketFamilies(previous,candidate,outcomes(true),now);
    assert.equal(result.payload.funds[0].nav,undefined); assert.equal(result.payload.funds[0].navReceivedAt,undefined);
    assert.equal(result.payload.funds[0].navDate,undefined); assert.equal(result.payload.funds[0].navTime,undefined);
    result=retainMarketFamilies(result.payload,candidate,outcomes(true),now+60000);
    assert.equal(result.payload.funds[0].nav,undefined); assert.equal(result.payload.funds[0].navReceivedAt,undefined);
  }
});
