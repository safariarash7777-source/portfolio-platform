import assert from "node:assert/strict";
import { test } from "node:test";
import { type GoalsPayload, type GoalsWriteRequest } from "./goalsApiContract";
import { createGoalsAttempt, readGoals, sendGoalsAttempt } from "./goalsRequest";

const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002", versionId = "10000000-0000-0000-0000-000000000001";
function payload(): GoalsPayload { return { contractVersion:1, goals:[{goalKey:"one",title:"ذخیره",targetAmountToman:1000,targetOn:"2027-01-01",declaredSavedToman:null,source:null,note:null}] }; }
const request = (): GoalsWriteRequest => ({ contractVersion: "goals-request.v1", expectedOwnerId: owner, clientToken: "synthetic-retry-token", baseVersion: 0, payload: payload() });
const receipt = (reused = false) => ({ contractVersion: "goals-write.v1", ownerId: owner, versionId, version: 1, goalCount: 1, reused, canonicalContentHash: "a".repeat(64) });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const apiError = (code: string) => ({ state: "error", code, error: "پیام آزمون" });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("immutable attempt preserves exact bytes across late commit and replay", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const input = request(), attempt = createGoalsAttempt(input); input.payload.goals[0].note = "changed draft";
  assert.ok(Object.isFrozen(attempt)); assert.equal(JSON.parse(attempt.body).payload.goals[0].note, null);
  const bodies: unknown[] = []; let finish!: (value: Response) => void;
  const first = sendGoalsAttempt(attempt, { currentOwnerId: owner, transport: async (_url, init) => { bodies.push(init?.body); return new Promise(resolve => { finish = resolve; }); } });
  await flush(); t.mock.timers.tick(15_000); assert.equal((await first).status, "unknown");
  finish(response(receipt(), 201)); await flush();
  const replay = await sendGoalsAttempt(attempt, { currentOwnerId: owner, unresolvedPrior: true, transport: async (_url, init) => { bodies.push(init?.body); assert.equal(init?.credentials, "same-origin"); return response(receipt(true)); } });
  assert.equal(replay.status, "confirmed"); assert.deepEqual(bodies, [attempt.body, attempt.body]);
});
test("response body hangs and ignored-abort late rejection remain unknown without unhandled rejection", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); let reject!: (reason: Error) => void;
  const pending = sendGoalsAttempt(createGoalsAttempt(request()), { currentOwnerId: owner, transport: async () => ({ status: 201, json: () => new Promise((_resolve, fail) => { reject = fail; }) }) as Response });
  await flush(); t.mock.timers.tick(15_000); assert.equal((await pending).status, "unknown");
  reject(new Error("late synthetic body failure")); await flush();
});
test("owner transition prevents transport and cannot resolve an earlier unknown attempt", async () => {
  let calls = 0; const transport: typeof fetch = async () => { calls++; return response(receipt(), 201); };
  const attempt = createGoalsAttempt(request());
  assert.equal((await sendGoalsAttempt(attempt, { currentOwnerId: other, transport })).status, "rejected");
  assert.equal((await sendGoalsAttempt(attempt, { currentOwnerId: null, transport, unresolvedPrior: true })).status, "unknown");
  assert.equal(calls, 0);
});
test("initial canonical rejection differs from later 4xx; conflicts retain prior uncertainty", async () => {
  const attempt = createGoalsAttempt(request());
  for (const [status, code] of [[400, "INVALID_INPUT"], [401, "AUTH_REQUIRED"], [403, "OWNER_CHANGED"], [413, "BODY_TOO_LARGE"]] as const) {
    const transport: typeof fetch = async () => response(apiError(code), status);
    assert.equal((await sendGoalsAttempt(attempt, { currentOwnerId: owner, transport })).status, "rejected");
    assert.equal((await sendGoalsAttempt(attempt, { currentOwnerId: owner, transport, unresolvedPrior: true })).status, "unknown");
  }
  const conflict = await sendGoalsAttempt(attempt, { currentOwnerId: owner, unresolvedPrior: true, transport: async () => response(apiError("CONFLICT"), 409) });
  assert.deepEqual(conflict, { status: "conflict", httpStatus: 409, error: apiError("CONFLICT"), priorUnresolved: true });
});
test("receipt mismatch, status mismatch, HTML and noncanonical errors never confirm/reject", async () => {
  const attempt = createGoalsAttempt(request());
  for (const result of [response({ ...receipt(), ownerId: other }, 201), response({ ...receipt(), version: 2 }, 201), response({ ...receipt(), goalCount: 0 }, 201), response(receipt(), 200), response({ ...receipt(), extra: true }, 201), new Response("<html>failure</html>", { status: 503 }), response(apiError("INVALID_INPUT"), 403), response(apiError("WRITE_UNAVAILABLE"), 503), response(apiError("RATE_LIMITED"), 429)]) {
    assert.equal((await sendGoalsAttempt(attempt, { currentOwnerId: owner, transport: async () => result })).status, "unknown");
  }
});


test("independent read rejects wrong selected id, inconsistent latest/history and malformed saved source",async()=>{
 const metadata={id:versionId,version:1,createdAt:"2026-10-23T00:00:00Z"};
 const good={contractVersion:"goals-read.v1",state:"ready",ownerId:owner,snapshot:{...metadata,payload:payload()},latest:{state:"ready",id:versionId,version:1},history:{state:"ready",items:[metadata],nextBeforeVersion:null}};
 const transport:typeof fetch=async()=>response(good);
 assert.equal((await readGoals({version:versionId,transport})).status,"ready");
 for(const bad of [{...good,snapshot:{...good.snapshot,id:other}},{...good,latest:{...good.latest,version:0,id:null}},{...good,history:{...good.history,items:[metadata,metadata]}},{...good,snapshot:{...good.snapshot,payload:{contractVersion:1,goals:[{...payload().goals[0],declaredSavedToman:1}]}}}]) {
  assert.equal((await readGoals({version:versionId,transport:async()=>response(bad)})).status,"error");
 }
});
test("read network failure never reports empty; invalid selector never starts transport",async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;throw new Error("offline");};
 assert.equal((await readGoals({beforeVersion:0,transport})).status,"error");assert.equal(calls,0);
 assert.equal((await readGoals({transport})).status,"error");assert.equal(calls,1);
});
