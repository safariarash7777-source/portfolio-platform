import assert from "node:assert/strict";
import test from "node:test";
import type { ConsultationRead, RecommendationBody } from "./contracts";
import { classifyTicketEntitlement, resolveTicketRecommendation, ticketReceiptVisible, ticketStatus, validateTicketContinuation, validateTicketRead, validateTicketReceipt, validateTicketRequest, validateTicketTransition, type TicketCommand, type TicketEvent, type TicketRead, type TicketRecommendation, type TicketRequest, type TicketEntitlementRow } from "./tickets";
import { createTicketIntent, validateTicketIntent } from "./ticketIntent";

// Synthetic values in memory only; no users, entitlements, or tickets are created.
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M = uid(1), O = uid(2), R = uid(3), Q = uid(4), S = uid(5);
const date = "2026-10-24T12:00:00Z", fingerprint = "a".repeat(64);
const reference: TicketRecommendation = { sessionId: S, version: 1, contentHash: fingerprint };
const basis = { holdingsVersionId: null, cashFlowVersionId: null, goalsVersionId: null, cashFlowPeriod: { startOn: "2026-10-01", endOn: "2026-10-31" } };
function source(member = true): ConsultationRead {
  const relation = { id: R, clientId: M, advisorId: O, clientLabel: "عضو ساختگی", createdAt: "2026-10-01T00:00:00Z", revoked: false };
  const body: RecommendationBody = { topic: "موضوع ساختگی", goal: "هدف", clientSummary: "جمع‌بندی", rationale: "دلیل", limitations: "نمونه", reviewOn: "2099-12-31", basis, researchVersionIds: [], evidence: [{ label: "منبع ساختگی", url: null, asOf: "2026-10-01" }], actions: [] };
  return { contractVersion: "consultation-read.v1", actor: { id: member ? M : O, isAdvisor: !member, isOwner: !member }, advisors: [{ id: O, displayName: "مالک ساختگی", isOwner: true }], relationships: [relation], selected: relation, dossier: { basis, holdings: null, cashFlow: null, goals: null }, sessions: [{ id: S, relationshipId: R, sessionKey: uid(6), version: 1, contentHash: fingerprint, actorId: O, createdAt: relation.createdAt, body, approval: { actorId: O, createdAt: relation.createdAt }, state: "published" }], notes: [], events: [{ id: uid(7), sessionId: S, kind: "publish", actorId: O, createdAt: relation.createdAt, note: null }], actions: [] };
}
function opening(recommendation: TicketRecommendation | null = null): TicketRequest {
  return { contractVersion: "consultation-ticket-request.v1", expectedActorId: M, clientToken: "attempt-open", command: { kind: "open", relationshipId: R, requestId: Q, baseVersion: 0, subject: "پرسش ساختگی", text: "متن درخواست ساختگی", recommendation } };
}
function append(kind: "member_followup" | "advisor_clarification" | "close" | "link_recommendation", baseVersion = 1): TicketRequest {
  const common = { relationshipId: R, requestId: Q, baseVersion };
  const command: TicketCommand = kind === "close" ? { ...common, kind, reason: "رسیدگی این درخواست پایان یافت؛ نمونه" } : kind === "link_recommendation" ? { ...common, kind, recommendation: reference } : { ...common, kind, text: "متن پیگیری ساختگی" };
  return { contractVersion: "consultation-ticket-request.v1", expectedActorId: kind === "member_followup" ? M : O, clientToken: `attempt-${kind}`, command };
}
function event(request: TicketRequest): TicketEvent {
  const version = request.command.baseVersion + 1;
  return { id: uid(100 + version), actorId: request.expectedActorId, version, createdAt: `2026-10-24T12:00:${String(version).padStart(2, "0")}Z`, command: structuredClone(request.command), contentHash: fingerprint };
}
function read(events = [event(opening())], actorId = M): TicketRead {
  return { contractVersion: "consultation-ticket-read.v1", actorId, relationshipId: R, requestId: Q, writeAvailability: "service_entitlement_not_connected", history: { state: "ready", events } };
}
function unavailable(actorId = M): TicketRead { return { ...read([], actorId), history: { state: "unavailable", events: null } }; }
function receipt(input: TicketRequest) { return { contractVersion: "consultation-ticket-write.v1", actorId: input.expectedActorId, clientToken: input.clientToken, command: input.command, id: event(input).id, version: input.command.baseVersion + 1, reused: false, canonicalContentHash: fingerprint }; }

