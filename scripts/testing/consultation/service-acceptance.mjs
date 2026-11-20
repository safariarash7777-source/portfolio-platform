// Runs only inside the disposable database allocated by run.mjs.
// All identities and version IDs are generated per invocation.
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
export async function acceptConsultationService({sql,actor,deny,q}) {
  const ok = async (label, fn) => { await fn(); console.log("PASS consultation service:", label); };
const A=id(),B=id(),O=id(),E=id(),W=id(),T=id(),tok=id(),key=id(),action=id();
const get=(a,r)=>actor(a,'SELECT public.load_consultation('+q(r)+",'2026-11-01','2026-11-30')");
const service=a=>actor(a,'SELECT public.read_consultation_services('+q(a)+')');
const open=(e,t=tok)=>'SELECT public.open_consultation_service_request('+[A,e,t,'درخواست آزمایشی'].map(q).join(',')+',true)';
const cmd=(a,c,t=id())=>'SELECT public.command_consultation('+q({contractVersion:'consultation-request.v1',clientToken:t,expectedActorId:a,command:c})+')';
await sql("INSERT INTO auth.users(id) VALUES "+[A,B,O].map(k=>'('+q(k)+')').join(',')+";INSERT INTO public.profiles(id,role) VALUES "+[A,B,O].map(k=>'('+q(k)+','+q(k===O?'admin':'user')+')').join(',')+";INSERT INTO public.consultation_advisors(user_id,display_name,is_owner) VALUES ("+q(O)+",'آرش آزمایشی',true);INSERT INTO consultation_private.service_items VALUES('private-case','مشاوره آزمایشی');");
for(const [e,kind] of [[E,'consulting'],[W,'webinar'],[T,'consulting']])await sql("INSERT INTO public.entitlements(id,user_id,kind,expires_at) VALUES("+[e,A,kind].map(q).join(',')+",now()+interval '1 day')");
await sql("INSERT INTO consultation_private.service_rights VALUES("+q(E)+",'private-case',1),("+q(W)+",'private-case',2)");
const holdings=[{position_key:'unpriced',manual_label:'دارایی آزمایشی',asset_class:'other',qty:2.5,unit:'item',as_of:'2026-11-17',ownership_pct:100,valuation_mode:'unpriced'}];
const debts=[{debt_key:'loan',title:'وام آزمایشی',kind:'loan',balance_toman:250000,currency:'IRT',balance_as_of:'2026-11-17'}];
const saveHold=(n,positions=holdings)=>'SELECT * FROM public.record_member_holdings('+q(positions)+'::jsonb,NULL,'+q(id())+','+n+')';
await actor(A,saveHold(0));await actor(A,'SELECT * FROM public.record_member_debts('+q(debts)+'::jsonb,1,'+q(id())+')');
await ok('explicit item required, webinar excluded, role alone excluded',async()=>{assert.equal((await service(A)).offers.length,1);await deny(A,open(W),'42501');await deny(A,open(T),'42501');await deny(B,open(E),'42501');await deny(A,cmd(A,{kind:'grant',advisorId:O,clientLabel:'legacy'}),'42501')});
await deny(A,'SELECT public.open_consultation_service_request('+[A,E,id(),'بدون رضایت'].map(q).join(',')+',false)','22023');
const r=await actor(A,open(E));const list=(await service(O)).requests[0];
await ok('stored receipt recovered after dropped response, one slot consumed',async()=>{assert.equal(await actor(A,open(E)),r);await deny(A,open(E,id()),'PT409');assert.equal((await service(A)).requests[0].token,tok);assert.equal(list.relation,r);assert.equal(list.token,null);assert.equal(list.basisVersion,2);assert.equal((await service(A)).requests.length,1);assert.equal((await service(A)).offers[0].remaining,0);assert.equal((await service(B)).requests.length,0);await deny(B,'SELECT public.load_consultation('+q(r)+",null,null)",'42501')});
// Member advances base finance before the advisor first opens the case.
await actor(A,saveHold(2,[{...holdings[0],manual_label:'ویرایش آزمایشی',qty:7}]));
const latestId=await sql('SELECT id FROM public.member_holding_versions WHERE user_id='+q(A)+' AND version=3');
assert.ok(latestId&&latestId!==list.basisId);
const d=(await get(O,r)).dossier;
await ok('first advisor read pins the request-time asset and nonzero debt',async()=>{
 assert.equal(d.basis.holdingsVersionId,list.basisId);
 assert.equal(d.holdings.version,2);
 assert.equal(Number(d.holdings.debts[0].balanceToman),250000);
 assert.equal(Number(d.holdings.positions[0].quantity),2.5);
 assert.equal((await get(A,r)).dossier.holdings.id,list.basisId);
});
const body={topic:'آزمون',goal:'آزمون',clientSummary:'پاسخ تاییدشده',rationale:'آزمون',limitations:'آزمون',reviewOn:'2099-12-31',basis:d.basis,researchVersionIds:[],evidence:[{label:'سند آزمون',url:null,asOf:'2026-11-17'}],actions:[{actionKey:action,title:'اقدام آزمایشی',dueOn:'2099-12-31',responsible:'member'}]};
const save=baseVersion=>actor(O,cmd(O,{kind:'save',relationshipId:r,sessionKey:key,baseVersion,body,privateNote:'یادداشت محرمانه'}));
await deny(O,cmd(O,{kind:'save',relationshipId:r,sessionKey:key,baseVersion:0,
 body:{...body,basis:{...d.basis,holdingsVersionId:latestId}},privateNote:null}),'PT409');
await save(0);body.clientSummary='پاسخ نهایی';const v=await save(1);
await ok('private two-version draft; owner approval and publication',async()=>{assert.equal((await get(A,r)).sessions.length,0);const s=(await get(O,r)).sessions.find(x=>x.id===v.id);for(const k of ['submit','approve','publish'])await actor(O,cmd(O,{kind:k,relationshipId:r,sessionId:v.id,contentHash:s.contentHash,note:null}));const shown=(await get(A,r));assert.equal(shown.sessions.length,1);assert.equal(shown.sessions[0].version,2);assert.equal(shown.notes.length,0)});
const feedback=(status,actionKey,text,baseVersion=0)=>({kind:'feedback',relationshipId:r,sessionId:v.id,actionKey,baseVersion,status,text});
const f=cmd(A,feedback('question',null,'پرسش آزمایشی'));
await actor(A,f);assert.equal((await actor(A,f)).reused,true);await actor(A,cmd(A,feedback('done',action,null)));
await ok('new DB session reads same basis, approved answer and follow-up; done leaves positions unchanged',async()=>{const a=await get(A,r);assert.equal(a.dossier.holdings.version,2);assert.equal(a.sessions[0].body.basis.holdingsVersionId,list.basisId);assert.equal(a.actions.filter(x=>x.sessionId===v.id).length,2);assert.equal(a.actions.filter(x=>x.status==='question').length,1);assert.equal(a.actions.find(x=>x.status==='question').text,'پرسش آزمایشی');});
await actor(A,cmd(A,{kind:'revoke',relationshipId:r}));await deny(O,'SELECT public.load_consultation('+q(r)+",null,null)",'42501');
await sql('UPDATE public.entitlements SET revoked_at=now() WHERE id='+q(E));await actor(A,saveHold(3));
await actor(B,saveHold(0,[{...holdings[0],manual_label:'دارایی جداگانهٔ عضو دوم',qty:3}]));
assert.equal(Number(await sql('SELECT max(version) FROM public.member_holding_versions WHERE user_id='+q(A))),4);
assert.equal(Number(await sql('SELECT max(version) FROM public.member_holding_versions WHERE user_id='+q(B))),1);
assert.equal((await get(A,r)).sessions[0].body.basis.holdingsVersionId,list.basisId);
await deny(B,'SELECT public.load_consultation('+q(r)+",null,null)",'42501');
console.log('PASS consent revoked, service ended, both base finance ledgers independent');
}
