import test from 'node:test';
import assert from 'node:assert/strict';
import { selectResearchUniverse, type ResearchUniverseRow } from './research-universe';
const options = { asOf: '2026-10-20T12:00:00Z', target: 30, maxAgeMs: 86400000 };
const row = (issuerId: string, cap = '100'): ResearchUniverseRow => ({ issuerId, symbol: issuerId, securityType: 'ordinary-share', marketCapRial: cap, unit: 'IRR', source: 'synthetic-test', sourceAt: '2026-10-20T11:00:00Z', observedAt: '2026-10-20T11:01:00Z' });
test('ranks exact large IRR integers; target and tie ordering are deterministic', () => {
  const rows = Array.from({ length: 55 }, (_, n) => row(String(n).padStart(3, '0'), String(BigInt('90071992547409930') + BigInt(n))));
  const result = selectResearchUniverse(rows, options);
  assert.equal(result.selected.length, 30); assert.equal(result.selected[0].issuerId, '054');
  assert.deepEqual(selectResearchUniverse([...rows].reverse(), options), result);
  assert.deepEqual(selectResearchUniverse([row('b'), row('a')], options).selected.map(x => x.issuerId), ['a', 'b']);
});
test('future revisions cannot leak; latest known invalid value blocks stale fallback', () => {
  const original = row('a');
  assert.equal(selectResearchUniverse([original, { ...original, observedAt: '2026-10-21T11:00:00Z', marketCapRial: '999' }], options).selected[0].marketCapRial, '100');
  const result = selectResearchUniverse([original, { ...original, observedAt: '2026-10-20T11:02:00Z', marketCapRial: null }], options);
  assert.equal(result.selected.length, 0); assert.equal(result.excluded[0].reason, 'invalid_capitalization_or_unit');
});
test('rejects missing dates, stale source, bad units, non-equities and conflicting observations', () => {
  const patches: Partial<ResearchUniverseRow>[] = [{ sourceAt: null }, { observedAt: null }, { sourceAt: '2026-10-18T11:00:00Z' }, { sourceAt: '2026-10-20T11:02:00Z' }, { unit: null }, { marketCapRial: '0' }, { marketCapRial: '1e15' }, { securityType: 'other' }, { source: '' }];
  for (const patch of patches) assert.equal(selectResearchUniverse([{ ...row('a'), ...patch }], options).selected.length, 0);
  assert.equal(selectResearchUniverse([row('a'), row('a', '101')], options).excluded[0].reason, 'conflicting_latest_observation');
});
test('never fills missing coverage or claims a complete-market ranking', () => {
  const result = selectResearchUniverse([row('a')], options);
  assert.equal(result.shortfall, 29); assert.equal(result.scope, 'eligible_observed_issuers');
  assert.equal(result.selected[0].rank, 1);
  for (const target of [0, 29, 51, 30.5]) assert.throws(() => selectResearchUniverse([], { ...options, target }));
});
test('unknown observation time blocks an undatable revision rather than silently retaining an older cap', () => {
  const result = selectResearchUniverse([row('a'), { ...row('a', '999'), observedAt: null }], options);
  assert.equal(result.selected.length, 0);
  assert.equal(result.excluded[0].reason, 'unknown_observation_time');
});
