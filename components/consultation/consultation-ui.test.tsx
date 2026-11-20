import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConsultationRead, ConsultationReceipt, ConsultationSession, RecommendationBody } from "@/lib/consultation/contracts";
import { draftBody, recommendationDraft } from "./draft";
import { receiptVisible } from "./readback";
import RecommendationEditor from "./RecommendationEditor";
import Dossier from "./Dossier";
import SessionCard from "./SessionCard";
import ConsultationPanel from "./ConsultationPanel";

const actor = "11111111-1111-4111-8111-111111111111", relationId = "22222222-2222-4222-8222-222222222222", sessionId = "33333333-3333-4333-8333-333333333333", member = "44444444-4444-4444-8444-444444444444";
const basis = { holdingsVersionId: null, cashFlowVersionId: null, goalsVersionId: null, cashFlowPeriod: { startOn: "2026-10-01", endOn: "2026-10-31" } };
const body: RecommendationBody = { topic: "موضوع مصنوعی", goal: "هدف مصنوعی", clientSummary: "متن عمومی عضو", rationale: "دلیل مصنوعی", limitations: "اطلاعات مالی نامعلوم", reviewOn: "2027-01-01", basis, evidence: [{ label: "سند ساختگی", url: null, asOf: "2026-10-23" }], researchVersionIds: [], actions: [] };
const session: ConsultationSession = { id: sessionId, relationshipId: relationId, sessionKey: sessionId, version: 1, createdAt: "2026-10-23T12:00:00Z", actorId: actor, contentHash: "a".repeat(64), body, state: "draft", approval: null };
const data: ConsultationRead = { contractVersion: "consultation-read.v1", actor: { id: actor, isAdvisor: true, isOwner: true }, advisors: [{ id: actor, displayName: "مشاور مصنوعی", isOwner: true }], relationships: [{ id: relationId, advisorId: actor, clientId: member, clientLabel: "عضو مصنوعی", createdAt: "2026-10-23T12:00:00Z", revoked: false }], selected: null, dossier: { basis, holdings: null, cashFlow: null, goals: null }, sessions: [session], notes: [{ sessionId, note: "یادداشت خصوصی" }], events: [], actions: [] };
data.selected = data.relationships[0];
const receipt: ConsultationReceipt = { contractVersion: "consultation-write.v1", actorId: actor, clientToken: "test", command: { kind: "save", relationshipId: relationId, sessionKey: sessionId, baseVersion: 0, body, privateNote: "یادداشت خصوصی" }, id: sessionId, version: 1, reused: false, canonicalContentHash: "b".repeat(64) };

