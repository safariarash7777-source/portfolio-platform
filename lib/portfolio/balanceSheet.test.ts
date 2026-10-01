import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBalanceSheet } from "./balanceSheet";
import type { HoldingPosition } from "./contracts";
import { dateInput, moneyInput, normaliseDebt, normalisePosition } from "./financialInput";
import { compareHoldingsToTarget } from "./rebalance";
const now = new Date("2026-09-30T10:00:00Z");
const asset: HoldingPosition = { positionKey: "a", symbol: null, manualLabel: "طلای نمونه", assetClass: "gold", qty: null, unit: "قلم", costBasis: null, asOf: "2026-09-30", ownershipPct: 50, valuationMode: "declared", declaredValue: 2000, valuationSource: "اظهار مشتری آزمایشی", valuationAsOf: "2026-09-30", valuationStatus: "valid" };
const debt = { debt_key: "d", title: "وام نمونه", kind: "loan" as const, balance_toman: 1500, currency: "IRT" as const, balance_as_of: "2026-09-30", next_installment_toman: 100, next_due_on: "2026-10-01", note: null };
const sheet = (positions = [asset], debts = [debt]) => buildBalanceSheet({ positions, debts, priceRows: [], now, recorded: true, assetsReady: true, debtsReady: true });
test("partial ownership, negative net worth and installment included only once", () => {
  const r = sheet(); assert.equal(r.assetValue, 1000); assert.equal(r.debtValue, 1500); assert.equal(r.netWorth, -500); assert.equal(r.partial, false);
});
test("unpriced asset remains null and visible, subtotal and net worth explicitly partial", () => {
  const r = sheet([asset, { ...asset, positionKey: "unknown", qty: 10, unit: "گرم", valuationMode: "unpriced", declaredValue: null }]);
  assert.equal(r.valuation.positions.length, 2); assert.equal(r.valuation.positions[1].value, null); assert.equal(r.assetValue, 1000); assert.equal(r.netWorth, -500); assert.equal(r.partial, true);
  assert.equal(sheet([{ ...asset, valuationMode: "unpriced", qty: 1 }]).netWorth, null);
});
test("rial and toman input both produce exactly the same canonical balance and declared value", () => {
  assert.equal(moneyInput("۲۰۰۰۰", "IRR"), moneyInput("۲۰۰۰", "IRT"));
  const r = { debt_key: "d", title: "وام نمونه", kind: "loan", balance_as_of: "2026-09-30" };
  assert.equal(normaliseDebt({ ...r, balance: "۱۵۰۰۰", currency: "IRR" }).balance_toman, 1500);
  const p = { position_key: "p", manual_label: "قلم", asset_class: "gold", unit: "قلم", as_of: "2026-09-30", valuation_mode: "declared", ownership_pct: "۵۰", declared_value: "۲۰۰۰۰", currency: "IRR", valuation_source: "ارزیابی نمونه", valuation_as_of: "2026-09-30", valuation_status: "estimated" };
  assert.equal(normalisePosition(p).declared_value, 2000); assert.equal(normalisePosition(p).qty, null);
  assert.throws(() => moneyInput(11, "IRR")); assert.throws(() => moneyInput("", "IRT")); assert.throws(() => moneyInput(100, "USD"));
});
test("estimated declared values are labelled and cannot generate definitive rebalancing", () => {
  const a = { ...asset, valuationStatus: "estimated" as const }; const r = sheet([a]); assert.equal(r.estimated, true); assert.equal(r.assetValue, 1000);
  const comparison = compareHoldingsToTarget({ id: "h", version: 1, positions: [a] }, { id: "t", version: 1, referenceVersionId: null, weights: [{ assetClass: "gold", weightPct: 100 }], problems: [] }, new Map(), { now, maxPriceAgeDays: 3, maxPriceFutureDays: 1 });
  assert.equal(comparison.definitive, false);
});
test("market value uses ownership after unit conversion and a single rial conversion", () => {
  const a = { ...asset, symbol: "فملی", manualLabel: null, qty: 2, unit: "هزار سهم", valuationMode: "market" as const };
  const r = buildBalanceSheet({ positions: [a], debts: [], priceRows: [{ symbol: "فملی", trade_date: "2026-09-30", close: 100, last_price: null, source: "synthetic" }], now, recorded: true, assetsReady: true, debtsReady: true });
  assert.equal(r.assetValue, 10000);
});
test("absence, failure, unsafe amounts and invalid dates never invent zero wealth", () => {
  assert.throws(() => dateInput("2026-02-31"));
  assert.throws(() => normaliseDebt({ debt_key: "x", title: "ضمانت", kind: "guarantee", currency: "IRT", balance: 1, balance_as_of: "2026-09-30" }));
  assert.throws(() => normaliseDebt({ debt_key: "x", title: "وام", kind: "loan", currency: "IRT", balance: 1, balance_as_of: "2026-09-30", next_installment: 1 }));
  for (const override of [{ recorded: false }, { assetsReady: false }, { debtsReady: false }]) {
    const r = buildBalanceSheet({ positions: [asset], debts: [debt], priceRows: [], now, recorded: true, assetsReady: true, debtsReady: true, ...override }); assert.equal(r.netWorth, null); assert.equal(r.partial, true);
  }
  assert.equal(sheet([asset], [{ ...debt, balance_toman: Number.MAX_SAFE_INTEGER }, { ...debt, balance_toman: 1 }]).debtValue, null);
  assert.equal(sheet([asset], [{ ...debt, balance_toman: NaN }]).netWorth, null);
  assert.equal(sheet([]).netWorth, -1500); assert.equal(sheet([], []).netWorth, 0);
});
