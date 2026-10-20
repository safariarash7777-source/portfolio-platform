import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastScorecard, type ForecastEvaluation } from './forecast-scorecard';

const asOf = '2026-10-20T00:00:00Z';
function row(id = 'forecast-a'): ForecastEvaluation {
  const target = { issuerId: 'synthetic-issuer', metric: 'revenue', unit: 'IRR-million',
    scope: 'standalone', periodStart: '2026-09-01', periodEnd: '2026-09-30', horizon: 'one-month' };
  return { id, target, forecast: 110, baseline: 80, baselineVersion: 'last-period-v1',
    modelVersion: 'synthetic-v1', cutoff: '2026-08-30T00:00:00Z',
    issuedAt: '2026-08-31T00:00:00Z', recordedAt: '2026-08-31T00:01:00Z', forecastReceipt: 'synthetic-receipt',
    inputs: [{ evidenceRef: 'synthetic-report', knownAt: '2026-08-29T00:00:00Z' }],
    actual: { target: { ...target }, value: 100, publishedAt: '2026-10-05T00:00:00Z',
      observedAt: '2026-10-06T00:00:00Z', evidenceRef: 'synthetic-actual' } };
}
test('compares paired errors without claiming real evidence or rollout approval', () => {
  const input = row(), saved = JSON.stringify(input);
  const result = buildForecastScorecard([input], asOf);
  assert.equal(result.accepted, 1);
  assert.equal(result.groups[0].modelMae, 10);
  assert.equal(result.groups[0].baselineMae, 20);
  assert.equal(result.groups[0].relativeMaeImprovement, 0.5);
  assert.equal(result.rolloutAuthorized, false);
  assert.equal(result.receiptAuthenticityVerified, false);
  assert.equal(JSON.stringify(input), saved);
});
test('future input and forecasts recorded after the target cannot enter historical score', () => {
  const future = row(); future.inputs[0].knownAt = '2026-09-01T00:00:00Z';
  assert.equal(buildForecastScorecard([future], asOf).excluded[0].reason, 'input_after_cutoff');
  const backfilled = row(); backfilled.recordedAt = '2026-10-01T00:00:00Z';
  assert.equal(buildForecastScorecard([backfilled], asOf).excluded[0].reason, 'invalid_forecast_chronology');
});
test('does not score actuals unavailable at evaluation cutoff', () => {
  const input = row(); input.actual!.observedAt = '2026-10-21T00:00:00Z';
  assert.equal(buildForecastScorecard([input], asOf).accepted, 0);
  input.actual = null;
  assert.equal(buildForecastScorecard([input], asOf).excluded[0].reason, 'actual_unavailable');
});
test('unit, scope, period, issuer, metric and horizon must match', () => {
  for (const key of ['unit', 'scope', 'periodStart', 'issuerId', 'metric', 'horizon'] as const) {
    const input = row(); input.actual!.target[key] = key === 'periodStart' ? '2026-09-02' : 'different';
    assert.equal(buildForecastScorecard([input], asOf).excluded[0].reason, 'incomparable_actual');
  }
});
test('null is not zero; negative profit and exact zero baseline error remain meaningful', () => {
  const input = row(); input.forecast = null;
  assert.equal(buildForecastScorecard([input], asOf).excluded[0].reason, 'unknown_or_unsafe_value');
  input.forecast = -10; input.baseline = -20; input.actual!.value = -20;
  const score = buildForecastScorecard([input], asOf).groups[0];
  assert.equal(score.modelMae, 10); assert.equal(score.baselineMae, 0);
  assert.equal(score.relativeMaeImprovement, null);
});
test('duplicates and ambiguous revisions cannot inflate sample size', () => {
  assert.equal(buildForecastScorecard([row(), row()], asOf).accepted, 0);
  const result = buildForecastScorecard([row('a'), row('b')], asOf);
  assert.equal(result.accepted, 0);
  assert.ok(result.excluded.every(item => item.reason === 'ambiguous_target_revision'));
});
test('future and undated revisions cannot change a historical accepted sample', () => {
  for (const recordedAt of ['2026-10-21T00:00:00Z', 'unknown']) {
    const valid = row(), later = row();
    later.recordedAt = recordedAt;
    const before = buildForecastScorecard([valid], asOf);
    const after = buildForecastScorecard([valid, later], asOf);
    assert.deepEqual(after.groups, before.groups);
    assert.equal(after.accepted, 1);
    assert.equal(after.excluded[0].reason, 'invalid_forecast_chronology');
  }
});
test('keeps different issuers and model versions in separate groups', () => {
  const a = row('a'), b = row('b'), c = row('c');
  b.target.issuerId = 'second'; b.actual!.target.issuerId = 'second';
  c.target.periodStart = '2026-08-01'; c.target.periodEnd = '2026-08-31';
  c.actual!.target = { ...c.target }; c.modelVersion = 'synthetic-v2';
  c.recordedAt = c.issuedAt = c.cutoff = '2026-07-31T00:00:00Z';
  c.inputs[0].knownAt = '2026-07-30T00:00:00Z';
  assert.equal(buildForecastScorecard([a, b, c], asOf).groups.length, 3);
});
test('invalid calendar, missing provenance and arithmetic overflow fail closed', () => {
  const input = row(); input.cutoff = '2026-02-30T00:00:00Z';
  assert.equal(buildForecastScorecard([input], asOf).accepted, 0);
  input.cutoff = '2026-08-30T00:00:00Z'; input.inputs = [];
  assert.equal(buildForecastScorecard([input], asOf).excluded[0].reason, 'missing_provenance');
  const overflow = row(); overflow.forecast = Number.MAX_SAFE_INTEGER; overflow.actual!.value = -Number.MAX_SAFE_INTEGER;
  assert.equal(buildForecastScorecard([overflow], asOf).excluded[0].reason, 'unsafe_error');
  assert.throws(() => buildForecastScorecard([], 'yesterday'), /invalid_scorecard_options/);
});