test("ticket request is independent of recommendation and clientToken; strict shape preserves explicit null", () => {
  const request = validateTicketRequest(opening());
  assert.equal(request.command.requestId, Q); assert.notEqual(request.clientToken, Q);
  assert.deepEqual(validateTicketRequest({ ...opening(), clientToken: "second-attempt" }).command, request.command);
  for (const value of [{ ...opening(), legacyQuestionId: uid(8) }, { ...opening(), command: { ...opening().command, actorId: O } }, { ...opening(), command: { ...opening().command, recommendation: undefined } }, { ...opening(), command: { ...opening().command, baseVersion: 1 } }]) assert.throws(() => validateTicketRequest(value));
});

test("ticket text validates Unicode, nulls and bounds; role/status/authority fields cannot be smuggled in", () => {
  assert.equal((validateTicketRequest({ ...opening(), command: { ...opening().command, text: ` ${"😀".repeat(2000)} ` } }).command as { text: string }).text.length, 4000);
  for (const value of [null, " ", "x\0y", "😀".repeat(2001)]) assert.throws(() => validateTicketRequest({ ...opening(), command: { ...opening().command, text: value } }));
  for (const extra of [{ state: "closed" }, { entitlement: "active" }, { createdAt: date }, { contentHash: fingerprint }]) assert.throws(() => validateTicketRequest({ ...opening(), ...extra }));
  assert.throws(() => validateTicketRequest({ ...append("close"), command: { ...append("close").command, reason: " " } }));
  assert.throws(() => validateTicketRequest({ ...append("member_followup"), command: { ...append("member_followup").command, baseVersion: 0 } }));
});

test("exact recommendation references cannot be partially specified, rebound to latest, or cross relationships", () => {
  assert.equal(resolveTicketRecommendation(reference, source()).state, "resolved");
  for (const ref of [{ sessionId: S }, { ...reference, version: 2 }, { ...reference, contentHash: "b".repeat(64) }]) assert.throws(() => validateTicketTransition({ ...opening(), command: { ...opening().command, recommendation: ref } }, source(), null));
  const unknown = { ...reference, sessionId: uid(30) };
  assert.equal(resolveTicketRecommendation(unknown, source()).state, "unknown");
  assert.throws(() => validateTicketTransition(opening(unknown), source(), null));
  const wrong = source(); wrong.sessions[0].relationshipId = uid(31);
  assert.throws(() => resolveTicketRecommendation(reference, wrong));
});

test("withdrawn and older references retain exact historical identity without revalidating a recommendation", () => {
  const old = source(); old.sessions[0].state = "withdrawn";
  old.sessions.push({ ...structuredClone(old.sessions[0]), id: uid(50), version: 2, contentHash: "b".repeat(64), state: "published" });
  assert.deepEqual(resolveTicketRecommendation(reference, old), { state: "resolved", reference });
  const data = validateTicketRead(read([event(opening(reference))]), old, Q);
  assert.equal(ticketStatus(data), "open");
  const missing = source(); missing.sessions = []; missing.events = [];
  assert.equal(resolveTicketRecommendation(reference, missing).state, "unknown");
  assert.equal(validateTicketRead(read([event(opening(reference))]), missing, Q).history.state, "ready");
});

