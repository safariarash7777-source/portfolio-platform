import test from "node:test";
import assert from "node:assert/strict";
import { parent, opening, lookup, M, O, R } from "../../scripts/testing/consultation-tickets/unit-fixture";
import { prepared, preparationReceipt, attemptLookup } from "../../scripts/testing/consultation-tickets/prepared-unit-fixture";
import { prepareTicketStorageAttempt } from "./ticketStorageRequest";
import { bindOriginalPreparation, readTicketAttemptStorage, sendTicketPreparation } from "./ticketAttemptStorageRequest";
const attempt = () => { const value = prepareTicketStorageAttempt(opening(), parent(), lookup()); if (value.status !== "prepared") throw Error("unit attempt"); return value.attempt; };
test("preparation transport sends original bytes only to the preparation endpoint, never a ticket command", async () => {
  const p = await prepared(), calls: string[] = [], original = attempt();
  const result = await sendTicketPreparation(original, parent(), { currentActorId: M, transport: async (input, init) => { calls.push(String(input)); assert.equal(init?.body, original.intent.body); return Response.json(preparationReceipt(p), { status: 201 }); } });
  assert.equal(result.status, "saved"); assert.deepEqual(calls, ["/api/consultation/ticket-attempts"]);
});
test("unknown preparation never auto-replays or transmits a command; later recovery is GET only", async () => {
  const original = attempt(), p = await prepared(); let posts = 0;
  const transport: typeof fetch = async (_input, init) => { if (init?.method === "POST") { posts++; throw Error("synthetic dropped response"); } return Response.json(attemptLookup(p)); };
  assert.equal((await sendTicketPreparation(original, parent(), { currentActorId: M, transport })).status, "uncertain");
  assert.equal((await sendTicketPreparation(original, parent(), { currentActorId: M, unresolvedPrior: true, transport })).status, "uncertain"); assert.equal(posts, 1);
  const found = await readTicketAttemptStorage({ mode: "lookup", relationshipId: R, clientToken: p.clientToken }, parent(), { expectedBody: original.intent.body, transport });
  assert.equal(found.status, "ready"); assert.equal(posts, 1);
  assert.equal(bindOriginalPreparation(p, original, parent()).intent.body, original.intent.body);
});
test("actor change or revoked advisor cannot return an original private attempt via read fallback", async () => {
  let calls = 0; const transport: typeof fetch = async () => { calls++; throw Error("not called"); };
  assert.equal((await sendTicketPreparation(attempt(), parent(), { currentActorId: O, transport })).status, "rejected"); assert.equal(calls, 0);
  const denied = parent(true); denied.selected!.revoked = true; denied.actor.isAdvisor = false;
  await assert.rejects(readTicketAttemptStorage({ mode: "list", relationshipId: R }, denied, { transport })); assert.equal(calls, 0);
});
test("found body with another fixture run or changed exact bytes cannot bind the old attempt", async () => {
  const original = attempt(), p = await prepared(); assert.throws(() => bindOriginalPreparation({ ...p, fixtureRunId: "other-run" }, original, parent()));
  const changed = structuredClone(opening()); if (changed.command.kind === "open") changed.command.text += " changed";
  assert.throws(() => bindOriginalPreparation({ ...p, body: JSON.stringify(changed) }, original, parent()));
});
