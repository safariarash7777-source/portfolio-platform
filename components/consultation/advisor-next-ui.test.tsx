import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import RepliesPanel, { SessionReplies, type QuestionView, type ReplyEdit } from "./RepliesPanel";
import RosterPanel, { type RosterRowView } from "./RosterPanel";
import { questionFollowUp } from "./questionFollowUp";
import type { ConsultationAction } from "@/lib/consultation/contracts";
import type { ReplyRead } from "@/lib/consultation/replies";

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

const followUpFeedback: ConsultationAction[] = [
  { id: "q1", sessionId: "s1", actionKey: "a1", version: 1, status: "question", text: "پرسش نخست", actorId: "member", createdAt: question.createdAt },
  { id: "q2", sessionId: "s1", actionKey: "a1", version: 2, status: "question", text: "پرسش مستقل بعدی", actorId: "member", createdAt: question.createdAt },
  { id: "done", sessionId: "s1", actionKey: "a1", version: 3, status: "done", text: null, actorId: "member", createdAt: question.createdAt },
];
const followUpRead: ReplyRead = { contractVersion: "consultation-reply-read.v1", actorId: "advisor", relationshipId: "rel", sessionId: "s1", canReply: true, readOnlyReason: null, replies: [1, 2].map(version => ({ id: `r${version}`, questionId: "q1", sessionId: "s1", version, text: `پاسخ ${version}`, actorId: "advisor", createdAt: question.createdAt, contentHash: "a".repeat(64) })) };

test("follow-up keeps distinct questions on one action and counts questions, not reply versions or done events", () => {
  const items = questionFollowUp(followUpRead, followUpFeedback, [{ actionKey: "a1", title: "بازبینی بودجه", responsible: "member", dueOn: "2099-01-01" }]);
  assert.ok(items); assert.equal(items.length, 2); assert.equal(items[0].replies.length, 2); assert.equal(items[1].replies.length, 0);
  assert.equal(items[0].context, "اقدام مرتبط: بازبینی بودجه");
  const html = renderToStaticMarkup(<SessionReplies data={followUpRead} feedback={followUpFeedback} sessionVersion={3} advisor locked={false} onDirty={() => {}} />);
  assert.match(html, /۱ پرسش بدون پاسخ ثبت‌شده · ۱ پرسش دارای پاسخ ثبت‌شده/);
  assert.doesNotMatch(html, /بستن درخواست|درخواست پایان یافت|پاسخ مشاهده شد/);
});

test("orphan or wrong-session replies fail closed without false zero or unanswered counts", () => {
  for (const bad of [{ ...followUpRead.replies[0], questionId: "missing" }, { ...followUpRead.replies[0], sessionId: "s2" }]) {
    const data = { ...followUpRead, replies: [bad] };
    assert.equal(questionFollowUp(data, followUpFeedback, []), null);
    const html = renderToStaticMarkup(<SessionReplies data={data} feedback={followUpFeedback} sessionVersion={3} advisor locked={false} onDirty={() => {}} />);
    assert.match(html, /role="alert"/); assert.doesNotMatch(html, /پرسش بدون پاسخ ثبت‌شده|هنوز پاسخی ثبت نشده/);
  }
});

test("question context retains unknown action titles and separates general questions", () => {
  const general = { ...followUpFeedback[0], id: "general", actionKey: null };
  const items = questionFollowUp({ ...followUpRead, replies: [] }, [...followUpFeedback, general], []);
  assert.ok(items); assert.match(items[0].context, /عنوان اقدام در این نسخه در دسترس نیست/);
  assert.equal(items[2].context, "دربارهٔ همین جمع‌بندی");
});

test("follow-up filter uses actual component handlers and cannot hide a question being edited", () => {
  const slots: unknown[] = []; let cursor = 0, tree: unknown;
  const hooks = { ...React, useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next: unknown) => { slots[i] = next; }]; } };
  const filename = resolve("components/consultation/RepliesPanel.tsx"), local = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  new Function("require", "module", "exports", code)((name: string) => name === "react" ? hooks : local(name.startsWith("@/") ? resolve(name.slice(2)) : name), taskModule, taskModule.exports);
  const render = () => { cursor = 0; tree = taskModule.exports.default({ sessionId: "s1", sessionVersion: 3, questions: questionFollowUp(followUpRead, followUpFeedback, []), canReply: true, locked: false }); };
  const select = () => { const item = nodes(tree).find(item => item.type === "select"); assert.ok(item); return item; };
  render(); (select().props.onChange as (event: unknown) => void)({ target: { value: "waiting" } }); render();
  const cards = nodes(tree).filter(item => typeof item.props.question === "object"); assert.equal(cards.length, 1);
  assert.equal((cards[0].props.question as QuestionView).id, "q2");
  (cards[0].props.onDirty as () => void)(); render(); assert.equal(select().props.disabled, true);
  (nodes(tree).find(item => typeof item.props.question === "object")!.props.onCancel as () => void)(); render();
  assert.equal(select().props.disabled, false);
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