test("only actor-scoped existing consultation history admits a ticket history; unknown is never empty/open", () => {
  assert.equal(ticketStatus(validateTicketRead(unavailable(), source(), Q)), null);
  for (const data of [{ ...read(), actorId: O }, { ...read(), relationshipId: uid(10) }, { ...read(), requestId: uid(10) }, read([]), { ...unavailable(), history: { state: "unavailable", events: [] } }, { ...read(), writeAvailability: "active" }]) assert.throws(() => validateTicketRead(data, source(), Q));
  const stranger = source(); stranger.actor.id = uid(99);
  assert.throws(() => validateTicketRead({ ...read(), actorId: stranger.actor.id }, stranger, Q));
});

test("full append-only history requires ordered contiguous versions, parents, author role and valid chronology", () => {
  const events = [event(opening()), event(append("advisor_clarification")), event(append("member_followup", 2)), event(append("close", 3))];
  assert.equal(ticketStatus(validateTicketRead(read(events), source(), Q)), "closed");
  const changes: ((events: TicketEvent[]) => void)[] = [items => { items[1].version = 3; }, items => { items[1].command.baseVersion = 0; }, items => { items[1].actorId = M; }, items => { items[1].command.requestId = uid(9); }, items => { items[1].command.relationshipId = uid(9); }, items => { items[1].createdAt = "2026-10-01T00:00:00Z"; }, items => { items[1].createdAt = "2026-02-30T00:00:00Z"; }, items => { items[1].id = items[0].id; }, items => { items.push(event(append("member_followup", 4))); }];
  for (const change of changes) { const copy = structuredClone(events); change(copy); assert.throws(() => validateTicketRead(read(copy), source(), Q)); }
  assert.throws(() => validateTicketRead(read([event(append("advisor_clarification"))]), source(), Q));
});

test("member retains history after revocation while advisor loses it and neither gains fresh write preparation", () => {
  const member = source(); member.selected!.revoked = true;
  assert.equal(validateTicketRead(read(), member, Q).history.state, "ready");
  assert.throws(() => createTicketIntent(opening(), member, null));
  const advisor = source(false); advisor.selected!.revoked = true;
  assert.throws(() => validateTicketRead(read(undefined, O), advisor, Q));
  const disabled = source(false); disabled.actor.isAdvisor = false; disabled.actor.isOwner = false;
  assert.throws(() => validateTicketRead(read(undefined, O), disabled, Q));
});

test("transition validation enforces CAS, active consent and member/owner roles but grants no entitlement", () => {
  assert.equal(validateTicketTransition(append("member_followup"), source(), read()).command.baseVersion, 1);
  assert.equal(validateTicketTransition(append("close"), source(false), read(undefined, O)).command.kind, "close");
  assert.throws(() => validateTicketTransition(append("member_followup", 2), source(), read()));
  assert.throws(() => validateTicketTransition(append("member_followup"), source(), unavailable()));
  assert.throws(() => validateTicketTransition(opening(), source(), read()));
  assert.throws(() => validateTicketTransition(append("member_followup"), source(), null));
  assert.throws(() => validateTicketTransition({ ...append("close"), expectedActorId: M }, source(), read()));
  const notOwner = source(false); notOwner.actor.isOwner = false;
  assert.throws(() => validateTicketTransition(append("close"), notOwner, read(undefined, O)));
  assert.throws(() => validateTicketTransition(append("member_followup", 2), source(), read([event(opening()), event(append("close"))])));
});

test("linking a recommendation is its own versioned event; unapproved drafts cannot be sent as links", () => {
  assert.equal(validateTicketTransition(append("link_recommendation"), source(false), read(undefined, O)).command.kind, "link_recommendation");
  const draft = source(false); draft.sessions[0].state = "draft"; draft.sessions[0].approval = null;
  assert.throws(() => validateTicketTransition(append("link_recommendation"), draft, read(undefined, O)));
});

