import assert from 'node:assert/strict';
import {test} from 'node:test';
import './tickets.test';
import {validateConsultationRequest,validateRecommendationBody,validateConsultationRead,validateConsultationReceipt,type RecommendationBody,type ConsultationRead} from './contracts';
const A='00000000-0000-4000-8000-000000000001',O='00000000-0000-4000-8000-000000000002',R='00000000-0000-4000-8000-000000000003',S='00000000-0000-4000-8000-000000000004',K='00000000-0000-4000-8000-000000000005',E='00000000-0000-4000-8000-000000000006';
const now='2026-10-24T00:00:00Z',hash='a'.repeat(64),basis={holdingsVersionId:null,cashFlowPeriod:{startOn:'2026-10-01',endOn:'2026-10-31'},cashFlowVersionId:null,goalsVersionId:null};
function body():RecommendationBody{return{topic:'Synthetic topic',goal:'Goal',clientSummary:'Summary',rationale:'Reason',limitations:'Incomplete synthetic data',reviewOn:'2099-12-31',basis:structuredClone(basis),researchVersionIds:[],evidence:[{label:'Synthetic source',url:null,asOf:'2026-10-23'}],actions:[{actionKey:K,title:'Synthetic action',dueOn:'2099-12-31',responsible:'member'}]};}
function request(){return{contractVersion:'consultation-request.v1',expectedActorId:O,clientToken:'attempt',command:{kind:'save',relationshipId:R,sessionKey:K,baseVersion:0,body:body(),privateNote:'PRIVATE'}};}
function read(member=false):ConsultationRead{const relation={id:R,clientId:A,advisorId:O,clientLabel:'Member',createdAt:now,revoked:false};return{contractVersion:'consultation-read.v1',actor:{id:member?A:O,isAdvisor:!member,isOwner:!member},advisors:[{id:O,displayName:'Owner',isOwner:true}],relationships:[relation],selected:relation,dossier:{basis:structuredClone(basis),holdings:null,cashFlow:null,goals:null},sessions:[{id:S,relationshipId:R,sessionKey:K,version:1,createdAt:now,actorId:O,contentHash:hash,body:body(),approval:member?{actorId:O,createdAt:now}:null,state:member?'published':'draft'}],notes:member?[]:[{sessionId:S,note:'PRIVATE'}],events:[],actions:[]};}

test('partial and not_done preserve exact action/version and require explanation without reinterpreting older statuses',()=>{
 for(const status of ['partial','not_done']){
  const command={kind:'feedback',relationshipId:R,sessionId:S,actionKey:K,baseVersion:2,status,text:'بخشی از اقدام انجام نشد؛ نمونه ساختگی'};
  const payload={contractVersion:'consultation-request.v1',expectedActorId:A,clientToken:'synthetic-'+status,command};
  assert.deepEqual(validateConsultationRequest(payload).command,command);
  for(const text of [null,'','   '])assert.throws(()=>validateConsultationRequest({...payload,command:{...command,text}}));
  assert.throws(()=>validateConsultationRequest({...payload,command:{...command,actionKey:null}}));
 }
 for(const status of ['viewed','acknowledged','doing','done','question']){
  const command={kind:'feedback',relationshipId:R,sessionId:S,actionKey:status==='viewed'||status==='acknowledged'?null:K,baseVersion:0,status,text:status==='question'?'پرسش ساختگی':null};
  assert.deepEqual(validateConsultationRequest({contractVersion:'consultation-request.v1',expectedActorId:A,clientToken:'existing-'+status,command}).command,command);
 }
});

test('extended feedback read requires the assigned actor, exact known action and preserved details',()=>{
 for(const status of ['partial','not_done']){
  const data=read(true), action={id:E,sessionId:S,actionKey:K,version:1,status,text:'جزئیات ساختگی',actorId:A,createdAt:now};
  assert.equal(validateConsultationRead({...data,actions:[action]}).actions[0].status,status);
  for(const edit of [{actorId:O},{actionKey:null},{actionKey:R},{text:null},{text:'   '}])assert.throws(()=>validateConsultationRead({...data,actions:[{...action,...edit}]}));
 }
});
test('strict request preserves unknown basis and manual source',()=>{assert.deepEqual(validateConsultationRequest(request()),request());assert.deepEqual(validateRecommendationBody(body()),body());});

