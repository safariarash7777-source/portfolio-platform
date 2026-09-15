import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePortfolioScenario as evaluate } from './portfolioScenario.ts';

const holding = (id, weightPct, returnPct) => ({ id, weightPct, returnPct });
const run = (holdings, extra = {}) => evaluate({ initialValue: 1000, holdings, ...extra });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('mixed scenario: hand-calculated attribution, values and real return', () => {
  const r = run([holding('gold', 60, 20), holding('stocks', 30, -10), holding('cash', 10, 0)], { inflationPct: 10 });
  assert.equal(r.status, 'complete');
  near(r.returnPct, 9); near(r.finalValue, 1090); near(r.profitLoss, 90);
  near(r.realReturnPct, -100 / 110);
  assert.deepEqual(r.contributions.map(h => h.profitLoss), [120, -30, 0]);
  near(r.contributions[0].finalWeightPct, 720 / 1090 * 100);
});
test('missing assumption blocks totals without reweighting known assets', () => {
  const r = run([holding('a', 60, 20), holding('b', 40, null)]);
  assert.deepEqual(r, { status: 'incomplete', missingIds: ['b'], coveredWeightPct: 60 });
  assert.equal('returnPct' in r, false);
});
test('zero-weight unknown does not block and is not invented exposure', () => {
  const r = run([holding('a', 100, 0), holding('b', 0, null)]);
  assert.equal(r.status, 'complete'); assert.equal(r.returnPct, 0); assert.equal(r.realReturnPct, null);
});
test('total loss leaves ending allocation undefined', () => {
  const r = run([holding('a', 100, -100)]);
  assert.equal(r.status, 'complete'); assert.equal(r.finalValue, 0);
  assert.equal(r.contributions[0].finalWeightPct, null);
});
test('reject invalid inputs, never silently normalise weights', () => {
  for (const holdings of [[], [holding('a', 99, 1)], [holding('a', -1, 1), holding('b', 101, 1)], [holding('a', 100, -101)], [holding('a', 100, NaN)], [holding('a', 100, Infinity)], [holding('a', 50, 1), holding('a', 50, 2)], [holding('', 100, 1)]]) {
    assert.equal(run(holdings).status, 'invalid');
  }
  for (const inflationPct of [-100, -101, Infinity, NaN]) assert.equal(run([holding('a', 100, 0)], { inflationPct }).status, 'invalid');
  for (const initialValue of [0, -1, NaN, Infinity]) assert.equal(run([holding('a', 100, 0)], { initialValue }).status, 'invalid');
});
test('scaling capital changes money, not returns; input stays unchanged', () => {
  const h = Object.freeze([Object.freeze(holding('a', 100, 25))]);
  const small = run(h); const large = run(h, { initialValue: 2000 });
  assert.equal(small.status, 'complete'); assert.equal(large.status, 'complete');
  assert.equal(small.returnPct, large.returnPct); near(large.profitLoss, small.profitLoss * 2);
});
test('extreme finite inputs cannot produce infinite money', () => {
  assert.equal(run([holding('a', 100, Number.MAX_VALUE)], { initialValue: Number.MAX_VALUE }).status, 'invalid');
});
