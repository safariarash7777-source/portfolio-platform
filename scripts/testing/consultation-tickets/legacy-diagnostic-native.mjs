// Actual installed SDK, GoTrue, RLS and frozen Next consumer in the existing lab.
// All credentials/rows/network observations stay private in this process.
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNativeAuthProfile, legacyDiagnosticSha, legacyDiagnosticChecks, legacySqlPin } from './native-auth-runtime.mjs';
import { preflight, cleanup, storageAudit, sdkCookies, browserDestination, browserFailureCode } from './browser.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export const legacyAcceptanceMode='legacy-diagnostic-v1';
export const selectedLegacyFields='id,user_id,kind,source,starts_at,expires_at,revoked_at';
const check=(value,code)=>{if(!value)throw Error('p03_legacy_'+code);};
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
// Pure validation of a private observed request; returns no URL, header or ID.
export function legacySelectMatches(url,headers,actorId,jwt){
 try{const u=new URL(url);return u.origin==='http://localhost:32189'&&u.pathname==='/rest/v1/entitlements'&&u.searchParams.get('select')===selectedLegacyFields&&u.searchParams.get('user_id')==='eq.'+actorId&&u.searchParams.get('order')==='id.asc'&&u.searchParams.get('offset')==='0'&&u.searchParams.get('limit')==='1000'&&[...u.searchParams.keys()].sort().join(',')==='limit,offset,order,select,user_id'&&headers.authorization==='Bearer '+jwt&&headers.prefer?.split(',').includes('count=exact')===true;}catch{return false;}
}
async function exercise(ctx,s){
 const {users,sql}=ctx,checks=[];let domPosts=0,privateStorageHits=0,privateUrlHits=0;
 const allPages=[],errors=[],markers=['SYNTHETIC_LEGACY_EXPIRED','SYNTHETIC_LEGACY_ACTIVE_<img src=x onerror=alert(1)>','SYNTHETIC_LEGACY_FOREIGN'];
 const pass=(name,evidence={})=>{check(legacyDiagnosticChecks.includes(name)&&!checks.some(x=>x.name===name),'check_identity');checks.push({name,status:'PASS'});ctx.pass(name,evidence);};
 const requireOk=async(actor,path,body,status=body===undefined?200:201)=>{const r=await ctx.api(actor,path,body);check(r.status===status,'real_api_status');return r.value;};
 check(ctx.readerSha===legacyDiagnosticSha&&ctx.appliedMigrations().filter(x=>x.file===legacySqlPin.file&&x.sha256===legacySqlPin.sha256).length===1,'source_schema_pin');
 check(sql("SELECT has_table_privilege('authenticated','public.entitlements','SELECT')::text")==='false','strict_grant_baseline');
 check(sql('SELECT count(*) FROM auth.users')==='4','fresh_users_only');
 sql(`INSERT INTO public.consultation_advisors(user_id,display_name,enabled,is_owner) VALUES(${quote(users.owner.id)},'Synthetic legacy owner',true,true);`);
 const relation=(await requireOk('a','/api/consultation',{contractVersion:'consultation-request.v1',expectedActorId:users.a.id,clientToken:randomUUID(),command:{kind:'grant',advisorId:users.owner.id,clientLabel:'Synthetic legacy member'}})).id;
 check(typeof relation==='string','relationship_receipt');
 const expired=randomUUID(),active=randomUUID(),foreign=randomUUID();
 sql(`INSERT INTO public.entitlements(id,user_id,kind,source,starts_at,expires_at) VALUES(${quote(expired)},${quote(users.a.id)},'consulting',${quote(markers[0])},now()-interval '2 days',now()-interval '1 day'),(${quote(foreign)},${quote(users.b.id)},'consulting',${quote(markers[2])},now()-interval '1 day',now()+interval '2 days');`);
 const readDirect=async(actor,userId)=>{const r=await ctx.transport(ctx.origin+'/rest/v1/entitlements?'+new URLSearchParams({select:selectedLegacyFields,user_id:'eq.'+userId,order:'id.asc',offset:'0',limit:'1000'}),{headers:{apikey:ctx.anon,Authorization:'Bearer '+users[actor].session.token,Prefer:'count=exact'}});return {status:r.status,rows:await r.json(),range:r.headers.get('content-range')};};
 const denied=await readDirect('a',users.a.id);check(denied.status===403,'strict_grant_denial');
 // Only this attested owned tmpfs DB. No writer grant/policy/product SQL change.
 sql('GRANT SELECT ON public.entitlements TO authenticated;');
 check(sql("SELECT has_table_privilege('authenticated','public.entitlements','SELECT') AND NOT has_table_privilege('authenticated','public.entitlements','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.entitlements','SELECT')")==='t','read_only_fixture_grant');
 const parent=await requireOk('a','/api/consultation?'+new URLSearchParams({relationshipId:relation,startOn:'2026-10-01',endOn:'2026-10-31'}));
 check(parent.selected?.clientId===users.a.id,'valid_parent_member');
 pass('immutable-source-default-closed',{readerSha:legacyDiagnosticSha,existingPhase11:true,strictBaselineStatus:403,tmpfsSelectGrantOnly:true,productServiceRight:'NOT_CONNECTED'});
 const own=await readDirect('a',users.a.id),other=await readDirect('a',users.b.id),bOwn=await readDirect('b',users.b.id);
 check(own.status===200&&own.rows.length===1&&own.rows[0].id===expired&&own.range?.endsWith('/1')&&other.status===200&&other.rows.length===0&&other.range?.endsWith('/0')&&bOwn.status===200&&bOwn.rows.length===1&&bOwn.rows[0].id===foreign,'own_foreign_rls');
 const auditPage=async state=>{const audit=await storageAudit(state.page,[...markers,...Object.values(users).flatMap(u=>[u.email,u.password,u.session.token,...sdkCookies(u.session.cookie).map(x=>x.value)])]);privateStorageHits+=audit.hits;privateUrlHits+=Number(audit.urlHit);};
 const closePage=async state=>{await auditPage(state);await state.context.close();};
 const open=async actor=>{
  const context=await s.browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});s.contexts.push(context);await context.addCookies(sdkCookies(users[actor].session.cookie));
  const page=await context.newPage(),state={page,context,actor,ent:[],auth:[],pending:[]};allPages.push(state);
  page.on('pageerror',()=>errors.push('runtime_error'));
  page.on('response',response=>{const req=response.request();if(new URL(req.url()).pathname==='/auth/v1/user'&&req.method()==='GET'){const task=(async()=>{if(response.status()!==200)return;const body=await response.json();state.auth.push({jwt:(await req.allHeaders()).authorization,userId:body.id});})();state.pending.push(task);}});
  await context.route('**/*',async route=>{try{
   const req=route.request(),u=new URL(req.url());check(browserDestination(req.url(),req.method(),legacyAcceptanceMode),'browser_destination');
   if(!['GET','HEAD'].includes(req.method())&&!u.pathname.startsWith('/auth/v1/')){domPosts++;throw Error('p03_legacy_browser_write');}
   if(u.pathname==='/rest/v1/entitlements'){
    check(req.method()==='GET'&&actor==='a','unexpected_side_get');await Promise.all(state.pending);
    const headers=await req.allHeaders(),previous=state.auth.findLast(x=>x.jwt===headers.authorization&&x.userId===users[actor].id);
    check(previous&&legacySelectMatches(req.url(),headers,users[actor].id,users[actor].session.token),'same_jwt_actual_getuser_select');
    state.ent.push(true);
   }
   await route.continue();
  }catch{ s.asyncFailure='p03_legacy_browser_observation_failed';await route.abort();}});
  await page.goto(ctx.origin+(actor==='a'?'/dashboard/consultation/requests':'/admin/consultation/requests')+'?'+new URLSearchParams({relation}),{waitUntil:'domcontentloaded'});
  await ctx.wait(async()=>{check(!s.asyncFailure,'async_browser');return await page.locator('section[aria-label="حدود حق خدمت"]').isVisible();},'p03_legacy_page_ready',60);
  return state;
 };
 const section=page=>page.locator('section[aria-label="حدود حق خدمت"]');
 const ready=async(state,activeState,marker)=>{
  const expected=activeState?'در اطلاعات خوانده‌شده، در زمان ارزیابی فعال است.':'در اطلاعات خوانده‌شده، دسترسی فعال از این نوع گزارش نشده است.';
  await ctx.wait(async()=>{check(!s.asyncFailure,'async_browser');return await section(state.page).getByText(expected,{exact:true}).isVisible();},'p03_legacy_dom_state',60);
  check(await section(state.page).getByText('هنوز متصل نیست.',{exact:true}).isVisible(),'service_not_connected_dom');
  check(await state.page.getByRole('button',{name:'ثبت آزمایشی با بررسی سرور',exact:true}).isDisabled(),'product_write_closed_dom');
  const detail=section(state.page).locator('details');await detail.locator('summary').click();
  check((await detail.innerText()).includes(marker)&&(await detail.innerText()).includes('تأییدنشده برای این خدمت'),'unverified_source_dom');
  check(await detail.locator('img').count()===0&&!((await state.page.locator('body').innerText()).includes(markers[2])),'source_escape_foreign_dom');
  check(state.ent.length===1,'single_side_get');
 };
 let member=await open('a');await ready(member,false,markers[0]);
 pass('actual-sdk-same-jwt-own-versus-foreign-rls',{actualBrowserGetUserBeforeSelect:true,sameAuthorizationVerifiedPrivately:true,exactSevenColumns:true,exactCount:true,oneOwnRow:true,foreignRows:0,secondMemberOwnRow:true});
 pass('expired-source-unverified-dom',{legacyState:'inactive',serviceRight:'NOT_CONNECTED',writeEnabled:false});await closePage(member);
 sql(`INSERT INTO public.entitlements(id,user_id,kind,source,starts_at,expires_at) VALUES(${quote(active)},${quote(users.a.id)},'consulting',${quote(markers[1])},now()-interval '1 day',now()+interval '2 days');`);
 member=await open('a');await ready(member,true,markers[1]);pass('active-source-unverified-dom',{legacyState:'active',escapedSource:true,serviceRight:'NOT_CONNECTED',writeEnabled:false});await closePage(member);
 sql(`UPDATE public.entitlements SET revoked_at=now() WHERE id=${quote(active)};`);
 member=await open('a');await ready(member,false,markers[1]);pass('revoked-source-unverified-dom',{legacyState:'inactive',serviceRight:'NOT_CONNECTED',writeEnabled:false});
 const advisor=await open('owner');await advisor.page.getByRole('button',{name:'بازخوانی بدون ارسال دوباره',exact:true}).click();
 await ctx.wait(async()=>!(await advisor.page.getByRole('button',{name:'بازخوانی بدون ارسال دوباره',exact:true}).isDisabled()),'p03_legacy_advisor_refresh',60);
 check(advisor.ent.length===0&&await advisor.page.locator('[aria-label="اطلاعات دسترسی قدیمی خود عضو"]').count()===0,'advisor_zero_side_get');
 pass('advisor-other-client-zero-side-get',{beforeAndAfterRefresh:0,otherClientDiagnosticAbsent:true});
 // Bundle the installed SSR SDK only in memory. Same real cookie adapter/auth
 // events as the app; no mock auth event, extra endpoint or product import.
 const {buildSync}=createRequire(resolve(root,'package.json'))('esbuild');
 const sdk=buildSync({stdin:{contents:"import {createBrowserClient} from '@supabase/ssr';export const client=createBrowserClient("+JSON.stringify(ctx.origin)+','+JSON.stringify(ctx.anon)+");",resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',globalName:'LegacyAcceptanceSDK'}).outputFiles[0].text;
 await member.page.addScriptTag({content:sdk});
 const switched=await member.page.evaluate(async token=>{const r=await LegacyAcceptanceSDK.client.auth.setSession({access_token:token,refresh_token:'unused-owned-acceptance'});const u=await LegacyAcceptanceSDK.client.auth.getUser();return !r.error&&!u.error&&u.data.user?.id===r.data.user?.id;},users.b.session.token);check(switched,'actual_sdk_identity_switch');
 await ctx.wait(async()=>await section(member.page).count()===0&&!(await member.page.locator('body').innerText()).includes(markers[1]),'p03_legacy_identity_clear',60);
 check(member.ent.length===1,'identity_no_late_side_get');pass('actual-sdk-identity-clear',{realSdkDifferentMember:true,diagnosticCleared:true,noLateSideGet:true});await closePage(member);
 member=await open('a');await ready(member,false,markers[1]);await member.page.addScriptTag({content:sdk});
 check(await member.page.evaluate(async()=>!(await LegacyAcceptanceSDK.client.auth.signOut()).error),'actual_sdk_signout');
 await ctx.wait(async()=>await section(member.page).count()===0&&!(await member.page.locator('body').innerText()).includes(markers[1]),'p03_legacy_signout_clear',60);
 check(member.ent.length===1,'signout_no_late_side_get');pass('actual-sdk-signout-clear',{realSdkSignout:true,diagnosticCleared:true,noLateSideGet:true});
 for(const state of allPages)if(!state.context.isClosed()){
  await auditPage(state);
 }
 check(!s.asyncFailure&&errors.length===0&&domPosts===0&&privateStorageHits===0&&privateUrlHits===0,'private_or_runtime_or_write');
 check(sql('SELECT count(*) FROM public.entitlements')==='3','legacy_history_preserved');
 check(sql('SELECT '+['member_holding_versions','member_holding_positions','member_debt_positions','member_cash_flow_versions','member_cash_flow_entries','member_goals_versions'].map(name=>'(SELECT count(*) FROM public.'+name+')').join('+'))==='0','no_financial_writes');
 const removed=await cleanup(s);s.cleaned=true;pass('private-storage-url-and-owned-cleanup',{privateStorageHits,privateUrlHits,domAutomaticPosts:domPosts,processStopped:removed.processStopped,contextsClosed:removed.contextsClosed,ownedTempRemoved:removed.ownedTempRemoved,legacyRowsPreserved:3});
 return {browser:{status:'PASS',readerSha:legacyDiagnosticSha,driverVersion:'1.64.1',sourceExecutable:'/opt/google/chrome/chrome',sourceSha256:s.sourceSha256,executable:s.executable,ownedTemp:s.local,ownerId:s.owner,chromeVersion:s.chromeVersion,chromeSha256:s.chromeSha256,closure:s.closure,checks,sameJwtVerified:true,ownForeignRlsVerified:true,expiredDomVerified:true,activeDomVerified:true,revokedDomVerified:true,advisorZeroSideGetVerified:true,identityCleared:true,signoutCleared:true,readOnlyGrantOnly:true,productWriteClosed:true,domAutomaticPosts:domPosts,privateStorageHits,privateUrlHits,productServiceRight:'NOT_CONNECTED',cleanup:removed}};
}
export async function runLegacyDiagnostic(){let state;try{state=await preflight();await runNativeAuthProfile('consultation-ticket',ctx=>exercise(ctx,state),{browserMode:true,acceptance:legacyAcceptanceMode});}finally{if(state&&!state.cleaned)await cleanup(state);}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runLegacyDiagnostic().catch(error=>{console.error('P03_LEGACY_FAILURE '+JSON.stringify({status:'FAIL',reason:/^(?:p03_legacy|pf10_native|p09_browser)_[a-z0-9_]+$/.test(error?.message??'')?error.message:browserFailureCode(error),automaticRetry:false,targetInstall:'NOT_APPLIED',productServiceRight:'NOT_CONNECTED'}));process.exitCode=1;});
