import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRefreshCadence, MARKET_REFRESH_MS, retainValidBoard } from "./market-refresh";
import { computeFreshness } from "./market-freshness";

test("two controlled five-minute cycles advance received stamp without changing closed-market prices", () => {
  const gate = new MarketRefreshCadence(100);
  let stamp = 100;
  for (let cycle = 1; cycle <= 2; cycle++) {
    const now = 100 + cycle * MARKET_REFRESH_MS;
    assert.equal(gate.begin(now - 1, true), false);
    assert.equal(gate.begin(now, true), true);
    stamp = now;
    gate.finish(now);
    assert.equal(computeFreshness({ irFetchedAt: stamp, usesIr: true, usesGlobal: false, now }).state, "fresh");
  }
  assert.equal(stamp, 600100);
});
test("hidden tab pauses; long pending cannot overlap; resume performs one overdue read", () => {
  const gate = new MarketRefreshCadence(0);
  assert.equal(gate.begin(MARKET_REFRESH_MS * 4, false), false);
  assert.equal(gate.begin(MARKET_REFRESH_MS * 4, true), true);
  assert.equal(gate.begin(MARKET_REFRESH_MS * 8, true), false);
  gate.finish(MARKET_REFRESH_MS * 8);
  assert.equal(gate.begin(MARKET_REFRESH_MS * 8 + 1, true), false);
  assert.equal(gate.begin(MARKET_REFRESH_MS * 9, true), true);
});
test("failed read retains complete board and timestamp; clock independently marks it stale", () => {
  const old = { rows: ["synthetic"], stamp: 100 };
  assert.equal(retainValidBoard(old, { rows: [], stamp: 0 }, false), old);
  assert.equal(computeFreshness({ irFetchedAt: old.stamp, usesIr: true, usesGlobal: false, now: 100 + 31 * 60000 }).state, "stale");
  const fresh = { rows: ["synthetic"], stamp: 400100 };
  assert.equal(retainValidBoard(old, fresh, true), fresh);
});
