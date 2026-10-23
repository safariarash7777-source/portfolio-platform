import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CashFlowPayload } from "@/lib/portfolio/cashFlowApiContract";
import CashFlowEditor from "./CashFlowEditor";
import { blankEntry, cashFlowDraft, draftPayload, invalidateCoverage, type CashFlowDraft } from "./draft";

const source = { label: "اظهار مصنوعی آزمون", observedOn: "2026-10-20" };
const period = { startOn: "2026-10-01", endOn: "2026-10-31" };
const payload = (): CashFlowPayload => ({ contractVersion: 1, period, accountDefinitions: [{ accountKey: "a", label: "حساب الف" }, { accountKey: "b", label: "حساب ب" }], scopeAccountKeys: ["a"], opening: { amountToman: -200, atStartOn: period.startOn, source },
  coverage: { planned: { status: "complete", memberAffirmed: true, source }, actual: { status: "complete", memberAffirmed: true, source } },
  entries: [{ entryKey: "stable-key", basis: "actual", kind: "transfer", fromAccountKey: "a", toAccountKey: "b", amountToman: 0, occurredOn: "2026-10-02", source, category: null, note: null }] });
type Element = React.ReactElement<Record<string, unknown>>;
const elements = (node: unknown): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  if (typeof element.type === "function") return elements((element.type as (props: unknown) => unknown)(element.props));
  return [element, ...elements(element.props.children)];
};
const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text((node.props as { children?: unknown }).children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
function form(initial = cashFlowDraft(period, payload()), locked = false) {
  let draft = initial, saves = 0;
  const tree = () => CashFlowEditor({ draft, locked, onChange: value => { draft = value; }, onSave: () => { saves++; }, onCancel() {} });
  const nodes = () => elements(tree());
  const label = (query: string) => { const found = nodes().find(node => node.type === "label" && text(node).startsWith(query)); assert.ok(found, query); return elements(found).find(node => ["input", "select"].includes(String(node.type)))!; };
  const change = (query: string, value: unknown, checked?: boolean) => (label(query).props.onChange as (event: unknown) => void)({ target: { value, checked } });
  return { get draft() { return draft; }, get saves() { return saves; }, tree, nodes, label, change };
}

test("canonical draft roundtrip preserves stable keys, outside-scope account, zero and signed opening", () => {
  const original = payload(); assert.deepEqual(draftPayload(cashFlowDraft(period, original)), original);
  assert.equal(original.entries[0].entryKey, "stable-key"); assert.deepEqual(original.scopeAccountKeys, ["a"]);
  const empty = cashFlowDraft(period); assert.equal(empty.coverage.actual.status, "unknown"); assert.equal(empty.opening.enabled, false); assert.equal(empty.entries.length, 0);
});

test("UI string conversion preserves Persian zero versus blank null and rejects unsafe money", () => {
  const draft = cashFlowDraft(period, payload()); draft.opening.amount = "-۲۰۰"; draft.entries[0].amount = "";
  assert.equal(draftPayload(draft).entries[0].amountToman, null); draft.entries[0].amount = "۰";
  assert.equal(draftPayload(draft).entries[0].amountToman, 0); assert.equal(draftPayload(draft).opening!.amountToman, -200);
  for (const value of ["۱.۵", "-۱", String(Number.MAX_SAFE_INTEGER + 1), "Infinity"]) { draft.entries[0].amount = value; assert.throws(() => draftPayload(draft)); }
});

test("actual scope/account handlers invalidate both existing coverage assertions without dropping events", () => {
  const view = form(); view.change("در محدوده", "", false);
  assert.equal(view.draft.coverage.actual.status, "partial"); assert.equal(view.draft.coverage.planned.memberAffirmed, false);
  assert.equal(view.draft.entries[0].entryKey, "stable-key"); assert.equal(view.draft.accounts.length, 2);
  const renamed = form(); renamed.change("نام حساب ۱", "نام تازه"); assert.equal(renamed.draft.coverage.actual.memberAffirmed, false);
});

test("actual event change invalidates relevant lane and basis change invalidates both", () => {
  const view = form(); view.change("مبلغ (تومان", "۹۰");
  assert.equal(view.draft.coverage.actual.memberAffirmed, false); assert.equal(view.draft.coverage.planned.memberAffirmed, true);
  assert.equal(view.draft.entries[0].amount, "۹۰");
  const moved = form(); moved.change("برنامه یا واقعیت", "planned"); assert.equal(moved.draft.coverage.actual.memberAffirmed, false); assert.equal(moved.draft.coverage.planned.memberAffirmed, false);
});

test("actual form keeps transfer references outside scope and blocks referenced account deletion", () => {
  const view = form();
  const buttons = view.nodes().filter(node => node.type === "button" && text(node).startsWith("حذف حساب"));
  assert.equal(buttons.length, 2); assert.ok(buttons.every(button => button.props.disabled));
  const html = renderToStaticMarkup(view.tree()); assert.match(html, /حساب ب · بیرون محدوده/); assert.match(html, /تقویم میلادی/); assert.match(html, /خالی یعنی نامعلوم/);
});

test("complete coverage is an explicit form assertion, never implicit from choosing complete", () => {
  const draft = cashFlowDraft(period, payload()); draft.coverage.actual = { status: "unknown", memberAffirmed: false, source: { label: "", observedOn: "" } };
  const view = form(draft); const selector = view.nodes().filter(node => node.type === "select" && elements(node).some(child => child.props.value === "complete"))[1];
  assert.ok(selector); (selector.props.onChange as (event: unknown) => void)({ target: { value: "complete" } });
  assert.equal(view.draft.coverage.actual.memberAffirmed, false); assert.throws(() => draftPayload(view.draft), /تأیید صریح/);
});

test("period invalidation and new period draft do not reuse previous coverage or unknown data as zero", () => {
  const draft = cashFlowDraft(period, payload());
  const changed = invalidateCoverage({ ...draft, period: { ...period, endOn: "2026-10-30" } });
  assert.equal(changed.coverage.actual.memberAffirmed, false); assert.equal(changed.entries[0].amount, "0");
  const fresh = cashFlowDraft(changed.period); assert.equal(fresh.coverage.planned.status, "unknown"); assert.equal(fresh.opening.amount, "");
});

test("actual submit respects locked state and does not fabricate a successful save", () => {
  for (const locked of [true, false]) {
    const view = form(undefined, locked);
    (view.tree().props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
    assert.equal(view.saves, locked ? 0 : 1);
  }
  assert.equal(blankEntry("stable").amount, ""); assert.equal(blankEntry("stable").occurredOn, "");
});
