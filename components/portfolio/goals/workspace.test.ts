import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import ts from "typescript";
import type { GoalsPayload, GoalsRead } from "@/lib/portfolio/goalsApiContract";

const owner = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222", second = "33333333-3333-4333-8333-333333333333";
const payload = (): GoalsPayload => ({ contractVersion: 1, goals: [{goalKey:"test-goal",title:"عنوان خصوصی هدف آزمون",targetAmountToman:1234,targetOn:"2027-10-01",declaredSavedToman:null,source:null,note:null}] });
function ready(overrides: Partial<GoalsRead> = {}): GoalsRead { return {contractVersion:"goals-read.v1",state:"ready",ownerId:owner,snapshot:{id,version:1,createdAt:"2026-10-20T10:00:00Z",payload:payload()},latest:{state:"ready",id,version:1},history:{state:"ready",items:[{id,version:1,createdAt:"2026-10-20T10:00:00Z"}],nextBeforeVersion:null},...overrides}; }

type Element = React.ReactElement<Record<string, unknown>>;
const nodes = (node: unknown): Element[] => {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  const content = typeof element.type === "function" ? (element.type as (props: unknown) => unknown)(element.props) : element.props.children;
  return [element, ...nodes(content)];
};
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : React.isValidElement(node) ? words(typeof node.type === "function" ? (node.type as (props: unknown) => unknown)(node.props) : (node.props as { children?: unknown }).children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

/** Runs actual TSX handlers and effects with bounded hooks + API/auth seams; no DOM, network or RLS claim. */
function mount(reads: unknown[], writes: unknown[] = [], initialVersion?: string, attemptError?: Error, actualTransport?: typeof fetch) {
  const slots: unknown[] = []; let cursor = 0, tree: unknown, callback: (event: string, session: unknown) => void = () => {};
  const effects: (() => void)[] = [], cleanups: (() => void)[] = [], readCalls: Record<string, unknown>[] = [], attempts: unknown[] = [], writeCalls: unknown[][] = [];
  const urls: string[] = [];
  const browser = Object.assign(new EventTarget(), { location: { reload() {} }, history: { replaceState(_state: unknown, _title: string, url: string) { urls.push(url); } } });
  const hooks = { ...React,
    useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn: unknown, deps: unknown[]) { const i = cursor++, previous = slots[i] as { fn: unknown; deps: unknown[] } | undefined; if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) slots[i] = { fn, deps }; return (slots[i] as { fn: unknown }).fn; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) { const i = cursor++, previous = slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined; if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) effects.push(() => { previous?.cleanup?.(); const cleanup = effect(); slots[i] = { deps, cleanup }; if (cleanup) cleanups.push(cleanup); }); },
  };
  const filename = resolve("components/portfolio/goals/GoalsWorkspace.tsx"), local = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
  const actual = actualTransport ? local(resolve("lib/portfolio/goalsRequest.ts")) as typeof import("@/lib/portfolio/goalsRequest") : null;
  const request = {
    createGoalsAttempt(input: unknown) { if (attemptError) throw attemptError; const attempt = actual ? actual.createGoalsAttempt(input as Parameters<typeof actual.createGoalsAttempt>[0]) : Object.freeze({ seamRequest: input }); attempts.push(attempt); return attempt; },
    async readGoals(options: Record<string, unknown>) { readCalls.push(options); if (actual) return await actual.readGoals({ ...options as Parameters<typeof actual.readGoals>[0], transport: actualTransport }); assert.ok(reads.length, "unexpected read"); return await reads.shift(); },
    async sendGoalsAttempt(...args: unknown[]) { writeCalls.push(args); if (actual) return await actual.sendGoalsAttempt(args[0] as Parameters<typeof actual.sendGoalsAttempt>[0], { ...args[1] as Parameters<typeof actual.sendGoalsAttempt>[1], transport: actualTransport }); assert.ok(writes.length, "unexpected write"); return await writes.shift(); },
  };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  const load = (name: string) => name === "react" ? hooks : name === "@/lib/portfolio/goalsRequest" ? request : name === "@/lib/supabase/client" ? { createClient: () => ({ auth: { onAuthStateChange(fn: typeof callback) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; } } }) } : local(name.startsWith("@/") ? resolve(name.slice(2)) : name);
  new Function("require", "module", "exports", "React", "window", code)(load, taskModule, taskModule.exports, React, browser);
  const render = () => { cursor = 0; tree = taskModule.exports.default({ expectedOwnerId: owner, initialVersion }); effects.splice(0).forEach(effect => effect()); };
  const flush = async () => { for (let i = 0; i < 4; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  const find = (type: string, query: string) => { const element = nodes(tree).find(node => node.type === type && words(node).includes(query)); assert.ok(element, `${type}: ${query}`); return element; };
  const editor = () => { const element = nodes(tree).find(node => typeof node.type === "function" && node.type.name === "GoalsEditor"); assert.ok(element); return element; };
  const click = async (label: string) => { const button = find("button", label); assert.ok(!button.props.disabled); (button.props.onClick as () => unknown)(); render(); await flush(); };
  render();
  return { render, flush, find, editor, click, readCalls, attempts, writeCalls, urls, text: () => words(tree), all: () => nodes(tree),
    async auth(event = "INITIAL_SESSION", userId: string | null = owner) { callback(event, userId ? { user: { id: userId } } : null); render(); await flush(); },
    beginSave() { (editor().props.onSave as () => void)(); render(); },
    beforeUnload() { const event = new Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; },
    unmount() { cleanups.forEach(cleanup => cleanup()); },
  };
}
const result = (data: GoalsRead = ready()) => ({ status: data.state, data });
const receipt = { contractVersion: "goals-write.v1", ownerId: owner, versionId: second, version: 2, goalCount: 1, reused: false, canonicalContentHash: "a".repeat(64) };

test("historical snapshot remains visible but cannot mutate or create a write attempt", async () => {
  const view = mount([result(ready({ latest: { state: "ready", id: second, version: 2 } }))], [], id);
  await view.auth(); assert.match(view.text(), /این نسخه تاریخی و فقط خواندنی است/); assert.equal(view.editor().props.locked, true);
  const draft = view.editor().props.draft;
  (view.editor().props.onChange as (value: unknown) => void)({ goals: [] }); view.render(); assert.equal(view.editor().props.draft, draft);
  view.beginSave(); await view.flush(); assert.equal(view.attempts.length, 0); assert.equal(view.writeCalls.length, 0); view.unmount();
});

test("no private rendering/edit/read before browser identity; transient missing session is not empty", async () => {
  const view = mount([result()]); assert.match(view.text(), /در حال تأیید نشست/); assert.equal(view.readCalls.length, 0);
  await view.auth("INITIAL_SESSION", null); assert.match(view.text(), /نشست مرورگر تأیید نشد/); assert.equal(view.readCalls.length, 0);
  await view.auth(); assert.match(view.text(), /۱٬۲۳۴ تومان/); assert.equal(view.editor().props.locked, false); view.unmount();
});

test("read error and selected missing version never seed fake empty and retry the same UUID", async () => {
  const view = mount([{ status: "error", httpStatus: 404, error: {} }, { status: "error", httpStatus: 503, error: {} }], [], second);
  await view.auth(); assert.match(view.text(), /نسخهٔ انتخابی/); assert.doesNotMatch(view.text(), /هنوز نسخه‌ای ثبت نشده/);
  await view.click("دوباره خواندن نسخهٔ درخواست‌شده"); assert.equal(view.readCalls[1].version, second); view.unmount();
});

test("successful empty permits only unknown unsaved draft, while metadata failure preserves good snapshot read-only", async () => {
  const empty = ready({ state: "empty", snapshot: null, latest: { state: "ready", id: null, version: 0 }, history: { state: "ready", items: [], nextBeforeVersion: null } });
  const first = mount([result(empty)]); await first.auth(); assert.match(first.text(), /هنوز فهرست هدفی ثبت نشده/); assert.doesNotMatch(first.text(), /۰ تومان/); assert.equal(first.editor().props.locked, false); first.unmount();
  const secondView = mount([result(ready({ latest: { state: "error", id: null, version: null }, history: { state: "error", items: [], nextBeforeVersion: null } }))]);
  await secondView.auth(); assert.match(secondView.text(), /۱٬۲۳۴ تومان/); assert.match(secondView.text(), /آخرین نسخه خوانده نشد/); assert.equal(secondView.editor().props.locked, true); secondView.unmount();
});

test("owner change/signout clears private view and ignores an abort-ignored old read", async () => {
  const delayed = deferred<unknown>(); const view = mount([delayed.promise]); await view.auth(); assert.equal(view.readCalls.length, 1);
  await view.auth("SIGNED_IN", "other-owner"); delayed.resolve(result()); await view.flush();
  assert.match(view.text(), /اطلاعات خصوصی این صفحه پاک شد/); assert.doesNotMatch(view.text(), /عنوان خصوصی|۱٬۲۳۴|نسخهٔ هدف‌های مالی/);
  assert.equal(view.attempts.length, 0); view.unmount();
  const visible = mount([result()]); await visible.auth(); await visible.auth("SIGNED_OUT", null); assert.doesNotMatch(visible.text(), /عنوان خصوصی|۱٬۲۳۴/); visible.unmount();
});

test("unknown actual handler retry uses same attempt; confirmed receipt survives failed readback", async () => {
  const view = mount([result(), { status: "error", httpStatus: 503, error: {} }], [{ status: "unknown", message: "نتیجه نامعلوم" }, { status: "confirmed", receipt }]);
  await view.auth(); view.beginSave(); await view.flush(); assert.equal(view.editor().props.locked, true); assert.ok(view.beforeUnload());
  const original = view.editor().props.draft;
  (view.editor().props.onChange as (value: unknown) => void)({}); view.render(); assert.equal(view.editor().props.draft, original);
  await view.click("بررسی دوبارهٔ همین ثبت");
  assert.equal(view.attempts.length, 1); assert.equal(view.writeCalls[0][0], view.writeCalls[1][0]);
  assert.match(view.text(), /سرور ثبت نسخهٔ ۲ را تأیید کرد/); assert.match(view.text(), /بازخوانی مستقل هنوز تأیید نشده/);
  assert.equal(view.editor().props.locked, true); assert.doesNotMatch(view.text(), /ویرایش نسخهٔ بازخوانی‌شده برای ثبت بعدی/); view.unmount();
});

test("synchronous duplicate save and late write after owner transition cannot create a new attempt or UI receipt", async () => {
  const delayed = deferred<unknown>(); const view = mount([result()], [delayed.promise]); await view.auth();
  view.beginSave(); view.beginSave(); assert.equal(view.attempts.length, 1); assert.equal(view.writeCalls.length, 1);
  await view.auth("SIGNED_IN", "other-owner"); delayed.resolve({ status: "confirmed", receipt }); await view.flush();
  assert.doesNotMatch(view.text(), /سرور ثبت نسخه|۱٬۲۳۴|عنوان خصوصی/); assert.equal(view.writeCalls.length, 1); view.unmount();
});

test("canonical conflict never rebases, unlocks or creates a new token", async () => {
  const view = mount([result()], [{ status: "conflict", httpStatus: 409, error: {}, priorUnresolved: false }]);
  await view.auth(); view.beginSave(); await view.flush(); assert.match(view.text(), /تعارض نسخه یا شناسه/); assert.equal(view.editor().props.locked, true);
  assert.equal(view.attempts.length, 1); view.beginSave(); await view.flush(); assert.equal(view.writeCalls.length, 1); view.unmount();
});

test("internal canonical validation errors stay Persian and do not submit or lock the draft", async () => {
  const view = mount([result()], [], undefined, new Error("Invalid goals internal detail")); await view.auth(); view.beginSave(); await view.flush();
  assert.match(view.text(), /اطلاعات فرم با قرارداد ثبت سازگار نیست/); assert.doesNotMatch(view.text(), /Invalid goals/);
  assert.equal(view.writeCalls.length, 0); assert.equal(view.attempts.length, 0); assert.equal(view.editor().props.locked, false); view.unmount();
});

test("actual workspace plus real request helpers recover byte-identical POST and independently parse canonical readback", async () => {
  const bodies: string[] = []; let gets = 0;
  const next = ready({ snapshot: { ...ready().snapshot!, id: second, version: 2 }, latest: { state: "ready", id: second, version: 2 }, history: { state: "ready", items: [{ id: second, version: 2, createdAt: "2026-10-20T10:00:00Z" }], nextBeforeVersion: null } });
  const transport = (async (_url, options) => {
    if (options?.method === "POST") {
      bodies.push(String(options.body));
      return bodies.length === 1 ? Response.json({ state: "error", code: "WRITE_UNAVAILABLE", error: "نتیجهٔ ثبت مصنوعی نامعلوم است." }, { status: 503 }) : Response.json({ ...receipt, reused: true }, { status: 200 });
    }
    return Response.json(gets++ === 0 ? ready() : next);
  }) as typeof fetch;
  const view = mount([], [], undefined, undefined, transport); await view.auth(); view.beginSave(); await view.flush();
  assert.equal(view.editor().props.locked, true); await view.click("بررسی دوبارهٔ همین ثبت");
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]); assert.equal(JSON.parse(bodies[0]).expectedOwnerId, owner); assert.equal(view.attempts.length, 1);
  assert.equal(gets, 2); assert.match(view.text(), /همان تلاش قبلی بازیابی شد/); assert.match(view.text(), /نسخهٔ تأییدشده مستقل بازخوانی شد/); view.unmount();
});

