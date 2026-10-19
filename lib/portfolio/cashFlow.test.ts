import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCashFlow, cashFlowAmount, type CashFlowEntry, type CashFlowInput } from "./cashFlow";

const source = { label: "اظهار عضو مصنوعی", observedOn: "2026-10-20" };
const income = (overrides: Partial<CashFlowEntry> = {}): CashFlowEntry => ({ entryKey: "income", ownerId: "A", basis: "actual", occurredOn: "2026-10-01", amountToman: 1000, source, category: "حقوق", note: null, kind: "income", accountKey: "cash", ...overrides } as CashFlowEntry);
const transfer = (overrides: Partial<CashFlowEntry> = {}): CashFlowEntry => ({ ...income(), entryKey: "transfer", kind: "transfer", fromAccountKey: "cash", toAccountKey: "bank", ...overrides } as CashFlowEntry);
function input(entries: readonly CashFlowEntry[] = [], overrides: Partial<CashFlowInput> = {}): CashFlowInput {
  return { period: { startOn: "2026-10-01", endOn: "2026-10-31" }, scope: { ownerId: "A", accountKeys: ["cash", "bank"] },
    readState: "ready", entries, coverage: { actual: { status: "complete", source }, planned: { status: "complete", source } },
    opening: { amountToman: 500, atStartOn: "2026-10-01", source }, ...overrides };
}

test("planned and actual remain separate and dated inclusive endpoints determine each net", () => {
  const report = buildCashFlow(input([
    income(), income({ entryKey: "expense", kind: "expense", amountToman: 400, occurredOn: "2026-10-31" }),
    income({ entryKey: "plan-income", basis: "planned", amountToman: 1500 }),
    income({ entryKey: "plan-expense", basis: "planned", kind: "expense", amountToman: 600 }),
    income({ entryKey: "before", occurredOn: "2026-09-30", amountToman: 9999 }),
    income({ entryKey: "after", occurredOn: "2026-11-01", amountToman: 9999 }),
    transfer({ entryKey: "irrelevant-old-invalid-transfer", occurredOn: "2026-09-01", fromAccountKey: "", toAccountKey: "", source: null, amountToman: null }),
  ]));
  assert.equal(report.actual.netToman, 600); assert.equal(report.planned.netToman, 900);
  assert.equal(report.actual.closingToman, 1100); assert.equal(report.actualMinusPlanned, -300);
  assert.equal(report.actual.includedEntries, 2); assert.equal(report.actual.state, "complete");
});

test("one internal transfer changes neither income, expense nor cash net; boundary transfers stay distinct", () => {
  const all = buildCashFlow(input([income(), transfer({ amountToman: 300 }), transfer({ entryKey: "back", fromAccountKey: "bank", toAccountKey: "cash", amountToman: 50 })]));
  assert.equal(all.actual.netToman, 1000); assert.equal(all.actual.incomeKnown, 1000); assert.equal(all.actual.expenseKnown, 0);
  assert.equal(all.actual.internalTransfers, 2); assert.equal(all.actual.transferInKnown, 0); assert.equal(all.actual.transferOutKnown, 0);
  const scoped = buildCashFlow(input([transfer({ amountToman: 300 }), transfer({ entryKey: "back", fromAccountKey: "bank", toAccountKey: "cash", amountToman: 50 })], { scope: { ownerId: "A", accountKeys: ["cash"] } }));
  assert.equal(scoped.actual.incomeKnown, 0); assert.equal(scoped.actual.expenseKnown, 0);
  assert.equal(scoped.actual.transferInKnown, 50); assert.equal(scoped.actual.transferOutKnown, 300);
  assert.equal(scoped.actual.netToman, -250); assert.equal(scoped.actual.internalTransfers, 0);
});

