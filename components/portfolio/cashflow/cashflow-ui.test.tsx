import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCashFlow, type CashFlowInput } from "@/lib/portfolio/cashFlow";
import CashFlowSummary from "./CashFlowSummary";

const source = { label: "صورت‌حساب مصنوعی آزمون", observedOn: "2026-10-20" };
const input = (): CashFlowInput => ({ period: { startOn: "2026-10-01", endOn: "2026-10-31" }, scope: { ownerId: "test-owner", accountKeys: ["bank", "wallet"] }, readState: "ready", entries: [], opening: null,
  coverage: { planned: { status: "unknown", source: null }, actual: { status: "unknown", source: null } } });
const render = (value: CashFlowInput) => renderToStaticMarkup(<CashFlowSummary report={buildCashFlow(value)} />);

test("actual summary renders unknown coverage and money separately from explicit complete zero", () => {
  const unknown = render(input());
  assert.match(unknown, /پوشش نامعلوم/); assert.match(unknown, /نامعلوم/); assert.doesNotMatch(unknown, /۰ تومان/);
  const value = input(); value.coverage.actual = { status: "complete", source };
  const complete = render(value);
  assert.match(complete, /پوشش کاملِ اعلام‌شده/); assert.match(complete, /۰ تومان/); assert.match(complete, /موجودی افتتاحیه نامعلوم است/);
  assert.match(complete, /dateTime="2026-10-01"/); assert.match(complete, /dateTime="2026-10-31"/);
});

test("actual summary keeps partial known amounts, signed opening and planned versus actual separate", () => {
  const value = input(); value.coverage.planned = { status: "partial", source }; value.coverage.actual = { status: "complete", source };
  value.opening = { amountToman: -200, atStartOn: "2026-10-01", source };
  value.entries = [{ entryKey: "salary", ownerId: "test-owner", basis: "planned", kind: "income", accountKey: "bank", occurredOn: "2026-10-02", amountToman: 1500, source, category: null, note: null },
    { entryKey: "transfer", ownerId: "test-owner", basis: "actual", kind: "transfer", fromAccountKey: "bank", toAccountKey: "wallet", occurredOn: "2026-10-02", amountToman: 90, source, category: null, note: null }];
  const html = render(value);
  assert.match(html, /۱٬۵۰۰ تومان/); assert.match(html, /-۲۰۰ تومان/); assert.match(html, /اطلاعات جزئی/);
  assert.match(html, /انتقال داخلی/); assert.match(html, /برنامه‌ریزی‌شده/); assert.match(html, /واقعی/);
  assert.match(html, /اختلاف خالص واقعی منهای برنامه: <bdi class="font-bold">نامعلوم/);
});

test("unavailable read never renders remaining entries as a zero or authoritative amount", () => {
  const value = input(); value.readState = "unavailable";
  const html = render(value); assert.match(html, /خواندن انجام نشد/); assert.doesNotMatch(html, /۰ تومان/);
});
