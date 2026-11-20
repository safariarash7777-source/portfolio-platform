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
import { mountComponent } from "../admin/p07-component-test-host";
import Field from "./Field";
import CaseOverview from "./CaseOverview";
import { consultationDay, jalaliInput, tehranDay } from "./calendar";
import { visiblePublication, nextMemberAction } from "./overview";
import ConsultationPanel from "./ConsultationPanel";

const actor = "11111111-1111-4111-8111-111111111111", relationId = "22222222-2222-4222-8222-222222222222", sessionId = "33333333-3333-4333-8333-333333333333", member = "44444444-4444-4444-8444-444444444444";
const basis = { holdingsVersionId: null, cashFlowVersionId: null, goalsVersionId: null, cashFlowPeriod: { startOn: "2026-10-01", endOn: "2026-10-31" } };
const body: RecommendationBody = { topic: "موضوع مصنوعی", goal: "هدف مصنوعی", clientSummary: "متن عمومی عضو", rationale: "دلیل مصنوعی", limitations: "اطلاعات مالی نامعلوم", reviewOn: "2027-01-01", basis, evidence: [{ label: "سند ساختگی", url: null, asOf: "2026-10-23" }], researchVersionIds: [], actions: [] };
const session: ConsultationSession = { id: sessionId, relationshipId: relationId, sessionKey: sessionId, version: 1, createdAt: "2026-10-23T12:00:00Z", actorId: actor, contentHash: "a".repeat(64), body, state: "draft", approval: null };
const data: ConsultationRead = { contractVersion: "consultation-read.v1", actor: { id: actor, isAdvisor: true, isOwner: true }, advisors: [{ id: actor, displayName: "مشاور مصنوعی", isOwner: true }], relationships: [{ id: relationId, advisorId: actor, clientId: member, clientLabel: "عضو مصنوعی", createdAt: "2026-10-23T12:00:00Z", revoked: false }], selected: null, dossier: { basis, holdings: null, cashFlow: null, goals: null }, sessions: [session], notes: [{ sessionId, note: "یادداشت خصوصی" }], events: [], actions: [] };
data.selected = data.relationships[0];

test("stored extended feedback renders its label and explanation without new write controls", () => {
  const actionKey = relationId;
  const published: ConsultationSession = { ...session, state: "published", approval: { actorId: actor, createdAt: session.createdAt }, body: { ...body, actions: [{ actionKey, title: "اقدام ساختگی", dueOn: "2027-01-01", responsible: "member" }] } };
  for (const [status, label] of [["partial", "بخشی انجام‌شده طبق اعلام"], ["not_done", "انجام‌نشده طبق اعلام"]] as const) {
    const html = renderToStaticMarkup(<SessionCard session={published} latest advisor={false} owner={false} revoked={false} basis={basis} feedback={[{ id: relationId, sessionId, actionKey, version: 1, status, text: "توضیح ساختگی عضو", actorId: member, createdAt: session.createdAt }]} locked={false} onCommand={async () => { throw new Error("render must not write"); }} onEdit={() => {}} onDirty={() => {}} />);
    assert.ok(html.includes(label));
    assert.ok(html.includes("توضیح ساختگی عضو"));
    assert.ok(!html.includes("بخشی انجام دادم"));
    assert.ok(!html.includes("انجام ندادم"));
  }
});
const receipt: ConsultationReceipt = { contractVersion: "consultation-write.v1", actorId: actor, clientToken: "test", command: { kind: "save", relationshipId: relationId, sessionKey: sessionId, baseVersion: 0, body, privateNote: "یادداشت خصوصی" }, id: sessionId, version: 1, reused: false, canonicalContentHash: "b".repeat(64) };

