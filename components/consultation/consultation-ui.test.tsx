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
import ActionFeedback from "./ActionFeedback";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import type { ActionFeedbackEdit } from "./ActionFeedback";

const actor = "11111111-1111-4111-8111-111111111111", relationId = "22222222-2222-4222-8222-222222222222", sessionId = "33333333-3333-4333-8333-333333333333", member = "44444444-4444-4444-8444-444444444444";
const basis = { holdingsVersionId: null, cashFlowVersionId: null, goalsVersionId: null, cashFlowPeriod: { startOn: "2026-10-01", endOn: "2026-10-31" } };
const body: RecommendationBody = { topic: "موضوع مصنوعی", goal: "هدف مصنوعی", clientSummary: "متن عمومی عضو", rationale: "دلیل مصنوعی", limitations: "اطلاعات مالی نامعلوم", reviewOn: "2027-01-01", basis, evidence: [{ label: "سند ساختگی", url: null, asOf: "2026-10-23" }], researchVersionIds: [], actions: [] };
const session: ConsultationSession = { id: sessionId, relationshipId: relationId, sessionKey: sessionId, version: 1, createdAt: "2026-10-23T12:00:00Z", actorId: actor, contentHash: "a".repeat(64), body, state: "draft", approval: null };
const data: ConsultationRead = { contractVersion: "consultation-read.v1", actor: { id: actor, isAdvisor: true, isOwner: true }, advisors: [{ id: actor, displayName: "مشاور مصنوعی", isOwner: true }], relationships: [{ id: relationId, advisorId: actor, clientId: member, clientLabel: "عضو مصنوعی", createdAt: "2026-10-23T12:00:00Z", revoked: false }], selected: null, dossier: { basis, holdings: null, cashFlow: null, goals: null }, sessions: [session], notes: [{ sessionId, note: "یادداشت خصوصی" }], events: [], actions: [] };
data.selected = data.relationships[0];
const receipt: ConsultationReceipt = { contractVersion: "consultation-write.v1", actorId: actor, clientToken: "test", command: { kind: "save", relationshipId: relationId, sessionKey: sessionId, baseVersion: 0, body, privateNote: "یادداشت خصوصی" }, id: sessionId, version: 1, reused: false, canonicalContentHash: "b".repeat(64) };

test("extended action feedback is offered only for a published active action assigned to the current role", () => {
 const action={actionKey:relationId,title:"اقدام ساختگی",dueOn:"2099-12-31",responsible:"member" as const};
 const published={...session,state:"published" as const,body:{...body,actions:[action]}};
 const render=(advisor=false,revoked=false,current:ConsultationSession=published,enabled=true)=>renderToStaticMarkup(<SessionCard session={current} latest extendedFeedbackWrite={enabled} advisor={advisor} owner={advisor} revoked={revoked} basis={basis} feedback={[]} locked={false} onCommand={async()=>false} onEdit={()=>{}} onDirty={()=>{}} />);
 assert.match(render(),/بخشی انجام دادم/);assert.match(render(),/انجام ندادم/);
 assert.doesNotMatch(render(true),/بخشی انجام دادم|انجام ندادم/);
 assert.doesNotMatch(render(false,true),/بخشی انجام دادم|انجام ندادم/);
 assert.doesNotMatch(render(false,false,{...published,state:"draft"}),/بخشی انجام دادم|انجام ندادم/);
 assert.doesNotMatch(render(false,false,published,false),/بخشی انجام دادم|انجام ندادم/);
 const html=renderToStaticMarkup(<ActionFeedback writeEnabled baseVersion={3} locked onSave={async()=>false} onBegin={()=>{}} onCancel={()=>{}} />);
 assert.equal((html.match(/disabled=""/g)||[]).length,2);
});

test("extended feedback history preserves both details and the prior completed entry", () => {
 const history=[{id:relationId,sessionId,actionKey:relationId,version:1,status:"done" as const,text:null,actorId:member,createdAt:session.createdAt},{id:actor,sessionId,actionKey:relationId,version:2,status:"partial" as const,text:"بخشی با تأخیر — نمونه",actorId:member,createdAt:session.createdAt},{id:member,sessionId,actionKey:relationId,version:3,status:"not_done" as const,text:"شرط اقدام محقق نشد — نمونه",actorId:member,createdAt:session.createdAt}];
 const published={...session,state:"published" as const,body:{...body,actions:[{actionKey:relationId,title:"اقدام ساختگی",dueOn:"2099-12-31",responsible:"member" as const}]}};
 const html=renderToStaticMarkup(<SessionCard session={published} latest advisor={false} owner={false} revoked={false} basis={basis} feedback={history} locked onCommand={async()=>false} onEdit={()=>{}} onDirty={()=>{}} />);
 assert.match(html,/انجام‌شده طبق اعلام/);assert.match(html,/بخشی انجام‌شده طبق اعلام/);assert.match(html,/انجام‌نشده طبق اعلام/);assert.match(html,/بخشی با تأخیر/);assert.match(html,/شرط اقدام محقق نشد/);
});

