import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { cashFlowDb, getCashFlow, postCashFlow, type CashFlowDb } from "./cashFlowServer";
import type { CashFlowPayload, CashFlowWriteRequest } from "./cashFlowApiContract";

const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002", id = "10000000-0000-0000-0000-000000000001";
const origin = "https://synthetic.example", path = `${origin}/api/personal-finance/cash-flow`, period = { startOn: "2026-10-01", endOn: "2026-10-31" };
function payload(): CashFlowPayload { return { contractVersion: 1, period, accountDefinitions: [{ accountKey: "bank", label: "بانک مصنوعی" }], scopeAccountKeys: ["bank"], opening: { amountToman: -100, atStartOn: period.startOn, source: { label: "اعلام عضو", observedOn: period.startOn } }, coverage: { planned: { status: "unknown", memberAffirmed: false, source: null }, actual: { status: "partial", memberAffirmed: false, source: null } }, entries: [{ entryKey: "income", basis: "actual", kind: "income", accountKey: "bank", amountToman: 1000, occurredOn: "2026-10-02", source: null, category: null, note: null }] }; }
function input(): CashFlowWriteRequest { return { contractVersion: "cash-flow-request.v1", expectedOwnerId: owner, clientToken: "synthetic-test-token", baseVersion: 0, payload: payload() }; }
function request(body: unknown = input(), requestOrigin: string | null = origin) { return new Request(path, { method: "POST", headers: { ...(requestOrigin === null ? {} : { origin: requestOrigin }), "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function header() { const p = payload(); return { id, user_id: owner, period_start: period.startOn, period_end: period.endOn, version: 1, account_definitions: p.accountDefinitions, scope_account_keys: p.scopeAccountKeys, opening: p.opening, coverage: p.coverage, entry_count: 1, created_at: "2026-10-20T00:00:00Z" }; }
function rows() { return [{ version_id: id, entry_key: "income", basis: "actual", kind: "income", amount_toman: 1000, occurred_on: "2026-10-02", source: null, category: null, note: null, account_key: "bank", from_account_key: null, to_account_key: null }]; }
const dbReceipt = (reused = false) => ({ contractVersion: "cash-flow-write.v1", version_id: id, version: 1, entry_count: 1, reused, canonical_content_hash: "a".repeat(64) });
function fixture() {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, args: unknown[]) => { calls.push({ method, args }); };
  const db: CashFlowDb = {
    async authenticate() { record("auth", []); return { user: { id: owner }, error: null }; },
    async latest(...args) { record("latest", args); return { data: header(), error: null }; },
    async selected(...args) { record("selected", args); return { data: header(), error: null }; },
    async entries(...args) { record("entries", args); return { data: rows(), error: null }; },
    async history(...args) { record("history", args); return { data: [{ id, user_id: owner, period_start: period.startOn, period_end: period.endOn, version: 1, created_at: "2026-10-20T00:00:00Z" }], error: null }; },
    async record(...args) { record("write", args); return { data: dbReceipt(), error: null }; },
  };
  return { db, calls, connect: async () => db };
}
const readRequest = (extra = "") => new Request(`${path}?startOn=${period.startOn}&endOn=${period.endOn}${extra}`);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
test("exact Origin and owner are checked before any write; forged payload keys rejected", async () => {
  for (const value of [null, "null", "https://foreign.example", `${origin}/`]) {
    const f = fixture(); const result = await postCashFlow(request(input(), value), f.connect);
    assert.equal(result.status, 403); assert.equal((await result.json()).code, "ORIGIN_FORBIDDEN"); assert.equal(f.calls.length, 0);
  }
  for (const body of [{ ...input(), expectedOwnerId: other }, { ...input(), ownerId: owner }, { ...input(), payload: { ...payload(), ownerId: owner } }]) {
    const f = fixture(); const result = await postCashFlow(request(body), f.connect);
    assert.equal(result.status, body.expectedOwnerId === other ? 403 : 400); assert.ok(!f.calls.some(call => call.method === "write"));
  }
});
test("native missing/rejected session401 differs from Auth infrastructure503; no RPC", async () => {
  for (const [error, status] of [[new AuthSessionMissingError(), 401], [{ status: 401 }, 401], [{ status: 503 }, 503], [new Error("network"), 503]] as const) {
    const f = fixture(); f.db.authenticate = async () => ({ user: { id: owner }, error });
    const result = await postCashFlow(request(), f.connect); assert.equal(result.status, status); assert.ok(!f.calls.some(call => call.method === "write"));
  }
});
test("stream cap counts Unicode bytes independent of false Content-Length, never invokes RPC", async () => {
  const f = fixture(); const req = new Request(path, { method: "POST", headers: { origin, "Content-Length": "2" }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('"' + "ی".repeat(500_000) + '"')); controller.close(); } }), duplex: "half" } as RequestInit);
  const result = await postCashFlow(req, f.connect); assert.equal(result.status, 413); assert.equal((await result.json()).code, "BODY_TOO_LARGE"); assert.ok(!f.calls.some(call => call.method === "write"));
  const bad = fixture(); assert.equal((await postCashFlow(new Request(path, { method: "POST", headers: { origin }, body: "{broken" }), bad.connect)).status, 400); assert.ok(!bad.calls.some(call => call.method === "write"));
});
test("late Auth and body preparation cannot start an RPC after deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); let finish!: (value: { user: { id: string }; error: null }) => void;
  f.db.authenticate = () => new Promise(resolve => { finish = resolve; });
  const pending = postCashFlow(request(), f.connect); await flush(); t.mock.timers.tick(10_000); assert.equal((await pending).status, 503);
  finish({ user: { id: owner }, error: null }); await flush(); assert.ok(!f.calls.some(call => call.method === "write"));
  const g = fixture(); const stalled = new Request(path, { method: "POST", headers: { origin }, body: new ReadableStream({ pull() { return new Promise(() => {}); } }), duplex: "half" } as RequestInit);
  const bodyPending = postCashFlow(stalled, g.connect); await flush(); t.mock.timers.tick(10_000); const result = await bodyPending;
  assert.equal(result.status, 503); assert.equal((await result.json()).code, "WRITE_UNAVAILABLE"); assert.ok(!g.calls.some(call => call.method === "write"));
});
test("write wait timeout is unknown even if ignored-abort RPC later commits; exact request supports replay", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const f = fixture(); let finish!: (value: { data: unknown; error: null }) => void; const received: unknown[] = [];
  f.db.record = async (value, signal) => { received.push(structuredClone(value)); assert.ok(signal instanceof AbortSignal); return new Promise(resolve => { finish = resolve; }); };
  const pending = postCashFlow(request(), f.connect); await flush(); t.mock.timers.tick(10_000);
  const result = await pending; assert.equal(result.status, 503); assert.equal((await result.json()).code, "WRITE_UNAVAILABLE");
  finish({ data: dbReceipt(), error: null }); await flush();
  f.db.record = async value => { received.push(structuredClone(value)); return { data: dbReceipt(true), error: null }; };
  const replay = await postCashFlow(request(), f.connect); assert.equal(replay.status, 200); assert.equal((await replay.json()).reused, true); assert.deepEqual(received[0], received[1]);
});
test("canonical receipts and SQL errors mapped without raw error details", async () => {
  const f = fixture(); const saved = await postCashFlow(request(), f.connect); assert.equal(saved.status, 201); assert.equal(saved.headers.get("cache-control"), "private, no-store"); const body = await saved.json(); assert.equal(body.ownerId, owner); assert.equal(body.versionId, id);
  for (const [code, status, expected] of [["22023", 400, "INVALID_INPUT"], ["23514", 400, "INVALID_INPUT"], ["42501", 403, "FORBIDDEN"], ["PT409", 409, "CONFLICT"], ["40001", 409, "CONFLICT"], ["08006", 503, "WRITE_UNAVAILABLE"]] as const) {
    const f = fixture(); f.db.record = async () => ({ data: null, error: { code, message: "private SQL details" } }); const result = await postCashFlow(request(), f.connect); assert.equal(result.status, status); const body = await result.json(); assert.equal(body.code, expected); assert.ok(!JSON.stringify(body).includes("private SQL"));
  }
  for (const data of [{ ...dbReceipt(), version: 2 }, { ...dbReceipt(), entry_count: 0 }, [dbReceipt()], null]) { const f = fixture(); f.db.record = async () => ({ data, error: null }); assert.equal((await postCashFlow(request(), f.connect)).status, 503); }
});
test("independent GET uses native owner, exact period/version, preserves unknown and negative opening", async () => {
  const f = fixture(); const result = await getCashFlow(readRequest(`&version=${id}&beforeVersion=2`), f.connect); assert.equal(result.status, 200);
  const body = await result.json(); assert.equal(body.snapshot.payload.opening.amountToman, -100); assert.equal(body.report.actual.knownNet, 1000); assert.equal(body.report.actual.netToman, null); assert.equal(body.report.planned.netToman, null);
  for (const call of f.calls.filter(call => ["selected", "history", "latest"].includes(call.method))) { assert.equal(call.args[0], owner); assert.deepEqual(call.args[1], period); }
  assert.equal(f.calls.find(call => call.method === "selected")?.args[2], id); assert.equal(f.calls.find(call => call.method === "history")?.args[2], 2);
});
test("entry error/count mismatch/duplicate/unsafe data never become empty or numeric report", async () => {
  for (const result of [{ data: null, error: { code: "08006" } }, { data: [], error: null }, { data: [...rows(), ...rows()], error: null }, { data: [{ ...rows()[0], amount_toman: Number.MAX_SAFE_INTEGER + 1 }], error: null }, { data: [{ ...rows()[0], version_id: other }], error: null }]) {
    const f = fixture(); f.db.entries = async () => result; const response = await getCashFlow(readRequest(), f.connect); assert.equal(response.status, 503); const body = await response.json(); assert.equal(body.code, "READ_UNAVAILABLE"); assert.equal(body.report, undefined);
  }
});
test("selected foreign/missing UUID404; malformed owned header503; invalid selection never queries DB", async () => {
  const f = fixture(); f.db.selected = async () => ({ data: null, error: null }); assert.equal((await getCashFlow(readRequest(`&version=${other}`), f.connect)).status, 404);
  const g = fixture(); g.db.selected = async () => ({ data: { ...header(), user_id: other }, error: null }); assert.equal((await getCashFlow(readRequest(`&version=${id}`), g.connect)).status, 503);
  for (const query of ["&ownerId=" + other, "&version=bad", "&beforeVersion=1.5", "&startOn=2026-10-02"]) { const f = fixture(); assert.equal((await getCashFlow(readRequest(query), f.connect)).status, 400); assert.equal(f.calls.length, 0); }
});
test("explicit selected data survives optional metadata error/hang; default latest failure is503", async t => {
  const f = fixture(); f.db.latest = async () => ({ data: null, error: { code: "08006" } }); f.db.history = async () => ({ data: null, error: { code: "08006" } });
  const result = await getCashFlow(readRequest(`&version=${id}`), f.connect); assert.equal(result.status, 200); const body = await result.json(); assert.equal(body.latest.state, "error"); assert.equal(body.history.state, "error"); assert.equal(body.report.actual.knownNet, 1000);
  assert.equal((await getCashFlow(readRequest(), f.connect)).status, 503);
  t.mock.timers.enable({ apis: ["setTimeout"] }); const g = fixture(); let reject!: (error: Error) => void;
  g.db.history = () => new Promise((_resolve, fail) => { reject = fail; }); const pending = getCashFlow(readRequest(`&version=${id}`), g.connect); await flush(); t.mock.timers.tick(7_500); const bounded = await pending;
  assert.equal(bounded.status, 200); assert.equal((await bounded.json()).history.state, "error"); reject(new Error("late ignored abort")); await flush();
});
test("true empty has no numeric report; bounded whole reader observes late rejection", async t => {
  const f = fixture(); f.db.latest = async () => ({ data: null, error: null }); f.db.history = async () => ({ data: [], error: null }); const result = await getCashFlow(readRequest(), f.connect); assert.equal(result.status, 200); const body = await result.json(); assert.equal(body.state, "empty"); assert.equal(body.report, null); assert.equal(body.latest.version, 0);
  t.mock.timers.enable({ apis: ["setTimeout"] }); const g = fixture(); let reject!: (error: Error) => void; g.db.entries = () => new Promise((_resolve, fail) => { reject = fail; }); const pending = getCashFlow(readRequest(), g.connect); await flush(); t.mock.timers.tick(10_000); assert.equal((await pending).status, 503); reject(new Error("late read")); await flush();
});
test("history pagination validates the lookahead and retains a truthful error on corruption", async () => {
  const f = fixture();
  const history = Array.from({ length: 21 }, (_, index) => ({ id: index === 0 ? id : `20000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`, user_id: owner, period_start: period.startOn, period_end: period.endOn, version: 30 - index, created_at: "2026-10-20T00:00:00Z" }));
  f.db.history = async () => ({ data: history, error: null }); f.db.latest = async () => ({ data: { ...header(), version: 30 }, error: null }); f.db.selected = async () => ({ data: { ...header(), version: 30 }, error: null });
  const response = await getCashFlow(readRequest(`&version=${id}&beforeVersion=31`), f.connect); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.history.items.length, 20); assert.equal(body.history.nextBeforeVersion, 11); assert.equal(body.latest.version, 30);
  history[20].user_id = other;
  const badLookahead = await getCashFlow(readRequest(`&version=${id}&beforeVersion=31`), f.connect); assert.equal(badLookahead.status, 200); const bad = await badLookahead.json(); assert.equal(bad.history.state, "error"); assert.equal(bad.history.nextBeforeVersion, null); assert.equal(bad.snapshot.version, 30);
});
test("slow Auth leaves optional metadata within the remaining whole-read budget", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] }); const f = fixture();
  f.db.authenticate = () => new Promise(resolve => setTimeout(() => resolve({ user: { id: owner }, error: null }), 3_000));
  f.db.history = () => new Promise(() => {});
  const pending = getCashFlow(readRequest(`&version=${id}`), f.connect); await flush(); t.mock.timers.tick(3_000); await flush(); t.mock.timers.tick(6_900);
  const response = await pending; assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.history.state, "error"); assert.equal(body.report.actual.knownNet, 1000);
});
test("SDK adapter queries retain owner/period predicates, limits, native RPC name and signal", async () => {
  const calls: unknown[][] = [];
  const builder = new Proxy({}, { get(_target, name) { if (name === "then") return undefined; return (...args: unknown[]) => { calls.push([name, ...args]); return builder; }; } });
  const client = { from: (...args: unknown[]) => { calls.push(["from", ...args]); return builder; }, rpc: (...args: unknown[]) => { calls.push(["rpc", ...args]); return builder; }, auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) } };
  const db = cashFlowDb(client as never), signal = new AbortController().signal;
  db.selected(owner, period, id, signal); db.latest(owner, period, signal); db.history(owner, period, 42, signal); db.entries(id, signal); db.record(input(), signal);
  assert.equal(calls.filter(call => call[0] === "eq" && call[1] === "user_id" && call[2] === owner).length, 3);
  assert.equal(calls.filter(call => call[0] === "eq" && call[1] === "period_start" && call[2] === period.startOn).length, 3);
  assert.ok(calls.some(call => call[0] === "lt" && call[1] === "version" && call[2] === 42)); assert.ok(calls.some(call => call[0] === "limit" && call[1] === 501)); assert.ok(calls.some(call => call[0] === "limit" && call[1] === 21));
  assert.equal(calls.filter(call => call[0] === "abortSignal" && call[1] === signal).length, 5); assert.deepEqual(calls.find(call => call[0] === "rpc"), ["rpc", "record_member_cash_flow", { p_payload: input().payload, p_client_token: input().clientToken, p_base_version: 0 }]);
});
