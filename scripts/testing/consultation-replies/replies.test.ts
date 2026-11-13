import assert from "node:assert/strict";
import test from "node:test";
import { validateReplyRequest, validateReplyReceipt, validateReplyRead, replyReceiptVisible, type ReplyRequest, type ReplyReceipt, type ReplyRead } from "../../../lib/consultation/replies";
import { postReply, getReplies, type ReplyDb } from "../../../lib/consultation/repliesServer";
import { createReplyAttempt, sendReplyAttempt, readReplies } from "../../../lib/consultation/repliesRequest";
import { consultationError } from "../../../lib/consultation/errors";
const actor = "00000000-0000-4000-8000-000000000001", relation = "00000000-0000-4000-8000-000000000002", session = "00000000-0000-4000-8000-000000000003", question = "00000000-0000-4000-8000-000000000004", other = "00000000-0000-4000-8000-000000000005";
const input: ReplyRequest = { contractVersion: "consultation-reply-request.v1", expectedActorId: actor, clientToken: "synthetic-token", command: { kind: "publish_reply", purpose: "clarification", relationshipId: relation, sessionId: session, questionId: question, baseVersion: 0, text: "پاسخ آزمایشی" } };
const receipt: ReplyReceipt = { contractVersion: "consultation-reply-write.v1", actorId: actor, clientToken: input.clientToken, command: input.command, id: other, version: 1, reused: false, canonicalContentHash: "a".repeat(64) };
const data: ReplyRead = { contractVersion: "consultation-reply-read.v1", actorId: actor, relationshipId: relation, sessionId: session, canReply: true, readOnlyReason: null, replies: [{ id: other, questionId: question, sessionId: session, version: 1, text: input.command.text, actorId: actor, createdAt: "2026-10-24T00:00:00Z", contentHash: receipt.canonicalContentHash }] };
const expected = { actorId: actor, relationshipId: relation, sessionId: session };
const endpoint = "https://example.test/api/consultation/replies";
const post = (value: unknown = input, origin: string | null = "https://example.test") => new Request(endpoint, { method: "POST", headers: origin ? { Origin: origin } : {}, body: typeof value === "string" ? value : JSON.stringify(value) });
const get = (query = `relationshipId=${relation}&sessionId=${session}`) => new Request(`${endpoint}?${query}`);
function fixture(overrides: Partial<ReplyDb> = {}) {
  let writes = 0;
  const db: ReplyDb = { authenticate: async () => ({ user: { id: actor }, error: null }), read: async () => ({ data, error: null }), write: async () => { writes++; return { data: receipt, error: null }; }, ...overrides };
  return { db, writes: () => writes };
}
test("strict command, Unicode length, normalization, null and extra fields", () => {
  assert.deepEqual(validateReplyRequest(input), input);
  assert.equal(validateReplyRequest({ ...input, command: { ...input.command, text: "\u00a0" + "😀".repeat(2000) + "\t" } }).command.text.length, 4000);
  for (const command of [{ ...input.command, text: null }, { ...input.command, text: "\u00a0" }, { ...input.command, text: "x\0x" }, { ...input.command, text: "😀".repeat(2001) }, { ...input.command, extra: true }, { ...input.command, purpose: "advice" }, { ...input.command, baseVersion: -1 }, { ...input.command, baseVersion: 0.5 }, { ...input.command, baseVersion: 2147483647 }]) assert.throws(() => validateReplyRequest({ ...input, command }));
  assert.throws(() => validateReplyRequest({ ...input, extra: true }));
});
test("exact receipt rejects wrong actor token command version and hash", () => {
  assert.deepEqual(validateReplyReceipt(receipt, input), receipt);
  for (const bad of [{ ...receipt, actorId: other }, { ...receipt, clientToken: "other" }, { ...receipt, command: { ...input.command, questionId: other } }, { ...receipt, version: 2 }, { ...receipt, canonicalContentHash: "x" }, { ...receipt, reused: "false" }]) assert.throws(() => validateReplyReceipt(bad, input));
});
test("read validates ownership, session, full contiguous immutable history and read-only status", () => {
  assert.deepEqual(validateReplyRead(data, expected), data);
  for (const bad of [{ ...data, actorId: other }, { ...data, relationshipId: other }, { ...data, sessionId: other }, { ...data, canReply: false }, { ...data, canReply: false, readOnlyReason: "made-up" }, { ...data, replies: [data.replies[0], data.replies[0]] }, { ...data, replies: [{ ...data.replies[0], version: 2 }] }, { ...data, replies: [{ ...data.replies[0], sessionId: other }] }, { ...data, replies: Array(201).fill(data.replies[0]) }]) assert.throws(() => validateReplyRead(bad, expected));
  assert.equal(validateReplyRead({ ...data, canReply: false, readOnlyReason: "revoked" }, expected).replies.length, 1);
});
test("receipt readback matches every effect dimension", () => {
  assert.equal(replyReceiptVisible(data, receipt), true);
  assert.equal(replyReceiptVisible({ ...data, actorId: other }, receipt), false);
  for (const patch of [{ id: question }, { questionId: other }, { actorId: other }, { sessionId: other }, { version: 2 }, { text: "wrong" }, { contentHash: "b".repeat(64) }]) assert.equal(replyReceiptVisible({ ...data, replies: [{ ...data.replies[0], ...patch }] }, receipt), false);
});
test("missing/foreign origin never connects", async () => {
  for (const origin of [null, "https://other.test"]) assert.equal((await postReply(post(input, origin), async () => { throw Error("must not connect"); })).status, 403);
});
test("auth failures and actor change never write", async () => {
  for (const [error, status] of [[null, 401], [{ status: 503 }, 503]] as const) {
    const f = fixture({ authenticate: async () => ({ user: null, error }) });
    assert.equal((await postReply(post(), async () => f.db)).status, status); assert.equal(f.writes(), 0);
  }
  const f = fixture(); assert.equal((await postReply(post({ ...input, expectedActorId: other }), async () => f.db)).status, 403); assert.equal(f.writes(), 0);
});
test("invalid/oversize stream never writes; all responses private no-store", async () => {
  for (const [body, status] of [["{", 400], ["x".repeat(20001), 413]] as const) {
    const f = fixture(), response = await postReply(post(body), async () => f.db);
    assert.equal(response.status, status); assert.equal(f.writes(), 0); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});
test("write receipts map exact status and SQL errors safely", async () => {
  for (const reused of [false, true]) {
    const f = fixture({ write: async () => ({ data: { ...receipt, reused }, error: null }) });
    assert.equal((await postReply(post(), async () => f.db)).status, reused ? 200 : 201);
  }
  for (const [code, status] of [["PT409", 409], ["42501", 403], ["22023", 400], ["08006", 503]] as const) {
    const f = fixture({ write: async () => ({ data: null, error: { code } }) }); assert.equal((await postReply(post(), async () => f.db)).status, status);
  }
  const f = fixture({ write: async () => ({ data: { ...receipt, version: 2 }, error: null }) }); assert.equal((await postReply(post(), async () => f.db)).status, 503);
});
test("read selection errors fail before connect; outage or identity mismatch never empty history", async () => {
  for (const query of ["", `relationshipId=${relation}`, `relationshipId=${relation}&sessionId=x`, `relationshipId=${relation}&sessionId=${session}&sessionId=${session}`, `relationshipId=${relation}&sessionId=${session}&extra=1`]) assert.equal((await getReplies(get(query), async () => { throw Error("must not connect"); })).status, 400);
  const f = fixture(); assert.equal((await getReplies(get(), async () => f.db)).status, 200);
  for (const result of [{ data: null, error: { code: "08006" } }, { data: { ...data, actorId: other }, error: null }]) assert.equal((await getReplies(get(), async () => fixture({ read: async () => result }).db)).status, 503);
});
test("frozen retry body retained; uncertain then denial stays uncertain", async () => {
  const attempt = createReplyAttempt(input); assert.equal(Object.isFrozen(attempt), true); const bodies: unknown[] = [];
  const transport: typeof fetch = async (_, init) => { bodies.push(init?.body); throw Error("lost response after commit"); };
  assert.equal((await sendReplyAttempt(attempt, { currentActorId: actor, transport })).status, "uncertain");
  const denied: typeof fetch = async (_, init) => { bodies.push(init?.body); return Response.json(consultationError("FORBIDDEN"), { status: 403 }); };
  assert.equal((await sendReplyAttempt(attempt, { currentActorId: actor, unresolvedPrior: true, transport: denied })).status, "uncertain");
  assert.equal((await sendReplyAttempt(attempt, { currentActorId: actor, transport: denied })).status, "rejected");
  assert.ok(bodies.every(body => body === attempt.body));
  assert.equal((await sendReplyAttempt(attempt, { currentActorId: other, unresolvedPrior: true, transport })).status, "uncertain");
});
test("client rejects mismatched receipt HTTP status and validates independent history", async () => {
  const attempt = createReplyAttempt(input);
  assert.equal((await sendReplyAttempt(attempt, { currentActorId: actor, transport: async () => Response.json(receipt, { status: 201 }) })).status, "saved");
  assert.equal((await sendReplyAttempt(attempt, { currentActorId: actor, transport: async () => Response.json(receipt, { status: 200 }) })).status, "uncertain");
  assert.equal((await readReplies({ ...expected, transport: async () => Response.json(data) })).status, "ready");
  assert.equal((await readReplies({ ...expected, transport: async () => Response.json({ ...data, actorId: other }) })).status, "error");
});
test("preparation timeout cannot cause a late write after auth eventually returns", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let resolveAuth!: (value: Awaited<ReturnType<ReplyDb["authenticate"]>>) => void;
  const auth = new Promise<Awaited<ReturnType<ReplyDb["authenticate"]>>>(resolve => { resolveAuth = resolve; });
  const f = fixture({ authenticate: () => auth });
  const pending = postReply(post(), async () => f.db);
  await Promise.resolve(); context.mock.timers.tick(10001);
  assert.equal((await pending).status, 503); assert.equal(f.writes(), 0);
  resolveAuth({ user: { id: actor }, error: null });
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(f.writes(), 0);
});
test("client deadline stays uncertain even when transport ignores abort", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = sendReplyAttempt(createReplyAttempt(input), { currentActorId: actor, transport: () => new Promise<Response>(() => {}) });
  context.mock.timers.tick(15001); assert.equal((await pending).status, "uncertain");
});
