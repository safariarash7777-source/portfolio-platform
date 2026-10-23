import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { getGoals, postGoals, type GoalsDb } from "./goalsServer";
import type { GoalsPayload, GoalsWriteRequest } from "./goalsApiContract";

const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002", id = "10000000-0000-0000-0000-000000000001";
const origin = "https://synthetic.example", path = `${origin}/api/personal-finance/goals`;
function payload(): GoalsPayload { return {contractVersion:1,goals:[{goalKey:"one",title:"ذخیره",targetAmountToman:1000,targetOn:"2027-01-01",declaredSavedToman:null,source:null,note:null}]}; }
function input(): GoalsWriteRequest { return { contractVersion: "goals-request.v1", expectedOwnerId: owner, clientToken: "synthetic-test-token", baseVersion: 0, payload: payload() }; }
function request(body: unknown = input(), requestOrigin: string | null = origin) { return new Request(path, { method: "POST", headers: { ...(requestOrigin === null ? {} : { origin: requestOrigin }), "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function header() { return {id,user_id:owner,version:1,payload:payload(),created_at:"2026-10-23T00:00:00Z"}; }
const dbReceipt = (reused = false) => ({ contractVersion: "goals-write.v1", version_id: id, version: 1, goal_count: 1, reused, canonical_content_hash: "a".repeat(64) });
function fixture() {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, args: unknown[]) => { calls.push({ method, args }); };
  const db: GoalsDb = {
    async authenticate() { record("auth", []); return { user: { id: owner }, error: null }; },
    async latest(...args) { record("latest", args); return { data: header(), error: null }; },
    async selected(...args) { record("selected", args); return { data: header(), error: null }; },
    async history(...args) { record("history", args); return { data: [{ id, user_id: owner, version: 1, created_at: "2026-10-20T00:00:00Z" }], error: null }; },
    async record(...args) { record("write", args); return { data: dbReceipt(), error: null }; },
  };
  return { db, calls, connect: async () => db };
}
const readRequest = (extra = "") => new Request(`${path}?${extra}`);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
test("exact Origin and owner are checked before any write; forged payload keys rejected", async () => {
  for (const value of [null, "null", "https://foreign.example", `${origin}/`]) {
    const f = fixture(); const result = await postGoals(request(input(), value), f.connect);
    assert.equal(result.status, 403); assert.equal((await result.json()).code, "ORIGIN_FORBIDDEN"); assert.equal(f.calls.length, 0);
  }
  for (const body of [{ ...input(), expectedOwnerId: other }, { ...input(), ownerId: owner }, { ...input(), payload: { ...payload(), ownerId: owner } }]) {
    const f = fixture(); const result = await postGoals(request(body), f.connect);
    assert.equal(result.status, body.expectedOwnerId === other ? 403 : 400); assert.ok(!f.calls.some(call => call.method === "write"));
  }
});
test("native missing/rejected session401 differs from Auth infrastructure503; no RPC", async () => {
  for (const [error, status] of [[new AuthSessionMissingError(), 401], [{ status: 401 }, 401], [{ status: 503 }, 503], [new Error("network"), 503]] as const) {
    const f = fixture(); f.db.authenticate = async () => ({ user: { id: owner }, error });
    const result = await postGoals(request(), f.connect); assert.equal(result.status, status); assert.ok(!f.calls.some(call => call.method === "write"));
  }
});
test("stream cap counts Unicode bytes independent of false Content-Length, never invokes RPC", async () => {
  const f = fixture(); const req = new Request(path, { method: "POST", headers: { origin, "Content-Length": "2" }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('"' + "ی".repeat(500_000) + '"')); controller.close(); } }), duplex: "half" } as RequestInit);
  const result = await postGoals(req, f.connect); assert.equal(result.status, 413); assert.equal((await result.json()).code, "BODY_TOO_LARGE"); assert.ok(!f.calls.some(call => call.method === "write"));
  const bad = fixture(); assert.equal((await postGoals(new Request(path, { method: "POST", headers: { origin }, body: "{broken" }), bad.connect)).status, 400); assert.ok(!bad.calls.some(call => call.method === "write"));
});
test("late Auth and body preparation cannot start an RPC after deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); let finish!: (value: { user: { id: string }; error: null }) => void;
  f.db.authenticate = () => new Promise(resolve => { finish = resolve; });
  const pending = postGoals(request(), f.connect); await flush(); t.mock.timers.tick(10_000); assert.equal((await pending).status, 503);
  finish({ user: { id: owner }, error: null }); await flush(); assert.ok(!f.calls.some(call => call.method === "write"));
  const g = fixture(); const stalled = new Request(path, { method: "POST", headers: { origin }, body: new ReadableStream({ pull() { return new Promise(() => {}); } }), duplex: "half" } as RequestInit);
  const bodyPending = postGoals(stalled, g.connect); await flush(); t.mock.timers.tick(10_000); const result = await bodyPending;
  assert.equal(result.status, 503); assert.equal((await result.json()).code, "WRITE_UNAVAILABLE"); assert.ok(!g.calls.some(call => call.method === "write"));
});
test("write wait timeout is unknown even if ignored-abort RPC later commits; exact request supports replay", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const f = fixture(); let finish!: (value: { data: unknown; error: null }) => void; const received: unknown[] = [];
  f.db.record = async (value, signal) => { received.push(structuredClone(value)); assert.ok(signal instanceof AbortSignal); return new Promise(resolve => { finish = resolve; }); };
  const pending = postGoals(request(), f.connect); await flush(); t.mock.timers.tick(10_000);
  const result = await pending; assert.equal(result.status, 503); assert.equal((await result.json()).code, "WRITE_UNAVAILABLE");
  finish({ data: dbReceipt(), error: null }); await flush();
  f.db.record = async value => { received.push(structuredClone(value)); return { data: dbReceipt(true), error: null }; };
  const replay = await postGoals(request(), f.connect); assert.equal(replay.status, 200); assert.equal((await replay.json()).reused, true); assert.deepEqual(received[0], received[1]);
});
test("canonical receipts and SQL errors mapped without raw error details", async () => {
  const f = fixture(); const saved = await postGoals(request(), f.connect); assert.equal(saved.status, 201); assert.equal(saved.headers.get("cache-control"), "private, no-store"); const body = await saved.json(); assert.equal(body.ownerId, owner); assert.equal(body.versionId, id);
  for (const [code, status, expected] of [["22023", 400, "INVALID_INPUT"], ["23514", 400, "INVALID_INPUT"], ["42501", 403, "FORBIDDEN"], ["PT409", 409, "CONFLICT"], ["40001", 409, "CONFLICT"], ["08006", 503, "WRITE_UNAVAILABLE"]] as const) {
    const f = fixture(); f.db.record = async () => ({ data: null, error: { code, message: "private SQL details" } }); const result = await postGoals(request(), f.connect); assert.equal(result.status, status); const body = await result.json(); assert.equal(body.code, expected); assert.ok(!JSON.stringify(body).includes("private SQL"));
  }
  for (const data of [{ ...dbReceipt(), version: 2 }, { ...dbReceipt(), goal_count: 0 }, [dbReceipt()], null]) { const f = fixture(); f.db.record = async () => ({ data, error: null }); assert.equal((await postGoals(request(), f.connect)).status, 503); }
});

