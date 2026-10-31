// HTTP boundary tests only. Fake connectors do not establish SQL/Auth acceptance.
// Explicit server-side release in this process only, independent of mock DB rights.
process.env.CONSULTATION_P03_WRITES_RELEASE = "reader-compatible-v1";
import assert from "node:assert/strict";
import test from "node:test";
import { getTicketStorage, postTicketStorage, type TicketStorageDb } from "./ticketStorageServer";
import { parent, opening, receipt, lookup, M, R } from "../../scripts/testing/consultation-tickets/unit-fixture";
const endpoint = "http://localhost:32189/api/consultation/tickets";
const request = (body: unknown = opening(), origin = "http://localhost:32189") => new Request(endpoint, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
function fixture() {
  let reads = 0, writes = 0;
  const db: TicketStorageDb = { authenticate: async () => ({ user: { id: M }, error: null }), parent: async () => ({ data: parent(), error: null }), read: async () => { reads++; return { data: lookup(), error: null }; }, write: async () => { writes++; return { data: receipt(), error: null }; } };
  return { db, count: () => ({ reads, writes }) };
}
test("same-origin gate rejects before Auth or DB connection", async () => {
  let connected = 0; const f = fixture();
  const response = await postTicketStorage(request(opening(), "https://other.invalid"), async () => { connected++; return f.db; });
  assert.equal(response.status, 403); assert.equal(connected, 0); assert.deepEqual(f.count(), { reads: 0, writes: 0 });
});
test("unavailable identity including user+error cannot read parent or start a write", async () => {
  const f = fixture(); let parents = 0;
  f.db.authenticate = async () => ({ user: { id: M }, error: { status: 503 } }); f.db.parent = async () => { parents++; throw Error("must not read"); };
  assert.equal((await postTicketStorage(request(), async () => f.db)).status, 503); assert.equal(parents, 0); assert.equal(f.count().writes, 0);
});
test("DB disconnected right is a distinct fail-closed result, never a success or a legacy entitlement", async () => {
  const f = fixture(); f.db.write = async () => ({ data: null, error: { code: "PT503" } });
  const result = await postTicketStorage(request(), async () => f.db);
  assert.equal(result.status, 503); assert.equal((await result.json()).code, "SERVICE_RIGHT_NOT_CONNECTED");
});
test("malformed parent is unavailable, not proof of revocation or an empty request list", async () => {
  const f = fixture(); f.db.parent = async () => ({ data: {}, error: null });
  const result = await postTicketStorage(request(), async () => f.db);
  assert.equal(result.status, 503); assert.equal((await result.json()).code, "READ_UNAVAILABLE"); assert.equal(f.count().writes, 0);
});
test("private intent text, unexpected keys and duplicate selector keys are rejected before a lookup", async () => {
  for (const suffix of ["&text=private", "&relationshipId=" + R, "&mode=read"]) {
    const f = fixture(); const result = await getTicketStorage(new Request(`${endpoint}?mode=inbox&relationshipId=${R}${suffix}`), async () => f.db);
    assert.equal(result.status, 400); assert.equal(f.count().reads, 0);
  }
});
test("forbidden parent cannot return a stored receipt or fall back to a private attempt", async () => {
  const f = fixture(); f.db.parent = async () => ({ data: null, error: { code: "42501" } });
  const result = await getTicketStorage(new Request(`${endpoint}?mode=lookup&relationshipId=${R}&requestId=${opening().command.requestId}&clientToken=unit-attempt`), async () => f.db);
  const original = opening();
  const privateText = original.command.kind === "open" ? original.command.text : "private";
  assert.equal(result.status, 403); assert.equal(f.count().reads, 0); assert.equal((await result.text()).includes(privateText), false);
});
test("request origin, actor, strict body bound and receipt HTTP semantics are enforced", async () => {
  const f = fixture(); assert.equal((await postTicketStorage(request({ ...opening(), expectedActorId: R }), async () => f.db)).status, 403);
  assert.equal((await postTicketStorage(request({ ...opening(), grant: true }), async () => f.db)).status, 400);
  assert.equal((await postTicketStorage(request({ ...opening(), extra: "x".repeat(21000) }), async () => f.db)).status, 413);
  assert.equal(f.count().writes, 0);
  const result = await postTicketStorage(request(), async () => f.db); assert.equal(result.status, 201); assert.match(result.headers.get("cache-control") ?? "", /private.*no-store/);
});
