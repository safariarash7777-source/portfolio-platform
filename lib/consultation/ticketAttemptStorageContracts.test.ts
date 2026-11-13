import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parent, opening, O, R, uid } from "../../scripts/testing/consultation-tickets/unit-fixture";
import { prepared, preparationReceipt, attemptList, attemptLookup } from "../../scripts/testing/consultation-tickets/prepared-unit-fixture";
import { frozenTicketIntentBody, parseTicketAttemptSelection, restorePreparedTicketAttempt, validateTicketAttemptRead, validateTicketPreparationReceipt } from "./ticketAttemptStorageContracts";

test("exact Persian UTF8 bytes/hash/DB microseconds survive lookup and frozen restoration", async () => {
  const input = opening(); if (input.command.kind === "open") input.command.text = 'فولاد\nمتن "محفوظ" و بک‌اسلش \\';
  const p = await prepared(input), selection = { mode: "lookup" as const, relationshipId: R, preparationId: p.preparationId };
  const read = await validateTicketAttemptRead(attemptLookup(p, true), parent(), selection);
  assert.equal(read.contractVersion, "consultation-ticket-attempt-lookup.v1");
  const restored = restorePreparedTicketAttempt(p, parent());
  assert.equal(restored.intent.body, p.body); assert.equal(restored.intent.clientToken, p.clientToken); assert.equal(restored.intent.writeEnabled, false);
  assert.equal(p.bodyHash, createHash("sha256").update(Buffer.from(p.body, "utf8")).digest("hex"));
  assert.equal((await validateTicketPreparationReceipt(preparationReceipt(p), parent(), p.body)).createdAt, "2026-10-31T00:00:00.123456Z");
});
test("different hash, actor, relation, token or exact bytes never replace the original body", async () => {
  const p = await prepared(), selection = { mode: "lookup" as const, relationshipId: R, clientToken: p.clientToken };
  for (const patch of [{ bodyHash: "b".repeat(64) }, { actorId: O }, { relationshipId: uid(60) }, { clientToken: "other" }, { body: p.body + " " }]) await assert.rejects(validateTicketAttemptRead(attemptLookup({ ...p, ...patch }), parent(), selection));
});
test("metadata list contains no private body/token and refuses overflow or hidden fields", async () => {
  const p = await prepared(), list = attemptList(p), selection = { mode: "list" as const, relationshipId: R };
  assert.deepEqual(await validateTicketAttemptRead(list, parent(), selection), list);
  assert.equal(JSON.stringify(list).includes(p.clientToken), false);
  await assert.rejects(validateTicketAttemptRead({ ...list, attempts: [{ ...list.attempts[0], body: p.body }] }, parent(), selection));
  await assert.rejects(validateTicketAttemptRead({ ...list, attempts: Array.from({ length: 501 }, (_, n) => ({ ...list.attempts[0], preparationId: uid(n + 100) })) }, parent(), selection));
});
test("unknown lookup is not authoritative absence and both correlations cannot be supplied", async () => {
  const p = await prepared(), selection = { mode: "lookup" as const, relationshipId: R, clientToken: p.clientToken };
  await assert.rejects(validateTicketAttemptRead({ ...attemptLookup(p), state: "unavailable", prepared: null }, parent(), selection));
  assert.throws(() => parseTicketAttemptSelection(new URLSearchParams({ mode: "lookup", relationshipId: R, clientToken: p.clientToken, preparationId: p.preparationId })));
  assert.throws(() => parseTicketAttemptSelection(new URLSearchParams({ mode: "list", relationshipId: R, body: p.body })));
});
test("revoked member keeps own prepared history; revoked/disabled advisor fails before private fallback", async () => {
  const p = await prepared(), member = parent(); member.selected!.revoked = true;
  assert.equal((await validateTicketAttemptRead(attemptLookup(p), member, { mode: "lookup", relationshipId: R, clientToken: p.clientToken })).contractVersion, "consultation-ticket-attempt-lookup.v1");
  const input = opening(); input.expectedActorId = O; input.command = { kind: "advisor_clarification", relationshipId: R, requestId: input.command.requestId, baseVersion: 1, text: "مشاور ساختگی" };
  const ownerPrepared = await prepared(input), advisor = parent(true); advisor.selected!.revoked = true; advisor.actor.isAdvisor = false;
  await assert.rejects(validateTicketAttemptRead(attemptLookup(ownerPrepared), advisor, { mode: "lookup", relationshipId: R, clientToken: ownerPrepared.clientToken }));
});
test("noncanonical producer bytes are rejected instead of silently reserializing a frozen intent", () => {
  assert.throws(() => frozenTicketIntentBody(JSON.stringify(opening(), null, 2)));
  assert.throws(() => frozenTicketIntentBody("\ufeff" + JSON.stringify(opening())));
});
