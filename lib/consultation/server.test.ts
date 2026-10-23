import assert from "node:assert/strict";
import test from "node:test";
import { getConsultation, postConsultation, type ConsultationDb } from "./server";
import { type ConsultationRequest } from "./contracts";
const actor = "11111111-1111-4111-8111-111111111111", advisor = "22222222-2222-4222-8222-222222222222", relation = "33333333-3333-4333-8333-333333333333";
const input: ConsultationRequest = { contractVersion: "consultation-request.v1", expectedActorId: actor, clientToken: "test-consent-1", command: { kind: "grant", advisorId: advisor, clientLabel: "عضو آزمایشی" } };
const receipt = { contractVersion: "consultation-write.v1", actorId: actor, clientToken: input.clientToken, command: input.command, id: relation, version: 1, reused: false, canonicalContentHash: "a".repeat(64) };
const empty = { contractVersion: "consultation-read.v1", actor: { id: actor, isAdvisor: false, isOwner: false }, advisors: [], relationships: [], selected: null, dossier: null, sessions: [], notes: [], events: [], actions: [] };
function fixture(overrides: Partial<ConsultationDb> = {}) {
  let writes = 0;
  const db: ConsultationDb = { authenticate: async () => ({ user: { id: actor }, error: null }), read: async () => ({ data: empty, error: null }), write: async () => { writes++; return { data: receipt, error: null }; }, ...overrides };
  return { db, writes: () => writes };
}
const req = (value: unknown = input, origin: string | null = "https://example.test") => new Request("https://example.test/api/consultation", { method: "POST", headers: origin ? { Origin: origin } : {}, body: typeof value === "string" ? value : JSON.stringify(value) });
test("missing and foreign Origin never connect or write", async () => {
  for (const origin of [null, "https://other.test"]) {
    const response = await postConsultation(req(input, origin), async () => { throw new Error("must not connect"); });
    assert.equal(response.status, 403); assert.equal((await response.json()).code, "ORIGIN_FORBIDDEN");
  }
});
test("anonymous and unavailable auth are distinct and never write", async () => {
  for (const [error, expected] of [[null, 401], [{ status: 503 }, 503]] as const) {
    const f = fixture({ authenticate: async () => ({ user: null, error }) });
    const response = await postConsultation(req(), async () => f.db); assert.equal(response.status, expected); assert.equal(f.writes(), 0);
  }
});
test("actor switch rejected before write", async () => {
  const f = fixture(); const response = await postConsultation(req({ ...input, expectedActorId: advisor }), async () => f.db);
  assert.equal(response.status, 403); assert.equal(f.writes(), 0);
});
test("malformed and oversized streaming body rejected before write", async () => {
  for (const [value, status] of [["{", 400], ["x".repeat(150001), 413]] as const) {
    const f = fixture(); assert.equal((await postConsultation(req(value), async () => f.db)).status, status); assert.equal(f.writes(), 0);
  }
});
test("valid receipt and replay produce 201 and 200 with private cache", async () => {
  for (const reused of [false, true]) {
    const f = fixture({ write: async () => ({ data: { ...receipt, reused }, error: null }) });
    const response = await postConsultation(req(), async () => f.db); assert.equal(response.status, reused ? 200 : 201); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});
test("wrong receipt cannot become success", async () => {
  const f = fixture({ write: async () => ({ data: { ...receipt, actorId: advisor }, error: null }) });
  const response = await postConsultation(req(), async () => f.db); assert.equal(response.status, 503); assert.equal((await response.json()).code, "WRITE_UNAVAILABLE");
});
test("DB conflict and permissions remain explicit", async () => {
  for (const [code, status] of [["PT409", 409], ["42501", 403], ["22023", 400], ["08006", 503]] as const) {
    const f = fixture({ write: async () => ({ data: null, error: { code } }) }); assert.equal((await postConsultation(req(), async () => f.db)).status, status);
  }
});
test("read errors never become empty dossier", async () => {
  const f = fixture({ read: async () => ({ data: null, error: { code: "08006" } }) });
  const response = await getConsultation(new Request("https://example.test/api/consultation"), async () => f.db);
  assert.equal(response.status, 503); assert.equal((await response.json()).code, "READ_UNAVAILABLE");
});
test("read validates actor and exact selection", async () => {
  const f = fixture();
  assert.equal((await getConsultation(new Request("https://example.test/api/consultation"), async () => f.db)).status, 200);
  assert.equal((await getConsultation(new Request(`https://example.test/api/consultation?relationshipId=${relation}`), async () => f.db)).status, 503);
  const wrong = fixture({ read: async () => ({ data: { ...empty, actor: { ...empty.actor, id: advisor } }, error: null }) });
  assert.equal((await getConsultation(new Request("https://example.test/api/consultation"), async () => wrong.db)).status, 503);
});
test("read rejects unknown or repeated parameters and invalid periods before DB", async () => {
  for (const query of ["ownerId=" + actor, "startOn=2026-10-01", "startOn=2026-02-30&endOn=2026-03-01", "relationshipId=x&relationshipId=y"]) {
    const response = await getConsultation(new Request("https://example.test/api/consultation?" + query), async () => { throw new Error("must not connect"); }); assert.equal(response.status, 400);
  }
});
