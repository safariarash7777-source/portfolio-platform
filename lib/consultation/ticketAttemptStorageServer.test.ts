// Controlled HTTP/connector seams only. Not genuine Auth or SQL acceptance.
// Explicit server-side release in this process only, independent of mock DB rights.
process.env.CONSULTATION_P03_WRITES_RELEASE = "reader-compatible-v1";
import test from "node:test";
import assert from "node:assert/strict";
import { parent, M, O, R } from "../../scripts/testing/consultation-tickets/unit-fixture";
import { prepared, preparationReceipt, attemptList, attemptLookup } from "../../scripts/testing/consultation-tickets/prepared-unit-fixture";
import { getTicketAttemptStorage, postTicketAttemptStorage, type TicketAttemptDb } from "./ticketAttemptStorageServer";
const origin = "http://localhost:32189", endpoint = origin + "/api/consultation/ticket-attempts";
async function fixture() {
  const p = await prepared(); const seen: string[] = []; let reads = 0;
  const db: TicketAttemptDb = { authenticate: async () => ({ user: { id: M }, error: null }), parent: async () => ({ data: parent(), error: null }), read: async selection => { reads++; return { data: selection.mode === "list" ? attemptList(p) : attemptLookup(p), error: null }; }, prepare: async body => { seen.push(body); return { data: preparationReceipt(p), error: null }; } };
  const request = (body: BodyInit = p.body, requestOrigin = origin) => new Request(endpoint, { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body });
  return { p, db, seen, reads: () => reads, request };
}
test("preparation preserves the exact producer text and only returns a preparation receipt", async () => {
  const f = await fixture(), result = await postTicketAttemptStorage(f.request(), async () => f.db);
  assert.equal(result.status, 201); assert.deepEqual(f.seen, [f.p.body]); assert.deepEqual(await result.json(), preparationReceipt(f.p)); assert.match(result.headers.get("cache-control")!, /private.*no-store/);
});
test("origin and user+error identity cannot start a private parent read or preparation", async () => {
  const f = await fixture(); let connected = 0, parents = 0;
  assert.equal((await postTicketAttemptStorage(f.request(f.p.body, "https://other.invalid"), async () => { connected++; return f.db; })).status, 403); assert.equal(connected, 0);
  f.db.authenticate = async () => ({ user: { id: M }, error: { status: 503 } }); f.db.parent = async () => { parents++; throw Error("not allowed"); };
  assert.equal((await postTicketAttemptStorage(f.request(), async () => f.db)).status, 503); assert.equal(parents, 0); assert.equal(f.seen.length, 0);
});
test("actor mismatch, noncanonical bytes, BOM and invalid UTF8 never reach SQL", async () => {
  const f = await fixture();
  for (const body of [f.p.body.replace(M, O), f.p.body + " ", "\ufeff" + f.p.body, new Uint8Array([0xff, 0xfe])]) assert.ok([400, 403].includes((await postTicketAttemptStorage(f.request(body), async () => f.db)).status));
  assert.equal(f.seen.length, 0);
});
test("UTF8 stream bound is byte based and preparation does not run after oversized input", async () => {
  const f = await fixture(); assert.equal((await postTicketAttemptStorage(f.request("ف".repeat(11000)), async () => f.db)).status, 413); assert.equal(f.seen.length, 0);
});
test("product right remains distinctly closed; DB CAS conflicts are not a successful preservation", async () => {
  const f = await fixture(); f.db.prepare = async () => ({ data: null, error: { code: "PT503" } });
  const blocked = await postTicketAttemptStorage(f.request(), async () => f.db); assert.equal(blocked.status, 503); assert.equal((await blocked.json()).code, "SERVICE_RIGHT_NOT_CONNECTED");
  f.db.prepare = async () => ({ data: null, error: { code: "PT409" } }); assert.equal((await postTicketAttemptStorage(f.request(), async () => f.db)).status, 409);
});
test("forbidden relation is checked before returning a stored body; malformed parent is unavailable", async () => {
  const f = await fixture(), url = `${endpoint}?mode=lookup&relationshipId=${R}&clientToken=${f.p.clientToken}`;
  f.db.parent = async () => ({ data: null, error: { code: "42501" } }); const denied = await getTicketAttemptStorage(new Request(url), async () => f.db);
  assert.equal(denied.status, 403); assert.equal(f.reads(), 0); assert.equal((await denied.text()).includes(f.p.body), false);
  f.db.parent = async () => ({ data: {}, error: null }); assert.equal((await getTicketAttemptStorage(new Request(url), async () => f.db)).status, 503);
});
test("list is a read independent of write provider; selector duplicates/private URL fields fail", async () => {
  const f = await fixture(); f.db.prepare = async () => { throw Error("no write provider call during read"); };
  assert.equal((await getTicketAttemptStorage(new Request(`${endpoint}?mode=list&relationshipId=${R}`), async () => f.db)).status, 200);
  for (const extra of ["&body=private", "&mode=list", "&relationshipId=" + R]) assert.equal((await getTicketAttemptStorage(new Request(`${endpoint}?mode=list&relationshipId=${R}${extra}`), async () => f.db)).status, 400);
  assert.equal(f.reads(), 1);
});
