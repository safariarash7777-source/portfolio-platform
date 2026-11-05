import assert from "node:assert/strict";
import test from "node:test";
import { afterConfirmedTicketAbsence, prepareTicketStorageAttempt, readTicketStorage, recoverTicketStorageAttempt, sendTicketStorageAttempt, ticketLookupSelection } from "./ticketStorageRequest";
import { parent, opening, receipt, lookup, O, uid } from "../../scripts/testing/consultation-tickets/unit-fixture";

test("product provider closed: preparation retains blocked legacy intent, never invents a right", () => {
  const result = prepareTicketStorageAttempt(opening(), parent(), lookup({ product: true }));
  assert.equal(result.status, "blocked");
  if (result.status === "blocked") { assert.equal(result.intent.writeEnabled, false); assert.equal(result.intent.serviceRightState, "not_connected"); }
});
test("lost write response: subsequent recovery performs GET only and confirms identical event", async () => {
  const input = opening(), prepared = prepareTicketStorageAttempt(input, parent(), lookup());
  assert.equal(prepared.status, "prepared"); if (prepared.status !== "prepared") return;
  let posts = 0, gets = 0;
  const transport = (async (_url, init) => { if (init?.method === "POST") { posts++; throw Error("lost response after server commit"); } gets++; return Response.json(lookup({ found: true, attempt: true })); }) as typeof fetch;
  assert.equal((await sendTicketStorageAttempt(prepared.attempt, parent(), { currentActorId: input.expectedActorId, transport })).status, "uncertain");
  assert.equal((await sendTicketStorageAttempt(prepared.attempt, parent(), { currentActorId: input.expectedActorId, unresolvedPrior: true, transport })).status, "uncertain");
  const read = await readTicketStorage(ticketLookupSelection(input), parent(), { input, transport });
  assert.equal(read.status, "ready"); if (read.status !== "ready") return;
  assert.equal(recoverTicketStorageAttempt(prepared.attempt, read.data, parent(), null).status, "confirmed");
  assert.deepEqual({ posts, gets }, { posts: 1, gets: 1 });
});
test("absence retry needs authoritative absence, same CAS and fixture run; bytes/token stay fixed", () => {
  const prepared = prepareTicketStorageAttempt(opening(), parent(), lookup()); if (prepared.status !== "prepared") throw Error("fixture");
  assert.equal(afterConfirmedTicketAbsence(prepared.attempt, lookup(), parent()).intent.body, prepared.attempt.intent.body);
  assert.throws(() => afterConfirmedTicketAbsence(prepared.attempt, lookup({ found: true, attempt: true }), parent()));
  assert.throws(() => afterConfirmedTicketAbsence(prepared.attempt, lookup({ product: true }), parent()));
  const other = lookup(); other.capability = { state: "owned_fixture", runId: "other-run" };
  assert.throws(() => afterConfirmedTicketAbsence(prepared.attempt, other, parent()));
});
test("revoked/disabled advisor cannot recover private intent through an unavailable lookup fallback", () => {
  const input = { ...opening(), expectedActorId: O, command: { kind: "advisor_clarification" as const, relationshipId: opening().command.relationshipId, requestId: opening().command.requestId, baseVersion: 1, text: "private advisor attempt" } };
  const view = parent(true); view.selected!.revoked = true; view.relationships[0].revoked = true;
  // Access is checked before parsing or returning any saved-intent fallback.
  const attempt = { intent: { body: JSON.stringify(input), expectedActorId: O, requestId: input.command.requestId, clientToken: input.clientToken, serviceRightState: "not_connected" as const, writeEnabled: false as const, blockedReason: "service_entitlement_not_connected" as const }, fixtureRunId: "unit-boundary-only" };
  assert.throws(() => recoverTicketStorageAttempt(attempt, {} as never, view, null));
});
test("lookup never sends private subject/text in URL and rejects a mismatched receipt correlation", async () => {
  const input = opening(); let requested = "";
  const transport = (async url => { requested = String(url); return Response.json(lookup({ found: true, attempt: true })); }) as typeof fetch;
  const read = await readTicketStorage(ticketLookupSelection(input), parent(), { input, transport });
  assert.equal(read.status, "ready"); assert.ok(!requested.includes(input.command.kind === "open" ? input.command.text : "")); assert.ok(!requested.includes("subject="));
  const changed = { ...ticketLookupSelection(input), requestId: uid(99) };
  assert.equal((await readTicketStorage(changed, parent(), { input, transport })).status, "error");
});
test("a forged fixture label never appears in POST body; receipt/status mismatch stays uncertain", async () => {
  const input = opening(), prepared = prepareTicketStorageAttempt(input, parent(), lookup()); if (prepared.status !== "prepared") throw Error("fixture");
  let actual = "";
  const transport = (async (_url, init) => { actual = String(init?.body); return Response.json(receipt(), { status: 200 }); }) as typeof fetch;
  assert.equal((await sendTicketStorageAttempt(prepared.attempt, parent(), { currentActorId: input.expectedActorId, transport })).status, "uncertain");
  assert.equal(actual, prepared.attempt.intent.body); assert.equal(actual.includes("fixtureRunId"), false); assert.equal(actual.includes("writeEnabled"), false);
});
