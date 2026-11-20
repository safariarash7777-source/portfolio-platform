import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { mountFinancialForm } from "./financial-form-test-host";
import { createFinancialEditor } from "./financialEditor";

type Element = React.ReactElement<Record<string, unknown>>;
const descendants = (node: unknown): Element[] => Array.isArray(node) ? node.flatMap(descendants)
  : React.isValidElement(node) ? [node as Element, ...descendants((node.props as { children?: unknown }).children)] : [];
const controls = (label: Element) => descendants(label.props.children).filter(node => node.type === "input" || node.type === "select");
const mount = (locked = false) => {
  const editor = createFinancialEditor();
  if (locked) editor.acquire("debts");
  return mountFinancialForm("components/portfolio/HoldingsWorkbench.tsx", {
  ready: true, targetFailed: false, activeVersion: 1, latestVersion: 1, history: [],
  activePositions: ["اول", "دوم"].map((name, index) => ({ positionKey: `asset-${index}`, manualLabel: name,
    symbol: null, assetClass: "gold", qty: 10 + index, unit: "گرم", costBasis: null, asOf: "2026-11-17",
    ownershipPct: 100, valuationMode: "unpriced", declaredValue: null, valuationSource: null,
    valuationAsOf: null, valuationStatus: null })),
  rows: [], gaps: [], definitive: false, notes: [], totalValue: null, showComparison: false, showImport: false,
}, editor);
};
const names = ["عنوان دارایی دستی", "نوع ثبت دارایی", "دستهٔ دارایی", "مقدار کل دارایی"];

test("each repeated asset's visible label owns exactly its input or select", () => {
  const ui = mount();
  for (const name of names) {
    const matching = ui.elements().filter(node => node.type === "label" && controls(node).some(control => control.props["aria-label"] === name));
    assert.equal(matching.length, 2, `${name}: both asset rows have a native label association`);
    for (const label of matching) {
      assert.equal(controls(label).length, 1, "label cannot target another field in the row");
      assert.ok(descendants(label.props.children).some(node => node.type === "span" && typeof node.props.children === "string"));
      assert.ok(!descendants(label.props.children).some(node => node.type === "label"), "no nested labels");
    }
  }
});

test("associated labels retain per-row editing and do not bypass a locked form", () => {
  const ui = mount();
  const quantities = () => ui.elements().filter(node => node.type === "input" && node.props["aria-label"] === "مقدار کل دارایی");
  (quantities()[1].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "۲۵" } });
  ui.render();
  assert.deepEqual(quantities().map(node => node.props.value), ["10", "۲۵"]);
  assert.equal(ui.navigation.length, 0);
  const locked = mount(true);
  const relevant = locked.elements().filter(node => names.includes(String(node.props["aria-label"])));
  assert.equal(relevant.length, 8);
  assert.ok(relevant.every(node => node.props.disabled === true));
});

test("historical route binds the saved version, distinguishes latest quotes, and never compares against today's target", async () => {
  const { holdingsHistoryMarkup } = await import("./holdings-history.fixture");
  const { formatToman, formatJalali } = await import("../../lib/format");
  for (const revision of [2, 3]) {
    const { html, seen, date } = await holdingsHistoryMarkup("v1", revision);
    assert.deepEqual(seen, ["debts:v1", "scope:v1"]);
    assert.match(html, /نسخهٔ بایگانی‌شدهٔ ۱/);
    assert.ok(html.includes(formatJalali(date)) && html.includes("قلم آزمایشی v1") && html.includes("بدهی آزمایشی v1"));
    assert.ok(html.includes(formatToman(2 * revision * 100)) && html.includes("latest-quote"));
    assert.ok(html.includes(formatToman(0)), "recorded zero debt is not missing");
    assert.match(html, /href="\?v=v1" aria-current="page"/);
    assert.match(html, /هدفِ زمان ثبت این نسخه مشخص نیست/);
    assert.doesNotMatch(html, /synthetic-latest-target|اختلاف وزن \(هدف|old-quote|قلم آزمایشی v2|بدهی آزمایشی v2/);
    assert.match(html, /<input[^>]+disabled=""[^>]+aria-label="نماد دارایی"/);
    assert.doesNotMatch(html, /<input(?![^>]* disabled=)[^>]*>/);
    // Current via default URL or the newest receipt URL keeps its normal editing/comparison path.
    const current = await holdingsHistoryMarkup(revision === 2 ? undefined : "v2", revision);
    assert.deepEqual(current.seen, ["debts:v2", "scope:v2"]);
    assert.ok(current.html.includes("synthetic-latest-target-" + revision) && current.html.includes(formatToman(4 * revision * 100)));
    assert.match(current.html, /اختلاف وزن \(هدف|فاصله ارزش/);
    assert.doesNotMatch(current.html, /نسخهٔ بایگانی‌شدهٔ|هدفِ زمان ثبت این نسخه مشخص نیست/);
    assert.match(current.html, /<input(?![^>]* disabled=)[^>]+aria-label="نماد دارایی"/);
  }
  const gap = await holdingsHistoryMarkup("v1", 2, true);
  assert.match(gap.html, /قیمت ناموجود؛ این قلم حفظ شده و ارزش آن صفر فرض نشده است/);
  assert.match(gap.html, /ارزش سهم شما: نامعلوم/);
  const invalid = await holdingsHistoryMarkup("not-mine");
  assert.match(invalid.html, /در دسترس حساب شما نیست/); assert.doesNotMatch(invalid.html, /نسخهٔ بایگانی‌شدهٔ|قلم آزمایشی/);
});
