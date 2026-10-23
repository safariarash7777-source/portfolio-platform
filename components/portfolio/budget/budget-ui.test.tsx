import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CashFlowRead } from "@/lib/portfolio/cashFlowApiContract";
import BudgetPanel from "./BudgetPanel";

const source = { label: "منبع مصنوعی بودجه", observedOn: "2026-10-20" };
function fixture(): CashFlowRead {
  const period = { startOn: "2026-10-01", endOn: "2026-10-31" };
  return { contractVersion: "cash-flow-read.v1", ownerId: "test-owner", period, state: "ready", report: null, latest: { state: "ready", id: "v2", version: 2 }, history: { state: "ready", items: [], nextBeforeVersion: null },
    snapshot: { id: "v1", version: 1, createdAt: "2026-10-23T12:00:00Z", payload: { contractVersion: 1, period, accountDefinitions: [{ accountKey: "bank", label: "بانک" }], scopeAccountKeys: ["bank"], opening: null,
      coverage: { planned: { status: "complete", source, memberAffirmed: true }, actual: { status: "complete", source, memberAffirmed: true } },
      entries: [{ entryKey: "p", kind: "expense", accountKey: "bank", basis: "planned", amountToman: 100, occurredOn: "2026-10-10", source, category: "خانه", note: null }, { entryKey: "a", kind: "expense", accountKey: "bank", basis: "actual", amountToman: 140, occurredOn: "2026-10-10", source, category: "خانه", note: null }] } } };
}
test("budget shows version, source, signed overrun, historical status and existing editor anchor", () => {
  const html = renderToStaticMarkup(<BudgetPanel data={fixture()} dirty />);
  for (const pattern of [/نسخهٔ ۱/, /تاریخی و فقط خواندنی/, /منبع مصنوعی بودجه/, /-۴۰ تومان/, /هزینه بیشتر از برنامه/, /پیش‌نویس را شامل نمی‌شود/, /href="#cashflow-editor"/, /dateTime="2026-10-20"/]) assert.match(html, pattern);
  assert.doesNotMatch(html, /تومان تومان/);
});
test("empty and unavailable budgets never render zero or stale financial data", () => {
  const empty = fixture(); empty.snapshot = null; empty.state = "empty";
  const html = renderToStaticMarkup(<BudgetPanel data={empty} />); assert.match(html, /بودجهٔ صفر نیست/); assert.doesNotMatch(html, /۰ تومان/);
  const stale = renderToStaticMarkup(<BudgetPanel data={fixture()} stale />); assert.match(stale, /خواندن تازه تأیید نشده/); assert.doesNotMatch(stale, /۱۴۰ تومان|منبع مصنوعی بودجه/);
});
test("partial coverage labels known amounts and withholds remaining budget", () => {
  const data = fixture(); data.snapshot!.payload.coverage.actual.status = "partial";
  const html = renderToStaticMarkup(<BudgetPanel data={data} />); assert.match(html, /۱۴۰ تومان/); assert.match(html, /جمع نهایی نامعلوم/); assert.doesNotMatch(html, /-۴۰ تومان/);
});
