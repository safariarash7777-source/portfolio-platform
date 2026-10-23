import assert from "node:assert/strict";
import test from "node:test";
import { createConsultationAttempt, sendConsultationAttempt, readConsultation } from "./request";
import { consultationError } from "./errors";
import type { ConsultationRequest } from "./contracts";
const actor = "11111111-1111-4111-8111-111111111111", advisor = "22222222-2222-4222-8222-222222222222";
const input: ConsultationRequest = { contractVersion: "consultation-request.v1", expectedActorId: actor, clientToken: "same-attempt", command: { kind: "grant", advisorId: advisor, clientLabel: "عضو آزمایشی" } };
const receipt = { contractVersion: "consultation-write.v1", actorId: actor, clientToken: input.clientToken, command: input.command, id: "33333333-3333-4333-8333-333333333333", version: 1, reused: true, canonicalContentHash: "a".repeat(64) };
const fake = (f: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => f as typeof fetch;
test("unknown write retry keeps identical bytes and token", async () => {
  const attempt = createConsultationAttempt(input), bodies: unknown[] = [];
  let calls = 0;
  const transport = fake(async (_, init) => { bodies.push(init?.body); if (++calls === 1) throw new Error("connection lost after commit"); return Response.json(receipt); });
  assert.equal((await sendConsultationAttempt(attempt, { currentActorId: actor, transport })).status, "uncertain");
  assert.equal((await sendConsultationAttempt(attempt, { currentActorId: actor, transport, unresolvedPrior: true })).status, "saved");
  assert.deepEqual(bodies, [attempt.body, attempt.body]); assert.ok(Object.isFrozen(attempt));
});
test("rejection after unknown result cannot discard an attempt", async () => {
  for (const code of ["FORBIDDEN", "CONFLICT", "AUTH_REQUIRED"] as const) {
    const status = code === "FORBIDDEN" ? 403 : code === "CONFLICT" ? 409 : 401;
    const outcome = await sendConsultationAttempt(createConsultationAttempt(input), { currentActorId: actor, unresolvedPrior: true, transport: fake(async () => Response.json(consultationError(code), { status })) });
    assert.equal(outcome.status, "uncertain");
  }
});
test("changed actor never transmits pending command", async () => {
  const attempt = createConsultationAttempt(input), transport = fake(async () => { throw new Error("must not send"); });
  const first = await sendConsultationAttempt(attempt, { currentActorId: advisor, transport }); assert.equal(first.status, "rejected");
  const prior = await sendConsultationAttempt(attempt, { currentActorId: advisor, unresolvedPrior: true, transport }); assert.equal(prior.status, "uncertain");
});
test("malformed success or receipt for another body stays uncertain", async () => {
  for (const value of [{ ok: true }, { ...receipt, clientToken: "different" }, { ...receipt, command: { ...input.command, clientLabel: "متن دیگر" } }, { ...receipt, reused: false }]) {
    const result = await sendConsultationAttempt(createConsultationAttempt(input), { currentActorId: actor, transport: fake(async () => Response.json(value)) }); assert.equal(result.status, "uncertain");
  }
});
test("unavailable read does not masquerade as no relationships", async () => {
  const result = await readConsultation({ transport: fake(async () => Response.json({ relationships: [] })) }); assert.equal(result.status, "error");
});