test('independent readback of partial/not_done must match the exact version, action and details',()=>{
 for(const status of ['partial','not_done'] as const){
  const command={kind:'feedback' as const,relationshipId:relationId,sessionId,actionKey:relationId,baseVersion:2,status,text:'شرح ساختگی'};
  const feedbackReceipt:ConsultationReceipt={...receipt,actorId:member,command,version:3,id:member};
  const action={id:member,sessionId,actionKey:relationId,version:3,status,text:command.text,actorId:member,createdAt:session.createdAt};
  const read={...data,actor:{id:member,isAdvisor:false,isOwner:false},notes:[],actions:[action]};
  assert.equal(receiptVisible(read,feedbackReceipt),true);
  for(const edit of [{version:2},{text:'شرح متفاوت'},{actionKey:actor},{status:'done' as const}])assert.equal(receiptVisible({...read,actions:[{...action,...edit}]},feedbackReceipt),false);
 }
});


type FeedbackElement = React.ReactElement<Record<string, unknown>>;
function feedbackNodes(tree: unknown): FeedbackElement[] { if(Array.isArray(tree))return tree.flatMap(feedbackNodes);if(!React.isValidElement(tree))return[];const e=tree as FeedbackElement;return[e,...feedbackNodes(e.props.children)]; }
function feedbackText(tree: unknown): string { if(Array.isArray(tree))return tree.map(feedbackText).join('');if(!React.isValidElement(tree))return typeof tree==='string'?tree:'';return feedbackText((tree as FeedbackElement).props.children); }
/** Actual component handlers and preserved hook state, not browser/native authorization evidence. */
function mountFeedback(outcome: (edit: ActionFeedbackEdit) => Promise<boolean> = async()=>false) {
 const slots:unknown[]=[],saves:ActionFeedbackEdit[]=[];let cursor=0,tree:unknown,version=2,locked=false,enabled=true;
 const hooks={...React,useState(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(v:unknown)=>{slots[i]=v;}];},useRef(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
 const filename=resolve('components/consultation/ActionFeedback.tsx'),local=createRequire(filename),mod={exports:{} as {default:(props:unknown)=>unknown}};
 const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true},fileName:filename}).outputText;
 new Function('require','module','exports',code)((name:string)=>name==='react'?hooks:local(name),mod,mod.exports);
 const render=()=>{cursor=0;tree=mod.exports.default({baseVersion:version,locked,writeEnabled:enabled,onBegin(){},onCancel(){},onSave:async(edit:ActionFeedbackEdit)=>{saves.push(edit);return outcome(edit);}});};
 const find=(type:string,label='')=>{const e=feedbackNodes(tree).find(e=>e.type===type&&feedbackText(e).includes(label));assert.ok(e,`${type} ${label}`);return e;};
 const details=()=>{const e=feedbackNodes(tree).find(e=>e.props.label==='چه بخشی انجام شد یا چرا انجام نشد؟');assert.ok(e);return e;};
 render();return{saves,render,find,details,gate(value:boolean){enabled=value;render();},text:()=>feedbackText(tree),update(v:number,lock=false){version=v;locked=lock;render();},click(label:string){(find('button',label).props.onClick as()=>void)();render();},change(value:string){(details().props.onChange as(v:string)=>void)(value);render();},submit(){(find('form').props.onSubmit as(e:unknown)=>void)({preventDefault(){}});},async flush(){await new Promise(resolve=>setImmediate(resolve));render();}};
}
test('failed feedback save retains exact status/details/base; incoming newer feedback cannot silently rebase it',async()=>{
 const v=mountFeedback();v.click('بخشی انجام دادم');v.change('متن ساختگی من');v.submit();await v.flush();
 assert.deepEqual(v.saves,[{status:'partial',text:'متن ساختگی من',baseVersion:2}]);assert.equal(v.details().props.value,'متن ساختگی من');
 v.update(3);assert.match(v.text(),/پیگیری تازه‌تری/);assert.equal(v.find('fieldset').props.disabled,true);v.submit();await v.flush();assert.equal(v.saves.length,1);
 v.click('لغو این پیش‌نویس');v.click('انجام ندادم');v.change('دلیل ساختگی');v.submit();await v.flush();assert.deepEqual(v.saves[1],{status:'not_done',text:'دلیل ساختگی',baseVersion:3});
});
test('feedback requires details and blocks synchronous duplicate submit while preserving text after transport rejection',async()=>{
 let reject!:(e:Error)=>void;const pending=new Promise<boolean>((_,r)=>{reject=r;});const v=mountFeedback(()=>pending);
 v.click('انجام ندادم');v.submit();await v.flush();assert.equal(v.saves.length,0);assert.match(v.text(),/جزئیات این وضعیت/);
 v.change('علت ساختگی');v.submit();v.submit();assert.equal(v.saves.length,1);reject(new Error('synthetic transport failure'));await v.flush();
 assert.equal(v.details().props.value,'علت ساختگی');assert.match(v.text(),/متن شما حفظ/);v.update(2,true);v.submit();await v.flush();assert.equal(v.saves.length,1);
});

