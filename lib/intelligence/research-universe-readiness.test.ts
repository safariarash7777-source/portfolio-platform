import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectResearchUniverseReadiness, type IssuerMappingEvidence, type CapitalizationEvidence } from './research-universe-readiness';
const options = { asOf: '2026-10-20T12:00:00Z', target: 30, maxAgeMs: 86400000 };
const received = Date.parse('2026-10-20T11:40:00Z');
const cap: CapitalizationEvidence = { unit: 'IRR', definition: 'issuer-total-equity', knownAt: '2026-10-19T00:00:00Z', evidenceRef: 'synthetic-cap-contract' };
const mapping = (symbol = 'فملی', issuerId = 'synthetic-issuer'): IssuerMappingEvidence => ({ symbol, issuerId, securityType: 'ordinary-share', validFrom: '2026-01-01T00:00:00Z', validUntil: null, knownAt: '2026-10-19T00:00:00Z', evidenceRef: 'synthetic-identity-proof' });
const stock = (id = 'فملی', marketValue: unknown = 100) => ({ id, marketValue, sourceDate: '1405-07-28', sourceTime: '15:00:00' });
const snapshot = (stocks: unknown[] = [stock()]) => ({ stocks, snapshotQuality: { version: 1, state: 'complete', attemptedAt: received, families: { stocks: { state: 'received', retained: false, receivedAt: received } } } });
const inspect = (payload: unknown, mappings = [mapping()]) => inspectResearchUniverseReadiness(payload, options, { capitalization: cap, mappings });
test('valid snapshot yields exact candidate with separate source and receipt clocks', () => {
  const result = inspect(snapshot());
  assert.equal(result.rows[0].candidate?.marketCapRial, '100');
  assert.equal(result.rows[0].candidate?.sourceAt, '2026-10-20T11:30:00.000Z');
  assert.equal(result.rows[0].candidate?.observedAt, '2026-10-20T11:40:00.000Z');
  assert.equal(result.universe.shortfall, 29);
  assert.equal(result.pilot[0].forecastReady, false);
  assert.ok(result.pilot[0].coverage.every(item => item.validatedPeriods === null));
});
test('current-like snapshot never infers date or issuer from instrument identifiers', () => {
  const payload = snapshot([{ ...stock(), sourceDate: null, isin: 'synthetic-isin', code_12: 'synthetic-code' }]);
  const result = inspect(payload, []);
  assert.equal(result.rows[0].candidate, null);
  assert.equal(result.rows[0].issuerId, null);
  assert.ok(result.rows[0].reasons.includes('missing_or_invalid_source_clock'));
  assert.ok(result.rows[0].reasons.includes('issuer_mapping_unverified'));
});
test('unsafe number is null; exact decimal string survives without numeric coercion', () => {
  const unsafe = inspect(snapshot([stock('فملی', Number.MAX_SAFE_INTEGER + 1)]));
  assert.equal(unsafe.rows[0].marketCapRial, null);
  assert.ok(unsafe.rows[0].reasons.includes('unsafe_cap_precision'));
  assert.equal(inspect(snapshot([stock('فملی', '900719925474099300')])).rows[0].candidate?.marketCapRial, '900719925474099300');
});
test('receipt cannot fall back to snapshot write/fetch time; retained family abstains', () => {
  const result = inspect({ stocks: [stock()], updated_at: options.asOf, fetchedAt: received });
  assert.ok(result.rows[0].reasons.includes('missing_or_future_receipt'));
  const payload = snapshot(); payload.snapshotQuality.families.stocks.retained = true;
  assert.equal(inspect(payload).rows[0].candidate, null);
});
test('missing, future, expired, and ambiguous evidence cannot authorize a candidate', () => {
  for (const mappings of [[], [{ ...mapping(), knownAt: '2026-10-21T00:00:00Z' }], [{ ...mapping(), validUntil: '2026-10-20T10:00:00Z' }], [mapping(), mapping()]]) {
    assert.equal(inspect(snapshot(), mappings).rows[0].candidate, null);
  }
  for (const capitalization of [null, { ...cap, knownAt: '2026-10-21T00:00:00Z' }]) {
    assert.equal(inspectResearchUniverseReadiness(snapshot(), options, { capitalization, mappings: [mapping()] }).rows[0].candidate, null);
  }
});
test('C1 and duplicate rows remain rejected even with identity proof', () => {
  for (const symbol of ['فملی2', 'فملی۲', 'فملی٢', 'فملیح']) assert.equal(inspect(snapshot([stock(symbol)]), [mapping(symbol)]).rows[0].candidate, null);
  const duplicate = inspect(snapshot([stock(), stock()]));
  assert.equal(duplicate.reasonCounts.duplicate_snapshot_symbol, 2);
  assert.equal(duplicate.universe.selected.length, 0);
});
test('pilot preserves top-five ranking despite missing report coverage; later evidence cannot leak', () => {
  const symbols = ['الف', 'ب', 'پ', 'ت', 'ث', 'ج'];
  const mappings = symbols.map(symbol => mapping(symbol, symbol));
  const result = inspectResearchUniverseReadiness(snapshot(symbols.map((symbol, i) => stock(symbol, 100 - i))), options, {
    capitalization: cap, mappings,
    coverage: [ { issuerId: 'الف', axis: 'quarterly', periods: 8, knownAt: '2026-10-19T00:00:00Z', evidenceRef: 'synthetic-eight-valid-periods' },
      { issuerId: 'الف', axis: 'monthly', periods: 24, knownAt: '2026-10-21T00:00:00Z', evidenceRef: 'synthetic-later-periods' } ],
  });
  assert.deepEqual(result.pilot.map(item => item.symbol), symbols.slice(0, 5));
  assert.equal(result.pilot[0].coverage[0].validatedPeriods, 8);
  assert.equal(result.pilot[0].coverage[1].validatedPeriods, null);
  assert.equal(result.pilot[1].coverage[0].validatedPeriods, null);
});
test('absent payload is unavailable, not an authoritative empty market', () => {
  assert.equal(inspect(null).snapshotState, 'unavailable');
  assert.equal(inspect(null).pilotShortfall, 5);
});
test('snapshot-wide error rejects an otherwise valid received family and retains audit evidence', () => {
  const payload = snapshot(); payload.snapshotQuality.state = 'error';
  const result = inspect(payload);
  assert.equal(result.rows[0].candidate, null);
  assert.ok(result.rows[0].reasons.includes('snapshot_error'));
  assert.equal(result.rows[0].mappingEvidenceRef, 'synthetic-identity-proof');
  assert.equal(result.rows[0].capitalizationEvidenceRef, 'synthetic-cap-contract');
  assert.equal(result.universe.selected.length, 0);
});