test("withdrawn-before-publication, approval alone or missing publication evidence never resolves a fresh link", () => {
  for (const approved of [false, true]) {
    const neverPublished = source(false); neverPublished.sessions[0].state = "withdrawn";
    if (!approved) neverPublished.sessions[0].approval = null;
    neverPublished.events = [{ id: uid(8), sessionId: S, kind: "withdraw", actorId: O, createdAt: neverPublished.sessions[0].createdAt, note: null }];
    assert.equal(resolveTicketRecommendation(reference, neverPublished).state, "unknown");
    assert.throws(() => validateTicketTransition(append("link_recommendation"), neverPublished, read(undefined, O)));
  }
  const missingEvidence = source(); missingEvidence.events = [];
  assert.equal(resolveTicketRecommendation(reference, missingEvidence).state, "unknown");
  assert.throws(() => validateTicketTransition(opening(reference), missingEvidence, null));
  assert.equal(validateTicketRead(read([event(opening(reference))]), missingEvidence, Q).history.state, "ready");
});

test("later action done or legacy question events never close or implicitly create independent tickets", () => {
  const parent = source(); parent.actions = [{ id: uid(80), sessionId: S, actionKey: null, version: 1, status: "question", text: "سؤال قدیمی", actorId: M, createdAt: date }];
  assert.equal(ticketStatus(validateTicketRead(read(), parent, Q)), "open");
  assert.throws(() => validateTicketRead(parent.actions, parent, Q));
  assert.throws(() => validateTicketRequest({ ...opening(), command: { ...opening().command, kind: "done" } }));
});

test("immutable intent preserves exact bytes and token, stays blocked even for owner, and cannot be enabled on recovery", () => {
  const intent = createTicketIntent(opening(reference), source(), null);
  assert.ok(Object.isFrozen(intent)); assert.equal(intent.writeEnabled, false); assert.equal(intent.blockedReason, "service_entitlement_not_connected");
  assert.equal(validateTicketIntent(intent).body, intent.body);
  assert.equal(validateTicketIntent(intent).clientToken, "attempt-open");
  assert.throws(() => validateTicketIntent({ ...intent, requestId: uid(99) }));
  assert.throws(() => validateTicketIntent({ ...intent, body: ` ${intent.body}` }));
  assert.throws(() => validateTicketIntent({ ...intent, body: " ".repeat(20_001) }));
  assert.throws(() => validateTicketIntent({ ...intent, writeEnabled: true } as unknown as typeof intent));
  assert.equal(createTicketIntent(append("close"), source(false), read(undefined, O)).writeEnabled, false);
  assert.throws(() => createTicketIntent(opening(), source(false), null));
});

test("receipt binds the exact actor/attempt/request/command/version; independent readback must show that event", () => {
  const input = append("close"), normalized = validateTicketRequest(input), good = validateTicketReceipt(receipt(input), normalized);
  const history = validateTicketRead(read([event(opening()), event(input)], O), source(false), Q);
  assert.equal(ticketReceiptVisible(history, good), true);
  assert.equal(ticketReceiptVisible(unavailable(O), good), false);
  assert.equal(ticketReceiptVisible(read(undefined, O), good), false);
  for (const change of [{ actorId: M }, { clientToken: "new-attempt" }, { version: 3 }, { command: { ...input.command, requestId: uid(90) } }, { canonicalContentHash: null }]) assert.throws(() => validateTicketReceipt({ ...receipt(input), ...change }, normalized));
  const different = structuredClone(history); if (different.history.state === "ready") different.history.events[1].contentHash = "b".repeat(64);
  assert.equal(ticketReceiptVisible(different, good), false);
});

