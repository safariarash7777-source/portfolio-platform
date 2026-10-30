// Actual component handlers with controlled unit seams. Not DOM/Auth/SQL evidence.
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import TicketRequestPanel, { blankTicketDraft } from "./TicketRequestPanel";
import * as storageClient from "../../lib/consultation/ticketStorageRequest";
import { TICKET_RIGHT_ERROR, type TicketStorageEnvelope, type TicketStorageSelection } from "../../lib/consultation/ticketStorageContracts";
import type { TicketRequest } from "../../lib/consultation/tickets";
import { parent, opening, history, receipt, lookup, M, O } from "../../scripts/testing/consultation-tickets/unit-fixture";
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Element[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!React.isValidElement(tree)) return []; const node = tree as Element; return [node, ...nodes(typeof node.type === "function" ? (node.type as (p: unknown) => unknown)(node.props) : node.props.children)]; }
function text(tree: unknown): string { if (Array.isArray(tree)) return tree.map(text).join(""); if (!React.isValidElement(tree)) return typeof tree === "string" || typeof tree === "number" ? String(tree) : ""; const node = tree as Element; return text(typeof node.type === "function" ? (node.type as (p: unknown) => unknown)(node.props) : node.props.children); }
const ready = (data: unknown) => ({ status: "ready", data });
function inbox(advisor = false): TicketStorageEnvelope { return { contractVersion: "consultation-ticket-storage.v1", mode: "inbox", capability: { state: "owned_fixture", runId: "unit-boundary-only" }, data: { actorId: advisor ? O : M, relationshipId: opening().command.relationshipId, requests: [] } }; }
function looked(input: TicketRequest, found = false) {
  const result = lookup({ found, attempt: found }, input);
  if (result.data.request.state === "found") { result.data.request.data.requestId = input.command.requestId; result.data.request.data.relationshipId = input.command.relationshipId; }
  return ready(result);
}
function deferred<T>() { let done!: (value: T) => void; const promise = new Promise<T>(resolve => { done = resolve; }); return { promise, done }; }
function parentGate() {
  const entered = deferred<void>(), outcome = deferred<unknown>();
  return { entered: entered.promise, read: () => { entered.done(undefined); return outcome.promise; }, done: outcome.done };
}
function mount(parentReads: unknown[], reads: unknown[], writes: unknown[], actor = M, requestId?: string) {
  const slots: unknown[] = [], effects: (() => void)[] = [], cleanups: (() => void)[] = [], readCalls: unknown[] = [], writeCalls: unknown[][] = [], urls: string[] = [];
  let cursor = 0, tree: unknown, callback: (event: string, session: unknown) => void = () => {};
  const hooks = { ...React,
    useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn: unknown, deps: unknown[]) { const i = cursor++, prior = slots[i] as { fn: unknown; deps: unknown[] } | undefined; if (!prior || deps.some((dep, n) => !Object.is(dep, prior.deps[n]))) slots[i] = { fn, deps }; return (slots[i] as { fn: unknown }).fn; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = cursor++, prior = slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined; if (!prior || deps.some((dep, n) => !Object.is(dep, prior.deps[n]))) effects.push(() => { prior?.cleanup?.(); const cleanup = fn(); slots[i] = { deps, cleanup }; if (cleanup) cleanups.push(cleanup); }); },
  };
  const filename = resolve("components/consultation/TicketRequestWorkspace.tsx"), local = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
  const consume = async (values: unknown[], args: unknown[]) => { assert.ok(values.length, "unexpected unit transport call"); const value = values.shift(); return typeof value === "function" ? value(...args) : await value; };
  const calls = { ...storageClient,
    async readTicketStorage(...args: unknown[]) { readCalls.push(args); return consume(reads, args); },
    async sendTicketStorageAttempt(...args: unknown[]) { writeCalls.push(args); return consume(writes, args); },
  };
  const browser = Object.assign(new EventTarget(), { location: { href: "http://localhost:32189/dashboard/consultation/requests" }, history: { replaceState(_state: unknown, _title: string, url: URL) { urls.push(String(url)); browser.location.href = String(url); } } });
  const dependencies = (name: string) => name === "react" ? hooks : name === "@/lib/consultation/request" ? { async readConsultation() { return consume(parentReads, []); } }
    : name === "@/lib/consultation/ticketStorageRequest" ? calls : name === "./TicketRequestPanel" ? { __esModule: true, default: (props: object) => React.createElement("test-ticket-panel", props), blankTicketDraft }
      : name === "@/lib/supabase/client" ? { createClient: () => ({ auth: { onAuthStateChange(fn: typeof callback) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; }, async getUser() { return { data: { user: { id: actor } }, error: null }; } } }) }
        : local(name.startsWith("@/") ? resolve(name.slice(2)) : name);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  new Function("require", "module", "exports", "React", "window", code)(dependencies, taskModule, taskModule.exports, React, browser);
  const render = () => { cursor = 0; tree = taskModule.exports.default({ expectedActorId: actor, initialRelationshipId: opening().command.relationshipId, initialRequestId: requestId }); effects.splice(0).forEach(fn => fn()); };
  const flush = async () => { for (let i = 0; i < 6; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  const panel = () => { const item = nodes(tree).find(node => node.type === "test-ticket-panel"); assert.ok(item); return item; };
  render();
  return {
    panel, render, flush, text: () => text(tree), writeCalls, readCalls, urls,
    async auth(event = "INITIAL_SESSION", id: string | null = actor) { callback(event, id ? { user: { id } } : null); render(); await flush(); },
    edit(value = "SYNTHETIC_PRIVATE_DRAFT") { (panel().props.onDraft as (draft: unknown) => void)({ ...blankTicketDraft(), subject: "Synthetic subject", text: value }); render(); },
    async submit() { (panel().props.onSubmit as () => void)(); render(); await flush(); },
    async reload() { const button = nodes(tree).find(node => node.type === "button" && text(node).includes("بازخوانی بدون ارسال")); assert.ok(button); assert.ok(!button.props.disabled); (button.props.onClick as () => void)(); render(); await flush(); },
    unmount() { cleanups.forEach(fn => fn()); },
  };
}

test("actual panel keeps an unknown right fail-closed and never labels missing history empty", () => {
  const html = renderToStaticMarkup(<TicketRequestPanel source={parent()} items={null} data={null} capability={{ state: "unavailable", runId: null }} draft={blankTicketDraft()} locked={false} selectionLocked={false} needsRefresh={false} onDraft={() => {}} onSelect={() => {}} onNew={() => {}} onSubmit={() => {}} onDiscard={() => {}}/>);
  assert.match(html, /بررسی مجوز ثبت در دسترس نیست/); assert.match(html, /فهرست تأیید نشده/);
  assert.doesNotMatch(html, /در فهرست بازخوانی‌شدهٔ همین رابطه درخواستی وجود ندارد/);
  assert.match(html, /type="submit"[^>]*disabled/);
});
test("no ticket read or private content before the expected identity is established", async () => {
  const view = mount([ready(parent())], [ready(inbox())], []);
  assert.match(view.text(), /تأیید نشست/); assert.equal(view.readCalls.length, 0);
  await view.auth(); assert.equal(view.readCalls.length, 1); view.unmount();
});
test("uncertain save retains exact draft and recovery performs GET only, without a second submit", async () => {
  const view = mount([ready(parent()), ready(parent())], [ready(inbox()), (_s: unknown, _p: unknown, options: { input: TicketRequest }) => looked(options.input), ready(inbox()), (_s: unknown, _p: unknown, options: { input: TicketRequest }) => looked(options.input, true)], [{ status: "uncertain", error: { state: "error", code: "WRITE_UNAVAILABLE", error: "unknown" } }]);
  await view.auth(); view.edit(); await view.submit();
  assert.equal(view.writeCalls.length, 1); assert.equal(view.panel().props.locked, true);
  assert.equal((view.panel().props.draft as { text: string }).text, "SYNTHETIC_PRIVATE_DRAFT");
  await view.reload(); assert.equal(view.writeCalls.length, 1); assert.equal(view.panel().props.locked, false);
  assert.match(view.text(), /در بازخوانی مستقل تطبیق/); assert.equal((view.panel().props.draft as { text: string }).text, "");
  assert.ok(view.urls.every(url => !url.includes("SYNTHETIC_PRIVATE_DRAFT"))); view.unmount();
});
test("a denied fresh write keeps text and requires refresh rather than overwriting the draft", async () => {
  const view = mount([ready(parent())], [ready(inbox()), (_s: unknown, _p: unknown, options: { input: TicketRequest }) => looked(options.input)], [{ status: "blocked", error: TICKET_RIGHT_ERROR, httpStatus: 503 }]);
  await view.auth(); view.edit(); await view.submit();
  assert.equal((view.panel().props.draft as { text: string }).text, "SYNTHETIC_PRIVATE_DRAFT"); assert.equal(view.panel().props.needsRefresh, true); assert.equal(view.writeCalls.length, 1); view.unmount();
});
test("changed identity clears private state and ignores a delayed write receipt", async () => {
  const late = deferred<unknown>(), view = mount([ready(parent())], [ready(inbox()), (_s: unknown, _p: unknown, options: { input: TicketRequest }) => looked(options.input)], [late.promise]);
  await view.auth(); view.edit(); await view.submit(); assert.equal(view.writeCalls.length, 1);
  const attempt = view.writeCalls[0][0] as { intent: { body: string } };
  await view.auth("SIGNED_IN", O); assert.throws(() => view.panel());
  late.done({ status: "saved", receipt: receipt(JSON.parse(attempt.intent.body)) }); await view.flush();
  assert.throws(() => view.panel()); assert.doesNotMatch(view.text(), /SYNTHETIC_PRIVATE_DRAFT|بازخوانی مستقل تطبیق/); view.unmount();
});
test("revoked advisor is cleared before any private read-error fallback", async () => {
  const denied = parent(true); denied.actor.isAdvisor = false; denied.actor.isOwner = false; denied.selected!.revoked = true;
  const initial = history(); initial.actorId = O;
  const view = mount([ready(parent(true)), ready(denied)], [ready(inbox(true)), ready({ contractVersion: "consultation-ticket-storage.v1", mode: "read", capability: { state: "owned_fixture", runId: "unit-boundary-only" }, data: initial })], [], O, opening().command.requestId);
  await view.auth(); view.edit("PRIVATE_ADVISOR_DRAFT"); await view.reload();
  assert.throws(() => view.panel()); assert.doesNotMatch(view.text(), /PRIVATE_ADVISOR_DRAFT/); assert.equal(view.readCalls.length, 2); view.unmount();
});
test("transient unknown identity hides draft; same identity recovery retains it; signout clears it", async () => {
  const view = mount([ready(parent()), ready(parent()), ready(parent())], [ready(inbox()), ready(inbox()), ready(inbox())], []);
  await view.auth(); view.edit(); await view.auth("TOKEN_REFRESHED", null); assert.throws(() => view.panel());
  await view.auth(); assert.equal((view.panel().props.draft as { text: string }).text, "SYNTHETIC_PRIVATE_DRAFT");
  await view.auth("SIGNED_OUT", null); await view.auth(); assert.equal((view.panel().props.draft as { text: string }).text, ""); view.unmount();
});

test("same actor cannot reveal the old panel while fresh relationship authorization is deferred", async () => {
  const stale = parentGate(), fresh = parentGate();
  const view = mount([ready(parent()), stale.read, fresh.read], [ready(inbox()), ready(inbox())], []);
  await view.auth(); view.edit("PRIVATE_REAUTH_DRAFT");
  await view.reload(); await stale.entered;
  await view.auth("TOKEN_REFRESHED", null);
  await view.auth(); await fresh.entered;
  assert.throws(() => view.panel()); assert.doesNotMatch(view.text(), /PRIVATE_REAUTH_DRAFT/);
  stale.done(ready(parent())); await view.flush();
  assert.throws(() => view.panel()); assert.equal(view.readCalls.length, 1);
  fresh.done(ready(parent())); await view.flush();
  assert.equal((view.panel().props.draft as { text: string }).text, "PRIVATE_REAUTH_DRAFT");
  assert.equal(view.readCalls.length, 2); assert.equal(view.writeCalls.length, 0); view.unmount();
});

test("deferred fresh authorization denied or unavailable never restores old advisor content", async () => {
  for (const outcome of [
    { status: "error", error: { code: "FORBIDDEN", error: "denied" } },
    { status: "error", error: { code: "AUTH_UNAVAILABLE", error: "unavailable" } },
    (() => { const denied = parent(true); denied.selected!.revoked = true; return ready(denied); })(),
  ]) {
    const fresh = parentGate();
    const view = mount([ready(parent(true)), fresh.read], [ready(inbox(true))], [], O);
    await view.auth(); view.edit("PRIVATE_ADVISOR_REAUTH_DRAFT"); await view.auth("TOKEN_REFRESHED", null);
    await view.auth(); await fresh.entered;
    assert.throws(() => view.panel()); assert.doesNotMatch(view.text(), /PRIVATE_ADVISOR_REAUTH_DRAFT/);
    fresh.done(outcome); await view.flush();
    assert.throws(() => view.panel()); assert.doesNotMatch(view.text(), /PRIVATE_ADVISOR_REAUTH_DRAFT/);
    assert.equal(view.readCalls.length, 1); assert.equal(view.writeCalls.length, 0); view.unmount();
  }
});

test("late write during unknown identity stays hidden and same-actor recovery is GET only", async () => {
  const fresh = parentGate(), late = deferred<unknown>();
  const view = mount([ready(parent()), fresh.read], [ready(inbox()), (_s: unknown, _p: unknown, options: { input: TicketRequest }) => looked(options.input), ready(inbox()), (_s: unknown, _p: unknown, options: { input: TicketRequest }) => looked(options.input, true)], [late.promise]);
  await view.auth(); view.edit(); await view.submit();
  const attempt = view.writeCalls[0][0] as { intent: { body: string } };
  await view.auth("TOKEN_REFRESHED", null); await view.auth(); await fresh.entered;
  late.done({ status: "saved", receipt: receipt(JSON.parse(attempt.intent.body)) }); await view.flush();
  assert.throws(() => view.panel()); assert.doesNotMatch(view.text(), /SYNTHETIC_PRIVATE_DRAFT|بازخوانی مستقل تطبیق/);
  fresh.done(ready(parent())); await view.flush();
  assert.equal(view.writeCalls.length, 1); assert.match(view.text(), /در بازخوانی مستقل تطبیق/); view.unmount();
});
