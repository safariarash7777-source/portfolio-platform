/** Owned loopback-only native Auth/API acceptance. Never accepts a remote URL. */
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {root,local,origin,attest} from './native-lab.mjs';
const check=(v,code)=>{if(!v)throw Error(code);};
const hash=v=>createHash('sha256').update(v).digest('hex');
const state=JSON.parse(readFileSync(resolve(local,'lab-state.json'),'utf8'));
const states=JSON.parse(readFileSync(resolve(local,'native-sessions.json'),'utf8'));
const period={startOn:'2026-10-01',endOn:'2026-10-31'};
const {createServerClient}=createRequire(resolve(root,'package.json'))('@supabase/ssr');
const load=async name=>{const m=await import(pathToFileURL(resolve(root,name)));return m.default??m;};
const contracts=await load('lib/consultation/contracts.ts');
const goals=await load('lib/portfolio/goalsApiContract.ts');
const jars={},passes=[];let posts=0;
function store(name,value){check(/^[a-z0-9.-]+$/.test(name),'private_name');const fd=openSync(resolve(local,'extension-'+name),'wx',0o600);try{writeSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
async function identity(){attest(state);const r=await fetch(origin+'/__consultation_lab_identity',{redirect:'error',signal:AbortSignal.timeout(3000)});const v=await r.json();check(v.runId===state.id&&v.sha===state.sha,'native_app_identity_changed');}
function sql(query){attest(state);return execFileSync('docker',['exec','-i',state.db,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{input:query,encoding:'utf8',stdio:'pipe',windowsHide:true}).trim();}
async function exchange(actor,path,method='GET',body,expected=200,discard=false){
 check(['/api/consultation','/api/personal-finance/goals','/api/portfolio/holdings','/api/personal-finance/cash-flow','/rest/v1/rpc/command_consultation'].includes(path.split('?')[0]),'native_path_forbidden');
 await identity();
 const headers={};if(actor)headers.Cookie=jars[actor]();
 if(method==='POST'){headers['Content-Type']='application/json';headers.Origin=origin;store('intent-'+String(++posts).padStart(3,'0')+'.json',{actorId:state.users[actor].id,path,body});}
 if(path.startsWith('/rest/')){headers.apikey=state.anon;headers.Authorization='Bearer '+states[actor].session.access_token;delete headers.Cookie;}
 let response;try{response=await fetch(origin+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error(method==='POST'?'native_write_outcome_unknown_no_replay':'native_read_failed');}
 check(response.status===expected,'native_http_status_mismatch');
 if(discard){await response.body?.cancel();store('discarded-'+String(posts).padStart(3,'0')+'.json',{status:response.status,responseBodyDiscarded:true,noReplay:true});return null;}
 const value=await response.json();
 if(expected===403&&path.startsWith('/api/consultation'))check(value.code==='FORBIDDEN','exact_forbidden_code_required');
 if(method==='POST')store('response-'+String(posts).padStart(3,'0')+'.json',{status:response.status,value});
 return value;
}
async function read(actor,relationshipId){const value=await exchange(actor,'/api/consultation?'+new URLSearchParams({...period,relationshipId}));return contracts.validateConsultationRead(value,{actorId:state.users[actor].id,relationshipId,period});}
async function post(actor,command,expected=201,discard=false){const request=contracts.validateConsultationRequest({contractVersion:'consultation-request.v1',expectedActorId:state.users[actor].id,clientToken:'start-a-native-extension-'+randomUUID(),command});const value=await exchange(actor,'/api/consultation','POST',request,expected,discard);return expected<300&&!discard?contracts.validateConsultationReceipt(value,request):value;}
const pass=name=>{passes.push({scenario:name,status:'PASS'});console.log('PASS '+name);};
function financial(){return sql("SELECT jsonb_build_object('holdings',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY id)::text,'[]')) FROM public.member_holding_versions r),'cashflow',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY id)::text,'[]')) FROM public.member_cash_flow_versions r),'goals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY id)::text,'[]')) FROM public.member_goals_versions r));");}
async function goalVersion(version){const request=goals.validateGoalsWriteRequest({contractVersion:'goals-request.v1',expectedOwnerId:state.users.b.id,clientToken:'start-a-goals-'+randomUUID(),baseVersion:version,payload:{contractVersion:1,goals:[]}});const value=await exchange('b','/api/personal-finance/goals','POST',request,201);return goals.validateGoalsReceipt(value,request);}

async function setupJars(){
 for(const actor of ['owner','a','b','admin']){
  const value=states[actor],marker='start-a-native-20261029-'+actor;
  check(value.marker===marker&&value.session.user.id===state.users[actor].id&&value.session.user.app_metadata.acceptance_run===marker,'fresh_owned_session_required');
  const cookies=new Map();const client=createServerClient(origin,value.anonKey,{auth:{autoRefreshToken:false,detectSessionInUrl:false},cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:rows=>{for(const r of rows){if(r.options?.maxAge===0)cookies.delete(r.name);else cookies.set(r.name,r.value);}}}});
  const set=await client.auth.setSession({access_token:value.session.access_token,refresh_token:value.session.refresh_token});const user=await client.auth.getUser();
  check(!set.error&&!user.error&&user.data.user.id===value.id&&user.data.user.app_metadata.acceptance_run===marker,'native_identity_mismatch');
  jars[actor]=()=>[...cookies].map(([name,value])=>name+'='+encodeURIComponent(value)).join('; ');
 }
}
function resumePosts(){posts=Math.max(0,...readdirSync(local).map(name=>Number(name.match(/^extension-intent-(\d+)\.json$/)?.[1]??0)));return posts;}
export {state,states,read,post,exchange,goalVersion,sql,identity,store,financial,pass,setupJars,resumePosts};

async function main(){
 await identity();store('started.json',{sha:state.sha,runId:state.id,driverSha256:hash(readFileSync(new URL(import.meta.url))),startedAt:new Date().toISOString(),realAccounts:0});
 await setupJars();
 check(sql(`SELECT count(*) FROM public.consultation_advisors WHERE user_id='${state.users.admin.id}'`)==='0','unrelated_registry_not_fresh');
 sql(`INSERT INTO public.consultation_advisors(user_id,display_name,is_owner) VALUES('${state.users.admin.id}','Synthetic unrelated advisor',false)`);
 const firstFinancial=await goalVersion(0);
 const grant=await post('b',{kind:'grant',advisorId:state.users.owner.id,clientLabel:'Synthetic START-A member B'}),relation=grant.id;
 const current=await read('owner',relation),basis=current.dossier.basis;
 check(basis.goalsVersionId===firstFinancial.versionId,'native_financial_basis_missing');
 const actionKey=randomUUID(),sessionKey=randomUUID();
 const body={topic:'Synthetic START-A','goal':'Synthetic goal','clientSummary':'Synthetic member summary','rationale':'Synthetic reason','limitations':'Synthetic acceptance only','reviewOn':'2099-12-31',basis,researchVersionIds:[],evidence:[{label:'Synthetic acceptance source',url:null,asOf:'2026-10-29'}],actions:[{actionKey,title:'Synthetic action',dueOn:'2099-12-31',responsible:'member'}]};
 const draft=await post('owner',{kind:'save',relationshipId:relation,sessionKey,baseVersion:0,body,privateNote:'START_A_NATIVE_PRIVATE_CANARY'});
 const transition=async(kind,id=draft.id,expected=201)=>{const s=(await read('owner',relation)).sessions.find(s=>s.id===id);return post('owner',{kind,relationshipId:relation,sessionId:id,contentHash:s.contentHash,note:null},expected);};
 for(const stage of ['submit','approve','publish'])await transition(stage);
 pass('native financial v1, consent, draft, explicit owner approval and separate publication');
 const feedback={kind:'feedback',relationshipId:relation,sessionId:draft.id,actionKey,baseVersion:0,status:'partial',text:'Synthetic partial after native write'};
 const off=await read('b',relation);check(off.capabilities.extendedFeedbackWrite===false,'default_gate_not_off');
 for(const status of ['partial','not_done']){const error=await post('b',{...feedback,status},409);check(error.code==='FEEDBACK_DISABLED','post_gate_not_enforced');}
 const rpc={contractVersion:'consultation-request.v1',expectedActorId:state.users.b.id,clientToken:'direct-rpc-'+randomUUID(),command:feedback};
 const denied=await exchange('b','/rest/v1/rpc/command_consultation','POST',{p_request:rpc},403);check(denied.code==='42501','direct_rpc_gate_not_enforced');
 check((await read('b',relation)).actions.length===0,'off_gate_wrote_feedback');pass('native GET capability off; POST and direct authenticated PostgREST RPC blocked');
 sql(`UPDATE consultation_private.feedback_rollout SET enabled=true,reader_sha='${state.sha}',reviewed_at=now() WHERE singleton`);
 check((await read('b',relation)).capabilities.extendedFeedbackWrite===true,'native_gate_enable_not_visible');
 for(const actor of ['a','admin'])await exchange(actor,'/api/consultation?'+new URLSearchParams({...period,relationshipId:relation}),'GET',undefined,403);
 for(const actor of ['owner','admin'])await post(actor,feedback,403);
 pass('native member A and unrelated advisor isolation; member action cannot be reported by advisor');
 const balances=financial(),postsBeforeFault=posts;
 await post('b',feedback,201,true); // Real 201 headers, intentionally discard the response body.
 const afterLost=await read('b',relation),found=afterLost.actions.find(a=>a.sessionId===draft.id&&a.actionKey===actionKey&&a.status==='partial'&&a.text===feedback.text&&a.version===1);
 check(found&&posts===postsBeforeFault+1&&financial()===balances,'native_unknown_write_readback_mismatch');
 pass('discarded HTTP response AFTER commit resolved by GET of exact action/version/text; one POST, no replay');
 const next=await post('b',{...feedback,baseVersion:1,status:'not_done',text:'Synthetic not done native detail'});
 const both=await read('b',relation);check(both.actions.some(a=>a.id===next.id&&a.status==='not_done'&&a.version===2)&&financial()===balances,'native_history_or_balance_mismatch');
 check(both.notes.length===0&&!JSON.stringify(both).includes('START_A_NATIVE_PRIVATE_CANARY'),'native_private_note_leak');
 sql('UPDATE consultation_private.feedback_rollout SET enabled=false WHERE singleton');
 const disabled=await read('b',relation);check(disabled.capabilities.extendedFeedbackWrite===false&&disabled.actions.length===2,'history_lost_while_gate_off');
 await post('b',{...feedback,baseVersion:2},409);
 const rollback=JSON.parse(execFileSync(process.env.PYTHON||'python3',[resolve(root,'scripts/testing/consultation-feedback/payload-fixture.py'),'--repo',root,'--operation','rollback'],{encoding:'utf8',stdio:'pipe',windowsHide:true}));
 let blocked=false;try{sql(rollback.payload);}catch(error){blocked=String(error.stderr??'').includes('PT409');}check(blocked,'native_rollback_should_refuse_history');
 check((await read('b',relation)).actions.length===2,'native_rollback_lost_history');
 pass('both new states keep balances unchanged and remain readable while off; incompatible rollback refused');
 const second=await post('owner',{kind:'save',relationshipId:relation,sessionKey,baseVersion:1,body,privateNote:null});
 await transition('submit',second.id);const v2=await goalVersion(1);check(v2.versionId!==firstFinancial.versionId,'second_financial_version_missing');
 await transition('approve',second.id,409);const stale=await read('owner',relation);check(!stale.sessions.find(s=>s.id===second.id).approval,'stale_basis_approved');
 check((await read('b',relation)).sessions.length===1,'unpublished_draft_visible');pass('second native financial version blocks approval using v1 basis');
 await post('b',{kind:'revoke',relationshipId:relation});await exchange('owner','/api/consultation?'+new URLSearchParams({...period,relationshipId:relation}),'GET',undefined,403);
 const revoked=await read('b',relation);check(revoked.selected.revoked&&revoked.actions.length===2&&revoked.notes.length===0,'native_revoke_history_mismatch');
 pass('native revoke blocks advisor and preserves member history');
 const result={status:'PASS_START_A_LOCAL_NATIVE_AUTH_API',sha:state.sha,runId:state.id,checkedAt:new Date().toISOString(),scenarios:passes.length,passes,postAttempts:posts,
  actors:'four fresh users created in isolated GoTrue, unique IDs and owned markers verified',environment:'loopback-only isolated GoTrue/PostgREST/PG17 with real Next routes',
  syntheticFinancialWrites:2,feedbackBalanceMutation:false,fault:'HTTP response body discarded after real 201 headers; GET only, no replay',gateEnabledOnlyInOwnedSyntheticDatabase:true,
  operationalGateActivation:false,primaryInstallation:false,nativeOnlineAcceptance:false,browser:'NOT_RUN',cleanup:'PENDING_OWNER_ONLY'};
 store('result.json',result);console.log(JSON.stringify(result));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({status:'BLOCKED',reason:/^[a-z_]{1,100}$/.test(error.message)?error.message:'native_extension_failed_review_private_receipts',automaticReplay:false}));process.exitCode=2;});