test('missing rollout capability is off; only an explicit boolean from the read model enables it',()=>{
 assert.equal(validateConsultationRead(read(true)).capabilities?.extendedFeedbackWrite??false,false);
 assert.deepEqual(validateConsultationRead({...read(true),capabilities:{extendedFeedbackWrite:true}}).capabilities,{extendedFeedbackWrite:true});
 for(const capabilities of [{extendedFeedbackWrite:'true'},{extendedFeedbackWrite:1},{extendedFeedbackWrite:true,admin:true},null])assert.throws(()=>validateConsultationRead({...read(true),capabilities}));
});
test('invalid body, source, dates, limits, versions and duplicate actions fail closed',()=>{for(const edit of [(r:ReturnType<typeof request>)=>{Object.assign(r,{ownerId:A});},(r:ReturnType<typeof request>)=>{r.command.baseVersion=2_147_483_647;},(r:ReturnType<typeof request>)=>{r.command.body.reviewOn='2026-02-30';},(r:ReturnType<typeof request>)=>{r.command.body.limitations=' ';},(r:ReturnType<typeof request>)=>{r.command.body.evidence=[];},(r:ReturnType<typeof request>)=>{r.command.body.evidence[0].url='https://user:secret@example.com/';},(r:ReturnType<typeof request>)=>{r.command.body.evidence[0].url='javascript:bad';},(r:ReturnType<typeof request>)=>{r.command.body.actions.push({...r.command.body.actions[0]});}]){const p=request();edit(p);assert.throws(()=>validateConsultationRequest(p));}});
test('receipt binds actor token command and next version',()=>{const req=validateConsultationRequest(request()),receipt={contractVersion:'consultation-write.v1',actorId:O,clientToken:req.clientToken,command:req.command,id:S,version:1,reused:false,canonicalContentHash:hash};assert.deepEqual(validateConsultationReceipt(receipt,req),receipt);for(const change of [{actorId:A},{clientToken:'other'},{version:2},{command:{...req.command,privateNote:'changed'}},{canonicalContentHash:'bad'}])assert.throws(()=>validateConsultationReceipt({...receipt,...change},req));});
test('member sees approval but never private notes draft or approval note',()=>{assert.deepEqual(validateConsultationRead(read(true),{actorId:A,relationshipId:R,period:basis.cashFlowPeriod}),read(true));for(const mutate of [(r:ConsultationRead)=>{r.notes=[{sessionId:S,note:'leak'}];},(r:ConsultationRead)=>{r.sessions[0].state='draft';},(r:ConsultationRead)=>{r.sessions[0].approval=null;},(r:ConsultationRead)=>{r.events=[{id:E,sessionId:S,kind:'approve',actorId:O,createdAt:now,note:'leak'}];}]){const r=read(true);mutate(r);assert.throws(()=>validateConsultationRead(r));}});
test('owner does not imply unrelated scope and inconsistent reads rejected',()=>{for(const mutate of [(r:ConsultationRead)=>{r.actor.id=E;},(r:ConsultationRead)=>{r.sessions[0].actorId=A;},(r:ConsultationRead)=>{r.sessions.push({...r.sessions[0],id:E});},(r:ConsultationRead)=>{r.selected!.advisorId=E;},(r:ConsultationRead)=>{r.dossier!.basis.goalsVersionId=E;}]){const r=read();mutate(r);assert.throws(()=>validateConsultationRead(r));}assert.throws(()=>validateConsultationRead(read(),{period:{startOn:'2026-11-01',endOn:'2026-11-30'}}));});
test('feedback binds approved action and responsible actor',()=>{const r=read(true);r.actions=[{id:E,sessionId:S,actionKey:K,version:1,status:'doing',text:null,actorId:A,createdAt:now}];assert.deepEqual(validateConsultationRead(r),r);for(const actorId of [O,R])assert.throws(()=>validateConsultationRead({...r,actions:[{...r.actions[0],actorId}]}));assert.throws(()=>validateConsultationRead({...r,actions:[{...r.actions[0],actionKey:R}]}));});
test('revoked member retains history but advisor cannot reopen',()=>{const r=read(true);r.selected!.revoked=true;r.relationships[0].revoked=true;assert.deepEqual(validateConsultationRead(r),r);const a=read();a.selected!.revoked=true;a.relationships[0].revoked=true;assert.throws(()=>validateConsultationRead(a));});
test('empty question and completion without action rejected',()=>{for(const [status,actionKey,text] of [['done',null,null],['question',null,null]])assert.throws(()=>validateConsultationRequest({contractVersion:'consultation-request.v1',expectedActorId:A,clientToken:'feedback',command:{kind:'feedback',relationshipId:R,sessionId:S,actionKey,baseVersion:0,status,text}}));});
test('integer boundary and ASCII source URL parity',()=>{const raw=request();raw.command.baseVersion=2_147_483_646;const req=validateConsultationRequest(raw);assert.equal(validateConsultationReceipt({contractVersion:'consultation-write.v1',actorId:O,clientToken:req.clientToken,command:req.command,id:S,version:2_147_483_647,reused:false,canonicalContentHash:hash},req).version,2_147_483_647);for(const url of ['https://example.com/a\u00a0b','https://example.com/\u0645','https://example.com/\\path']){const p=body();p.evidence[0].url=url;assert.throws(()=>validateRecommendationBody(p));}const p=body();p.evidence[0].url='https://example.com/%D9%85';assert.equal(validateRecommendationBody(p).evidence[0].url,p.evidence[0].url);});
