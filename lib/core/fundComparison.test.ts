import test from "node:test";
import assert from "node:assert/strict";
import { compareFunds, fundSelectionIssue, type FundComparisonRow } from "./fundComparison";
import { periodReturnObservation, periodicReturns } from "./fundReturns";
import type { HistoryDay } from "./engine";

// Synthetic fixtures only; these symbols/values are not live observations.
const row = (id: string, change: Partial<FundComparisonRow> = {}): FundComparisonRow => ({
  id, type: "اهرم - نوع دقیق منبع", unit: "toman", price: 100, closingPrice: 100,
  sourceDate: "1405-07-08", sourceTime: "13:25:00", nav: 100,
  navDate: "1405-07-08", navTime: "13:20:00", navState: "ready", bubblePercent: 0,
  classEvidence: { unitClass: "preferred-tradable", source: "synthetic document price units" },
  navClassEvidence: { unitClass: "preferred-tradable", source: "synthetic document NAV units" },
  returnObservations: { w1: { value: 0, periodStart: "2026-09-23", periodEnd: "2026-09-30", startField: "close", endField: "close", method: "unadjusted-price", source: "symbol_history" } },
  ...change,
});

test("three attested same-type/class/date observations keep zero; inputs stay intact", () => {
  const input = [row("a"), row("b"), row("c")];
  const before = structuredClone(input);
  const result = compareFunds(input);
  assert.deepEqual(result.bubbles, [0, 0, 0]);
  assert.deepEqual(result.returns.w1, [0, 0, 0]);
  assert.deepEqual(result.returns.m1, [null, null, null]);
  assert.deepEqual(input, before);
});

test("missing class blocks comparisons but preserves observed data and specific reasons", () => {
  const input = [row("a"), row("b", { classEvidence: null })];
  const result = compareFunds(input);
  assert.deepEqual(result.bubbles, [null, null]);
  assert.deepEqual(result.returns.w1, [null, null]);
  assert.ok(result.issues.some(issue => issue.code === "unknown-class" && issue.ids.join() === "b"));
  assert.equal(input[1].nav, 100);
  assert.equal(input[1].returnObservations?.w1?.value, 0);
});

test("subscription NAV cannot serve as tradable leveraged NAV, even when prices are fresh", () => {
  const result = compareFunds([row("a"), row("b", { navClassEvidence: { unitClass: "ordinary-subscription", source: "document" } })]);
  assert.deepEqual(result.bubbles, [null, null]);
  assert.deepEqual(result.returns.w1, [0, 0], "a NAV class error does not blank an unrelated return");
  assert.ok(result.issues.some(issue => issue.code === "nav-class"));
  const subscription = { unitClass: "ordinary-subscription" as const, source: "document" };
  assert.ok(compareFunds([row("a", { classEvidence: subscription, navClassEvidence: subscription }), row("b", { classEvidence: subscription, navClassEvidence: subscription })]).issues.some(issue => issue.code === "not-traded"));
});

test("fund type/currency/classes must match; broad similar categories are not sufficient", () => {
  for (const change of [{ type: "نوع دیگر اهرمی" }, { unit: "usd" as const }]) {
    const input = [row("a"), row("b", change)];
    assert.ok(fundSelectionIssue(input[0], input[1]));
    assert.deepEqual(compareFunds(input).returns.w1, [null, null]);
  }
  assert.ok(compareFunds([row("a"), row("b", { classEvidence: { unitClass: "ordinary-subscription", source: "document" } })]).issues.some(issue => issue.code === "class-mismatch"));
  assert.ok(fundSelectionIssue(row("a"), row("b", { type: undefined })));
});

test("stale/missing clocks and different source days do not create comparable bubbles", () => {
  for (const change of [{ navState: "stale" }, { sourceTime: null }, { navTime: null }, { navTime: "04:00:00" }, { navDate: "1405-07-07" }, { sourceDate: "1405-07-07" }, { nav: null }, { navDate: "bad" }, { sourceTime: "25:10" }, { navDate: "1405-07-32" }]) {
    assert.deepEqual(compareFunds([row("a"), row("b", change)]).bubbles, [null, null]);
  }
});

test("legacy reported bubble is ignored; comparable bubble uses the gated formula with original sign", () => {
  const result = compareFunds([row("a", { closingPrice: 110, bubblePercent: -999 }), row("b", { closingPrice: 90, bubblePercent: 999 })]);
  assert.deepEqual(result.bubbles, [10, -10]);
  assert.deepEqual(compareFunds([row("a", { sourceDate: "bad", navDate: "bad" }), row("b", { sourceDate: "bad", navDate: "bad" })]).bubbles, [null, null]);
});

test("same month label with different endpoints or mixed close/last_price cannot be compared", () => {
  for (const change of [{ periodStart: "2026-09-22" }, { periodEnd: "2026-09-29" }, { startField: "last_price" as const }, { periodStart: "2026-02-30" }, { value: Infinity }]) {
    const observation = { ...row("a").returnObservations!.w1!, ...change };
    const result = compareFunds([row("a"), row("b", { returnObservations: { w1: observation } })]);
    assert.deepEqual(result.returns.w1, [null, null]);
    assert.deepEqual(result.bubbles, [0, 0], "return failure does not hide an independently valid bubble");
  }
});

test("duplicate, single and more-than-three selections fail closed", () => {
  for (const input of [[], [row("a")], [row("a"), row("a")], [row("a"), row("b"), row("c"), row("d")]]) {
    const result = compareFunds(input);
    assert.ok(result.issues.some(issue => issue.metric === "group"));
    assert.ok(result.bubbles.every(value => value === null));
  }
});

test("history return retains actual holiday-shifted dates and price fallback provenance", () => {
  const history = [
    { trade_date: "2026-09-21", close: null, last_price: 100 },
    { trade_date: "2026-09-30", close: 110, last_price: null },
  ] as HistoryDay[];
  const observation = periodReturnObservation(history, 7)!;
  assert.equal(observation.periodStart, "2026-09-21");
  assert.equal(observation.periodEnd, "2026-09-30");
  assert.equal(observation.startField, "last_price");
  assert.equal(observation.endField, "close");
  assert.equal(observation.value, 10);
  assert.deepEqual(periodicReturns(history).observations?.w1, observation);
  assert.equal(periodReturnObservation(history, NaN), null);
  assert.equal(periodReturnObservation(history, 0), null);
  for (const invalid of ["not-a-day", "2026-02-30", "2026-13-01", "2026-9-21"]) {
    assert.equal(periodReturnObservation([{ ...history[0], trade_date: invalid }, history[1]], 7), null);
  }
  assert.equal(periodReturnObservation([...history].reverse(), 7), null);
  assert.equal(periodReturnObservation([history[0], history[0]], 7), null);
});
