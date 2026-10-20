import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBalanceSheet, type DebtPosition } from "./balanceSheet";
import type { HoldingPosition } from "./contracts";
import { dateInput, moneyInput, normaliseDebt, normalisePosition } from "./financialInput";
import { compareHoldingsToTarget } from "./rebalance";
import { buildRecordedPayments, paymentReferenceDay } from "./paymentSchedule";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as format from "../format";
import { valuePositions } from "./valuation";
const now = new Date("2026-09-30T10:00:00Z");
const asset: HoldingPosition = { positionKey: "a", symbol: null, manualLabel: "طلای نمونه", assetClass: "gold", qty: null, unit: "قلم", costBasis: null, asOf: "2026-09-30", ownershipPct: 50, valuationMode: "declared", declaredValue: 2000, valuationSource: "اظهار مشتری آزمایشی", valuationAsOf: "2026-09-30", valuationStatus: "valid" };
const debt = { debt_key: "d", title: "وام نمونه", kind: "loan" as const, balance_toman: 1500, currency: "IRT" as const, balance_as_of: "2026-09-30", next_installment_toman: 100, next_due_on: "2026-10-01", note: null };
const sheet = (positions = [asset], debts = [debt]) => buildBalanceSheet({ positions, debts, priceRows: [], now, recorded: true, assetsReady: true, debtsReady: true });
test("partial ownership, negative net worth and installment included only once", () => {
  const r = sheet(); assert.equal(r.assetValue, 1000); assert.equal(r.debtValue, 1500); assert.equal(r.netWorth, -500); assert.equal(r.partial, false);
});

const payments = (debts: readonly DebtPosition[], overrides: Partial<Omit<Parameters<typeof buildRecordedPayments>[0], "debts">> = {}) => buildRecordedPayments({ debts, ready: true, recorded: true, referenceDay: "2026-10-20", ...overrides });
test("recorded installments sort calendar dates without mutation or currency reconversion", () => {
  const rows = Object.freeze([
    { ...debt, debt_key: "later", currency: "IRR" as const, next_installment_toman: 10000, next_due_on: "2026-11-02" },
    { ...debt, debt_key: "past", next_installment_toman: 200, next_due_on: "2026-10-19" },
    { ...debt, debt_key: "today", next_installment_toman: 0, next_due_on: "2026-10-20" },
  ]);
  const result = payments(rows);
  assert.deepEqual(result.items.map(row => row.debtKey), ["past", "today", "later"]);
  assert.deepEqual(result.items.map(row => row.relation), ["past", "today", "future"]);
  assert.deepEqual(rows.map(row => row.debt_key), ["later", "past", "today"]);
  assert.equal(result.knownAmountTotal, 10200); assert.equal(result.partial, false);
  assert.equal(result.items[2].amountToman, 10000, "canonical toman is never divided by ten again");
});

test("missing and invalid installment fields preserve each known field and never become zero", () => {
  const result = payments([
    { ...debt, debt_key: "known-amount", next_installment_toman: 300, next_due_on: "2026-02-31" },
    { ...debt, debt_key: "known-date", next_installment_toman: NaN, next_due_on: "2026-10-22" },
    { ...debt, debt_key: "negative", next_installment_toman: -1, next_due_on: "2026-10-23" },
  ]);
  assert.equal(result.status, "partial"); assert.equal(result.incompleteCount, 3);
  assert.equal(result.knownAmountTotal, 300);
  assert.equal(result.items[0].dueOn, "2026-10-22"); assert.equal(result.items[0].amountToman, null);
  assert.equal(result.items[2].amountToman, 300); assert.equal(result.items[2].dueOn, null);
});

test("unread, unrecorded, empty and unknown installment amounts remain distinct", () => {
  assert.equal(payments([debt], { ready: false }).status, "unavailable");
  assert.equal(payments([debt], { ready: false }).knownAmountTotal, null);
  assert.equal(payments([debt], { recorded: false }).status, "unrecorded");
  assert.equal(payments([]).status, "empty"); assert.equal(payments([]).knownAmountTotal, null);
  const unknown = payments([{ ...debt, next_installment_toman: null, next_due_on: null }]);
  assert.equal(unknown.status, "partial"); assert.equal(unknown.knownAmountTotal, null);
  assert.equal(unknown.items.length, 1);
});

test("installment sum overflow hides only the sum while recorded rows remain", () => {
  const result = payments([{ ...debt, next_installment_toman: Number.MAX_SAFE_INTEGER }, { ...debt, debt_key: "other", next_installment_toman: 1 }]);
  assert.equal(result.items.length, 2); assert.equal(result.knownAmountTotal, null);
  assert.equal(result.overflow, true); assert.equal(result.status, "partial");
});

test("Tehran reference day changes at its own midnight and invalid dates do not classify payment status", () => {
  assert.equal(paymentReferenceDay(new Date("2026-10-19T20:29:59Z")), "2026-10-19");
  assert.equal(paymentReferenceDay(new Date("2026-10-19T20:30:00Z")), "2026-10-20");
  assert.equal(paymentReferenceDay(new Date(NaN)), null);
  const result = payments([debt], { referenceDay: "not-a-day" });
  assert.equal(result.items[0].relation, "unknown"); assert.equal(result.referenceKnown, false);
});

