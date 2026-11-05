// Controlled unit seams only. Native/DB/business acceptance is separate.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { consultationWritesReleased } from "./consultationWriteRelease";
import { getConsultation, postConsultation, type ConsultationDb } from "./server";
import { getTicketStorage, postTicketStorage, type TicketStorageDb } from "./ticketStorageServer";
import { getTicketAttemptStorage, postTicketAttemptStorage, type TicketAttemptDb } from "./ticketAttemptStorageServer";
import { TICKET_RELEASE_ERROR, parseTicketStorageError, ticketStorageErrorStatus } from "./ticketStorageContracts";
import { prepareTicketStorageAttempt, sendTicketStorageAttempt } from "./ticketStorageRequest";
import { sendTicketPreparation } from "./ticketAttemptStorageRequest";
import type { ConsultationRead, ConsultationRequest } from "./contracts";
import { parent, opening, lookup, receipt, uid, M, O, R } from "../../scripts/testing/consultation-tickets/unit-fixture";
import { prepared, attemptLookup } from "../../scripts/testing/consultation-tickets/prepared-unit-fixture";
const flag = "CONSULTATION_P03_WRITES_RELEASE", origin = "http://localhost:32189";
const previous = process.env[flag];
beforeEach(() => { delete process.env[flag]; });
afterEach(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous; });
const openRelease = () => { process.env[flag] = "reader-compatible-v1"; };
const post = (path: string, body: unknown = opening()) => new Request(origin + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
function ticketDb(): TicketStorageDb {
  return { authenticate: async () => ({ user: { id: M }, error: null }), parent: async () => ({ data: parent(), error: null }), read: async () => ({ data: lookup({ found: true, attempt: true }), error: null }), write: async () => ({ data: receipt(), error: null }) };
}
function consultationDb(data = parent()): ConsultationDb {
  return { authenticate: async () => ({ user: { id: M }, error: null }), read: async () => ({ data, error: null }), write: async input => ({ data: { contractVersion: "consultation-write.v1", actorId: M, clientToken: input.clientToken, command: input.command, id: uid(30), version: 1, reused: false, canonicalContentHash: "a".repeat(64) }, error: null }) };
}
const feedback = (status: "partial" | "not_done" | "done"): ConsultationRequest => ({ contractVersion: "consultation-request.v1", expectedActorId: M, clientToken: "same-feedback-attempt", command: { kind: "feedback", relationshipId: R, sessionId: uid(10), actionKey: uid(11), baseVersion: 0, status, text: status === "done" ? null : "جزئیات ساختگی" } });
function feedbackHistory(status: "partial" | "not_done"): ConsultationRead {
  const source = parent(), now = "2026-10-31T00:00:00Z";
  source.capabilities = { extendedFeedbackWrite: true };
  source.sessions = [{ id: uid(10), relationshipId: R, sessionKey: uid(20), version: 1, createdAt: now, actorId: O, contentHash: "a".repeat(64), state: "published", approval: { actorId: O, createdAt: now }, body: { topic: "Synthetic", goal: "Synthetic", clientSummary: "Synthetic", rationale: "Synthetic", limitations: "Synthetic", reviewOn: "2099-12-31", basis: source.dossier!.basis, researchVersionIds: [], evidence: [{ label: "Synthetic", url: null, asOf: "2026-10-31" }], actions: [{ actionKey: uid(11), title: "Synthetic", dueOn: "2099-12-31", responsible: "member" }] } }];
  source.actions = [{ id: uid(12), sessionId: uid(10), actionKey: uid(11), version: 1, status, text: "جزئیات ساختگی", actorId: M, createdAt: now }];
  return source;
}

test("server release defaults closed, unknown values never open, and public/client values do not grant it", () => {
  assert.equal(consultationWritesReleased(), false);
  for (const value of ["", "true", "1", "full", "admin", "owned_fixture", "reader-compatible-v1 ", "READER-COMPATIBLE-V1"]) { process.env[flag] = value; assert.equal(consultationWritesReleased(), false); }
  process.env.NEXT_PUBLIC_CONSULTATION_P03_WRITES_RELEASE = "reader-compatible-v1";
  assert.equal(consultationWritesReleased(), false); delete process.env.NEXT_PUBLIC_CONSULTATION_P03_WRITES_RELEASE;
  openRelease(); assert.equal(consultationWritesReleased(), true);
});
test("closed ticket POST does not connect or consume original bytes even with an allowed fixture DB", async () => {
  let connects = 0; const request = post("/api/consultation/tickets", { ...opening(), role: "admin", release: true });
  const result = await postTicketStorage(request, async () => { connects++; return ticketDb(); });
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), TICKET_RELEASE_ERROR); assert.equal(connects, 0); assert.equal(request.bodyUsed, false);
});
test("closed preparation POST cannot connect, retain bytes or dispatch a command", async () => {
  let connects = 0;
  const result = await postTicketAttemptStorage(post("/api/consultation/ticket-attempts"), async () => { connects++; throw Error("must not connect"); });
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), TICKET_RELEASE_ERROR); assert.equal(connects, 0);
});
test("ticket lookup/history and same receipt remain readable with release closed and zero writer calls", async () => {
  const db = ticketDb(); let writes = 0; db.write = async () => { writes++; throw Error("not allowed"); };
  const result = await getTicketStorage(new Request(origin + "/api/consultation/tickets?" + new URLSearchParams({ mode: "lookup", relationshipId: R, requestId: opening().command.requestId, clientToken: opening().clientToken })), async () => db);
  assert.equal(result.status, 200); const body = await result.json(); assert.equal(body.data.history, undefined); assert.deepEqual(body.data.attempt.receipt, receipt()); assert.equal(body.data.request.data.history.events.length, 1); assert.equal(writes, 0);
});
test("prepared original UTF8/hash/token/time remains GET-readable while writer is closed", async () => {
  const p = await prepared(); let writes = 0;
  const db: TicketAttemptDb = { authenticate: async () => ({ user: { id: M }, error: null }), parent: async () => ({ data: parent(), error: null }), read: async () => ({ data: attemptLookup(p, true), error: null }), prepare: async () => { writes++; throw Error("not allowed"); } };
  const result = await getTicketAttemptStorage(new Request(origin + "/api/consultation/ticket-attempts?" + new URLSearchParams({ mode: "lookup", relationshipId: R, preparationId: p.preparationId })), async () => db);
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).prepared, p); assert.equal(writes, 0);
});
test("missing prepared RPC stays unavailable and cannot hide independent ticket history", async () => {
  const db: TicketAttemptDb = { authenticate: async () => ({ user: { id: M }, error: null }), parent: async () => ({ data: parent(), error: null }), read: async () => ({ data: null, error: { code: "PGRST202" } }), prepare: async () => { throw Error("not allowed"); } };
  const result = await getTicketAttemptStorage(new Request(origin + "/api/consultation/ticket-attempts?mode=list&relationshipId=" + R), async () => db);
  assert.equal(result.status, 503); assert.equal((await result.json()).code, "READ_UNAVAILABLE");
  const tickets = await getTicketStorage(new Request(origin + "/api/consultation/tickets?" + new URLSearchParams({ mode: "lookup", relationshipId: R, requestId: opening().command.requestId, clientToken: opening().clientToken })), async () => ticketDb());
  assert.equal(tickets.status, 200);
});
test("partial/not_done history survives closed rollback; only the write capability is suppressed", async () => {
  for (const status of ["partial", "not_done"] as const) {
    const source = feedbackHistory(status), result = await getConsultation(new Request(origin + "/api/consultation?relationshipId=" + R), async () => consultationDb(source));
    assert.equal(result.status, 200); const data = await result.json(); assert.deepEqual(data.actions, source.actions); assert.deepEqual(data.capabilities, { extendedFeedbackWrite: false }); assert.equal(source.capabilities?.extendedFeedbackWrite, true);
  }
});
test("closed partial/not_done POST never calls the DB writer even when DB capability is true", async () => {
  for (const status of ["partial", "not_done"] as const) {
    const db = consultationDb(feedbackHistory(status)); let writes = 0; db.write = async () => { writes++; throw Error("not allowed"); };
    const result = await postConsultation(post("/api/consultation", feedback(status)), async () => db);
    assert.equal(result.status, 409); assert.equal((await result.json()).code, "FEEDBACK_DISABLED"); assert.equal(writes, 0);
  }
});
test("existing done and grant consultation commands still reach their unchanged DB authority path", async () => {
  for (const input of [feedback("done"), { contractVersion: "consultation-request.v1", expectedActorId: M, clientToken: "existing-grant", command: { kind: "grant", advisorId: O, clientLabel: "ساختگی" } }]) {
    const db = consultationDb(); let writes = 0; const write = db.write; db.write = (request, signal) => { writes++; return write(request, signal); };
    const result = await postConsultation(post("/api/consultation", input), async () => db); assert.equal(result.status, 201); assert.equal(writes, 1);
  }
});
test("release stop is rechecked after awaited authorization and before new ticket dispatch", async () => {
  openRelease(); const db = ticketDb(); let writes = 0; db.parent = async () => { delete process.env[flag]; return { data: parent(), error: null }; }; db.write = async () => { writes++; throw Error("not allowed"); };
  const result = await postTicketStorage(post("/api/consultation/tickets"), async () => db); assert.deepEqual(await result.json(), TICKET_RELEASE_ERROR); assert.equal(writes, 0);
});
test("explicit release does not create a DB service right", async () => {
  openRelease(); const db = ticketDb(); db.write = async () => ({ data: null, error: { code: "PT503" } });
  const result = await postTicketStorage(post("/api/consultation/tickets"), async () => db); assert.equal(result.status, 503); assert.equal((await result.json()).code, "SERVICE_RIGHT_NOT_CONNECTED");
});
test("known release rejection maps to blocked in both existing clients; same intent retained, no auto POST", async () => {
  const value = prepareTicketStorageAttempt(opening(), parent(), lookup()); assert.equal(value.status, "prepared"); if (value.status !== "prepared") throw Error("unit fixture");
  const body = value.attempt.intent.body; const calls: string[] = [];
  const transport = (async (_url, options) => { calls.push(String(options?.body)); return Response.json(TICKET_RELEASE_ERROR, { status: 503 }); }) as typeof fetch;
  for (const send of [sendTicketStorageAttempt, sendTicketPreparation]) {
    const result: { status: string } = await send(value.attempt, parent(), { currentActorId: M, transport }); assert.equal(result.status, "blocked"); assert.equal(value.attempt.intent.body, body);
    const unknownOutcome: { status: string } = await send(value.attempt, parent(), { currentActorId: M, unresolvedPrior: true, transport }); assert.equal(unknownOutcome.status, "uncertain");
  }
  assert.deepEqual(calls, [body, body]);
});
test("release error parser remains strict and carries the existing member-facing disabled message", () => {
  assert.deepEqual(parseTicketStorageError(TICKET_RELEASE_ERROR, 503), TICKET_RELEASE_ERROR); assert.equal(ticketStorageErrorStatus(TICKET_RELEASE_ERROR), 503);
  for (const value of [{ ...TICKET_RELEASE_ERROR, error: "internal release flag" }, { ...TICKET_RELEASE_ERROR, debug: true }]) assert.equal(parseTicketStorageError(value, 503), null);
  assert.equal(parseTicketStorageError(TICKET_RELEASE_ERROR, 409), null); assert.equal(TICKET_RELEASE_ERROR.error, "ثبت غیرفعال است. متن واردشده در همین نشست حفظ می‌شود.");
});
test("review branch has a precise deployment stop without changing cron definitions", () => {
  const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.git.deploymentEnabled["codex/p03-reader-release-20261031"], false); assert.equal(config.crons.length, 2);
});
