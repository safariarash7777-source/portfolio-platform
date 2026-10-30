import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { declaredInstallmentTotal, validateDebtPaymentPayload, validateDebtPaymentReceipt, validateDebtPaymentsRead, type DebtPaymentPayload, type DebtPaymentReceipt, type DebtPaymentRecord, type DebtPaymentRequest, type DebtPaymentsReady } from "./debtPayments";
import { getDebtPayments, postDebtPayment, type DebtPaymentsDb } from "./debtPaymentsServer";
import { createDebtPaymentAttempt, readDebtPayments, recoverDebtPayment, sendDebtPayment } from "./debtPaymentsRequest";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", H = "33333333-3333-4333-8333-333333333333", C = "44444444-4444-4444-8444-444444444444", P = "55555555-5555-4555-8555-555555555555", R = "66666666-6666-4666-8666-666666666666";
const period = { startOn: "2026-10-01", endOn: "2026-10-31" };
const payload: DebtPaymentPayload = { contractVersion: 1, paymentKey: P, holdingVersionId: H, debtKey: "debt", dueOn: "2026-10-25", cashFlowVersionId: C, entryKey: "partial-one", reference: null };
const request: DebtPaymentRequest = { contractVersion: "debt-payment-request.v1", expectedActorId: A, clientToken: "synthetic-pf10", baseVersion: 0, period, payload };
const receipt: DebtPaymentReceipt = { contractVersion: "debt-payment-write.v1", actorId: A, clientToken: request.clientToken, id: R, sequence: 1, version: 1, canonicalContentHash: "a".repeat(64), payload, period, reused: false };
const ready: DebtPaymentsReady = { contractVersion: "debt-payment-read.v1", state: "ready", actorId: A, consistencyKey: "a".repeat(64), basis: { id: H, version: 2, latestId: H, latestVersion: 2, historical: false }, period, sourceVersion: { id: C, version: 1 }, installments: [{ debtKey: "debt", title: "قسط مصنوعی", dueOn: "2026-10-25", installmentToman: 10000 }], sources: [{ entryKey: "partial-one", amountToman: 3000, occurredOn: "2026-10-25", unit: "IRT", note: null }], history: { items: [], nextBeforeSequence: null }, writeAllowed: true };
const selection = { holdingVersionId: H, period };
const post = (body: unknown = request, origin: string | null = "http://localhost") => new Request("http://localhost/api/personal-finance/debt-payments", { method: "POST", headers: { ...(origin === null ? {} : { origin }), "content-type": "application/json" }, body: JSON.stringify(body) });
function fixture(options: { actor?: string | null; authError?: unknown; missing?: string; read?: unknown; prior?: unknown } = {}) {
  const calls: string[] = [];
  const db: DebtPaymentsDb = { async authenticate() { return { user: options.actor === null ? null : { id: options.actor ?? A }, error: options.authError ?? null }; }, async rpc(name) {
    calls.push(name);
    if (options.missing) return { data: null, error: { code: options.missing } };
    return { error: null, data: name === "lookup_member_debt_payment" ? options.prior ?? { contractVersion: "debt-payment-lookup.v1", actorId: A, status: "unknown", receipt: null } : name === "load_member_debt_payments" ? options.read ?? ready : receipt };
  } };
  return { calls, connect: async () => db };
}
test("PF10 metadata cannot carry duplicate money, paid status or a guessed split", () => {
  for (const extra of [{ amountToman: 3000 }, { principal: 3000 }, { paid: true }, { occurredOn: "2026-10-25" }]) assert.throws(() => validateDebtPaymentPayload({ ...payload, ...extra }));
  for (const patch of [{ dueOn: "2026-02-31" }, { reference: "x".repeat(161) }, { holdingVersionId: "foreign" }]) assert.throws(() => validateDebtPaymentPayload({ ...payload, ...patch }));
  assert.equal(validateDebtPaymentPayload({ ...payload, reference: "  " }).reference, null);
});
test("PF10 known declaration totals use one current head per payment; unknown split stays null", () => {
  const record: DebtPaymentRecord = { id: R, sequence: 1, version: 1, createdAt: "2026-10-30T08:00:00Z", payload, period, amountToman: 3000, occurredOn: "2026-10-25", unit: "IRT", sourceState: "current", latestForPayment: true, basisCurrent: true, allocation: null };
  const second = { ...record, id: B, sequence: 2, payload: { ...payload, paymentKey: B, entryKey: "partial-two" }, amountToman: 2000 };
  assert.equal(declaredInstallmentTotal([record, second], payload), 5000);
  assert.equal(declaredInstallmentTotal([{ ...record, amountToman: 15000 }], payload), 15000);
  assert.equal(declaredInstallmentTotal([{ ...record, sourceState: "stale" }], payload), null);
  assert.equal(declaredInstallmentTotal([{ ...record, basisCurrent: false }], payload), null);
  assert.equal(declaredInstallmentTotal([{ ...record, amountToman: 0 }], payload), 0);
  assert.equal(declaredInstallmentTotal([record, record], payload), null);
});
for (const code of ["42883", "42P01", "42703", "PGRST202", "PGRST205"]) test(`PF10 reader-first ${code}: unavailable is not empty; POST cannot reach write RPC`, async () => {
  const f = fixture({ missing: code });
  const response = await getDebtPayments(new Request(`http://localhost/pf10?holdingVersionId=${H}&startOn=${period.startOn}&endOn=${period.endOn}`), f.connect);
  const body = validateDebtPaymentsRead(await response.json(), selection, A);
  assert.equal(body.state, "unavailable"); assert.equal(body.writeAllowed, false);
  const denied = await postDebtPayment(post(), f.connect); assert.equal(denied.status, 409);
  assert.ok(!f.calls.includes("record_member_debt_payment"));
});
for (const authError of [{ status: 503 }, { status: 429 }]) test("PF10 unverified user+error cannot load or write", async () => {
  const f = fixture({ authError }); assert.equal((await postDebtPayment(post(), f.connect)).status, 503); assert.deepEqual(f.calls, []);
});
test("PF10 rejects foreign actor and wrong/missing origin before write", async () => {
  const f = fixture({ actor: B }); assert.equal((await postDebtPayment(post(), f.connect)).status, 403); assert.deepEqual(f.calls, []);
  for (const origin of [null, "https://foreign.invalid"]) { let connects = 0; assert.equal((await postDebtPayment(post(request, origin), async () => { connects++; return fixture().connect(); })).status, 403); assert.equal(connects, 0); }
});
test("PF10 historical or stale source read cannot reach record RPC", async () => {
  for (const read of [{ ...ready, basis: { ...ready.basis, latestId: B, latestVersion: 3, historical: true }, writeAllowed: false }, { ...ready, sourceVersion: { id: B, version: 2 } }]) {
    const f = fixture({ read }); assert.equal((await postDebtPayment(post(), f.connect)).status, 409); assert.ok(!f.calls.includes("record_member_debt_payment"));
  }
});
test("PF10 independent existing receipt resolves before newer basis validation; mismatch never writes", async () => {
  const prior = { contractVersion: "debt-payment-lookup.v1", actorId: A, status: "found", receipt: { ...receipt, reused: true } };
  const f = fixture({ prior, read: null }); assert.equal((await postDebtPayment(post(), f.connect)).status, 200); assert.deepEqual(f.calls, ["lookup_member_debt_payment"]);
  const wrong = fixture({ prior: { ...prior, receipt: { ...receipt, payload: { ...payload, reference: "different" } } } });
  assert.equal((await postDebtPayment(post(), wrong.connect)).status, 409); assert.deepEqual(wrong.calls, ["lookup_member_debt_payment"]);
});
test("PF10 missing read table does not become a valid empty history or open writer", async () => {
  const f = fixture({ read: { ...ready, sources: [{ ...ready.sources[0], amountToman: null }] } });
  const response = await postDebtPayment(post(), f.connect); assert.equal(response.status, 503); assert.ok(!f.calls.includes("record_member_debt_payment"));
  const outcome = await readDebtPayments(selection, { transport: async () => Response.json({ ...ready, actorId: B }), actorId: A }); assert.equal(outcome.status, "error");
});
test("PF10 lost response preserves frozen bytes; recovery is GET-only and confirms exact payload", async () => {
  const attempt = createDebtPaymentAttempt(request), bodies: string[] = [], methods: string[] = [];
  const transport: typeof fetch = async (_url, options) => {
    methods.push(options?.method ?? "GET");
    if (options?.method === "POST") { bodies.push(String(options.body)); throw Error("Synthetic committed response lost"); }
    return Response.json({ contractVersion: "debt-payment-lookup.v1", actorId: A, status: "found", receipt: { ...receipt, reused: true } });
  };
  assert.equal((await sendDebtPayment(attempt, { actorId: A, transport })).status, "unknown");
  assert.equal((await recoverDebtPayment(attempt, { actorId: A, transport })).status, "confirmed");
  assert.deepEqual(methods, ["POST", "GET"]); assert.equal(bodies[0], attempt.body); assert.ok(Object.isFrozen(attempt));
});
test("PF10 absent receipt, changed actor, bad receipt and noncanonical errors never replay automatically", async () => {
  const attempt = createDebtPaymentAttempt(request); let posts = 0;
  const transport: typeof fetch = async (_url, options) => { if (options?.method === "POST") posts++; return Response.json({ contractVersion: "debt-payment-lookup.v1", actorId: A, status: "unknown", receipt: null }); };
  assert.equal((await recoverDebtPayment(attempt, { actorId: A, transport })).status, "unknown"); assert.equal(posts, 0);
  assert.equal((await sendDebtPayment(attempt, { actorId: B, transport })).status, "unknown"); assert.equal(posts, 0);
  for (const patch of [{ actorId: B }, { version: 2 }, { payload: { ...payload, entryKey: "other" } }, { period: { ...period, endOn: "2026-10-30" } }]) assert.throws(() => validateDebtPaymentReceipt({ ...receipt, ...patch }, request));
  for (const status of [400, 409, 429, 503]) assert.equal((await sendDebtPayment(attempt, { actorId: A, transport: async () => Response.json({ error: "gateway" }, { status }) })).status, "unknown");
});