test("draft preserves exact selected financial basis, normalizes Persian dates, keeps private note outside body", () => {
  const draft = recommendationDraft(sessionId, session, "خصوصی"); draft.reviewOn = "۲۰۲۷-۰۱-۰۱"; draft.evidence[0].asOf = "۲۰۲۶-۱۰-۲۳";
  const result = draftBody(draft, basis); assert.deepEqual(result, body); assert.ok(!("privateNote" in result)); assert.equal(draft.privateNote, "خصوصی");
  draft.topic = "ویرایش"; assert.equal(session.body.topic, "موضوع مصنوعی");
});
test("empty evidence, invalid date and arbitrary research identifiers cannot be saved", () => {
  const draft = recommendationDraft(sessionId, session); draft.evidence = []; assert.throws(() => draftBody(draft, basis));
  draft.evidence = body.evidence; draft.reviewOn = "2027-02-30"; assert.throws(() => draftBody(draft, basis));
  draft.reviewOn = body.reviewOn; draft.researchIds = "invalid"; assert.throws(() => draftBody(draft, basis));
});
test("readback requires exact receipt session, body and private note, not merely a successful GET", () => {
  assert.equal(receiptVisible(data, receipt), true);
  assert.equal(receiptVisible({ ...data, sessions: [] }, receipt), false);
  assert.equal(receiptVisible({ ...data, sessions: [{ ...session, body: { ...body, clientSummary: "متن دیگر" } }] }, receipt), false);
  assert.equal(receiptVisible({ ...data, notes: [] }, receipt), false);
  assert.equal(receiptVisible({ ...data, actor: { ...data.actor, id: member } }, receipt), false);
});
test("approval and publication readback require matching event and resulting state", () => {
  const eventId = "55555555-5555-4555-8555-555555555555";
  const approved: ConsultationReceipt = { ...receipt, id: eventId, command: { kind: "approve", relationshipId: relationId, sessionId, contentHash: session.contentHash, note: null } };
  const approvedData: ConsultationRead = { ...data, sessions: [{ ...session, state: "approved" }], events: [{ id: eventId, kind: "approve", sessionId, actorId: actor, createdAt: session.createdAt, note: null }] };
  assert.equal(receiptVisible(approvedData, approved), true); assert.equal(receiptVisible({ ...approvedData, sessions: [session] }, approved), false); assert.equal(receiptVisible({ ...approvedData, events: [] }, approved), false);
});
test("readonly dossier does not turn unavailable holdings cashflow and goals into zeros", () => {
  const html = renderToStaticMarkup(<Dossier data={data.dossier!} ownerId={member} />); assert.match(html, /نامعلوم/); assert.match(html, /نسخه‌ای ثبت نشده/); assert.doesNotMatch(html, /۰ تومان/);
});
test("locked recommendation form disables all mutable fields and retains date/unit context", () => {
  const html = renderToStaticMarkup(<RecommendationEditor draft={recommendationDraft(sessionId, session)} basis={basis} locked onChange={() => assert.fail()} onSave={() => assert.fail()} onCancel={() => assert.fail()} />);
  assert.match(html, /fieldset disabled/); assert.match(html, /یادداشت خصوصی مشاور/); assert.match(html, /موعد بازبینی \(میلادی\)/); assert.match(html, /نسخهٔ پایه/);
});
test("member cannot see private note or draft workflow controls; receipt and action are distinct", () => {
  const html = renderToStaticMarkup(<SessionCard session={{ ...session, state: "published" }} latest advisor={false} owner={false} revoked={false} basis={basis} feedback={[]} privateNote="راز خصوصی آزمون" locked={false} onCommand={async () => true} onEdit={() => {}} onDirty={() => {}} />);
  assert.doesNotMatch(html, /راز خصوصی آزمون|تأیید آرش برای همین نسخه|اصلاح در نسخهٔ تازه|انتشار همین نسخه/);
  assert.match(html, /این نسخه را مشاهده کردم/); assert.match(html, /دریافت این نسخه را تأیید/); assert.match(html, /به معنی تأیید معامله نزد کارگزاری نیست/);
});
test("owner role gates approval; stale basis disables it; withdrawn version has no member feedback controls", () => {
  const props = { session: { ...session, state: "submitted" as const }, latest: true, advisor: true, revoked: false, basis, feedback: [], locked: false, onCommand: async () => true, onEdit() {}, onDirty() {} };
  assert.doesNotMatch(renderToStaticMarkup(<SessionCard {...props} owner={false} />), /تأیید آرش برای همین نسخه/);
  const ownerHtml = renderToStaticMarkup(<SessionCard {...props} owner basis={{ ...basis, goalsVersionId: member }} />); assert.match(ownerHtml, /disabled="">تأیید آرش برای همین نسخه/);
  const withdrawn = renderToStaticMarkup(<SessionCard {...props} session={{ ...session, state: "withdrawn" }} advisor={false} owner={false} />); assert.doesNotMatch(withdrawn, /این نسخه را مشاهده کردم|ثبت پرسش خصوصی/);
  const draft = renderToStaticMarkup(<SessionCard {...props} session={session} owner />); assert.doesNotMatch(draft, /پس‌گرفتن این نسخه/);
});
test("only registry owner is offered for consent; unavailable owner never becomes a fake advisor", () => {
  const memberData = { ...data, actor: { id: member, isOwner: false, isAdvisor: false }, selected: null, dossier: null, sessions: [], notes: [], relationships: [], advisors: [{ id: actor, displayName: "مشاور غیرمالک", isOwner: false }] };
  const html = renderToStaticMarkup(<ConsultationPanel data={memberData} locked={false} selectionLocked={false} onCommand={async () => true} onSelect={() => {}} onDirty={() => {}} onPeriod={() => {}} onDiscard={() => {}} />);
  assert.match(html, /دسترسی آرش برای این محیط هنوز/); assert.doesNotMatch(html, /<option value="11111111/); assert.match(html, /فیلتر ریسک، دارایی و نقص اطلاعات هنوز/);
});

test("consent form hides for existing active current-owner relation and returns after revocation", () => {
  const memberData: ConsultationRead = { ...data, actor: { id: member, isOwner: false, isAdvisor: false }, selected: null, dossier: null, sessions: [], notes: [] };
  const render = (value: ConsultationRead) => renderToStaticMarkup(<ConsultationPanel data={value} locked={false} selectionLocked={false} onCommand={async () => true} onSelect={() => {}} onDirty={() => {}} onPeriod={() => {}} onDiscard={() => {}} />);
  assert.doesNotMatch(render(memberData), /aria-label="رضایت و دسترسی مشاور"/);
  assert.match(render({ ...memberData, relationships: [] }), /aria-label="رضایت و دسترسی مشاور"/);
  assert.match(render({ ...memberData, relationships: memberData.relationships.map(item => ({ ...item, revoked: true })) }), /aria-label="رضایت و دسترسی مشاور"/);
  const unavailable = render({ ...memberData, advisors: [] });
  assert.match(unavailable, /دسترسی آرش برای این محیط هنوز/);
  assert.match(unavailable, /aria-label="رضایت و دسترسی مشاور"/);
});
