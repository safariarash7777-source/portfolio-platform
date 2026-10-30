// Thin P09 scenario. The pinned shared runtime owns Auth/bootstrap/isolation/cleanup.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {runNativeAuthProfile,origin} from './native-auth-runtime.mjs';
const endpoint='/api/admin/intelligence/workbooks';
const check=(value,code)=>{if(!value)throw Error(code);};
export function workbookRequestURL(path){const url=new URL(path,origin);check(url.origin===origin&&url.pathname===endpoint&&!url.username&&!url.password,'p09_native_workbook_destination');return url.href;}
export function exactWorkbookWrite(body,intentId){check(typeof body==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(intentId),'p09_native_exact_intent');return {method:'POST',headers:{'Content-Type':'application/json','x-workbook-save-intent':intentId},body};}
export function workbookHistoryPanel(){return createRequire(import.meta.url)('../../components/admin/ResearchHistoryPanel.tsx').default;}
// The hook host's DOM globals must not make the genuine Node SDK detect a browser.
// Caller unmounts the UI first. SDK code/options/getUser remain exactly shared.
export async function withNativeNodeGlobals(work){
 const globals=['window','document'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const [name] of globals)Reflect.deleteProperty(globalThis,name);
 try{return await work();}finally{for(const [name,descriptor] of globals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
}
async function run(){await runNativeAuthProfile('p09',async runtime=>{
 const {sql,transport,write,pass,users,newSession,anon,service}=runtime;
 const {p07FixtureWorkbook}=await import('../../lib/intelligence/p07-workflow-fixture.ts');
 const {mountComponent}=await import('../../components/admin/p07-component-test-host.ts');
 // Match the existing hook host's CJS module identity; tsx's ESM bridge wraps default.
 const ResearchHistoryPanel=workbookHistoryPanel();
 const {projectWorkbookHistory}=await import('../../lib/intelligence/research-history-metadata.ts');
 const calls=[];let sequence=0,loseNextSave=false,lostAttempt;
 const http=async(actor,path,init={})=>{
  workbookRequestURL(path);const method=init.method??'GET',headers=new Headers(init.headers);
  headers.set('Cookie',users[actor].session.cookie);if(method!=='GET')headers.set('Origin',origin);
  const action=method==='POST'?JSON.parse(init.body).action:null;
  if(method!=='GET')write('p09-intent-'+String(++sequence).padStart(3,'0')+'.json',{path,method,body:init.body,headers:{intent:headers.get('x-workbook-save-intent')}},true);
  const response=await transport(workbookRequestURL(path),{...init,headers}),body=await response.json();
  const record={path,method,action,status:response.status,body,requestBody:init.body,intentId:headers.get('x-workbook-save-intent')};calls.push(record);
  if(loseNextSave&&action==='save'){check(response.status===201,'p09_native_expected_real_commit');lostAttempt=record;loseNextSave=false;throw Error('synthetic_response_discard_after_real_201');}
  return {status:response.status,body};
 };
 const post=(actor,value)=>http(actor,endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 const open=(actor,id,version)=>http(actor,endpoint+'?'+new URLSearchParams({id,version:String(version)}));
 const prepare=async(id,body)=>{
  check((await post('a',{action:'prepare_save',intentId:id,requestBody:body})).status===201,'p09_native_prepare');
  const read=await http('a',endpoint+'?intent='+id);check(read.status===200&&read.body.requestBody===body&&read.body.requestHash===createHash('sha256').update(body).digest('hex'),'p09_native_prepare_independent_get');return read.body;
 };
 const fixture=()=>({...p07FixtureWorkbook(),interpretation:'TEST_PRIVATE_WORKBOOK_TEXT\n exact synthetic content; no financial research'});
 const wb=randomUUID(),intent1=randomUUID(),body1=JSON.stringify({action:'save',workbookId:wb,creationId:wb,baseVersion:0,workbook:fixture()},null,2);
 await prepare(intent1,body1);check((await http('a',endpoint,exactWorkbookWrite(body1,intent1))).status===201,'p09_native_v1');
 check((await post('a',{action:'decide',workbookId:wb,version:1,decision:'approved_internal',note:null})).status===201,'p09_native_review_v1');
 const v1=await open('a',wb,1),otherAdmin=await open('b',wb,1);
 check(v1.status===200&&otherAdmin.status===200&&otherAdmin.body.authorMatchesSession===false,'p09_native_two_admin_canonical_read');
 check((await open('member',wb,1)).status===403,'p09_native_member_read_denied');
 const metadata1=v1.body.historyMetadata,version1=metadata1.versions[0],review1=metadata1.reviews[0];
 check(version1.id&&review1.id&&review1.versionId===version1.id&&Number.isFinite(Date.parse(version1.createdAt)),'p09_native_real_v1_review_refs');
 pass('two-real-admins-canonical-v1-review-and-member-denial',{workbookId:wb,versionId:version1.id,reviewId:review1.id,reviewVersion:1});
 const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');const mounted=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true,addEventListener(){},removeEventListener(){},get localStorage(){throw Error('p09_native_private_browser_storage_forbidden');},get sessionStorage(){throw Error('p09_native_private_browser_storage_forbidden');}}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
 try{
  const componentTransport=(path,init)=>http('a',path,init),mount=props=>{const ui=mountComponent('components/admin/ResearchWorkbook.tsx',{transport:componentTransport,...props});mounted.push(ui);return ui;};
  const ui=mount({initialWorkbookId:wb});await ui.waitFor(()=>ui.find('input',e=>e.props.id==='title').props.value===fixture().title);
  const title2='TEST synthetic native durable v2';ui.find('input',e=>e.props.id==='title').props.onChange({target:{value:title2}});await ui.settle();
  loseNextSave=true;await ui.click('ذخیره به‌عنوان');await ui.waitFor(()=>!!lostAttempt);check(ui.button('تازه').props.disabled,'p09_native_unknown_blocks_new_save');ui.unmount();
  const priorToken=users.a.session.token;users.a.session=await withNativeNodeGlobals(()=>newSession('a'));check(users.a.session.token!==priorToken,'p09_native_fresh_password_session');
  const beforeReopen=calls.length,reopened=mount({});
  await reopened.waitFor(()=>reopened.find(ResearchHistoryPanel,()=>true).props.read.state==='read');
  check(reopened.find('input',e=>e.props.id==='title').props.value===title2&&!reopened.badge(),'p09_native_remount_recovered_v2_unapproved');
  check(calls.slice(beforeReopen).every(c=>c.method==='GET'),'p09_native_reopen_must_be_get_only');
  const historyRead=reopened.find(ResearchHistoryPanel,()=>true).props.read;
  const prepared2=await http('a',endpoint+'?intent='+lostAttempt.intentId);
  check(prepared2.status===200&&prepared2.body.requestBody===lostAttempt.requestBody,'p09_native_exact_durable_body_after_remount');
  pass('real-201-discard-fresh-session-component-remount-get-only',{newPasswordSession:true,postOnRemount:false,transportDiscard:true,browserOrTcpDisconnect:false});
  const beforeRetry=calls.filter(c=>c.action==='save').length;
  const replay=await http('a',endpoint,exactWorkbookWrite(lostAttempt.requestBody,lostAttempt.intentId));
  check(replay.status===200&&replay.body.reused===true&&calls.filter(c=>c.action==='save').length===beforeRetry+1,'p09_native_exact_committed_replay');
  check(sql(`SELECT count(*) FROM public.research_workbook_versions WHERE workbook_id='${wb}'`)==='2','p09_native_no_duplicate_v2');
  pass('explicit-same-body-intent-replay-no-duplicate',{sameIntent:true,sameRequestBytes:true,versions:2});
  check((await http('b',endpoint+'?intent='+lostAttempt.intentId)).status===404,'p09_native_other_admin_journal_denied');
  check((await http('member',endpoint+'?intent='+lostAttempt.intentId)).status===403,'p09_native_member_journal_denied');
  check((await http('b',endpoint,exactWorkbookWrite(lostAttempt.requestBody,lostAttempt.intentId))).status===409,'p09_native_other_admin_replay_denied');
  check((await http('member',endpoint,exactWorkbookWrite(lostAttempt.requestBody,lostAttempt.intentId))).status===403,'p09_native_member_write_denied');
  const direct=async(actor,path,init={})=>{if(init.method&&init.method!=='GET')write('p09-intent-'+String(++sequence).padStart(3,'0')+'.json',{path,method:init.method,body:init.body},true);return transport(origin+'/rest/v1/'+path,{...init,headers:{apikey:anon,Authorization:'Bearer '+(actor==='service'?service:users[actor].session.token),'Content-Type':'application/json'}});};
  const hidden=await direct('b','research_workbook_save_intents?select=intent_id&intent_id=eq.'+lostAttempt.intentId);check(hidden.status===200&&JSON.stringify(await hidden.json())==='[]','p09_native_journal_native_rls');
  check((await direct('service','research_workbook_save_intents?select=intent_id')).status===403,'p09_native_service_journal_select_denied');
  check((await direct('service','research_workbook_versions?select=id')).status===200,'p09_native_existing_backup_canonical_read');
  const forged=users.a.session.token.split('.');forged[2]=(forged[2][0]==='a'?'b':'a')+forged[2].slice(1);
  check((await transport(origin+'/rest/v1/research_workbook_versions?select=id',{headers:{apikey:anon,Authorization:'Bearer '+forged.join('.')}})).status===401,'p09_native_real_jwt_signature_denial');
  pass('actor-owned-journal-native-rls-and-member-service-denial',{otherAdminIntent:404,member:403,serviceJournal:403,canonicalBackupRead:200,invalidJwt:401});
  reopened.unmount();const pendingWb=randomUUID(),pendingId=randomUUID(),pendingBody=JSON.stringify({action:'save',workbookId:pendingWb,creationId:pendingWb,baseVersion:0,workbook:{...fixture(),title:'TEST prepared but no workbook POST'}},null,2);
  await prepare(pendingId,pendingBody);users.a.session=await withNativeNodeGlobals(()=>newSession('a'));
  const beforePending=calls.length,pending=mount({});await pending.waitFor(()=>!pending.button('ارسال دوبارهٔ همین ثبت').props.disabled);
  check(calls.slice(beforePending).every(c=>c.method==='GET'),'p09_native_prepared_reopen_is_read_only');
  check(calls.slice(beforePending).some(c=>c.status===404&&c.body.absent===true&&c.body.workbookId===pendingWb),'p09_native_target_absence_before_retry');
  const retryStart=calls.length;await pending.click('ارسال دوبارهٔ همین ثبت');await pending.waitFor(()=>calls.slice(retryStart).some(c=>c.action==='save'&&c.status===201)&&!pending.button('تازه').props.disabled);
  const sent=calls.slice(retryStart).filter(c=>c.method==='POST');check(sent.length===1&&sent[0].action==='save'&&sent[0].requestBody===pendingBody&&sent[0].intentId===pendingId,'p09_native_explicit_retry_exact_body_and_intent');
  check((await open('a',pendingWb,1)).status===200&&sql(`SELECT count(*) FROM public.research_workbook_versions WHERE workbook_id='${pendingWb}'`)==='1','p09_native_one_retry_row');
  pass('prepared-absence-remount-explicit-ui-retry-exact-bytes',{automaticPost:false,explicitPosts:1,sameIntent:true,sameRequestBytes:true});
  const beforeProjection=calls.length,view=projectWorkbookHistory(historyRead),events=view.history.events;
  check(view.state==='read'&&events.length===3,'p09_native_metadata_event_count');
  const native=JSON.parse(sql(`SELECT json_build_object('versions',(SELECT json_agg(json_build_object('id',id,'version',version,'at',created_at) ORDER BY version) FROM public.research_workbook_versions WHERE workbook_id='${wb}'),'reviews',(SELECT json_agg(json_build_object('id',r.id,'versionId',r.version_id)) FROM public.research_workbook_reviews r JOIN public.research_workbook_versions v ON v.id=r.version_id WHERE v.workbook_id='${wb}'))`));
  assert.deepEqual(historyRead.metadata.versions.map(v=>v.id),native.versions.map(v=>v.id));
  check(historyRead.metadata.versions.every((v,i)=>Date.parse(v.createdAt)===Date.parse(native.versions[i].at)),'p09_native_persisted_version_times');
  check(events.find(e=>e.kind==='workbook_review_recorded').versionId===version1.id&&events.find(e=>e.kind==='workbook_review_recorded').version===1&&native.reviews[0].id===review1.id,'p09_native_review_exact_v1_reference');
  check(events.every(e=>e.actorId===null&&e.times.readAt===null)&&view.history.sources.filter(s=>s.source.startsWith('worker_')).every(s=>s.state==='not_supplied'),'p09_native_unknown_actors_and_worker_preserved');
  assert.doesNotMatch(JSON.stringify(historyRead),/TEST_PRIVATE_WORKBOOK_TEXT|interpretation|scenarios/);check(calls.length===beforeProjection,'p09_native_panel_no_extra_http');
  pass('same-get-metadata-real-native-references-no-panel-request',{versionIds:native.versions.map(v=>v.id),reviewId:review1.id,reviewVersionId:version1.id,extraHttpRequests:0,actorsDisclosed:false});
  check((await direct('a','research_workbook_versions?workbook_id=eq.'+wb,{method:'PATCH',body:JSON.stringify({title:'must remain denied'})})).status===403,'p09_native_version_update_denied');
  check((await direct('a','research_workbook_save_intents?intent_id=eq.'+lostAttempt.intentId,{method:'PATCH',body:JSON.stringify({request_body:'must remain denied'})})).status===403,'p09_native_intent_update_denied');
  const retained=await open('a',wb,1),v2=await open('b',wb,2);assert.deepEqual(retained.body.workbook,v1.body.workbook);
  check(retained.body.historyMetadata.reviews[0].id===review1.id&&v2.body.version===2&&v2.body.reviews.every(r=>r.version===1)&&v2.body.historyMetadata.versions.length===2,'p09_native_v1_review_preserved_v2_unapproved');
  pass('native-append-only-original-history-and-version-bound-review',{originalVersionPreserved:true,reviewStillOnV1:true,v2Approved:false,modelCalls:0,primaryTouched:false});
 }finally{for(const ui of mounted)ui.unmount();if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');}
});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{await run();}catch(error){console.error('P09_NATIVE_AUTH '+JSON.stringify({status:'BLOCKED',reason:/^[a-z0-9_]+$/.test(error.message)?error.message:'p09_native_assertion_failed_review_private_receipt',automaticReplay:false,realAuthAcceptance:false}));process.exitCode=1;}}