function actualComponent(file: string, imports: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../../" + file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiledModule = { exports: {} as { default: (props: Record<string, unknown>) => React.ReactNode | Promise<React.ReactNode> } };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (name: string) => {
    if (name in imports) return imports[name];
    if (name === "react/jsx-runtime") return require(name);
    if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
    if (name.startsWith("@/components/")) return { __esModule: true, default: () => null };
    throw new Error("Unexpected component dependency: " + name);
  } });
  return compiledModule.exports.default;
}
const scheduleComponent = () => actualComponent("components/portfolio/DebtSchedule.tsx", {
  "@/lib/format": format, "@/lib/portfolio/paymentSchedule": { buildRecordedPayments },
});
async function scheduleMarkup(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(await scheduleComponent()({ debts: [debt], ready: true, version: 2, referenceDay: "2026-10-20", ...props }));
}

test("actual installments panel preserves partial amounts and labels past dates as payment unknown", async () => {
  const html = await scheduleMarkup({ historical: true, debts: [debt, { ...debt, debt_key: "missing", title: "اطلاعات ناقص", next_installment_toman: null, next_due_on: null }] });
  assert.match(html, /جمع مبالغ اقساط معلوم: ۱۰۰ تومان/);
  assert.match(html, /برای ۱ بدهی/); assert.match(html, /اطلاعات ناقص/); assert.match(html, /مبلغ معلوم نیست/);
  assert.match(html, /موعد ثبت‌شده گذشته؛ وضعیت پرداخت نامعلوم/);
  assert.match(html, /نسخهٔ قبلی/); assert.match(html, /datetime="2026-10-01"/i);
  assert.match(html, /خالص ثروت از ماندهٔ بدهی محاسبه می‌شود/); assert.match(html, /دوباره کسر نمی‌شود/); assert.match(html, /href="#debt-editor"/);
  assert.doesNotMatch(html, /معوق|پرداخت‌نشده|قسط پرداخت‌شده/);
});

test("actual installments panel separates reader error, first recording and empty debt without fabricated zero", async () => {
  const failed = await scheduleMarkup({ ready: false, debts: [{ ...debt, title: "residual-private-row" }] });
  assert.match(failed, /role="alert"/); assert.match(failed, /اطلاعات اقساط ناقص/);
  assert.doesNotMatch(failed, /residual-private-row|جمع مبالغ اقساط|۰ تومان/);
  const first = await scheduleMarkup({ version: null }); assert.match(first, /نخستین تصویر مالی/); assert.doesNotMatch(first, /۱۰۰ تومان/);
  const empty = await scheduleMarkup({ debts: [] }); assert.match(empty, /در این نسخه بدهی ثبت نشده/); assert.doesNotMatch(empty, /۰ تومان|جمع مبالغ اقساط/);
});

test("actual holdings page connects its existing debt reader and a real edit anchor without another query", async () => {
  const calls: [string, unknown][] = [], holding = { id: "owned-v2", version: 2, positions: [asset] };
  let history = [{ ...holding, version: 3 }];
  const panel = scheduleComponent();
  const page = actualComponent("app/(protected)/dashboard/holdings/page.tsx", {
    "@/lib/portfolio/service": {
      async loadPortfolioSnapshot(id: string) { calls.push(["snapshot", id]); return { holdings: holding, history, ready: true, targetState: "empty", storedTarget: null }; },
      async loadVersionDebts(id: string) { calls.push(["debts", id]); return { ready: true, debts: [debt] }; },
      async loadPriceRows(positions: unknown) { calls.push(["prices", positions]); return { status: "empty", data: null }; },
    },
    "@/lib/portfolio/scopeService": { async loadInvestmentScope() { calls.push(["scope", null]); return { status: "ready", review: null }; } },
    "@/lib/portfolio/balanceSheet": { buildBalanceSheet }, "@/lib/portfolio/valuation": { valuePositions },
    "@/lib/portfolio/paymentSchedule": { paymentReferenceDay }, "@/components/portfolio/DebtSchedule": { __esModule: true, default: panel },
    "@/components/portfolio/FinancialEditors": { __esModule: true, default: (props: { children: React.ReactNode }) => props.children },
  });
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ v: "owned-v2" }) }));
  assert.match(html, /اقساط بعدیِ ثبت‌شده/); assert.match(html, /۱۰۰ تومان/); assert.match(html, /نسخهٔ قبلی/);
  assert.match(html, /id="debt-editor"/); assert.match(html, /href="#debt-editor"/);
  assert.deepEqual(calls.map(([name]) => name), ["snapshot", "prices", "debts", "scope"]);
  assert.equal(calls[0][1], "owned-v2"); assert.equal(calls[2][1], holding.id);
  history = [];
  const withoutHistory = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ v: "owned-v2" }) }));
  assert.doesNotMatch(withoutHistory, /نسخهٔ قبلی/, "unavailable history does not establish that the known snapshot is historical");
  assert.match(withoutHistory, /۱۰۰ تومان/, "known installment remains visible when history is unavailable");
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