test("confirmed snapshot needs readback then explicit edit before next token/base; dirty cancel warns and preserves stored values", async () => {
  const next = ready({ snapshot: { ...ready().snapshot!, id: second, version: 2 }, latest: { state: "ready", id: second, version: 2 } });
  const view = mount([result(), result(next)], [{ status: "confirmed", receipt }]); await view.auth();
  const changed = { ...(view.editor().props.draft as object) }; (view.editor().props.onChange as (value: unknown) => void)(changed); view.render(); assert.ok(view.beforeUnload());
  view.beginSave(); await view.flush(); assert.match(view.text(), /نسخهٔ تأییدشده مستقل بازخوانی شد/); assert.equal(view.editor().props.locked, true);
  await view.click("ویرایش نسخهٔ بازخوانی‌شده برای ثبت بعدی"); assert.equal(view.editor().props.locked, false); assert.equal(view.attempts.length, 1);
  assert.equal(view.beforeUnload(), false); assert.equal(view.readCalls[1].version, second);
  assert.equal(view.urls[1], `/dashboard/goals?version=${second}`); assert.ok(view.urls.every(url => !url.includes(owner) && !url.includes("1234"))); view.unmount();
});

test("history pagination preserves already rendered pages on optional failure", async () => {
  const first = ready({ history: { state: "ready", items: [{ id, version: 3, createdAt: "2026-10-20T10:00:00Z" }], nextBeforeVersion: 3 } });
  const page = ready({ history: { state: "ready", items: [{ id: second, version: 2, createdAt: "2026-10-19T10:00:00Z" }], nextBeforeVersion: 2 } });
  const view = mount([result(first), result(page), { status: "error", httpStatus: 503, error: {} }]); await view.auth(); await view.click("نسخه‌های قدیمی‌تر");
  await view.click("نسخه‌های قدیمی‌تر"); assert.match(view.text(), /خواندن صفحهٔ بعد سابقه انجام نشد/);
  const historyLinks = view.all().filter(node => node.type === "a" && typeof node.props.href === "string" && node.props.href.includes("version="));
  assert.ok(historyLinks.some(node => String(node.props.href).includes(second))); assert.equal(view.readCalls[2].beforeVersion, 2); assert.match(view.text(), /۱٬۲۳۴ تومان/); view.unmount();
});