test("canonical integer toman converts input once; invalid money never rounds or becomes zero", () => {
  assert.equal(cashFlowAmount("۱۰۰۰۰", "IRR"), 1000); assert.equal(cashFlowAmount("۱۰۰۰", "IRT"), 1000);
  assert.equal(buildCashFlow(input([income({ amountToman: cashFlowAmount("۱۰۰۰۰", "IRR") })])).actual.incomeKnown, 1000);
  assert.equal(cashFlowAmount(null, "IRT"), null);
  for (const amount of ["", "-1", 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => cashFlowAmount(amount, "IRT"));
  assert.throws(() => cashFlowAmount(11, "IRR"));
});

test("empty unknown, explicit complete zero and partial coverage are different claims", () => {
  const unknown = buildCashFlow(input([], { coverage: { actual: { status: "unknown", source: null }, planned: { status: "partial", source } } }));
  assert.equal(unknown.actual.state, "unknown"); assert.equal(unknown.actual.incomeKnown, null); assert.equal(unknown.actual.netToman, null);
  assert.equal(unknown.planned.state, "partial"); assert.equal(unknown.planned.knownNet, null); assert.equal(unknown.actualMinusPlanned, null);
  const complete = buildCashFlow(input()); assert.equal(complete.actual.netToman, 0); assert.equal(complete.actual.closingToman, 500);
  const partial = buildCashFlow(input([income()], { coverage: { actual: { status: "partial", source }, planned: { status: "unknown", source: null } } }));
  assert.equal(partial.actual.incomeKnown, 1000); assert.equal(partial.actual.expenseKnown, null); assert.equal(partial.actual.knownNet, 1000);
  assert.equal(partial.actual.netToman, null); assert.equal(partial.actual.closingState, "flow_partial");
});

test("unknown or invalid row amounts preserve other known amounts without a definitive net", () => {
  for (const amount of [null, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const r = buildCashFlow(input([income(), income({ entryKey: "missing", kind: "expense", amountToman: amount })])).actual;
    assert.equal(r.incomeKnown, 1000); assert.equal(r.expenseKnown, null); assert.equal(r.knownNet, 1000);
    assert.equal(r.state, "partial"); assert.equal(r.netToman, null); assert.ok(r.issues.includes("entry_amount_invalid"));
  }
  assert.equal(buildCashFlow(input([income({ amountToman: 0 })])).actual.netToman, 0);
});

test("invalid date cannot be silently assigned to or removed from a complete period", () => {
  for (const occurredOn of [null, "2026-02-31", "2026-10-01T00:00:00Z"]) {
    const r = buildCashFlow(input([income(), income({ entryKey: "undated", occurredOn })])).actual;
    assert.equal(r.incomeKnown, 1000); assert.equal(r.netToman, null); assert.ok(r.issues.includes("entry_date_invalid"));
  }
  const persian = buildCashFlow(input([income({ occurredOn: "۲۰۲۶-۱۰-۰۱" })])); assert.equal(persian.actual.netToman, 1000);
});

test("sources and explicit coverage are necessary even when a known subtotal exists", () => {
  for (const badSource of [null, { label: "نامشخص", observedOn: "2026-10-20" }, { label: "اعلام", observedOn: "2026-02-31" }]) {
    const row = buildCashFlow(input([income({ source: badSource })])).actual;
    assert.equal(row.incomeKnown, 1000); assert.equal(row.netToman, null); assert.ok(row.issues.includes("entry_source_missing"));
    const coverage = buildCashFlow(input([], { coverage: { planned: { status: "complete", source }, actual: { status: "complete", source: badSource } } })).actual;
    assert.equal(coverage.state, "partial"); assert.equal(coverage.knownNet, null); assert.ok(coverage.issues.includes("coverage_source_missing"));
  }
});

test("opening balance is a sourced start-of-period stock, may be negative, and never an income", () => {
  const absent = buildCashFlow(input([income()], { opening: null })).actual;
  assert.equal(absent.netToman, 1000); assert.equal(absent.closingToman, null); assert.equal(absent.closingState, "opening_unknown");
  const wrongDay = buildCashFlow(input([income()], { opening: { amountToman: 500, atStartOn: "2026-10-02", source } })).actual;
  assert.equal(wrongDay.netToman, 1000); assert.equal(wrongDay.closingState, "opening_invalid");
  const negative = buildCashFlow(input([income()], { opening: { amountToman: -1500, atStartOn: "2026-10-01", source } })).actual;
  assert.equal(negative.incomeKnown, 1000); assert.equal(negative.closingToman, -500);
});

test("duplicate stable entry keys are excluded rather than inflating a subtotal", () => {
  const report = buildCashFlow(input([income(), income({ amountToman: 2000 }), income({ entryKey: "safe", amountToman: 10 })]));
  assert.equal(report.actual.incomeKnown, 10); assert.equal(report.actual.includedEntries, 1);
  assert.equal(report.actual.netToman, null); assert.ok(report.actual.issues.includes("duplicate_entry"));
});

test("owner and selected accounts isolate inputs; foreign duplicate keys never poison owned records", () => {
  const r = buildCashFlow(input([income(), income({ ownerId: "B", amountToman: 90000, occurredOn: null }), income({ entryKey: "other-account", accountKey: "outside", amountToman: 99999 })]));
  assert.equal(r.actual.netToman, 1000); assert.equal(r.actual.includedEntries, 1); assert.deepEqual(r.actual.issues, []);
  assert.equal(JSON.stringify(r).includes("90000"), false);
  const b = buildCashFlow(input([income()], { scope: { ownerId: "B", accountKeys: ["cash"] } })); assert.equal(b.actual.includedEntries, 0);
});

test("same-account or missing-endpoint transfers do not create an invented cash flow", () => {
  for (const row of [transfer({ toAccountKey: "cash" }), transfer({ toAccountKey: "" }), transfer({ fromAccountKey: "", toAccountKey: "" })]) {
    const r = buildCashFlow(input([row])).actual;
    assert.equal(r.netToman, null); assert.equal(r.knownNet, null); assert.ok(r.issues.includes("transfer_invalid"));
  }
  const unknownAccount = buildCashFlow(input([income({ accountKey: "" })])).actual;
  assert.equal(unknownAccount.netToman, null); assert.ok(unknownAccount.issues.includes("entry_account_invalid"));
});

test("invalid period, scope and failed reader discard even valid-looking residual values", () => {
  for (const overrides of [
    { period: { startOn: "2026-10-31", endOn: "2026-10-01" } },
    { period: { startOn: "2026-02-31", endOn: "2026-10-01" } },
    { scope: { ownerId: "A", accountKeys: [] } },
    { scope: { ownerId: "A", accountKeys: ["cash", "cash"] } },
    { readState: "unavailable" as const },
  ]) {
    const r = buildCashFlow(input([income()], overrides));
    assert.equal(r.actual.incomeKnown, null); assert.equal(r.actual.netToman, null); assert.equal(r.actual.includedEntries, 0);
    assert.equal(r.actualMinusPlanned, null); assert.equal(r.opening.amountToman, null);
  }
});

test("unsafe aggregates and closing overflow remain null without losing safe known bucket totals", () => {
  const r = buildCashFlow(input([income({ amountToman: Number.MAX_SAFE_INTEGER }), income({ entryKey: "extra", amountToman: 1 }), income({ entryKey: "safe-expense", kind: "expense", amountToman: 20 })])).actual;
  assert.equal(r.incomeKnown, null); assert.equal(r.expenseKnown, 20); assert.equal(r.netToman, null); assert.ok(r.issues.includes("unsafe_total"));
  const closing = buildCashFlow(input([income({ amountToman: Number.MAX_SAFE_INTEGER })])).actual;
  assert.equal(closing.netToman, Number.MAX_SAFE_INTEGER); assert.equal(closing.closingToman, null); assert.equal(closing.closingState, "unsafe");
});

test("calculation is deterministic and does not mutate frozen records, scope, coverage or period", () => {
  const row = Object.freeze(income()); const x = input(Object.freeze([row]));
  Object.freeze(x.period); Object.freeze(x.scope.accountKeys); Object.freeze(x.scope); Object.freeze(x.coverage.actual); Object.freeze(x.coverage.planned); Object.freeze(x.coverage); Object.freeze(x);
  const first = buildCashFlow(x), second = buildCashFlow(x); assert.deepEqual(first, second);
  first.actual.issues.push("entry_amount_invalid"); assert.deepEqual(buildCashFlow(x), second);
});