test("draft preserves exact selected financial basis, converts Persian civil dates, keeps private note outside body", () => {
  const draft = recommendationDraft(sessionId, session, "خصوصی"); draft.reviewOn = jalaliInput("2027-01-01"); draft.evidence[0].asOf = jalaliInput("2026-10-23");
  const result = draftBody(draft, basis); assert.deepEqual(result, body); assert.ok(!("privateNote" in result)); assert.equal(draft.privateNote, "خصوصی");
  draft.topic = "ویرایش"; assert.equal(session.body.topic, "موضوع مصنوعی");
});
test("empty evidence, invalid date and arbitrary research identifiers cannot be saved", () => {
  const draft = recommendationDraft(sessionId, session); draft.evidence = []; assert.throws(() => draftBody(draft, basis));
  draft.evidence = recommendationDraft(sessionId, session).evidence; draft.reviewOn = "۱۴۰۴/۱۲/۳۰"; assert.throws(() => draftBody(draft, basis));
  draft.reviewOn = jalaliInput(body.reviewOn); draft.researchIds = "invalid"; assert.throws(() => draftBody(draft, basis));
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
  assert.match(html, /fieldset disabled/); assert.match(html, /یادداشت خصوصی مشاور/); assert.match(html, /موعد بازبینی \(شمسی\)/); assert.match(html, /نسخهٔ پایه/);
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
  assert.match(html, /دسترسی آرش برای این محیط هنوز/); assert.doesNotMatch(html, /<option value="11111111/); assert.match(html, /href="\/#waitlist"/); assert.match(html, /نوبت قطعی یا دسترسی/);
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


test("period form rejects 366 days locally and remains editable for a valid 365-day period",async()=>{
 const periods:unknown[]=[];
 const ui=mountComponent('components/consultation/ConsultationPanel.tsx',{data,locked:false,selectionLocked:false,onCommand:async()=>{throw Error('no write');},onSelect:()=>{},onDirty:()=>{},onPeriod:(period:unknown)=>periods.push(period),onDiscard:()=>{}});
 await ui.settle();
 const edit=async(label:string,value:string)=>{(ui.find(Field,e=>e.props.label===label).props.onChange as (value:string)=>void)(value);await ui.settle();};
 const submit=async()=>{(ui.find('form',e=>e.props['aria-label']==='دورهٔ پروندهٔ مالی').props.onSubmit as (event:unknown)=>void)({preventDefault(){}});await ui.settle();};
 await edit('شروع دوره (شمسی)',jalaliInput('2024-01-01'));await edit('پایان دوره (شمسی)',jalaliInput('2025-01-01'));await submit();
 assert.equal(periods.length,0);assert.match(String(ui.find('p',e=>e.props.role==='alert').props.children),/۳۶۵/);
 assert.equal(ui.find(Field,e=>e.props.label==='شروع دوره (شمسی)').props.value,jalaliInput('2024-01-01'));
 await edit('شروع دوره (شمسی)',jalaliInput('2024-01-02'));await submit();
 assert.deepEqual(periods,[{startOn:'2024-01-02',endOn:'2025-01-01'}]);
});

test("Jalali editing round trips leap Esfand, rejects rollover and uses Tehran's civil day", () => {
  assert.equal(consultationDay("۱۴۰۳/۱۲/۳۰"), "2025-03-20");
  assert.equal(consultationDay("١٤٠٤-١-١"), "2025-03-21");
  assert.throws(() => consultationDay("۱۴۰۴/۱۲/۳۰"));
  assert.throws(() => consultationDay("۱۴۰۵/۰۷/۳۱"));
  for (const iso of ["2024-01-02", "2026-03-21", "2099-12-31"]) assert.equal(consultationDay(jalaliInput(iso)), iso);
  assert.equal(tehranDay(new Date("2026-11-19T20:31:00Z")), "2026-11-20");
});

const published: ConsultationSession = { ...session, state: "published", approval: { actorId: actor, createdAt: session.createdAt },
  body: { ...body, actions: [{ actionKey: "step", responsible: "member", title: "قدم عضو", dueOn: "2027-01-01" },
    { actionKey: "advisor-step", responsible: "advisor", title: "کار مشاور", dueOn: "2026-12-01" }] } };
const memberRead: ConsultationRead = { ...data, actor: { id: member, isAdvisor: false, isOwner: false }, sessions: [published], notes: [] };
const overview = (read: ConsultationRead, today = "2026-12-01") => renderToStaticMarkup(<CaseOverview data={read} today={today} openSession={() => assert.fail()} />);
test("withdrawn revision never resurrects an older published version; drafts are not publications", () => {
  const withdrawn = { ...published, id: relationId, version: 2, state: "withdrawn" as const };
  assert.equal(visiblePublication({ ...data, sessions: [session] }), null);
  const read = { ...memberRead, sessions: [published, withdrawn] };
  assert.equal(visiblePublication(read), null); assert.doesNotMatch(overview(read), /متن عمومی عضو|قدم عضو/);
  assert.equal(visiblePublication({ ...data, sessions: [published, { ...session, version: 2, id: relationId }] })?.id, published.id);
});
test("only accountable member steps from that version compete for next action; latest versioned feedback wins", () => {
  const item = { id: actor, sessionId: published.id, actionKey: "step", version: 2, status: "done" as const, text: null, actorId: member, createdAt: session.createdAt };
  assert.equal(nextMemberAction(published, memberRead)?.title, "قدم عضو");
  const read = { ...memberRead, actions: [item, { ...item, version: 1, status: "doing" as const }] };
  assert.equal(nextMemberAction(published, read), null); assert.match(overview(read), /اقدام باز برای شما ثبت نشده/);
  assert.match(overview({ ...memberRead, actions: [{ ...item, sessionId: relationId }] }), /قدم عضو/);
});
test("overview never tells the member to act on an expired, changed-basis or revoked case", () => {
  assert.match(overview(memberRead), /قدم عضو/);
  for (const html of [overview(memberRead, "2027-01-02"), overview({ ...memberRead, dossier: { ...memberRead.dossier!, basis: { ...basis, holdingsVersionId: member } } }), overview({ ...memberRead, selected: { ...memberRead.selected!, revoked: true } })]) {
    assert.doesNotMatch(html, /قدم عضو/); assert.match(html, /بازبینی جمع‌بندی|فقط مشاهدهٔ سابقه/);
  }
});
test("advisor priority is an actual pending revision; no approval or publish buttons are added to the overview", () => {
  const html = overview({ ...data, sessions: [session, { ...session, version: 2, id: relationId, state: "submitted", body: { ...body, topic: "نسخهٔ منتظر" } }] });
  assert.match(html, /نسخهٔ منتظر/); assert.match(html, /بررسی و تأیید نسخه/); assert.doesNotMatch(html, /تأیید آرش برای همین نسخه/);
});

test("member grant requires separately naming the file, choosing a registered owner and affirmative consent", async () => {
  const calls: unknown[] = [];
  const ui = mountComponent("components/consultation/ConsultationPanel.tsx", { data: { ...memberRead, selected: null, dossier: null, relationships: [], sessions: [] },
    locked: false, selectionLocked: false, onCommand: async (command: unknown) => { calls.push(command); return true; }, onSelect() {}, onDirty() {}, onPeriod() {}, onDiscard() {} });
  const submit = () => (ui.find("form", e => e.props["aria-label"] === "رضایت و دسترسی مشاور").props.onSubmit as (e: unknown) => void)({preventDefault() {}});
  await ui.settle(); submit(); assert.deepEqual(calls, []);
  (ui.find(Field, e => e.props.label === "نام شما برای پرونده").props.onChange as (s: string) => void)("  پروندهٔ من ");
  (ui.find("select", e => e.props.value === "").props.onChange as (e: unknown) => void)({target: {value: actor}});
  await ui.settle(); submit(); assert.deepEqual(calls, []);
  (ui.find("input", e => e.props.type === "checkbox").props.onChange as (e: unknown) => void)({target: {checked: true}});
  await ui.settle(); submit(); assert.deepEqual(calls, [{kind: "grant", advisorId: actor, clientLabel: "پروندهٔ من"}]);
});

test("member can report a version-specific action or question, never an unkeyed completion", async () => {
  const calls: unknown[] = [];
  const event = { id: member, sessionId, actionKey: "step", version: 3, status: "doing", actorId: member, text: null, createdAt: session.createdAt };
  const ui = mountComponent("components/consultation/SessionCard.tsx", { session: { ...published, body: { ...published.body, reviewOn: "2099-01-01" } }, latest: true, advisor: false, owner: false, revoked: false,
    basis, feedback: [event], locked: false, onCommand: async (command: unknown) => { calls.push(command); return true; }, onDirty() {}, onEdit() {} });
  await ui.settle(); await ui.click("اعلام انجام اقدام");
  assert.deepEqual(calls[0], {kind:"feedback",relationshipId:relationId,sessionId,actionKey:"step",baseVersion:3,status:"done",text:null});
  (ui.find(Field, e=> e.props.label === "پرسش دربارهٔ همین نسخه").props.onChange as (s: string) => void)("پرسش آزمایشی");
  await ui.settle(); await ui.click("ثبت پرسش خصوصی");
  assert.deepEqual(calls[1],{kind:"feedback",relationshipId:relationId,sessionId,actionKey:null,baseVersion:0,status:"question",text:"پرسش آزمایشی"});
});