test("actual member page forwards only native owner/selected version and separates auth unavailable from login", async () => {
  const filename = resolve("app/(protected)/dashboard/goals/page.tsx"), local = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  async function page(user: { id: string } | null, error: unknown) {
    const taskModule = { exports: {} as { default: (props: unknown) => Promise<unknown> } };
    const load = (name: string) => {
      if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
      if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error }) } }) };
      if (name === "@/components/portfolio/goals/GoalsWorkspace") return function WorkspaceSeam(props: unknown) { return React.createElement("mock-workspace", props as object); };
      if (name.startsWith("@/components/") || name === "next/link") return function PresentationSeam(props: unknown) { return React.createElement("mock-presentation", props as object); };
      return local(name.startsWith("@/") ? resolve(name.slice(2)) : name);
    };
    new Function("require", "module", "exports", "React", code)(load, taskModule, taskModule.exports, React);
    return await taskModule.exports.default({ searchParams: Promise.resolve({ version: id }) });
  }
  const tree = await page({ id: owner }, null), workspace = nodes(tree).find(node => node.type === "mock-workspace");
  assert.match(words(tree), /فضای مالی شخصی · آرش صفری/);
  assert.ok(workspace); assert.equal(workspace.props.expectedOwnerId, owner); assert.equal(workspace.props.initialVersion, id);
  const failure = await page(null, { status: 503 }); assert.doesNotMatch(words(failure), /در این دوره هنوز نسخه‌ای/);
  assert.ok(nodes(failure).some(node => node.props.code === "GOALS_AUTH"));
  await assert.rejects(() => page(null, null), /REDIRECT:\/login/);
});