test("append verification rejects rewritten or shortened confirmed history and leaves unavailable continuity unknown", () => {
  const before = read(), after = read([event(opening()), event(append("advisor_clarification"))]);
  assert.equal(validateTicketContinuation(before, after, source(), Q).continuity, "verified");
  const changed = structuredClone(after); if (changed.history.state === "ready") changed.history.events[0].command = { ...opening().command, text: "بازنویسی گذشته" } as TicketCommand;
  assert.throws(() => validateTicketContinuation(before, changed, source(), Q));
  assert.throws(() => validateTicketContinuation(after, before, source(), Q));
  assert.equal(validateTicketContinuation(before, unavailable(), source(), Q).continuity, "unknown");
  assert.equal(validateTicketContinuation(unavailable(), after, source(), Q).continuity, "unknown");
});

const entitlement: TicketEntitlementRow = { id: uid(200), user_id: M, kind: "consulting", source: "admin_grant", starts_at: "2026-10-01T00:00:00Z", expires_at: "2026-11-01T00:00:00Z", revoked_at: null };
test("existing consulting kind, including admin_grant provenance, is classified by row dates without granting runtime access", () => {
  const classify = (rows: unknown[], at = date) => classifyTicketEntitlement({ state: "ready", rows, complete: true }, M, at);
  const active = classify([entitlement]); assert.equal(active.state, "active"); assert.equal(active.writeEnabled, false); assert.equal(active.authority, "not_connected");
  assert.deepEqual(active.matchingIds, [entitlement.id]);
  assert.equal(classify([entitlement], entitlement.starts_at).state, "active");
  assert.equal(classify([entitlement], entitlement.expires_at).state, "inactive");
  assert.equal(classify([{ ...entitlement, starts_at: "2026-10-25T00:00:00Z" }]).state, "inactive");
  for (const row of [{ ...entitlement, kind: "manual" }, { ...entitlement, kind: "webinar" }, { ...entitlement, revoked_at: date }]) assert.equal(classify([row]).state, "inactive");
  assert.equal(classify([]).state, "inactive");
});

test("missing, malformed, foreign, incomplete, duplicate or failed entitlement data remain unknown, never zero rights", () => {
  assert.equal(classifyTicketEntitlement({ state: "not_connected", rows: null }, M, date).state, "not_connected");
  assert.equal(classifyTicketEntitlement({ state: "unavailable", rows: null }, M, date).state, "unknown");
  assert.equal(classifyTicketEntitlement({ state: "ready", rows: [], complete: false }, M, date).state, "unknown");
  for (const bad of [null, {}, { state: "ready", rows: [], complete: "yes" }, { state: "ready", rows: [] }]) assert.equal(classifyTicketEntitlement(bad, M, date).state, "unknown");
  for (const rows of [[{ ...entitlement, user_id: O }], [{ ...entitlement, expires_at: null }], [{ ...entitlement, starts_at: "2026-02-30T00:00:00Z" }], [{ ...entitlement, kind: "admin" }], [entitlement, entitlement]]) {
    const result = classifyTicketEntitlement({ state: "ready", rows, complete: true }, M, date); assert.equal(result.state, "unknown"); assert.equal(result.matchingIds, null); assert.equal(result.writeEnabled, false);
  }
});

test("microsecond entitlement boundaries and event chronology preserve database timestamp precision", () => {
  const row = { ...entitlement, starts_at: "2026-10-24T12:00:00.123456Z", expires_at: "2026-10-24T12:00:00.123459Z" };
  for (const [fraction, expected] of [["123455", "inactive"], ["123456", "active"], ["123458", "active"], ["123459", "inactive"]]) {
    const result = classifyTicketEntitlement({ state: "ready", rows: [row], complete: true }, M, `2026-10-24T12:00:00.${fraction}Z`);
    assert.equal(result.state, expected); assert.equal(result.writeEnabled, false);
  }
  const events = [event(opening()), event(append("advisor_clarification"))];
  events[0].createdAt = "2026-10-24T12:00:01.123457Z"; events[1].createdAt = "2026-10-24T12:00:01.123456Z";
  assert.throws(() => validateTicketRead(read(events), source(), Q));
});
