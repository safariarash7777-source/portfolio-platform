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