// Executes the actual workspace handlers and request validators with synthetic
// native Auth/read seams. This is not DOM, browser or real account acceptance.
type Element = React.ReactElement<Record<string, unknown>>;
const nodeText = (node: unknown): string => Array.isArray(node) ? node.map(nodeText).join("") : React.isValidElement(node) ? nodeText((node.props as { children?: unknown }).children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
function mountPayments(transport: typeof fetch, owner: string = A) {
  const slots: unknown[] = [], effects: (() => void)[] = [], events = new EventTarget(); let index = 0, tree: unknown;
  let authChanged: (event: string, session: { user: { id: string } } | null) => void = () => {};
  const hooks = { ...React,
    useState(initial: unknown) { const key = index++; if (!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial; return [slots[key], (next: unknown) => { slots[key] = typeof next === "function" ? next(slots[key]) : next; }]; },
    useRef(initial: unknown) { const key = index++; if (!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
    useCallback(callback: unknown, deps: unknown[]) { const key = index++, old = slots[key] as { deps: unknown[]; callback: unknown } | undefined; if (!old || deps.some((v, i) => !Object.is(v, old.deps[i]))) slots[key] = { deps, callback }; return (slots[key] as { callback: unknown }).callback; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) { const key = index++, old = slots[key] as { deps: unknown[]; cleanup?: () => void } | undefined; if (!old || deps.some((v, i) => !Object.is(v, old.deps[i]))) effects.push(() => { old?.cleanup?.(); const cleanup = effect(); slots[key] = { deps, cleanup }; }); },
  };
  const filename = resolve("components/portfolio/debt-payments/DebtPaymentsWorkspace.tsx"), local = createRequire(filename), mod = { exports: {} as { default: (props: unknown) => unknown } };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
  new Function("require", "module", "exports", "window", code)((name: string) => {
    if (name === "react") return hooks;
    if (name === "@/lib/supabase/client") return { createClient: () => ({ auth: { onAuthStateChange(callback: typeof authChanged) { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; }, async getUser() { return { data: { user: { id: owner } }, error: null }; } } }) };
    if (name === "@/lib/portfolio/debtPaymentsRequest") return { createDebtPaymentAttempt, readDebtPayments: (s: Parameters<typeof readDebtPayments>[0], o: Parameters<typeof readDebtPayments>[1]) => readDebtPayments(s, { ...o, transport }), recoverDebtPayment: (a: Parameters<typeof recoverDebtPayment>[0], o: Parameters<typeof recoverDebtPayment>[1]) => recoverDebtPayment(a, { ...o, transport }), sendDebtPayment: (a: Parameters<typeof sendDebtPayment>[0], o: Parameters<typeof sendDebtPayment>[1]) => sendDebtPayment(a, { ...o, transport }) };
    return local(name.startsWith("@/") ? resolve(name.slice(2)) : name);
  }, mod, mod.exports, events);
  const render = () => { index = 0; tree = mod.exports.default({ holdingVersionId: H, initialPeriod: period }); effects.splice(0).forEach(effect => effect()); };
  const flatten = (node: unknown): Element[] => Array.isArray(node) ? node.flatMap(flatten) : React.isValidElement(node) ? [node as Element, ...flatten(typeof node.type === "function" ? (node.type as (p: unknown) => unknown)(node.props) : (node.props as { children?: unknown }).children)] : [];
  const elements = () => flatten(tree);
  const find = (type: string, predicate: (item: Element) => boolean) => { const found = elements().find(item => item.type === type && predicate(item)); assert.ok(found, `PF10 UI ${type} absent`); return found; };
  const flush = async () => { for (let n = 0; n < 16; n++) await new Promise<void>(resolve => setImmediate(resolve)); render(); };
  const click = async (label: string) => { const button = find("button", item => nodeText(item).includes(label)); assert.equal(Boolean(button.props.disabled), false); await (button.props.onClick as () => unknown)(); await flush(); };
  const change = (type: string, predicate: (item: Element) => boolean, value: string) => { const field = find(type, predicate); assert.equal(Boolean(field.props.disabled), false); (field.props.onChange as (e: { target: { value: string } }) => void)({ target: { value } }); render(); };
  render(); return { flush, click, change, elements, find, text: () => nodeText(tree), authChanged: (id: string | null) => { authChanged(id ? "TOKEN_REFRESHED" : "SIGNED_OUT", id ? { user: { id } } : null); render(); }, beforeUnload: () => { const event = new Event("beforeunload", { cancelable: true }); events.dispatchEvent(event); return event.defaultPrevented; }, submit: async () => { const form = find("form", () => true); (form.props.onSubmit as (e: { preventDefault(): void }) => void)({ preventDefault() {} }); await flush(); } };
}
test("PF10 real workspace locks unknown intent, uses GET recovery + independent history, retains expense amount and clears on account switch", async () => {
  let committed: DebtPaymentReceipt | null = null;
  const methods: string[] = [], posts: string[] = [];
  const transport: typeof fetch = async (url, options) => {
    methods.push(options?.method ?? "GET");
    if (options?.method === "POST") { posts.push(String(options.body)); const req = JSON.parse(posts.at(-1)!); committed = { ...receipt, payload: req.payload, clientToken: req.clientToken }; throw Error("Synthetic committed response loss"); }
    if (String(url).includes("clientToken=")) return Response.json({ contractVersion: "debt-payment-lookup.v1", actorId: A, status: "found", receipt: { ...committed!, reused: true } });
    return Response.json({ ...ready, history: { items: committed ? [{ id: committed.id, sequence: 1, version: 1, createdAt: "2026-10-30T08:00:00Z", payload: committed.payload, period, amountToman: 3000, occurredOn: "2026-10-25", unit: "IRT", sourceState: "current", latestForPayment: true, basisCurrent: true, allocation: null }] : [], nextBeforeSequence: null } });
  };
  const ui = mountPayments(transport); await ui.flush();
  ui.change("select", item => nodeText(item).includes("انتخاب قسط"), "debt");
  ui.change("select", item => nodeText(item).includes("انتخاب هزینه"), "partial-one");
  ui.change("input", item => item.props.maxLength === 160, "ارجاع خصوصی مصنوعی"); assert.equal(ui.beforeUnload(), true);
  assert.equal(ui.elements().some(item => item.type === "input" && item.props.type === "number"), false);
  await ui.submit(); assert.equal(posts.length, 1); assert.equal(ui.beforeUnload(), true);
  assert.ok(ui.elements().filter(item => ["input", "select"].includes(String(item.type))).every(item => item.props.disabled));
  assert.equal(ui.elements().some(item => item.type === "button" && nodeText(item).includes("تکرار دقیق")), false);
  await ui.click("بازخوانی رسید همین ثبت"); assert.equal(posts.length, 1); assert.equal(ui.beforeUnload(), false); assert.deepEqual(methods, ["GET", "POST", "GET", "GET"]);
  assert.match(ui.text(), /مستقل بازخوانی شد/); ui.authChanged(B); assert.doesNotMatch(ui.text(), /ارجاع خصوصی مصنوعی|ثبت و مستقل/); assert.equal(ui.elements().some(item => item.type === "form"), false);
});
test("PF10 actual workspace absence and historical basis close controls; an absent receipt never posts", async () => {
  for (const body of [{ contractVersion: "debt-payment-read.v1", state: "unavailable", actorId: A, holdingVersionId: H, period, reason: "not_installed", writeAllowed: false }, { ...ready, basis: { ...ready.basis, latestId: B, latestVersion: 3, historical: true }, writeAllowed: false }]) {
    let posts = 0; const ui = mountPayments(async (_url, options) => { if (options?.method === "POST") posts++; return Response.json(body); }); await ui.flush();
    assert.ok(ui.elements().filter(item => item.type === "select").every(item => item.props.disabled)); assert.equal(posts, 0); assert.equal(ui.beforeUnload(), false);
  }
  let posts = 0; const ui = mountPayments(async (url, options) => {
    if (options?.method === "POST") { posts++; throw Error("Synthetic unknown"); }
    return Response.json(String(url).includes("clientToken=") ? { contractVersion: "debt-payment-lookup.v1", actorId: A, status: "unknown", receipt: null } : ready);
  }); await ui.flush(); ui.change("select", item => nodeText(item).includes("انتخاب قسط"), "debt"); ui.change("select", item => nodeText(item).includes("انتخاب هزینه"), "partial-one"); await ui.submit(); await ui.click("بازخوانی رسید همین ثبت"); assert.equal(posts, 1); assert.equal(ui.beforeUnload(), true);
  ui.authChanged(null); assert.equal(ui.elements().some(item => item.type === "form"), false);
});

const historyRecord = (sequence: number, reference: string | null = null): DebtPaymentRecord => ({ id: `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`, sequence, version: sequence, createdAt: "2026-10-30T08:00:00Z", payload: { ...payload, reference }, period, amountToman: 3000, occurredOn: "2026-10-25", unit: "IRT", sourceState: "current", latestForPayment: true, basisCurrent: true, allocation: null });
const allParagraphs = (ui: ReturnType<typeof mountPayments>) => ui.elements().filter(item => item.type === "p").map(nodeText).join("\n");
for (const failure of ["network", "timeout"]) test(`PF10 actual async workspace success→${failure} preserves snapshot/draft but never confirms stale current labels or total`, async t => {
  const loaded = { ...ready, history: { items: [historyRecord(1)], nextBeforeSequence: null } };
  let reads = 0, posts = 0;
  const ui = mountPayments(async (_url, options) => {
    if (options?.method === "POST") { posts++; throw Error("writer should be closed"); }
    reads++;
    if (reads === 2) { if (failure === "network") throw Error("Synthetic read failure"); return new Promise<Response>(() => {}); }
    return Response.json(loaded);
  });
  await ui.flush(); ui.change("select", item => nodeText(item).includes("انتخاب قسط"), "debt"); ui.change("select", item => nodeText(item).includes("انتخاب هزینه"), "partial-one"); ui.change("input", item => item.props.maxLength === 160, "پیش‌نویس محفوظ");
  assert.match(allParagraphs(ui), /نسخهٔ هزینه جاری است/); assert.match(allParagraphs(ui), /جمع اعلام‌های جاریِ خوانده‌شده/);
  if (failure === "timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
  await ui.click("بازخوانی مبنا و سابقه");
  // An unfinished read already invalidates a current-state presentation.
  assert.doesNotMatch(allParagraphs(ui), /نسخهٔ هزینه جاری است|جمع اعلام‌های جاریِ خوانده‌شده/);
  if (failure === "timeout") { assert.match(ui.text(), /در حال خواندن/); t.mock.timers.tick(10_000); await ui.flush(); t.mock.timers.reset(); }
  assert.match(allParagraphs(ui), /خواندن تازه تأیید نشده/); assert.match(allParagraphs(ui), /جمع جاری این قسط تأیید نشده/);
  assert.ok(ui.elements().filter(item => ["input", "select"].includes(String(item.type)) && item.props.type !== "date").every(item => item.props.disabled));
  assert.equal(ui.find("input", item => item.props.maxLength === 160).props.value, "پیش‌نویس محفوظ"); assert.equal(ui.find("select", item => nodeText(item).includes("انتخاب هزینه")).props.value, "partial-one");
  assert.match(allParagraphs(ui), /هزینهٔ مبنا:/); assert.equal(ui.beforeUnload(), true); await ui.submit(); assert.equal(posts, 0);
  await ui.click("بازخوانی مبنا و سابقه"); assert.match(allParagraphs(ui), /نسخهٔ هزینه جاری است/); assert.match(allParagraphs(ui), /جمع اعلام‌های جاریِ خوانده‌شده/); assert.equal(ui.find("input", item => item.props.maxLength === 160).props.value, "پیش‌نویس محفوظ");
});

for (const change of ["payment correction", "cash-flow revision in another history period"]) test(`PF10 actual workspace page1→${change}→page2 refuses mixed coverage and requires restart`, async () => {
  const firstPage = { ...ready, history: { items: Array.from({ length: 50 }, (_, i) => ({ ...historyRecord(100 - i), latestForPayment: i === 0 })), nextBeforeSequence: 51 } };
  if (change === "cash-flow revision in another history period") firstPage.history.items[0] = { ...firstPage.history.items[0], period: { startOn: "2026-09-01", endOn: "2026-09-30" }, occurredOn: "2026-09-25", payload: { ...firstPage.history.items[0].payload, cashFlowVersionId: "77777777-7777-4777-8777-777777777777" } };
  const nextPage = { ...ready, consistencyKey: "b".repeat(64), history: { items: [{ ...historyRecord(50, "صفحهٔ دوم تازه"), latestForPayment: false }], nextBeforeSequence: null } };
  // Financial and selected CF IDs intentionally stay unchanged. Native tests
  // separately prove that real corrections/other-period CF writes change key.
  assert.equal(firstPage.basis.latestId, nextPage.basis.latestId); assert.equal(firstPage.sourceVersion?.id, nextPage.sourceVersion?.id);
  let contextChanged = false, restarted = false;
  const ui = mountPayments(async url => Response.json(String(url).includes("beforeSequence=") ? nextPage : contextChanged ? (restarted = true, { ...firstPage, consistencyKey: nextPage.consistencyKey }) : firstPage));
  await ui.flush(); contextChanged = true; await ui.click("خواندن سابقهٔ قدیمی‌تر");
  assert.match(ui.text(), /فهرست را از ابتدا بازخوانی کنید/); assert.doesNotMatch(allParagraphs(ui), /صفحهٔ دوم تازه|نسخهٔ هزینه جاری است/);
  assert.equal(ui.elements().filter(item => item.type === "li").length, 50);
  assert.ok(ui.elements().filter(item => item.type === "select").every(item => item.props.disabled));
  assert.equal(ui.find("button", item => nodeText(item).includes("خواندن سابقهٔ قدیمی‌تر")).props.disabled, true);
  await ui.click("بازخوانی مبنا و سابقه"); assert.equal(restarted, true); assert.match(allParagraphs(ui), /نسخهٔ هزینه جاری است/); assert.equal(ui.find("button", item => nodeText(item).includes("خواندن سابقهٔ قدیمی‌تر")).props.disabled, false);
});
test("PF10 actual workspace merges a later page only with matching consistency witness", async () => {
  const firstPage = { ...ready, history: { items: Array.from({ length: 50 }, (_, i) => ({ ...historyRecord(100 - i), latestForPayment: i === 0 })), nextBeforeSequence: 51 } };
  const ui = mountPayments(async url => Response.json(String(url).includes("beforeSequence=") ? { ...ready, history: { items: [{ ...historyRecord(50, "صفحهٔ دوم سازگار"), latestForPayment: false }], nextBeforeSequence: null } } : firstPage));
  await ui.flush(); await ui.click("خواندن سابقهٔ قدیمی‌تر"); assert.equal(ui.elements().filter(item => item.type === "li").length, 51, ui.text()); assert.match(allParagraphs(ui), /صفحهٔ دوم سازگار/); assert.doesNotMatch(ui.text(), /از ابتدا بازخوانی/);
});
test("PF10 missing or malformed consistency witness fails closed before workspace or writer", async () => {
  for (const consistencyKey of [undefined, null, "", "a".repeat(63), "G".repeat(64)]) {
    const result = await readDebtPayments(selection, { actorId: A, transport: async () => Response.json({ ...ready, consistencyKey }) }); assert.equal(result.status, "error");
  }
});
