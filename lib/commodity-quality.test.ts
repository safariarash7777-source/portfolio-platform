import test from 'node:test';
import assert from 'node:assert/strict';
import { commodityReadQuality, quoteClock } from './commodity-quality';
const now = Date.parse('2026-10-17T08:30:00Z');

test('commodity receipt ages even when persisted state remains received', () => {
  assert.equal(commodityReadQuality('received', now, now), 'received');
  assert.equal(commodityReadQuality('received', now - 30 * 60_000, now), 'stale');
  assert.equal(commodityReadQuality('received', null, now), 'unknown');
  assert.equal(commodityReadQuality('received', now + 120_001, now), 'unknown');
  for (const state of ['stale', 'disabled', 'unavailable', 'unknown'] as const) assert.equal(commodityReadQuality(state, now, now), state);
});
test('quote clock preserves observed time without using it to classify feed health', () => {
  assert.deepEqual(quoteClock(now - 31 * 60_000, now), { at: now - 31 * 60_000, state: 'old' });
  assert.equal(commodityReadQuality('received', now, now), 'received');
  for (const at of [null, undefined, NaN, Infinity, -1]) assert.equal(quoteClock(at, now).state, 'unknown');
  assert.equal(quoteClock(now + 120_000, now).state, 'recent');
  assert.deepEqual(quoteClock(now + 120_001, now), { at: now + 120_001, state: 'future' });
});
