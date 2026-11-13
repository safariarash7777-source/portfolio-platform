// Acceptance scenario only. Reuses the existing owned Linux runtime and Chrome.
// No product code/SQL changes, new service, primary access or POST replay.
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runNativeAuthProfile, feedbackReaderChecks, feedbackReaderSha, feedbackSqlPins } from './native-auth-runtime.mjs';
import { preflight, cleanup, storageAudit, sdkCookies, browserDestination, browserFailureCode } from './browser.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const MODE='feedback-reader-v1',PERIOD={startOn:'2026-10-01',endOn:'2026-10-31'},DATE='2026-10-29';
const check=(value,code)=>{if(!value)throw Error(code);};
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const stable=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const digest=value=>createHash('sha256').update(value).digest('hex');
const load=async path=>{const value=await import(pathToFileURL(resolve(root,path)));return value.default??value;};
export const feedbackAcceptanceMode=MODE;
export function originalFeedbackRows(data,keys){
 check(Array.isArray(data?.actions)&&Array.isArray(keys)&&keys.length===2&&new Set(keys).size===2,'p03_feedback_expected_actions');
 const rows=keys.map(key=>data.actions.filter(row=>row.actionKey===key));
 check(rows.every(matches=>matches.length===1),'p03_feedback_original_row_missing');
 const result=rows.map(([row])=>({id:row.id,sessionId:row.sessionId,actionKey:row.actionKey,version:row.version,status:row.status,text:row.text,actorId:row.actorId,createdAt:row.createdAt}));
 check(result[0].status==='partial'&&result[1].status==='not_done'&&result.every(row=>row.version===1&&typeof row.id==='string'&&typeof row.createdAt==='string'&&typeof row.text==='string'&&row.text.length>0),'p03_feedback_original_row_contract');
 return result;
}
export function requireOriginalFeedbackRows(original,current){
 check(stable(original)===stable(current),'p03_feedback_history_identity_changed');
}
async function exercise(ctx,s){
 const contracts=await load('lib/consultation/contracts.ts'),cash=await load('lib/portfolio/cashFlowApiContract.ts');
 const {users,sql,api}=ctx,checks=[],posts=new Map(),needles=[];
 let domPosts=0,privateStorageHits=0,privateUrlHits=0;const pageErrors=[];
 const pass=(name,evidence={})=>{check(feedbackReaderChecks.includes(name)&&!checks.some(x=>x.name===name),'p03_feedback_check_identity');checks.push({name,status:'PASS'});ctx.pass(name,evidence);};
 const expect=async(actor,path,body,expected=body===undefined?200:201)=>{const result=await api(actor,path,body);check(result.status===expected,'p03_feedback_http_status');return result.value;};
 const postRequest=async(actor,request,expected=201)=>{
  const input=contracts.validateConsultationRequest(request),key=actor+':'+input.clientToken;
  check(!posts.has(key),'p03_feedback_repeated_post_forbidden');posts.set(key,1);
  const response=await expect(actor,'/api/consultation',input,expected);
  return expected===200||expected===201?contracts.validateConsultationReceipt(response,input):response;
 };
 const command=(actor,command,expected=201)=>postRequest(actor,{contractVersion:'consultation-request.v1',expectedActorId:users[actor].id,clientToken:randomUUID(),command},expected);
 const read=async(actor,relationshipId)=>contracts.validateConsultationRead(await expect(actor,'/api/consultation?'+new URLSearchParams({...PERIOD,relationshipId})),{actorId:users[actor].id,relationshipId,period:PERIOD});
 const financialFingerprint=()=>sql('BEGIN READ ONLY;SELECT jsonb_build_object('+['member_holding_versions','member_holding_positions','member_debt_positions','member_cash_flow_versions','member_cash_flow_entries','member_goals_versions'].map(name=>quote(name)+",(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]'),'UTF8')),'hex') FROM public."+name+' r)').join(',')+');COMMIT;');
 for(const pin of feedbackSqlPins)check(ctx.appliedMigrations().filter(x=>x.file===pin.file&&x.sha256===pin.sha256).length===1,'p03_feedback_applied_sql_pin');
 check(ctx.readerSha===feedbackReaderSha&&sql('SELECT enabled::text FROM consultation_private.feedback_rollout WHERE singleton')==='false','p03_feedback_initial_rollout_open');
 check(sql("SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated','service_role') AND ((table_schema='public' AND table_name='consultation_actions') OR (table_schema='consultation_private' AND table_name='feedback_rollout'))")==='0','p03_feedback_private_table_grants_changed');
 pass('immutable-sql-and-default-closed',{sqlFiles:2,immutablePins:true,defaultDbStop:true,readerSha:feedbackReaderSha,productServiceRight:'NOT_CONNECTED'});

 const position={position_key:'feedback-synthetic-cash',manual_label:'Synthetic declared cash',symbol:null,asset_class:'cash',qty:null,unit:'item',as_of:DATE,title:'Synthetic feedback fixture',ownership_pct:100,valuation_mode:'declared',declared_value:1000000,currency:'IRT',valuation_source:'Synthetic declaration only',valuation_as_of:DATE,valuation_status:'estimated'};
 const holding=await expect('a','/api/portfolio/holdings',{base_version:0,client_token:randomUUID(),positions:[position],note:'Owned feedback acceptance only'});
 const source={label:'Synthetic financial statement',observedOn:DATE};
 const payload={contractVersion:1,period:PERIOD,accountDefinitions:[{accountKey:'synthetic-bank',label:'Synthetic bank account'}],scopeAccountKeys:['synthetic-bank'],opening:{amountToman:500000,atStartOn:PERIOD.startOn,source},coverage:{planned:{status:'unknown',memberAffirmed:false,source:null},actual:{status:'complete',memberAffirmed:true,source}},entries:[{entryKey:'income',basis:'actual',kind:'income',accountKey:'synthetic-bank',amountToman:100000,occurredOn:'2026-10-02',source,category:null,note:null},{entryKey:'expense',basis:'actual',kind:'expense',accountKey:'synthetic-bank',amountToman:20000,occurredOn:'2026-10-03',source,category:null,note:null}]};
 const cashInput=cash.validateCashFlowWriteRequest({contractVersion:'cash-flow-request.v1',expectedOwnerId:users.a.id,clientToken:randomUUID(),baseVersion:0,payload});
 const cashReceipt=cash.validateCashFlowReceipt(await expect('a','/api/personal-finance/cash-flow',cashInput),cashInput);
 const cashRead=cash.validateCashFlowRead(await expect('a','/api/personal-finance/cash-flow?'+new URLSearchParams(PERIOD)),{ownerId:users.a.id,period:PERIOD});
 check(holding.version===1&&cashRead.report.actual.closingToman===580000&&cashRead.report.planned.netToman===null,'p03_feedback_nonzero_financial_readback');
 sql(`INSERT INTO public.consultation_advisors(user_id,display_name,enabled,is_owner) VALUES(${quote(users.owner.id)},'Synthetic feedback owner',true,true);`);
 const relation=(await command('a',{kind:'grant',advisorId:users.owner.id,clientLabel:'Synthetic feedback member'})).id;
 const parent=await read('owner',relation);check(parent.dossier.basis.holdingsVersionId===holding.version_id&&parent.dossier.basis.cashFlowVersionId===cashReceipt.versionId,'p03_feedback_published_basis');
 const keys=Array.from({length:4},()=>randomUUID()),sessionKey=randomUUID(),privateNote='SYNTHETIC_PRIVATE_FEEDBACK_ADVISOR_NOTE';
 const body={topic:'نسخهٔ آموزشی پیگیری',goal:'آزمون سازگاری خواننده',clientSummary:'پروندهٔ ساختگی و غیرعملیاتی',rationale:'تنها بررسی نرم‌افزار',limitations:'فقط داده و رابطهٔ ساختگی برای آزمون نرم‌افزار',reviewOn:'2099-12-31',basis:parent.dossier.basis,researchVersionIds:[],evidence:[{label:'Synthetic financial fixture',url:null,asOf:DATE}],actions:keys.map((actionKey,index)=>({actionKey,title:['Synthetic partial action','Synthetic not-done action','Synthetic legacy doing','Synthetic legacy done'][index],dueOn:'2099-12-31',responsible:index%2===0?'member':'advisor'}))};
 const session=await command('owner',{kind:'save',relationshipId:relation,sessionKey,baseVersion:0,body,privateNote});
 for(const kind of ['submit','approve','publish']){const current=(await read('owner',relation)).sessions.find(x=>x.id===session.id);await command('owner',{kind,relationshipId:relation,sessionId:session.id,contentHash:current.contentHash,note:null});}
 const published=(await read('a',relation)).sessions.find(x=>x.id===session.id);check(published.state==='published'&&published.version===1&&published.body.actions.length===4,'p03_feedback_nonzero_published_version');
 const beforeFinancial=financialFingerprint();ctx.write('feedback-original-basis.json',{basis:published.body.basis,financialFingerprint:beforeFinancial},true);
 pass('nonzero-published-version-and-valid-consent',{publishedVersion:1,actions:4,holdingsToman:1000000,actualClosingToman:580000,plannedUnknown:true,realActorConsent:true});

 const details=['SYNTHETIC_PRIVATE_PARTIAL_699\nجزئیات اصلی «بخشی انجام شد»','SYNTHETIC_PRIVATE_NOT_DONE_699\nجزئیات اصلی «انجام نشد»'];
 needles.push(privateNote,...details);
 // Existing rollout fixture data, not SQL rewriting or a product service grant.
 sql(`UPDATE consultation_private.feedback_rollout SET enabled=true,reader_sha=${quote(feedbackReaderSha)},reviewed_at=clock_timestamp() WHERE singleton;`);
 await ctx.setWriteRelease(true);
 const statuses=['partial','not_done'],actors=['a','owner'],receipts=[];
 for(let index=0;index<2;index++)receipts.push(await command(actors[index],{kind:'feedback',relationshipId:relation,sessionId:session.id,actionKey:keys[index],baseVersion:0,status:statuses[index],text:details[index]}));
 const original=originalFeedbackRows(await read('a',relation),keys.slice(0,2));
 check(original.every((row,index)=>row.id===receipts[index].id&&row.actorId===users[actors[index]].id&&row.text===details[index]),'p03_feedback_real_receipt_row_mismatch');
 ctx.write('feedback-original-rows.json',{rows:original},true);
 pass('actual-two-actor-partial-not-done',{actors:2,realPosts:2,originalIdsRecorded:true,originalTimesRecorded:true,originalRowsHash:digest(stable(original))});

 const openPage=async(actor)=>{
  const context=await s.browser.newContext({serviceWorkers:'block',viewport:actor==='a'?{width:390,height:844}:{width:1440,height:1000}});s.contexts.push(context);
  needles.push(users[actor].session.token,...sdkCookies(users[actor].session.cookie).map(x=>x.value));await context.addCookies(sdkCookies(users[actor].session.cookie));
  const page=await context.newPage();page.on('pageerror',()=>pageErrors.push('runtime_error'));
  await context.route('**/*',async route=>{const request=route.request();if(!browserDestination(request.url(),request.method(),MODE)){s.asyncFailure='p03_feedback_browser_destination';await route.abort();return;}if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/consultation')domPosts++;await route.continue();});
  await page.goto(ctx.origin+(actor==='a'?'/dashboard/consultation':'/admin/consultation')+'?'+new URLSearchParams({relation}),{waitUntil:'domcontentloaded'});
  await ctx.wait(async()=>{if(s.asyncFailure)throw Error(s.asyncFailure);return await page.getByText(body.topic,{exact:true}).isVisible();},'p03_feedback_page_ready',60);
  return {page,context,actor};
 };
 const beforeMember=await openPage('a'),beforeOwner=await openPage('owner');
 check(await beforeMember.page.getByRole('button',{name:'بخشی انجام دادم',exact:true}).first().isEnabled()&&await beforeOwner.page.getByRole('button',{name:'انجام ندادم',exact:true}).first().isEnabled(),'p03_feedback_initial_consumer_capability');
 await ctx.setWriteRelease(false);
 const appDenied=await command('a',{kind:'feedback',relationshipId:relation,sessionId:session.id,actionKey:keys[0],baseVersion:1,status:'partial',text:'SYNTHETIC_DENIED_APP_STOP'},409);
 check(appDenied.code==='FEEDBACK_DISABLED'&&sql('SELECT enabled::text FROM consultation_private.feedback_rollout WHERE singleton')==='true','p03_feedback_app_stop_not_independent');
 requireOriginalFeedbackRows(original,originalFeedbackRows(await read('a',relation),keys.slice(0,2)));
 sql('UPDATE consultation_private.feedback_rollout SET enabled=false WHERE singleton;');
 const directInput=contracts.validateConsultationRequest({contractVersion:'consultation-request.v1',expectedActorId:users.a.id,clientToken:randomUUID(),command:{kind:'feedback',relationshipId:relation,sessionId:session.id,actionKey:keys[0],baseVersion:1,status:'partial',text:'SYNTHETIC_DENIED_DB_STOP'}});
 const direct=await ctx.post('/rest/v1/rpc/command_consultation',{p_request:directInput},{Authorization:'Bearer '+users.a.session.token,apikey:ctx.anon});
 check(direct.status===403&&(await direct.json()).code==='42501','p03_feedback_db_stop_direct_rpc_open');
 requireOriginalFeedbackRows(original,originalFeedbackRows(await read('a',relation),keys.slice(0,2)));
 pass('separate-app-stop-and-db-stop',{appStop:409,dbStop:403,directRpcBlocked:true,originalEffects:2,additionalFeedbackEffects:0});

 for(const item of [beforeMember,beforeOwner])await item.context.close();
 for(const actor of actors){const previous=users[actor].session.token;const signedOut=await ctx.post('/auth/v1/logout',{}, {Authorization:'Bearer '+previous,apikey:ctx.anon});check([200,204].includes(signedOut.status),'p03_feedback_password_logout');users[actor].session=await ctx.newSession(actor);check(users[actor].session.token!==previous,'p03_feedback_password_session_not_fresh');}
 for(const actor of actors){const current=await read(actor,relation);requireOriginalFeedbackRows(original,originalFeedbackRows(current,keys.slice(0,2)));check(current.capabilities?.extendedFeedbackWrite===false,'p03_feedback_fresh_capability_open');}
 const newDomStart=domPosts,newPostCount=posts.size;
 const member=await openPage('a'),owner=await openPage('owner');
 const verifyDom=async item=>{
  const history=item.page.locator('details').filter({has:item.page.locator('summary').filter({hasText:'سابقهٔ مشاهده و اقدام‌ها'})});
  check(await history.count()===1,'p03_feedback_history_section');
  if(!await history.evaluate(node=>node.open))await history.locator('summary').click();
  for(let index=0;index<2;index++){
   const row=history.locator('li').filter({hasText:details[index].split('\n')[0]});check(await row.count()===1,'p03_feedback_dom_original_row_missing');
   check(await row.locator('p.whitespace-pre-wrap').textContent()===original[index].text,'p03_feedback_dom_original_text');
   check(await row.locator('time').getAttribute('datetime')===original[index].createdAt,'p03_feedback_dom_original_time');
   check((await row.textContent()).includes(index===0?'بخشی انجام‌شده طبق اعلام':'انجام‌نشده طبق اعلام'),'p03_feedback_dom_original_status');
  }
  for(const label of ['بخشی انجام دادم','انجام ندادم'])for(const button of await item.page.getByRole('button',{name:label,exact:true}).all())check(await button.isDisabled(),'p03_feedback_dom_writer_open');
  if(item.actor==='a')check(!(await item.page.textContent('body')).includes(privateNote),'p03_feedback_member_private_note');
  check(await item.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'p03_feedback_dom_page_overflow');
  const audit=await storageAudit(item.page,needles);privateStorageHits+=audit.hits;privateUrlHits+=audit.urlHit?1:0;
 };
 await verifyDom(member);await verifyDom(owner);
 check(domPosts===newDomStart&&posts.size===newPostCount,'p03_feedback_fresh_history_caused_post');
 pass('fresh-password-sdk-get-and-original-dom-history',{freshActors:2,originalIdsPreserved:true,originalTextPreserved:true,originalTimeAttributesPreserved:true,domStatusLabels:true,capability:false,automaticPosts:0});

 await command('a',{kind:'feedback',relationshipId:relation,sessionId:session.id,actionKey:keys[2],baseVersion:0,status:'doing',text:null});
 await command('owner',{kind:'feedback',relationshipId:relation,sessionId:session.id,actionKey:keys[3],baseVersion:0,status:'done',text:null});
 const legacy=await read('a',relation);requireOriginalFeedbackRows(original,originalFeedbackRows(legacy,keys.slice(0,2)));check(legacy.actions.find(x=>x.actionKey===keys[2])?.status==='doing'&&legacy.actions.find(x=>x.actionKey===keys[3])?.status==='done','p03_feedback_legacy_states_closed');
 const afterHoldings=await expect('a','/api/portfolio/holdings'),afterCash=cash.validateCashFlowRead(await expect('a','/api/personal-finance/cash-flow?'+new URLSearchParams(PERIOD)),{ownerId:users.a.id,period:PERIOD});
 check(afterHoldings.positions[0]?.declared_value===1000000&&afterCash.report.actual.closingToman===580000&&afterCash.report.planned.netToman===null,'p03_feedback_closed_financial_reader_changed');
 check(financialFingerprint()===beforeFinancial,'p03_feedback_financial_fingerprint_changed');
 pass('legacy-doing-done-and-stable-financials',{legacyRealPosts:2,legacyDoing:true,legacyDone:true,newFeedbackRowsUnchanged:true,financialFingerprintUnchanged:true});

 await command('a',{kind:'revoke',relationshipId:relation});
 for(const actor of ['owner','b','admin']){const denied=await expect(actor,'/api/consultation?'+new URLSearchParams({...PERIOD,relationshipId:relation}),undefined,403);check(!stable(denied).includes(details[0])&&!stable(denied).includes(privateNote),'p03_feedback_private_denial_leaked');}
 const revoked=await read('a',relation);requireOriginalFeedbackRows(original,originalFeedbackRows(revoked,keys.slice(0,2)));check(revoked.selected.revoked===true&&revoked.capabilities.extendedFeedbackWrite===false,'p03_feedback_revoked_member_history');
 await member.page.reload({waitUntil:'domcontentloaded'});await ctx.wait(()=>member.page.getByText(body.topic,{exact:true}).isVisible(),'p03_feedback_revoked_dom_ready',60);await verifyDom(member);
 check(financialFingerprint()===beforeFinancial&&sql(`SELECT count(*) FROM public.consultation_actions WHERE session_id=${quote(session.id)} AND status IN ('partial','not_done')`)==='2','p03_feedback_final_effect_changed');
 pass('revocation-and-member-history',{revokedAdvisorDenied:true,unrelatedMemberDenied:true,unrelatedAdminDenied:true,memberHistoryRetained:true,newStatusRows:2,financialFingerprintUnchanged:true});
 check(!s.asyncFailure&&pageErrors.length===0&&domPosts===0&&[...posts.values()].every(n=>n===1),'p03_feedback_unexpected_post_or_runtime');
 const removed=await cleanup(s);s.cleaned=true;
 pass('owned-browser-cleanup-and-no-repeat',{processStopped:removed.processStopped,contextsClosed:removed.contextsClosed,ownedTempRemoved:removed.ownedTempRemoved,repeatedPosts:0,domAutomaticPosts:0});
 return {browser:{status:'PASS',readerSha:feedbackReaderSha,driverVersion:'1.64.1',sourceExecutable:'/opt/google/chrome/chrome',sourceSha256:s.sourceSha256,executable:s.executable,ownedTemp:s.local,ownerId:s.owner,chromeVersion:s.chromeVersion,chromeSha256:s.chromeSha256,closure:s.closure,checks,freshAuthActors:2,originalRowsStable:true,domHistoryVerified:true,appStopVerified:true,dbStopVerified:true,legacyStatesVerified:true,financialFingerprintUnchanged:true,revocationVerified:true,repeatedPosts:0,domAutomaticPosts:domPosts,privateStorageHits,privateUrlHits,cleanup:removed}};
}
export async function runFeedbackReader(){
 let state;
 try{state=await preflight();await runNativeAuthProfile('consultation-ticket',ctx=>exercise(ctx,state),{browserMode:true,acceptance:MODE});}
 finally{if(state&&!state.cleaned)await cleanup(state);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runFeedbackReader().catch(error=>{console.error('P03_FEEDBACK_FAILURE '+JSON.stringify({status:'FAIL',reason:/^(?:p03_feedback|pf10_native|p09_browser)_[a-z0-9_]+$/.test(error?.message??'')?error.message:browserFailureCode(error),automaticRetry:false,targetInstall:'NOT_APPLIED',productServiceRight:'NOT_CONNECTED'}));process.exitCode=1;});