test("read owner binding, empty versus unavailable and explicit missing version", async () => {
 const f=fixture(); const result=await getGoals(readRequest(),f.connect); assert.equal(result.status,200); assert.equal((await result.json()).snapshot.payload.goals[0].declaredSavedToman,null);
 f.db.latest=async()=>({data:{...header(),user_id:other},error:null}); assert.equal((await getGoals(readRequest(),f.connect)).status,503);
 f.db.selected=async()=>({data:null,error:null});assert.equal((await getGoals(readRequest(`version=${id}`),f.connect)).status,404);
 f.db.latest=async()=>({data:null,error:null});f.db.history=async()=>({data:[],error:null});assert.equal((await (await getGoals(readRequest(),f.connect)).json()).state,"empty");
 f.db.latest=async()=>({data:null,error:{code:"offline"}}); assert.equal((await getGoals(readRequest(),f.connect)).status,503);
});
test("read rejects unknown, duplicate and unbounded query selectors before auth",async()=>{
 for(const query of ["ownerId="+other,"beforeVersion=0","beforeVersion=2147483648","version=bad","version="+id+"&version="+id]) {const f=fixture();assert.equal((await getGoals(readRequest(query),f.connect)).status,400);assert.equal(f.calls.length,0);}
});
test("explicit snapshot survives optional history failure; malformed history becomes error",async()=>{
 const f=fixture();f.db.history=async()=>({data:null,error:{code:"offline"}});
 const r=await getGoals(readRequest(`version=${id}`),f.connect);assert.equal(r.status,200);assert.equal((await r.json()).history.state,"error");
 f.db.history=async()=>({data:[{id,user_id:other,version:1,created_at:"2026-10-23T00:00:00Z"}],error:null});assert.equal((await (await getGoals(readRequest(`version=${id}`),f.connect)).json()).history.state,"error");
});
