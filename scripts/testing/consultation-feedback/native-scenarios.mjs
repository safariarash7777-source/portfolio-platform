// Explicit one-shot owned-native acceptance. No provisioning, admin reads or auto-replay.
// Run with the reviewed checkout's tsx CLI and one reviewed Preview URL argument.
import {readFile,open,mkdir,lstat,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const BASE=path.join(ROOT,'scripts/isolated-e2e/.local-goals-members');
const BACKEND='http://localhost:32189';
const ACTORS=['owner','a','b','admin'];
const PERIOD={startOn:'2026-10-01',endOn:'2026-10-31'};
const KEY='a6d0c1c2-17a7-483d-9b54-cfa90625b873',ACTION='b7d0c1c2-17a7-483d-9b54-cfa90625b874';
const PRIVATE_NOTE='SYNTHETIC_PRIVATE_NOTE_CONSULTATION_20261024',INTERNAL_NOTE='SYNTHETIC_INTERNAL_APPROVAL_20261024';
const check=(value,code)=>{if(!value)throw Error(code);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const json=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
function previewUrl(input,localLab=false){check(localLab&&new URL(input).href==='http://localhost:32189/','fixed_isolated_loopback_required');return 'http://localhost:32189';}
function acl(target){
 check(process.platform==='win32','windows_private_acl_required');
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='psmodulepath'));env.PSModulePath=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/Modules');env.CONSULTATION_ACL_PATH=target;
 const script="$ErrorActionPreference='Stop';$a=Get-Acl -LiteralPath $env:CONSULTATION_ACL_PATH;$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$allowed=@($me,'S-1-5-18','S-1-5-32-544');foreach($r in $a.Access){if($r.AccessControlType -eq 'Allow' -and $allowed -notcontains $r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value){exit 9}};$owner=(New-Object System.Security.Principal.NTAccount($a.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value;if($allowed -notcontains $owner){exit 10};'ACL_OK'";
 try{check(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim()==='ACL_OK','private_acl_failed');}catch{throw Error('private_acl_failed');}
}
async function protectedPath(file){check(!(await lstat(file)).isSymbolicLink()&&path.resolve(await realpath(file)).toLowerCase()===path.resolve(file).toLowerCase(),'private_path_redirect');acl(file);}
async function exclusive(file,value){const handle=await open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n','utf8');await handle.sync();}finally{await handle.close();}acl(file);}

/** Importable scenario core for offline review. All transport is explicitly supplied by caller. */
export async function runNative({preview,states,contract,errors,replies,roster,createServerClient,store,transport=fetch,onReceipt=()=>{},localLab=false,baselineResume=null}){
 preview=previewUrl(preview,localLab);const backend=localLab?preview:BACKEND;check(new Set(ACTORS.map(actor=>states[actor]?.id)).size===4,'four_distinct_owned_actors_required');
 const jars={};
 for(const actor of ACTORS){
  const value=states[actor],marker='start-a-native-20261029-'+actor;
  check(value.marker===marker&&value.session?.user?.id===value.id&&value.session.user.email===marker+'-a@example.invalid'&&value.session.user.app_metadata?.acceptance_run===marker,'owned_native_session_required');
  const decode=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  check(decode(value.anonKey).role==='anon','anon_key_required');
  const claims=decode(value.session.access_token);check(claims.sub===value.id&&claims.role==='authenticated'&&claims.exp>Date.now()/1000+120,'fresh_owned_native_token_required');
  const cookies=new Map();let authCalls=0;
  const put=rows=>{for(const row of rows){check(/^sb-[a-zA-Z0-9_.-]+$/.test(row.name)&&typeof row.value==='string'&&!/[;\r\n]/.test(row.value),'auth_cookie_invalid');if(row.options?.maxAge===0||!row.value)cookies.delete(row.name);else cookies.set(row.name,row.value);}};
  const client=createServerClient(backend,value.anonKey,{auth:{autoRefreshToken:false,detectSessionInUrl:false},cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:put},global:{fetch:async(input,init={})=>{
   const url=typeof input==='string'?input:input.url??String(input);check(url===backend+'/auth/v1/user'&&(init.method??'GET').toUpperCase()==='GET'&&++authCalls<=3,'auth_destination_forbidden');
   return transport(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
  }}});
  const session=await client.auth.setSession({access_token:value.session.access_token,refresh_token:value.session.refresh_token});
  const identity=await client.auth.getUser();
  check(!session.error&&!identity.error&&identity.data.user?.id===value.id&&identity.data.user?.app_metadata?.acceptance_run===marker&&cookies.size>0,'native_identity_mismatch');
  jars[actor]=()=>[...cookies].map(([name,value])=>`${name}=${encodeURIComponent(value)}`).join('; ');
 }
 let step=0,posts=0;const receipts=[];
 const exchange=async(actor,method,body,relationshipId,origin=true)=>{
  const query=new URLSearchParams({...PERIOD,...(relationshipId?{relationshipId}:{})});
  const headers={...(actor?{Cookie:jars[actor]()}:{})};if(method==='POST'){headers['Content-Type']='application/json';if(origin)headers.Origin=preview;}
  let response;try{response=await transport(preview+'/api/consultation'+(method==='GET'?'?'+query:''),{method,headers,...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error(method==='POST'?'write_outcome_unknown_stop_no_replay':'native_read_failed');}
  check(response.status<300||response.status>=400,'unexpected_redirect_stop');
  let value;try{value=await response.json();}catch{throw Error(method==='POST'?'write_outcome_unknown_stop_no_replay':'native_read_failed');}
  return {status:response.status,value};
 };
 const read=async(actor,relationshipId)=>{const response=await exchange(actor,'GET',null,relationshipId);check(response.status===200,'native_read_failed');return contract.validateConsultationRead(response.value,{actorId:states[actor].id,relationshipId,period:PERIOD});};
 const pass=async name=>{const safe={scenario:name,status:'PASS',checkedAt:new Date().toISOString()};receipts.push(safe);await store('pass-'+String(++step).padStart(3,'0')+'.json',safe);onReceipt(safe);};
 const requestFor=(actor,command,token)=>contract.validateConsultationRequest({contractVersion:'consultation-request.v1',expectedActorId:states[actor].id,clientToken:token??'native-start-a-native-20261029-'+String(posts+1).padStart(3,'0'),command});
 const post=async(name,actor,command,{expectedStatus=201,expectedCode,request:prior,origin=true}={})=>{
  const request=prior??requestFor(actor,command),body=JSON.stringify(request);
  // Every POST, including intentional negative/replay probes, has its own durable immutable intent.
  await store('attempt-'+String(++posts).padStart(3,'0')+'-'+name+'.json',{preview,actor,request,body,sha256:digest(body)});
  const response=await exchange(actor,'POST',body,null,origin);
  await store('response-'+String(posts).padStart(3,'0')+'.json',{status:response.status,value:response.value});
  check(response.status===expectedStatus,'write_unexpected_status_stop');
  if(expectedCode){check(errors.parseConsultationError(response.value,response.status)?.code===expectedCode,'write_noncanonical_error');return null;}
  const receipt=contract.validateConsultationReceipt(response.value,request);check(receipt.reused===(response.status===200),'receipt_replay_status_mismatch');return {receipt,request};
 };
 const deniedRead=async(actor,relationshipId)=>{const response=await exchange(actor,'GET',null,relationshipId);check(response.status===403&&errors.parseConsultationError(response.value,403)?.code==='FORBIDDEN','relationship_isolation_failed');};
 const addonExchange=async(actor,endpoint,query,body)=>{
  check(['roster','replies'].includes(endpoint),'addon_endpoint_forbidden');
  const method=body?'POST':'GET',headers={...(actor?{Cookie:jars[actor]()}:{})};if(body){headers.Origin=preview;headers['Content-Type']='application/json';}
  let response;try{response=await transport(preview+'/api/consultation/'+endpoint+(query?'?'+new URLSearchParams(query):''),{method,headers,...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error(body?'write_outcome_unknown_stop_no_replay':'native_read_failed');}
  check(response.status<300||response.status>=400,'unexpected_redirect_stop');
  let value;try{value=await response.json();}catch{throw Error(body?'write_outcome_unknown_stop_no_replay':'native_read_failed');}return {status:response.status,value};
 };
 const readRoster=async(actor,extra={})=>{const r=await addonExchange(actor,'roster',{...PERIOD,...extra});check(r.status===200,'roster_read_failed');return roster.validateRosterRead(r.value,states[actor].id);};
 const readReplies=async(actor,relationshipId,sessionId)=>{const r=await addonExchange(actor,'replies',{relationshipId,sessionId});check(r.status===200,'reply_read_failed');return replies.validateReplyRead(r.value,{actorId:states[actor].id,relationshipId,sessionId});};
 const denyAddon=async(actor,endpoint,query,status=403)=>{const r=await addonExchange(actor,endpoint,query);check(r.status===status&&(endpoint==='roster'?r.value?.error?.code:errors.parseConsultationError(r.value,status)?.code)===(status===401?'AUTH_REQUIRED':'FORBIDDEN'),'addon_isolation_failed');};
 const postReply=async(name,actor,command,{prior,expectedStatus=201,expectedCode}={})=>{
  const request=prior??replies.validateReplyRequest({contractVersion:'consultation-reply-request.v1',expectedActorId:states[actor].id,clientToken:'native-consultation-next-reply-'+String(posts+1).padStart(3,'0'),command}),body=JSON.stringify(request);
  await store('attempt-'+String(++posts).padStart(3,'0')+'-'+name+'.json',{preview,endpoint:'/api/consultation/replies',actor,request,body,sha256:digest(body)});
  const r=await addonExchange(actor,'replies',null,body);await store('response-'+String(posts).padStart(3,'0')+'.json',{status:r.status,value:r.value});check(r.status===expectedStatus,'reply_write_unexpected_status_stop');
  if(expectedCode){check(errors.parseConsultationError(r.value,r.status)?.code===expectedCode,'reply_noncanonical_error');return null;}
  const receipt=replies.validateReplyReceipt(r.value,request);check(receipt.reused===(r.status===200),'reply_replay_status_mismatch');
  check(replies.replyReceiptVisible(await readReplies(actor,command.relationshipId,command.sessionId),receipt),'reply_readback_mismatch');return {request,receipt};
 };
 let relationshipId,body,saveCommand,current;
 if(!baselineResume){
 for(const actor of ACTORS){const data=await read(actor);check(data.relationships.length===0&&data.sessions.length===0,'owned_ledger_not_empty');if(actor==='owner')check(data.actor.isOwner&&data.actor.isAdvisor,'synthetic_owner_registry_missing');else check(!data.actor.isOwner&&!data.actor.isAdvisor,'unrelated_actor_registry_invalid');}
 await pass('four-owned-native-empty');
 const anonymous=await exchange(null,'GET');check(anonymous.status===401&&errors.parseConsultationError(anonymous.value,401)?.code==='AUTH_REQUIRED','anonymous_not_rejected');await pass('anonymous-rejected');
 const grantCommand={kind:'grant',advisorId:states.owner.id,clientLabel:'عضو ساختگی پذیرش مشاوره A'};
 await post('missing-origin','a',grantCommand,{origin:false,expectedStatus:403,expectedCode:'ORIGIN_FORBIDDEN'});
 check((await read('a')).relationships.length===0,'negative_mutated_relationship');await pass('missing-origin-rejected');
 const granted=await post('grant','a',grantCommand);relationshipId=granted.receipt.id;
 check((await read('a',relationshipId)).selected.clientId===states.a.id,'grant_readback_mismatch');await pass('explicit-owned-consent');
 const replay=await post('grant-replay','a',grantCommand,{request:granted.request,expectedStatus:200});check(replay.receipt.id===relationshipId&&replay.receipt.canonicalContentHash===granted.receipt.canonicalContentHash,'grant_replay_mismatch');await pass('exact-consent-replay');
 await deniedRead('b',relationshipId);await deniedRead('admin',relationshipId);await pass('member-b-and-unrelated-admin-isolated');
 const dossier=await read('owner',relationshipId);check(dossier.dossier&&dossier.selected.advisorId===states.owner.id,'owner_dossier_missing');
 body={topic:'پذیرش ساختگی مسیر مشاوره',goal:'فقط آزمون نرم‌افزار؛ بدون توصیه واقعی',clientSummary:'خلاصهٔ صرفاً ساختگی برای پذیرش',rationale:'بررسی مسیر ثبت و تأیید با حساب مصنوعی',limitations:'فاقد اطلاعات عضو واقعی و فاقد پیشنهاد سرمایه‌گذاری',reviewOn:'2099-12-31',basis:dossier.dossier.basis,researchVersionIds:[],evidence:[{label:'سند ساختگی پذیرش ۲۰۲۶۱۰۲۴',url:null,asOf:'2026-10-24'}],actions:[{actionKey:ACTION,title:'اعلام انجام اقدام ساختگی پذیرش',dueOn:'2099-12-31',responsible:'member'}]};
 saveCommand={kind:'save',relationshipId,sessionKey:KEY,baseVersion:0,body,privateNote:PRIVATE_NOTE};
 const saved=await post('draft-v1','owner',saveCommand);current=(await read('owner',relationshipId)).sessions.find(s=>s.id===saved.receipt.id);
 check(current?.version===1&&stable(current.body)===stable(body),'draft_readback_mismatch');check((await read('a',relationshipId)).sessions.length===0,'member_saw_draft');await pass('private-versioned-draft');
 const workflow=kind=>({kind,relationshipId,sessionId:current.id,contentHash:current.contentHash,note:INTERNAL_NOTE});
 await post('publish-before-approval','owner',workflow('publish'),{expectedStatus:409,expectedCode:'CONFLICT'});await pass('publish-without-approval-rejected');
 await post('submit','owner',workflow('submit'));check((await read('owner',relationshipId)).sessions.find(s=>s.id===current.id)?.state==='submitted','submit_readback_mismatch');check((await read('a',relationshipId)).sessions.length===0,'member_saw_submitted');await pass('submit-is-not-publication');
 await post('admin-approval','admin',workflow('approve'),{expectedStatus:403,expectedCode:'FORBIDDEN'});await pass('unrelated-admin-cannot-approve');
 await post('owner-approve','owner',workflow('approve'));check((await read('owner',relationshipId)).sessions.find(s=>s.id===current.id)?.state==='approved','approval_readback_mismatch');check((await read('a',relationshipId)).sessions.length===0,'approval_published_implicitly');await pass('owner-approval-is-not-publication');
 await post('publish','owner',workflow('publish'));const member=await read('a',relationshipId);check(member.sessions.length===1&&member.sessions[0].state==='published'&&member.sessions[0].approval?.actorId===states.owner.id&&member.notes.length===0&&!stable(member).includes(PRIVATE_NOTE)&&!stable(member).includes(INTERNAL_NOTE),'publication_or_private_note_leak');await pass('published-version-private-notes-hidden');
 let generalVersion=0;
 for(const status of ['viewed','acknowledged','question']){const feedback={kind:'feedback',relationshipId,sessionId:current.id,actionKey:null,baseVersion:generalVersion,status,text:status==='question'?'پرسش صرفاً ساختگی درباره همین نسخه':null};const result=await post(status,'a',feedback);generalVersion=result.receipt.version;check((await read('a',relationshipId)).actions.some(a=>a.id===result.receipt.id&&a.status===status&&a.version===generalVersion),'feedback_readback_mismatch');await pass('member-'+status);}
 let actionVersion=0;for(const status of ['doing','done']){const result=await post('action-'+status,'a',{kind:'feedback',relationshipId,sessionId:current.id,actionKey:ACTION,baseVersion:actionVersion,status,text:null});actionVersion=result.receipt.version;check((await read('owner',relationshipId)).actions.some(a=>a.id===result.receipt.id&&a.status===status&&a.actionKey===ACTION),'action_readback_mismatch');await pass('member-action-'+status);}
 }else{
  check(localLab&&baselineResume.posts===14,'explicit_local_baseline_resume_required');posts=14;
  relationshipId=baselineResume.relationshipId;const dossier=await read('owner',relationshipId);current=dossier.sessions.find(s=>s.id===baselineResume.sessionId);
  check(dossier.sessions.length===1&&current?.version===1&&current.state==='published'&&current.contentHash===baselineResume.contentHash&&dossier.actions.length===5&&dossier.notes.some(n=>n.sessionId===current.id&&n.note===PRIVATE_NOTE),'baseline_resume_readback_mismatch');
  const replyState=await readReplies('owner',relationshipId,current.id);check(replyState.canReply&&replyState.replies.length===0,'baseline_resume_replies_not_empty');
  body=current.body;saveCommand={kind:'save',relationshipId,sessionKey:current.sessionKey,baseVersion:0,body,privateNote:PRIVATE_NOTE};await pass('existing-baseline-independently-readback-no-write-replay');
 }
 const rosterRead=await readRoster('owner');check(rosterRead.rows.length===1&&rosterRead.rows[0].relationshipId===relationshipId&&rosterRead.rows[0].risk.state==='missing'&&rosterRead.rows[0].assetValue.totalToman===null&&!rosterRead.capabilities.assetValueRange,'roster_scope_or_null_mismatch');
 check((await readRoster('owner',{riskStates:'missing'})).totalMatched===1&&(await readRoster('owner',{riskStates:'current'})).totalMatched===0,'roster_filter_mismatch');
 for(const actor of ['a','b','admin'])await denyAddon(actor,'roster',PERIOD);await denyAddon(null,'roster',PERIOD,401);await pass('roster-consent-filters-and-null');
 const question=(await read('a',relationshipId)).actions.find(a=>a.status==='question');check(question,'question_missing');
 const replyCommand={kind:'publish_reply',relationshipId,sessionId:current.id,questionId:question.id,baseVersion:0,text:'پاسخ توضیحی صرفاً ساختگی؛ بدون تغییر جمع‌بندی',purpose:'clarification'};
 for(const actor of ['b','admin'])await denyAddon(actor,'replies',{relationshipId,sessionId:current.id});
 await postReply('member-reply-denied','a',replyCommand,{expectedStatus:403,expectedCode:'FORBIDDEN'});
 const reply1=await postReply('reply-v1','owner',replyCommand);await postReply('reply-v1-replay','owner',replyCommand,{prior:reply1.request,expectedStatus:200});
 const reply2=await postReply('reply-v2','owner',{...replyCommand,baseVersion:1,text:'نسخه دوم پاسخ توضیحی صرفاً ساختگی'});
 await postReply('reply-stale','owner',replyCommand,{expectedStatus:409,expectedCode:'CONFLICT'});
 const memberReplies=await readReplies('a',relationshipId,current.id);check(!memberReplies.canReply&&memberReplies.replies.length===2&&memberReplies.replies.some(r=>r.id===reply1.receipt.id)&&memberReplies.replies.some(r=>r.id===reply2.receipt.id)&&!stable(memberReplies).includes(PRIVATE_NOTE),'reply_history_or_privacy_mismatch');await pass('reply-version-history-replay-isolation');
 const secondBody={...body,clientSummary:'نسخهٔ دوم صرفاً ساختگی؛ هنوز منتشر نشده'};
 const second=await post('draft-v2','owner',{...saveCommand,baseVersion:1,body:secondBody});const versions=(await read('owner',relationshipId)).sessions;
 check(versions.some(s=>s.id===second.receipt.id&&s.version===2&&s.state==='draft')&&versions.some(s=>s.id===current.id&&stable(s.body)===stable(body)),'second_version_or_history_mismatch');
 const memberAfterSecond=await read('a',relationshipId);check(memberAfterSecond.sessions.length===1&&memberAfterSecond.sessions[0].id===current.id,'unpublished_v2_visible');await pass('v2-preserves-published-v1');
 check((await readReplies('owner',relationshipId,current.id)).readOnlyReason==='superseded','superseded_reply_not_locked');await postReply('reply-superseded','owner',{...replyCommand,baseVersion:2},{expectedStatus:409,expectedCode:'CONFLICT'});await pass('superseded-recommendation-reply-denied');
 await post('stale-save','owner',{...saveCommand,baseVersion:0,body:secondBody},{expectedStatus:409,expectedCode:'CONFLICT'});check((await read('owner',relationshipId)).sessions.length===2,'stale_save_mutated');await pass('stale-base-rejected');
 await post('revoke','a',{kind:'revoke',relationshipId});const revoked=await read('a',relationshipId);check(revoked.selected.revoked&&revoked.sessions.length===1&&revoked.notes.length===0,'revoke_member_history_mismatch');await deniedRead('owner',relationshipId);await deniedRead('b',relationshipId);await deniedRead('admin',relationshipId);await pass('revocation-and-published-history');
 check((await readRoster('owner')).totalAuthorized===0,'revoked_roster_leak');await denyAddon('owner','replies',{relationshipId,sessionId:current.id});
 const history=await readReplies('a',relationshipId,current.id);check(!history.canReply&&history.replies.length===2,'revoked_member_reply_history_lost');await postReply('revoked-reply-replay','owner',replyCommand,{prior:reply1.request,expectedStatus:403,expectedCode:'FORBIDDEN'});await pass('revoked-roster-reply-and-history');
 const result={status:'PASS_NATIVE_API',package:'start-a-native-20261029',scenarios:receipts.length,postAttempts:posts,sessionVersions:2,publishedVersions:1,replyVersions:2,feedbackEvents:5,relationshipRevoked:true,financialLedgerWrites:0,browser:'NOT_RUN',retirement:'PENDING_SEPARATE_HELPER',checkedAt:new Date().toISOString()};await store('result.json',result);return result;
}
