import assert from "node:assert/strict";
import { test } from "node:test";
import { cashFlowReport, validateCashFlowPayload, validateCashFlowRead, type CashFlowPayload, type CashFlowWriteRequest } from "./cashFlowApiContract";
import { createCashFlowAttempt, readCashFlow, sendCashFlowAttempt } from "./cashFlowRequest";

const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002", versionId = "10000000-0000-0000-0000-000000000001";
const period = { startOn: "2026-10-01", endOn: "2026-10-31" };
function payload(): CashFlowPayload {
  return { contractVersion: 1, period: { ...period }, accountDefinitions: [{ accountKey: "cash", label: "نقد" }, { accountKey: "bank", label: "بانک" }], scopeAccountKeys: ["cash"], opening: null,
    coverage: { planned: { status: "unknown", memberAffirmed: false, source: null }, actual: { status: "partial", memberAffirmed: false, source: null } },
    entries: [{ entryKey: "one", basis: "actual", kind: "transfer", fromAccountKey: "bank", toAccountKey: "cash", amountToman: null, occurredOn: null, source: null, category: null, note: null }] };
}
const request = (): CashFlowWriteRequest => ({ contractVersion: "cash-flow-request.v1", expectedOwnerId: owner, clientToken: "synthetic-retry-token", baseVersion: 0, payload: payload() });
const receipt = (reused = false) => ({ contractVersion: "cash-flow-write.v1", ownerId: owner, versionId, version: 1, entryCount: 1, reused, canonicalContentHash: "a".repeat(64) });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const apiError = (code: string) => ({ state: "error", code, error: "پیام آزمون" });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("immutable attempt preserves exact bytes across late commit and replay", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const input = request(), attempt = createCashFlowAttempt(input); input.payload.entries[0].note = "changed draft";
  assert.ok(Object.isFrozen(attempt)); assert.equal(JSON.parse(attempt.body).payload.entries[0].note, null);
  const bodies: unknown[] = []; let finish!: (value: Response) => void;
  const first = sendCashFlowAttempt(attempt, { currentOwnerId: owner, transport: async (_url, init) => { bodies.push(init?.body); return new Promise(resolve => { finish = resolve; }); } });
  await flush(); t.mock.timers.tick(15_000); assert.equal((await first).status, "unknown");
  finish(response(receipt(), 201)); await flush();
  const replay = await sendCashFlowAttempt(attempt, { currentOwnerId: owner, unresolvedPrior: true, transport: async (_url, init) => { bodies.push(init?.body); assert.equal(init?.credentials, "same-origin"); return response(receipt(true)); } });
  assert.equal(replay.status, "confirmed"); assert.deepEqual(bodies, [attempt.body, attempt.body]);
});
test("response body hangs and ignored-abort late rejection remain unknown without unhandled rejection", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); let reject!: (reason: Error) => void;
  const pending = sendCashFlowAttempt(createCashFlowAttempt(request()), { currentOwnerId: owner, transport: async () => ({ status: 201, json: () => new Promise((_resolve, fail) => { reject = fail; }) }) as Response });
  await flush(); t.mock.timers.tick(15_000); assert.equal((await pending).status, "unknown");
  reject(new Error("late synthetic body failure")); await flush();
});
test("owner transition prevents transport and cannot resolve an earlier unknown attempt", async () => {
  let calls = 0; const transport: typeof fetch = async () => { calls++; return response(receipt(), 201); };
  const attempt = createCashFlowAttempt(request());
  assert.equal((await sendCashFlowAttempt(attempt, { currentOwnerId: other, transport })).status, "rejected");
  assert.equal((await sendCashFlowAttempt(attempt, { currentOwnerId: null, transport, unresolvedPrior: true })).status, "unknown");
  assert.equal(calls, 0);
});
test("initial canonical rejection differs from later 4xx; conflicts retain prior uncertainty", async () => {
  const attempt = createCashFlowAttempt(request());
  for (const [status, code] of [[400, "INVALID_INPUT"], [401, "AUTH_REQUIRED"], [403, "OWNER_CHANGED"], [413, "BODY_TOO_LARGE"]] as const) {
    const transport: typeof fetch = async () => response(apiError(code), status);
    assert.equal((await sendCashFlowAttempt(attempt, { currentOwnerId: owner, transport })).status, "rejected");
    assert.equal((await sendCashFlowAttempt(attempt, { currentOwnerId: owner, transport, unresolvedPrior: true })).status, "unknown");
  }
  const conflict = await sendCashFlowAttempt(attempt, { currentOwnerId: owner, unresolvedPrior: true, transport: async () => response(apiError("CONFLICT"), 409) });
  assert.deepEqual(conflict, { status: "conflict", httpStatus: 409, error: apiError("CONFLICT"), priorUnresolved: true });
});
test("receipt mismatch, status mismatch, HTML and noncanonical errors never confirm/reject", async () => {
  const attempt = createCashFlowAttempt(request());
  for (const result of [response({ ...receipt(), ownerId: other }, 201), response({ ...receipt(), version: 2 }, 201), response({ ...receipt(), entryCount: 0 }, 201), response(receipt(), 200), response({ ...receipt(), extra: true }, 201), new Response("<html>failure</html>", { status: 503 }), response(apiError("INVALID_INPUT"), 403), response(apiError("WRITE_UNAVAILABLE"), 503), response(apiError("RATE_LIMITED"), 429)]) {
    assert.equal((await sendCashFlowAttempt(attempt, { currentOwnerId: owner, transport: async () => result })).status, "unknown");
  }
});
test("payload preserves unknown and boundary transfer; rejects forged ownership, duplicate refs, unsafe amounts/calendar and unaffirmed complete", () => {
  assert.deepEqual(validateCashFlowPayload(payload()), payload());
  for (const mutate of [
    (p: CashFlowPayload) => { Object.assign(p, { ownerId: other }); },
    (p: CashFlowPayload) => { Object.assign(p.entries[0], { ownerId: other }); },
    (p: CashFlowPayload) => { p.scopeAccountKeys.push("cash"); },
    (p: CashFlowPayload) => { p.entries[0].amountToman = Number.MAX_SAFE_INTEGER + 1; },
    (p: CashFlowPayload) => { p.entries[0].amountToman = -1; },
    (p: CashFlowPayload) => { p.entries[0].occurredOn = "2026-02-30"; },
    (p: CashFlowPayload) => { p.entries[0].occurredOn = "2026-11-01"; },
    (p: CashFlowPayload) => { p.coverage.actual = { status: "complete", memberAffirmed: false, source: { label: "اعلام عضو", observedOn: "2026-10-01" } }; },
    (p: CashFlowPayload) => { p.entries.push(structuredClone(p.entries[0])); },
  ]) { const p = payload(); mutate(p); assert.throws(() => validateCashFlowPayload(p)); }
  const signed = payload(); signed.opening = { amountToman: -10, atStartOn: period.startOn, source: null }; assert.equal(validateCashFlowPayload(signed).opening?.amountToman, -10);
});
function ready() {
  const p = payload(); return { contractVersion: "cash-flow-read.v1", state: "ready", ownerId: owner, period,
    snapshot: { id: versionId, version: 1, createdAt: "2026-10-20T00:00:00Z", payload: p }, report: cashFlowReport(p, owner),
    latest: { state: "ready", id: versionId, version: 1 }, history: { state: "ready", items: [{ id: versionId, version: 1, createdAt: "2026-10-20T00:00:00Z" }], nextBeforeVersion: null } };
}
test("canonical independent read retains unknown and partial history without erasing selected snapshot", async () => {
  const result = ready(); result.latest = { state: "error", id: null, version: null } as never; result.history = { state: "error", items: [], nextBeforeVersion: null };
  const read = await readCashFlow({ period, version: versionId, transport: async url => { assert.match(String(url), /version=10000000/); return response(result); } });
  assert.equal(read.status, "ready"); assert.equal(read.data.report?.actual.netToman, null); assert.equal(read.data.history.state, "error");
  assert.throws(() => validateCashFlowRead(result, { period }));
});
test("read checks owner/period/version and report integrity rather than accepting plausible totals", () => {
  assert.throws(() => validateCashFlowRead(ready(), { period, ownerId: other }));
  assert.throws(() => validateCashFlowRead(ready(), { period, version: other }));
  const wrong = ready(); wrong.report.actual.netToman = 0; assert.throws(() => validateCashFlowRead(wrong, { period }));
  const history = ready(); history.history.items.push({ ...history.history.items[0] }); assert.throws(() => validateCashFlowRead(history, { period }));
});
test("empty has no numeric report; malformed or body-stalled read is an error", async t => {
  const empty = { contractVersion: "cash-flow-read.v1", state: "empty", ownerId: owner, period, snapshot: null, report: null, latest: { state: "ready", id: null, version: 0 }, history: { state: "ready", items: [], nextBeforeVersion: null } };
  assert.equal((await readCashFlow({ period, transport: async () => response(empty) })).status, "empty");
  assert.equal((await readCashFlow({ period, transport: async () => response({ ...empty, report: {} }) })).status, "error");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = readCashFlow({ period, transport: async () => ({ status: 200, json: () => new Promise(() => {}) }) as Response });
  await flush(); t.mock.timers.tick(10_000); assert.equal((await pending).status, "error");
});