test('closing the write capability retains the open draft, blocks submission and allows conscious cancellation',async()=>{
 const v=mountFeedback();v.click('بخشی انجام دادم');v.change('متن حفظ‌شده هنگام توقف');v.gate(false);
 assert.equal(v.details().props.value,'متن حفظ‌شده هنگام توقف');assert.match(v.text(),/اکنون فعال نیست/);
 v.submit();await v.flush();assert.equal(v.saves.length,0);
 assert.equal(v.find('button','لغو این پیش‌نویس').props.disabled,false);
 v.gate(true);assert.equal(v.details().props.value,'متن حفظ‌شده هنگام توقف');v.submit();await v.flush();assert.equal(v.saves.length,1);
});

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
  const html = renderToStaticMarkup(<ConsultationPanel memberFilters={{search:"",relationStatus:"active"}} onMemberFiltersChange={()=>{}} data={memberData} locked={false} selectionLocked={false} onCommand={async () => true} onSelect={() => {}} onDirty={() => {}} onPeriod={() => {}} onDiscard={() => {}} />);
  assert.match(html, /دسترسی آرش برای این محیط هنوز/); assert.doesNotMatch(html, /<option value="11111111/); assert.match(html, /فیلتر ریسک، دارایی و نقص اطلاعات هنوز/);
});

test("member list renders the same controlled name/status filter before and after a selected dossier remount",()=>{
 const revoked={...data.relationships[0],clientLabel:"پرونده هدف لغوشده",revoked:true};
 const active={...revoked,id:member,clientLabel:"پرونده هدف فعال پنهان",revoked:false};
 const memberData:ConsultationRead={...data,actor:{id:member,isOwner:false,isAdvisor:false},relationships:[revoked,active],selected:null,dossier:null,sessions:[],notes:[],events:[],actions:[]};
 for(const selected of [false,true]){
  const html=renderToStaticMarkup(<ConsultationPanel data={{...memberData,selected:selected?revoked:null,dossier:selected?data.dossier:null}} memberFilters={{search:"هدف",relationStatus:"revoked"}} onMemberFiltersChange={()=>{}} locked={false} selectionLocked={false} onCommand={async()=>false} onSelect={()=>{}} onDirty={()=>{}} onPeriod={()=>{}} onDiscard={()=>{}} />);
  assert.match(html,/value="هدف"/);assert.match(html,/value="revoked" selected=""/);
  assert.match(html,/پرونده هدف لغوشده/);assert.doesNotMatch(html,/پرونده هدف فعال پنهان/);
  if(selected)assert.match(html,/<button[^>]*disabled=""[^>]*>پرونده هدف لغوشده/);
 }
});

test("consent form hides for existing active current-owner relation and returns after revocation", () => {
  const memberData: ConsultationRead = { ...data, actor: { id: member, isOwner: false, isAdvisor: false }, selected: null, dossier: null, sessions: [], notes: [] };
  const render = (value: ConsultationRead) => renderToStaticMarkup(<ConsultationPanel memberFilters={{search:"",relationStatus:"active"}} onMemberFiltersChange={()=>{}} data={value} locked={false} selectionLocked={false} onCommand={async () => true} onSelect={() => {}} onDirty={() => {}} onPeriod={() => {}} onDiscard={() => {}} />);
  assert.doesNotMatch(render(memberData), /aria-label="رضایت و دسترسی مشاور"/);
  assert.match(render({ ...memberData, relationships: [] }), /aria-label="رضایت و دسترسی مشاور"/);
  assert.match(render({ ...memberData, relationships: memberData.relationships.map(item => ({ ...item, revoked: true })) }), /aria-label="رضایت و دسترسی مشاور"/);
  const unavailable = render({ ...memberData, advisors: [] });
  assert.match(unavailable, /دسترسی آرش برای این محیط هنوز/);
  assert.match(unavailable, /aria-label="رضایت و دسترسی مشاور"/);
});
