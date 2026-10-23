import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import ts from "typescript";
import type { ConsultationCommand, ConsultationRead, ConsultationReceipt } from "@/lib/consultation/contracts";

const actor = "11111111-1111-4111-8111-111111111111", advisor = "22222222-2222-4222-8222-222222222222", relation = "33333333-3333-4333-8333-333333333333";
const ready = (): ConsultationRead => ({ contractVersion: "consultation-read.v1", actor: { id: actor, isOwner: false, isAdvisor: false }, advisors: [{ id: advisor, displayName: "مشاور آزمون", isOwner: true }], relationships: [], selected: null, dossier: null, sessions: [], notes: [], events: [], actions: [] });
const command: ConsultationCommand = { kind: "grant", advisorId: advisor, clientLabel: "نام خصوصی مصنوعی" };
const receipt: ConsultationReceipt = { contractVersion: "consultation-write.v1", actorId: actor, clientToken: "test", command, id: relation, version: 1, reused: false, canonicalContentHash: "a".repeat(64) };
const readback = (): ConsultationRead => ({ ...ready(), relationships: [{ id: relation, advisorId: advisor, clientId: actor, clientLabel: command.kind === "grant" ? command.clientLabel : "", createdAt: "2026-10-23T12:00:00Z", revoked: false }] });
const result = (data = ready()) => ({ status: "ready", data });
const deferred = <T,>() => { let done!: (value: T) => void; const promise = new Promise<T>(resolve => { done = resolve; }); return { promise, done }; };
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Element[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!React.isValidElement(tree)) return []; const node = tree as Element; const content = typeof node.type === "function" ? (node.type as (p: unknown) => unknown)(node.props) : node.props.children; return [node, ...nodes(content)]; }
function text(tree: unknown): string { if (Array.isArray(tree)) return tree.map(text).join(""); if (!React.isValidElement(tree)) return typeof tree === "string" || typeof tree === "number" ? String(tree) : ""; const node = tree as Element; return text(typeof node.type === "function" ? (node.type as (p: unknown) => unknown)(node.props) : node.props.children); }
/** Actual workspace handlers/effects; controlled auth and transport seams, no DOM/RLS claim. */
function mount(reads: unknown[], writes: unknown[]) {
  const slots: unknown[] = [], effects: (() => void)[] = [], cleanups: (() => void)[] = [], readCalls: unknown[] = [], attempts: unknown[] = [], writeCalls: unknown[][] = [];
  let cursor = 0, tree: unknown, callback: (event: string, session: unknown) => void = () => {};
  const hooks = { ...React,
    useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn: unknown, deps: unknown[]) { const i = cursor++, prior = slots[i] as { fn: unknown; deps: unknown[] } | undefined; if (!prior || deps.some((dep, n) => !Object.is(dep, prior.deps[n]))) slots[i] = { fn, deps }; return (slots[i] as { fn: unknown }).fn; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = cursor++, prior = slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined; if (!prior || deps.some((dep, n) => !Object.is(dep, prior.deps[n]))) effects.push(() => { prior?.cleanup?.(); const cleanup = fn(); slots[i] = { deps, cleanup }; if (cleanup) cleanups.push(cleanup); }); },
  };
  const filename = resolve("components/consultation/ConsultationWorkspace.tsx"), local = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
  const request = { createConsultationAttempt(input: unknown) { const attempt = Object.freeze({ input }); attempts.push(attempt); return attempt; }, async readConsultation(options: unknown) { readCalls.push(options); assert.ok(reads.length, "unexpected read"); return await reads.shift(); }, async sendConsultationAttempt(...args: unknown[]) { writeCalls.push(args); assert.ok(writes.length, "unexpected write"); return await writes.shift(); } };
  const browser = Object.assign(new EventTarget(), { location: { reload() {} } });
  const load = (name: string) => name === "react" ? hooks : name === "@/lib/consultation/request" ? request : name === "./ConsultationPanel" ? { __esModule: true, default: (props: object) => React.createElement("test-panel", props) } : name === "@/lib/supabase/client" ? { createClient: () => ({ auth: { onAuthStateChange(fn: typeof callback) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; } } }) } : local(name.startsWith("@/") ? resolve(name.slice(2)) : name);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  new Function("require", "module", "exports", "React", "window", code)(load, taskModule, taskModule.exports, React, browser);
  const render = () => { cursor = 0; tree = taskModule.exports.default({ expectedActorId: actor }); effects.splice(0).forEach(fn => fn()); };
  const flush = async () => { for (let i = 0; i < 4; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  const panel = () => { const item = nodes(tree).find(node => node.type === "test-panel"); assert.ok(item); return item; };
  const button = (label: string) => { const item = nodes(tree).find(node => node.type === "button" && text(node).includes(label)); assert.ok(item, label); return item; };
  render();
  return { text: () => text(tree), panel, render, flush, attempts, writeCalls, readCalls, button,
    async auth(event = "INITIAL_SESSION", id: string | null = actor) { callback(event, id ? { user: { id } } : null); render(); await flush(); },
    send() { (panel().props.onCommand as (command: ConsultationCommand) => unknown)(command); render(); },
    async click(label: string) { const item = button(label); assert.ok(!item.props.disabled); (item.props.onClick as () => unknown)(); render(); await flush(); },
    unmount() { cleanups.forEach(fn => fn()); },
  };
}
test("no dossier or read before matching native browser identity", async () => { const view = mount([result()], []); assert.match(view.text(), /در حال تأیید نشست/); assert.equal(view.readCalls.length, 0); await view.auth(); assert.equal(view.readCalls.length, 1); view.unmount(); });
test("unknown outcome locks edits and retries exactly one frozen attempt", async () => {
  const view = mount([result(), result(readback())], [{ status: "uncertain" }, { status: "saved", receipt }]); await view.auth(); view.send(); await view.flush(); assert.equal(view.panel().props.locked, true); await view.click("بررسی دوبارهٔ همین ثبت"); assert.equal(view.attempts.length, 1); assert.equal(view.writeCalls[0][0], view.writeCalls[1][0]); assert.match(view.text(), /مستقل بازخوانی شد/); view.unmount();
});
test("valid stale GET after a confirmed save never claims readback or unlocks workflow", async () => {
  const view = mount([result(), result(), result(readback())], [{ status: "saved", receipt }]); await view.auth(); view.send(); await view.flush(); assert.match(view.text(), /اثر همان درخواست/); assert.equal(view.panel().props.locked, true); assert.doesNotMatch(view.text(), /ادامه با پروندهٔ بازخوانی‌شده/); await view.click("دوباره خواندن پرونده"); assert.equal(view.attempts.length, 1); await view.click("ادامه با پروندهٔ بازخوانی‌شده"); assert.equal(view.panel().props.locked, false); view.unmount();
});
test("transient session loss while POST resolves permits only same attempt after same-user return", async () => {
  const late = deferred<unknown>(); const view = mount([result(), result(readback())], [late.promise, { status: "saved", receipt }]); await view.auth(); view.send(); await view.auth("TOKEN_REFRESHED", null); late.done({ status: "saved", receipt }); await view.flush(); await view.auth("SIGNED_IN"); assert.equal(view.button("بررسی دوبارهٔ همین ثبت").props.disabled, false); await view.click("بررسی دوبارهٔ همین ثبت"); assert.equal(view.attempts.length, 1); assert.equal(view.writeCalls[0][0], view.writeCalls[1][0]); view.unmount();
});
test("session loss during post-success independent GET cannot unlock until exact receipt effect is read again", async () => {
  const lateRead = deferred<unknown>();
  const view = mount([result(), lateRead.promise, result(readback())], [{ status: "saved", receipt }]);
  await view.auth(); view.send(); await view.flush(); assert.equal(view.readCalls.length, 2);
  await view.auth("TOKEN_REFRESHED", null); lateRead.done(result(readback())); await view.flush(); await view.auth("SIGNED_IN");
  assert.doesNotMatch(view.text(), /ادامه با پروندهٔ بازخوانی‌شده/); assert.equal(view.panel().props.locked, true);
  assert.equal(view.button("دوباره خواندن پرونده").props.disabled, false); assert.equal(view.writeCalls.length, 1);
  await view.click("دوباره خواندن پرونده"); assert.equal(view.readCalls.length, 3); assert.equal(view.writeCalls.length, 1);
  await view.click("ادامه با پروندهٔ بازخوانی‌شده"); assert.equal(view.panel().props.locked, false); view.unmount();
});
test("owner change clears pending private state and ignores delayed receipt", async () => {
  const late = deferred<unknown>(); const view = mount([result()], [late.promise]); await view.auth(); view.send(); await view.auth("SIGNED_IN", advisor); late.done({ status: "saved", receipt }); await view.flush(); assert.match(view.text(), /حساب یا نشست تغییر کرد/); assert.doesNotMatch(view.text(), /سرور ثبت را تأیید/); assert.equal(view.readCalls.length, 1); view.unmount();
});
test("synchronous duplicate click cannot create a second request", async () => {
  const late = deferred<unknown>(); const view = mount([result(), result(readback())], [late.promise]); await view.auth(); view.send(); view.send(); assert.equal(view.attempts.length, 1); assert.equal(view.writeCalls.length, 1); late.done({ status: "saved", receipt }); await view.flush(); view.unmount();
});
