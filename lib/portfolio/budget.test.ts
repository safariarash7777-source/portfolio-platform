import assert from "node:assert/strict";
import test from "node:test";
import { buildBudget } from "./budget";
import type { CashFlowEntry, CashFlowInput } from "./cashFlow";

const source = { label: "اظهار مصنوعی آزمون", observedOn: "2026-10-20" };
const entry = (overrides: Partial<CashFlowEntry> = {}): CashFlowEntry => ({ entryKey: "p", ownerId: "A", accountKey: "bank", basis: "planned", kind: "expense", category: "خانه", amountToman: 100, occurredOn: "2026-10-10", source, note: null, ...overrides } as CashFlowEntry);
const input = (entries: CashFlowEntry[] = []): CashFlowInput => ({ period: { startOn: "2026-10-01", endOn: "2026-10-31" }, scope: { ownerId: "A", accountKeys: ["bank", "wallet"] }, opening: null, readState: "ready", entries,
  coverage: { planned: { status: "complete", source }, actual: { status: "complete", source } } });

test("negative remaining expense is retained; income variance uses the opposite direction", () => {
  const report = buildBudget(input([entry(), entry({ entryKey: "a", basis: "actual", amountToman: 140 }), entry({ entryKey: "ip", kind: "income", category: "حقوق", amountToman: 300 }), entry({ entryKey: "ia", kind: "income", category: "حقوق", basis: "actual", amountToman: 250 })]));
  assert.equal(report.rows.find(row => row.kind === "expense")!.differenceToman, -40);
  assert.equal(report.rows.find(row => row.kind === "income")!.differenceToman, -50);
});
test("partial and unknown coverage keep known amounts but never give a definitive balance", () => {
  const value = input([entry()]); value.coverage.planned.status = "partial"; value.coverage.actual.status = "unknown";
  const row = buildBudget(value).rows[0];
  assert.deepEqual(row.planned, { knownToman: 100, totalToman: null });
  assert.deepEqual(row.actual, { knownToman: null, totalToman: null }); assert.equal(row.differenceToman, null);
});
test("explicit complete empty coverage is zero, unknown empty coverage remains null", () => {
  assert.equal(buildBudget(input()).totals[1].differenceToman, 0);
  const value = input(); value.coverage.actual.status = "unknown";
  assert.equal(buildBudget(value).totals[1].actual.knownToman, null);
  assert.equal(buildBudget(value).totals[1].differenceToman, null);
});
test("transfers including scope-crossing transfer never become budget income or expense", () => {
  const value = input([entry(), entry({ entryKey: "t", kind: "transfer", fromAccountKey: "bank", toAccountKey: "wallet", amountToman: 999 }), entry({ entryKey: "outside-transfer", kind: "transfer", fromAccountKey: "outside", toAccountKey: "bank", amountToman: 999 })]);
  const report = buildBudget(value); assert.equal(report.rows.length, 1); assert.equal(report.totals[0].actual.totalToman, 0); assert.equal(report.totals[1].planned.totalToman, 100);
});
test("missing category is a visible bucket and prevents definitive category comparisons", () => {
  const report = buildBudget(input([entry(), entry({ entryKey: "uncategorized", category: null, amountToman: 50 })]));
  assert.equal(report.missingCategory, true); assert.equal(report.rows.find(row => row.category === null)!.planned.knownToman, 50);
  assert.equal(report.rows.find(row => row.category === "خانه")!.differenceToman, null);
  assert.equal(report.totals[1].planned.totalToman, 150);
});
test("missing date remains visible, missing source retains known amount but suppresses comparison", () => {
  const undated = buildBudget(input([entry({ occurredOn: null })]));
  assert.equal(undated.rows.length, 1); assert.equal(undated.rows[0].planned.totalToman, null); assert.equal(undated.rows[0].differenceToman, null);
  const unsourced = buildBudget(input([entry({ source: null })])); assert.equal(unsourced.rows[0].planned.knownToman, 100); assert.equal(unsourced.rows[0].differenceToman, null);
});
test("duplicate keys across categories or transfers cannot become valid after filtering", () => {
  for (const extra of [entry({ category: "خوراک" }), entry({ kind: "transfer", fromAccountKey: "bank", toAccountKey: "wallet" })]) {
    const report = buildBudget(input([entry(), extra]));
    assert.equal(report.totals[1].planned.totalToman, null); assert.equal(report.rows[0].differenceToman, null);
  }
});
test("owner, account and period scope exclude unrelated values and labels", () => {
  const report = buildBudget(input([entry(), entry({ entryKey: "foreign", ownerId: "B", category: "private" }), entry({ entryKey: "outside", accountKey: "other", category: "outside" }), entry({ entryKey: "old", occurredOn: "2026-09-30", category: "old" })]));
  assert.equal(report.rows.length, 1); assert.equal(report.totals[1].planned.totalToman, 100);
});
test("overflow cannot produce a rounded money amount", () => {
  const report = buildBudget(input([entry({ amountToman: Number.MAX_SAFE_INTEGER }), entry({ entryKey: "p2", amountToman: 1 })]));
  assert.equal(report.rows[0].planned.knownToman, null); assert.equal(report.rows[0].differenceToman, null);
});
test("unavailable read, invalid period or scope hides category labels and values", () => {
  for (const value of [ { ...input([entry()]), readState: "unavailable" as const }, { ...input([entry()]), period: { startOn: "invalid", endOn: "2026-10-31" } }, { ...input([entry()]), scope: { ownerId: "A", accountKeys: [] } } ]) {
    const report = buildBudget(value); assert.deepEqual(report.rows, []); assert.deepEqual(report.totals, []);
  }
});
test("whitespace in categories is normalized and source evidence is deduplicated", () => {
  const report = buildBudget(input([entry(), entry({ entryKey: "a", basis: "actual", category: " خانه " })]));
  assert.equal(report.rows.length, 1); assert.equal(report.rows[0].sources.length, 1); assert.equal(report.rows[0].differenceToman, 0);
});
