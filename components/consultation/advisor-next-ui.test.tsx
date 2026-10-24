import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import RepliesPanel, { type QuestionView, type ReplyEdit } from "./RepliesPanel";
import RosterPanel, { type RosterRowView } from "./RosterPanel";

const question: QuestionView = { id: "q1", text: "پرسش مصنوعی", createdAt: "2026-10-24T10:00:00Z", replies: [{ id: "r1", version: 1, text: "پاسخ پیشین", createdAt: "2026-10-24T11:00:00Z" }] };
const row: RosterRowView = { relationshipId: "rel", label: "عضو مصنوعی", risk: { label: null, status: "نامعلوم", assessedAt: null, expiresAt: null }, assets: { valueToman: null, asOf: null, definition: "ارزش اظهارشده", partial: true }, missingInformation: null };
const callbacks = { onFilter() {}, onSelect() {}, onRetry() {} };

test("member view hides advisor roster even if accidentally supplied rows", () => {
  assert.equal(renderToStaticMarkup(<RosterPanel advisorMode={false} state={{ status: "ready", rows: [row] }} filters={[]} locked={false} {...callbacks} />), "");
});
test("roster keeps unknown distinct from zero and read failure distinct from no matches", () => {
  const render = (state: React.ComponentProps<typeof RosterPanel>["state"]) => renderToStaticMarkup(<RosterPanel advisorMode state={state} filters={[]} locked={false} {...callbacks} />);
  assert.match(render({ status: "ready", rows: [row] }), /نامعلوم/);
  assert.doesNotMatch(render({ status: "ready", rows: [row] }), /۰ تومان/);
  assert.match(render({ status: "error", message: "خواندن ناموفق بود" }), /role="alert"/);
  assert.doesNotMatch(render({ status: "error", message: "خواندن ناموفق بود" }), /پرونده‌ای مطابق/);
  assert.match(render({ status: "ready", rows: [] }), /پرونده‌ای مطابق/);
});
test("member sees current answer and previous versions without edit controls", () => {
  const html = renderToStaticMarkup(<RepliesPanel sessionId="s1" sessionVersion={2} questions={[{ ...question, replies: [...question.replies, { id: "r2", version: 2, text: "پاسخ تازه", createdAt: "2026-10-24T12:00:00Z" }] }]} canReply={false} locked={false} />);
  assert.match(html, /پاسخ پیشین/); assert.match(html, /پاسخ تازه/); assert.match(html, /نسخه‌های قبلی پاسخ/);
  assert.doesNotMatch(html, /textarea|انتشار پاسخ|اصلاح پاسخ/);
  assert.ok(html.indexOf("پرسش مصنوعی") < html.indexOf("پاسخ تازه"));
});

type Element = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Element[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!React.isValidElement(tree)) return []; const element = tree as Element; return [element, ...nodes(element.props.children)]; }
function content(tree: unknown): string { if (Array.isArray(tree)) return tree.map(content).join(""); if (!React.isValidElement(tree)) return typeof tree === "string" ? tree : ""; return content((tree as Element).props.children); }
/** Exercise actual component handlers across prop changes; no browser-layout claim. */
function mountQuestion() {
  const slots: unknown[] = [], saves: ReplyEdit[] = []; let cursor = 0, tree: unknown, current = question;
  const hooks = { ...React, useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next: unknown) => { slots[i] = next; }]; } };
  const filename = resolve("components/consultation/RepliesPanel.tsx"), local = createRequire(filename);
  const taskModule = { exports: {} as { ReplyQuestion: (props: unknown) => unknown } };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  new Function("require", "module", "exports", code)((name: string) => name === "react" ? hooks : local(name.startsWith("@/") ? resolve(name.slice(2)) : name), taskModule, taskModule.exports);
  const render = () => { cursor = 0; tree = taskModule.exports.ReplyQuestion({ question: current, canReply: true, locked: false, onSave: async (edit: ReplyEdit) => { saves.push(edit); return false; } }); };
  const find = (type: string, label = "") => { const node = nodes(tree).find(item => item.type === type && content(item).includes(label)); assert.ok(node); return node; };
  render();
  return { saves, find, render, text: () => content(tree), update(q: QuestionView) { current = q; render(); }, click(label: string) { (find("button", label).props.onClick as () => void)(); render(); }, async submit() { await (find("form").props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} }); render(); } };
}
test("reply edit captures base version; concurrent new answer cannot silently overwrite it", async () => {
  const view = mountQuestion(); view.click("اصلاح پاسخ");
  (view.find("textarea").props.onChange as (event: unknown) => void)({ target: { value: "متن ویرایش من" } }); view.render();
  view.update({ ...question, replies: [...question.replies, { id: "r2", version: 2, text: "ویرایش هم‌زمان", createdAt: "2026-10-24T12:00:00Z" }] });
  assert.equal(view.find("textarea").props.value, "متن ویرایش من"); assert.match(view.text(), /از زمان شروع ویرایش/);
  assert.equal(view.find("button", "انتشار").props.disabled, true); await view.submit(); assert.equal(view.saves.length, 0);
  view.update(question); await view.submit(); assert.deepEqual(view.saves, [{ questionId: "q1", baseVersion: 1, text: "متن ویرایش من" }]);
});
test("cancel abandons unpublished local text and next edit uses current version", async () => {
  const view = mountQuestion(); view.click("اصلاح پاسخ"); view.click("انصراف"); assert.equal(view.saves.length, 0);
  view.update({ ...question, replies: [...question.replies, { id: "r2", version: 2, text: "نسخه دوم", createdAt: "2026-10-24T12:00:00Z" }] });
  view.click("اصلاح پاسخ"); assert.equal(view.find("textarea").props.value, "نسخه دوم"); await view.submit(); assert.equal(view.saves[0].baseVersion, 2);
});

test("roster filter state survives dossier selection and period refresh; explicit reset clears it", () => {
  const slots: unknown[] = []; let cursor = 0, tree: unknown;
  const hooks = { ...React, useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; }, useEffect() {} };
  const filename = resolve("components/consultation/RosterPanel.tsx"), local = createRequire(filename), taskModule = { exports: {} as { AdvisorRoster: (props: unknown) => unknown } };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  new Function("require", "module", "exports", code)((name: string) => name === "react" ? hooks : local(name.startsWith("@/") ? resolve(name.slice(2)) : name), taskModule, taskModule.exports);
  const render = (selectedId = "first", startOn = "2026-10-01") => { cursor = 0; tree = taskModule.exports.AdvisorRoster({ actorId: "actor", selectedId, locked: false, period: { startOn, endOn: "2026-10-24" }, onSelect() {} }); };
  const panel = () => { const item = nodes(tree).find(item => typeof item.props.onFilter === "function"); assert.ok(item); return item; };
  render(); (panel().props.onFilter as (key: string, value: string) => void)("state", "expired"); render("second");
  assert.equal((panel().props.filters as { key: string; value: string }[]).find(item => item.key === "state")?.value, "expired");
  render("second", "2026-09-01"); assert.equal((panel().props.filters as { key: string; value: string }[]).find(item => item.key === "state")?.value, "expired");
  const reset = nodes(tree).find(item => item.type === "button" && content(item).includes("پاک‌کردن فیلترها")); assert.ok(reset); (reset.props.onClick as () => void)(); render();
  assert.equal((panel().props.filters as { value: string }[]).every(item => item.value === ""), true);
});
