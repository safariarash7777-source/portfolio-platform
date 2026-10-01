import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {chromium} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const out=path.dirname(fileURLToPath(import.meta.url));
const remaining=process.argv[2]==='remaining';
const repo=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const old=path.join(repo,'docs/ops/seasonal-program/followup-06-auth-storage-evidence');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'app-manifest.json')));
const fixture=JSON.parse(fs.readFileSync(path.join(old,'fixtures.json')));
const credentials=JSON.parse(fs.readFileSync('C:/Users/Asus/.codex/private/followup06-auth-storage/reviewer-credentials.json'));
const secrets=JSON.parse(fs.readFileSync('C:/Users/Asus/.codex/private/followup06-auth-storage/secrets.json'));
const anon=secrets.anon, origin=manifest.origin??'http://127.0.0.1:3299';
const checkoutHead=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha=manifest.sha;
const sourceDiff=cp.execFileSync('git',['diff','--name-only',sha,checkoutHead,'--','app','components','lib','middleware.ts','package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','sql','supabase'],{encoding:'utf8'}).trim();
const checkpointDiff=cp.execFileSync('git',['diff','--name-only',sha,checkoutHead],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(sourceDiff||checkpointDiff.some(p=>!['.github/workflows/ci.yml','eslint.config.mjs'].includes(p)))throw Error('Independent run refused: checkout and immutable build differ beyond CI/lint wiring');
if(!manifest.environment)throw Error('Independent run refused: environment identifier missing');
const faultFile='C:/Users/Asus/.codex/private/followup06-auth-storage/limited-fault.json';
const hash=b=>createHash('sha256').update(b).digest('hex');
const oldHashes=Object.fromEntries(['independent.md','independent.json'].map(n=>[n,hash(fs.readFileSync(path.join(old,n)))]));
const evidence={reviewer:'/root/limited_independent; independent agent, not code author or human research approver',sha,checkoutHead,checkpointDiff,applicationSourceDiffEmpty:sourceDiff==='',environment:manifest.environment,origin,startedAt:new Date().toISOString(),manifest,migrationProof:'migration.json',fixtureSource:'../followup-06-auth-storage-evidence/fixtures.json; existing synthetic resources retained',frozenEvidenceHashesBefore:oldHashes,scenarios:[],privacy:'UI-issued sessions and signed capabilities stay in memory. No storageState/session injection, traces, HAR or credential screenshots.',open:['Successful private-identity write: native confirmed phone absent; provider disabled/unconfigured','New member feed/read-state and NEXT09','Human DEV07/173 and personal owner login','Live market quota/cycles and real FX financial/provider acceptance']};
evidence.executionScope=remaining?'Focused remaining/retest after owned schema-cache readiness; already-passed resource matrix/admin FX/guest contracts not repeated':'Initial full limited acceptance';
const save=()=>fs.writeFileSync(path.join(out,remaining?'independent-retest.json':'independent.json'),JSON.stringify(evidence,null,2)+'\n');
const record=(id,roles,expected,observed,ok,owner)=>{
 const row={id,roles,sha,environment:evidence.environment,at:new Date().toISOString(),expected,observed,status:ok?'PASS':'FAIL',...(owner?{owner}:{})};
 evidence.scenarios.push(row);save();console.log(id+' '+row.status+' '+JSON.stringify(observed));
};
const sessions={};let grantRef,signed;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-first-run']});
const api=async(role,method,p,body)=>{
 const r=await sessions[role].context.request.fetch(origin+p,{method,timeout:30000,headers:{origin},...(body===undefined?{}:{data:body})});
 return {http:r.status(),body:await r.json().catch(()=>null)};
};
const native=async(role,p,body)=>{
 const r=await fetch(origin+'/supabase/'+p,{method:body===undefined?'GET':'POST',headers:{apikey:anon,authorization:'Bearer '+(sessions[role]?.token??anon),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const bytes=Buffer.from(await r.arrayBuffer());return {http:r.status,ok:r.ok,bytes,json:()=>JSON.parse(bytes.toString())};
};
const rest=async(role,p,body)=>{const r=await native(role,'rest/v1/'+p,body);return {http:r.http,body:r.json()};};
const resource=label=>'/api/cohorts/'+fixture.cohorts[label]+'/resources/'+fixture.resources[label].id;
const ledger=async role=>{
 const v=await rest(role,'member_holding_versions?select=*&user_id=eq.'+credentials[role].id+'&order=id');
 if(v.http!==200||!Array.isArray(v.body))throw Error('Ledger versions inaccessible');
 const rows=[{table:'member_holding_versions',http:v.http,rows:v.body.length,digest:hash(JSON.stringify(v.body))}];
 const ids=v.body.map(x=>x.id).join(',');
 for(const [table,key] of [['member_holding_positions','position_key'],['member_debt_positions','debt_key']]){
  const r=await rest(role,table+'?select=*&version_id=in.('+ids+')&order=version_id,'+key);
  if(r.http!==200||!Array.isArray(r.body))throw Error('Ledger positions inaccessible');
  rows.push({table,http:r.http,rows:r.body.length,digest:hash(JSON.stringify(r.body))});
 }return rows;
};
const fault=mode=>fs.writeFileSync(faultFile,JSON.stringify(mode)+'\n');
const financialMarker='دارایی کاملاً ساختگی FOLLOWUP06';
const initial={};
try{
 fault({});
 for(const role of ['A','B','expired','cancelled','nonmember','admin']){
  const context=await browser.newContext({timezoneId:role==='B'?'America/Los_Angeles':'Asia/Tehran'}),page=await context.newPage();sessions[role]={context,page};
  // The product performs full-document navigation immediately after Auth success.
  // Capture the REAL upstream response before forwarding it unchanged, so Chrome
  // cannot discard its body during navigation. This never creates a fake session.
  let capture;
  const tokenCapture=new Promise(resolve=>{capture=resolve;});
  await page.route(origin+'/supabase/auth/v1/token**',async route=>{const upstream=await route.fetch();const b=await upstream.json();capture({http:upstream.status(),body:b});await route.fulfill({response:upstream});});
  await page.goto(origin+'/login?next=%2Fdashboard%2Fholdings',{waitUntil:'domcontentloaded'});
  await page.locator('#login-email').fill(credentials[role].email);await page.locator('#login-password').fill(credentials[role].password);
  await page.locator('button[type="submit"]').click();const captured=await tokenCapture,b=captured.body;sessions[role].token=b.access_token;
  if(captured.http!==200||!b.access_token){record('login-'+role,[role],'Real UI Auth login must issue native session200',{tokenHTTP:captured.http,tokenPresent:!!b.access_token,currentPath:new URL(page.url()).pathname},false,'Owned acceptance environment');throw Error('Native UI login did not issue a session; later scenarios not executed');}
  await page.waitForURL('**/dashboard/holdings',{waitUntil:'domcontentloaded'});const user=await native(role,'auth/v1/user'),u=user.json();
  record('login-'+role,[role],'Fresh UI form login, native GoTrue issued token/user200, canonical UUID and actual holdings redirect',{tokenHTTP:captured.http,userHTTP:user.http,userId:u.id,redirect:new URL(page.url()).pathname,contextTimezone:role==='B'?'America/Los_Angeles':'Asia/Tehran',capture:'Real native response forwarded unchanged before full navigation'},captured.http===200&&user.http===200&&u.id===credentials[role].id);
 }
 if(!remaining){
 const fx=[];for(const role of ['admin','B','nonmember']){const r=await sessions[role].context.request.get(origin+'/admin/fx',{maxRedirects:0});fx.push({role,http:r.status(),redirectPath:r.headers().location?new URL(r.headers().location,origin).pathname:null});}
 record('admin-fx-wrapper-role-gate',['admin','B','nonmember'],'Native authenticated DB-admin can open wrapper; B/nonmember redirect away. Embedded FX runtime and financial/provider acceptance remain OPEN',fx,fx.every(x=>x.role==='admin'?x.http===200:[302,303,307,308].includes(x.http)&&x.redirectPath==='/dashboard'),'Admin wrapper/role integration only');
 }
 sessions.guest={context:await browser.newContext()};
 const priorAttempt=remaining?JSON.parse(fs.readFileSync(path.join(out,'independent-attempt-03.json'))):null;
 for(const role of ['A','expired','cancelled'])initial[role]=remaining?priorAttempt.ledgerBaseline[role]:await ledger(role);evidence.ledgerBaseline=initial;save();
 if(!remaining){
 const memberships=[];
 for(const [role,label,expectedRows,allowed] of [['A','A',0,false],['expired','A',0,false],['cancelled','cancel',0,false],['nonmember','A',0,false],['B','A',0,false],['B','B',1,true]]){
  const l=await api(role,'GET','/api/cohorts/'+fixture.cohorts[label]+'/resources'),d=await api(role,'GET',resource(label)),r=await rest(role,'course_resources?select=id&cohort_id=eq.'+fixture.cohorts[label]),rpc=await rest(role,'rpc/seasonal_module_access',{p_module:'resources',p_cohort:fixture.cohorts[label]}),n=await native(role,'storage/v1/object/authenticated/course-private/'+fixture.resources[label].storagePath);
  memberships.push({role,cohort:label,listHTTP:l.http,listRows:l.body?.data?.length,downloadHTTP:d.http,restHTTP:r.http,restRows:r.body?.length,rpcHTTP:rpc.http,rpcAllowed:rpc.body?.allowed,nativeHTTP:n.http,byteDigest:n.ok?hash(n.bytes):null,ok:l.http===200&&l.body?.data?.length===expectedRows&&d.http===(allowed?200:403)&&r.http===200&&r.body.length===expectedRows&&rpc.body.allowed===allowed&&n.ok===allowed&&(!n.ok||hash(n.bytes)===fixture.resources[label].sha256)});
 }
 record('current-membership-and-foreign-isolation',['A','B','expired','cancelled','nonmember'],'Revoked/expired/cancelled/nonmember/foreign denied; active B alone gets B bytes with exact digest',memberships,memberships.every(x=>x.ok));
 const gl=await api('guest','GET','/api/cohorts/'+fixture.cohorts.A+'/resources'),gd=await api('guest','GET',resource('A')),gm=await api('guest','GET','/api/me/cohorts');
 record('guest-http-contract',['guest'],'No-session resource list/download/me-cohorts401',{listHTTP:gl.http,downloadHTTP:gd.http,meCohortsHTTP:gm.http},gl.http===401&&gd.http===401&&gm.http===401,'NEXT04/PR184');
 const ng=await native('guest','storage/v1/object/authenticated/course-private/'+fixture.resources.A.storagePath),np=await fetch(origin+'/supabase/storage/v1/object/public/course-private/'+fixture.resources.A.storagePath);
 record('native-guest-private-bucket',['guest'],'Private bytes inaccessible through authenticated/public native routes',{authenticatedHTTP:ng.http,publicHTTP:np.status},!ng.ok&&!np.ok);
 const administrators=[];
 for(const label of ['A','B']){
  const l=await api('admin','GET','/api/cohorts/'+fixture.cohorts[label]+'/resources'),d=await api('admin','GET',resource(label)),n=await native('admin','storage/v1/object/authenticated/course-private/'+fixture.resources[label].storagePath);
  administrators.push({cohort:label,listHTTP:l.http,listRows:l.body?.data?.length,downloadHTTP:d.http,nativeHTTP:n.http});
 }
 record('admin-without-resource-entitlement',['admin'],'Admin without resource grant: list200/zero, download403, native bytes denied',administrators,administrators.every(x=>x.listHTTP===200&&x.listRows===0&&x.downloadHTTP===403&&x.nativeHTTP!==200),'NEXT04/PR184');
 const forbidden=await api('B','POST','/api/admin/cohort-access/commands',{action:'grant',userId:credentials.B.id,cohortId:fixture.cohorts.A,moduleKeys:['resources'],startsAt:new Date(Date.now()-1000).toISOString(),endsAtExclusive:new Date(Date.now()+3600000).toISOString(),reason:'Independent forbidden synthetic grant',idempotencyKey:randomUUID()});
 record('non-admin-command-denied',['B'],'Member cannot grant access',{http:forbidden.http},forbidden.http===403);
 }
 const grant=await api('admin','POST','/api/admin/cohort-access/commands',{action:'grant',userId:credentials.A.id,cohortId:fixture.cohorts.A,moduleKeys:['resources','market-overview'],startsAt:new Date(Date.now()-60000).toISOString(),endsAtExclusive:new Date(Date.now()+3600000).toISOString(),reason:'Independent limited combination synthetic temporary grant; cleanup required',idempotencyKey:randomUUID()});
 grantRef=grant.body?.data?.grantRef;
 record('temporary-audited-grant',['admin','A'],'Actual admin API grants A temporary synthetic cohort access',{http:grant.http,grantRef},grant.http===200&&!!grantRef);
 if(!grantRef)throw Error('Temporary grant failed');
 const own=await api('A','GET','/api/cohorts/'+fixture.cohorts.A+'/resources'),dl=await api('A','GET',resource('A')),nf=await native('A','storage/v1/object/authenticated/course-private/'+fixture.resources.A.storagePath);
 if(dl.body?.data?.url)signed={url:dl.body.data.url,issuedAt:Date.now()};const bearer=signed?await fetch(signed.url):null,bytes=bearer?Buffer.from(await bearer.arrayBuffer()):Buffer.alloc(0);
 record('positive-real-storage-and-signing',['A','anonymous bearer'],'Actual private native and signedTTL60 bytes equal expected synthetic file',{listHTTP:own.http,listRows:own.body?.data?.length,downloadHTTP:dl.http,nativeHTTP:nf.http,nativeDigest:nf.ok?hash(nf.bytes):null,ttlSeconds:dl.body?.data?.expiresInSeconds,bearerHTTP:bearer?.status,bearerBytes:bytes.length,bearerDigest:hash(bytes),signedURLRecorded:false},own.body?.data?.length===1&&dl.http===200&&nf.ok&&hash(nf.bytes)===fixture.resources.A.sha256&&dl.body?.data?.expiresInSeconds===60&&bearer?.ok&&hash(bytes)===fixture.resources.A.sha256);
 if(!remaining){
 const terminal=await sessions.A.context.request.get(origin+'/terminal',{maxRedirects:0});
 record('cohort-grant-does-not-unlock-terminal',['A'],'Cohort resource/module grant cannot unlock full terminal',{http:terminal.status(),redirectPath:terminal.headers().location?new URL(terminal.headers().location,origin).pathname:null},[302,303,307,308].includes(terminal.status())&&new URL(terminal.headers().location,origin).pathname==='/dashboard','179/180 middleware composition');
 }
 const identities=[];
 for(const role of ['A','B','expired','cancelled','nonmember','guest']){
  const r=await api(role,'GET','/api/auth/identity');identities.push({role,http:r.http,profileNull:r.body?.profile===null,phoneVerified:r.body?.phoneVerified,identityMatch:r.body?.identityMatch,phoneNationalIdMatch:r.body?.phoneNationalIdMatch,ok:role==='guest'?r.http===401:r.http===200&&r.body?.profile===null&&r.body?.phoneVerified===false&&r.body?.identityMatch==='pending'&&r.body?.phoneNationalIdMatch==='pending'});
 }
 record('installed-empty-identity-contract',['A','B','expired','cancelled','nonmember','guest'],'Installed endpoint reads empty identity, native phone false, official pending; guest401',identities,identities.every(x=>x.ok),'PR180');
 const post=await api('A','POST','/api/auth/identity',{firstName:'Synthetic',lastName:'Reviewer',nationalId:'0000000000',baseVersion:0,consent:'identity-v1'});
 record('email-only-cannot-write-identity',['A'],'No native confirmed phone: identity POST401',{http:post.http},post.http===401,'PR180');
 const writer=await rest('B','rpc/auth_save_private_identity',{p_user:credentials.A.id,p_base:0,p_ciphertext:'synthetic-not-a-real-identity-ciphertext',p_digest:'a'.repeat(64),p_key_version:'v1',p_consent:'identity-v1'});
 record('direct-client-identity-writer-denied',['B'],'Client cannot call server-only identity writer or supply another UUID',{http:writer.http,code:writer.body?.code},[401,403,404].includes(writer.http),'PR180');
 const read=await rest('A','rpc/auth_read_private_identity',{});
 record('native-private-identity-read-empty',['A'],'Installed readerRPC returns null; no private record fabricated',{http:read.http,resultNull:read.body===null},read.http===200&&read.body===null,'PR180');
 for(const role of ['A','B']){
  const page=sessions[role].page;await page.goto(origin+'/dashboard?cohort='+fixture.cohorts[role]);
  await page.locator('#member-courses-title').waitFor({state:'visible'});await page.getByText('پروفایل هنوز ثبت نشده است؛ می‌توانید در مسیر مشترک حساب، آن را تکمیل کنید.',{exact:true}).waitFor({state:'visible'});
  const text=await page.locator('body').innerText();const profileLink=await page.locator('a[href^="/account/mobile?"]').first().getAttribute('href');
  record('member-home-installed-profile-'+role,[role],'Actual member home, empty/pending profile and shared owner link; no NOT_INSTALLED or other account UUID',{path:new URL(page.url()).pathname,coursesTitleVisible:await page.locator('#member-courses-title').isVisible(),emptyProfileVisible:text.includes('پروفایل هنوز ثبت نشده'),officialPendingVisible:text.includes('تطبیق رسمی هویت و شماره در انتظار بررسی است'),sharedProfileLink:profileLink,notInstalledVisible:text.includes('مسیر پروفایل مشترک هنوز'),otherAccountUuidVisible:text.includes(credentials[role==='A'?'B':'A'].id)},!!profileLink&&text.includes('پروفایل هنوز ثبت نشده')&&!text.includes('مسیر پروفایل مشترک هنوز')&&!text.includes(credentials[role==='A'?'B':'A'].id),'181/180');
 }
 const portfolio=sessions.A.page;await portfolio.goto(origin+'/dashboard/portfolio');await portfolio.locator('body').waitFor({state:'visible'});await portfolio.waitForTimeout(1200);
 record('prior-portfolio-route-retained',['A'],'Prior portfolio management view retained at /dashboard/portfolio, member home stays /dashboard',{path:new URL(portfolio.url()).pathname,memberCoursesTitleCount:await portfolio.locator('#member-courses-title').count(),pageTitle:await portfolio.title()},new URL(portfolio.url()).pathname==='/dashboard/portfolio'&&await portfolio.locator('#member-courses-title').count()===0,'PR181');
 const previous=JSON.parse(fs.readFileSync(path.join(old,'acceptance.json'))),publication=previous.scenarios.find(x=>x.id==='publication-cohort-Auth')?.observed.versionId;
 evidence.publicationVersionId=publication;
 const audiences=[];for(const role of ['A','B','expired','cancelled','nonmember','guest']){const p=await api(role,'GET','/api/publications/'+publication);audiences.push({role,http:p.http,privateMarkerPresent:JSON.stringify(p.body).includes('PRIVATE')});}
 const raw=await rest('A','research_workbook_versions?select=id');
 record('existing-publication-audience',['A','B','expired','cancelled','nonmember','guest'],'Existing technical C1 publication visible to entitled A only; private research excluded',{publicationVersion:publication,audiences,privateResearchHTTP:raw.http,privateResearchRows:raw.body?.length},audiences.every(x=>x.http===(x.role==='A'?200:404)&&!x.privateMarkerPresent)&&raw.http===200&&raw.body.length===0);
 fault({auth:true});
 try{
  const n=await native('A','auth/v1/user'),l=await api('A','GET','/api/cohorts/'+fixture.cohorts.A+'/resources'),d=await api('A','GET',resource('A')),m=await api('A','GET','/api/me/cohorts');
  record('auth-upstream-failure-is-503',['A'],'Controlled owned gateway Auth upstream503 must not be mistaken for missing session',{fault:'Owned loopback gateway upstream503; native containers untouched',nativeAuthHTTP:n.http,listHTTP:l.http,downloadHTTP:d.http,meCohortsHTTP:m.http},n.http===503&&l.http===503&&d.http===503&&m.http===503,'PR184');
 }finally{fault({});}
 const recovered=await api('A','GET',resource('A'));
 record('auth-transport-recovery',['A'],'Removing owned fault restores private resource request',{http:recovered.http},recovered.http===200);
 fault({storage:true});
 try{
  const n=await native('A','storage/v1/object/authenticated/course-private/'+fixture.resources.A.storagePath),d=await api('A','GET',resource('A'));
  record('storage-upstream-failure-is-503',['A'],'Native gateway Storage upstream503 and permitted download503, not forbidden/empty success',{fault:'Owned loopback gateway upstream503; native containers untouched',nativeStorageHTTP:n.http,downloadHTTP:d.http},n.http===503&&d.http===503,'PR184');
 }finally{fault({});}
 const storageRecovered=await api('A','GET',resource('A'));record('storage-transport-recovery',['A'],'Removing Storage fault restores signedURL issuance',{http:storageRecovered.http},storageRecovered.http===200);
 const revoke=await api('admin','POST','/api/admin/cohort-access/commands',{action:'revoke',userId:credentials.A.id,cohortId:fixture.cohorts.A,grantRef,reason:'Independent limited acceptance cleanup',idempotencyKey:randomUUID()});if(revoke.http===200)grantRef=null;
 const rd=await api('A','GET',resource('A')),rl=await api('A','GET','/api/cohorts/'+fixture.cohorts.A+'/resources'),rn=await native('A','storage/v1/object/authenticated/course-private/'+fixture.resources.A.storagePath),rr=await rest('A','rpc/seasonal_module_access',{p_module:'resources',p_cohort:fixture.cohorts.A}),rp=await api('A','GET','/api/publications/'+publication),prior=signed?await fetch(signed.url):null;
 record('explicit-revoke-and-capability-window',['admin','A','anonymous bearer'],'New requests denied after revoke; prior signed bearer may survive only remaining nativeTTL',{revokeHTTP:revoke.http,downloadHTTP:rd.http,listHTTP:rl.http,listRows:rl.body?.data?.length,nativeHTTP:rn.http,rpcAllowed:rr.body?.allowed,publicationHTTP:rp.http,priorBearerHTTP:prior?.status,signedURLRecorded:false},revoke.http===200&&rd.http===403&&rl.http===200&&rl.body?.data?.length===0&&!rn.ok&&rr.body?.allowed===false&&rp.http===404);
 const final={};
 for(const role of ['A','expired','cancelled']){
  final[role]=await ledger(role);const page=sessions[role].page;await page.goto(origin+'/dashboard/holdings');await page.getByText(financialMarker,{exact:false}).first().waitFor({state:'visible'});const visible=(await page.locator('body').innerText()).includes(financialMarker);
  record('ledger-preserved-'+role,[role],'Canonical personal asset/debt versions and rows byte-identical; actual financial UI visible',{canonicalUserId:credentials[role].id,before:initial[role],after:final[role],UIVisible:visible},JSON.stringify(initial[role])===JSON.stringify(final[role])&&visible);
 }evidence.ledgerFinal=final;
 const foreign=await rest('B','member_holding_versions?select=id&user_id=eq.'+credentials.A.id);
 record('personal-ledger-foreign-denial',['B'],'B cannot read A financial ledger',{http:foreign.http,rows:foreign.body?.length},foreign.http===200&&foreign.body.length===0);
 if(!signed)throw Error('No actual signed URL for provider expiry');
 while(Date.now()<signed.issuedAt+65000)await new Promise(r=>setTimeout(r,Math.min(5000,signed.issuedAt+65000-Date.now())));
 const expired=await fetch(signed.url);
 record('provider-signed-url-expiry',['anonymous bearer'],'Native provider denies previous URL afterTTL60',{http:expired.status,elapsedSeconds:Math.floor((Date.now()-signed.issuedAt)/1000),signedURLRecorded:false},!expired.ok);
}catch(error){
 let message=String(error.message);for(const v of [anon,secrets.service,secrets.jwtSecret,...Object.values(credentials).flatMap(x=>[x.email,x.password])])if(v)message=message.split(v).join('[redacted]');
 evidence.executionError=message.replace(/eyJ[\w.-]+/g,'[redacted]').replace(/token=[^ &]+/g,'token=[redacted]');save();console.log('Independent execution error: '+evidence.executionError);
}finally{
 fault({});
 if(grantRef&&sessions.admin){try{const r=await api('admin','POST','/api/admin/cohort-access/commands',{action:'revoke',userId:credentials.A.id,cohortId:fixture.cohorts.A,grantRef,reason:'Independent finally cleanup',idempotencyKey:randomUUID()});evidence.finalCleanupRevokeHTTP=r.http;}catch{evidence.finalCleanupError='Temporary grant cleanup transport unavailable; owner must revoke synthetic grant.';}}
 evidence.frozenEvidenceHashesAfter=Object.fromEntries(['independent.md','independent.json'].map(n=>[n,hash(fs.readFileSync(path.join(old,n)))]));
 evidence.frozenEvidenceUnchanged=JSON.stringify(oldHashes)===JSON.stringify(evidence.frozenEvidenceHashesAfter);
 evidence.finishedAt=new Date().toISOString();evidence.counts=Object.fromEntries(['PASS','FAIL','BLOCKED'].map(k=>[k,evidence.scenarios.filter(x=>x.status===k).length]));save();await browser.close();console.log(JSON.stringify({sha,counts:evidence.counts,executionError:evidence.executionError??null,frozenEvidenceUnchanged:evidence.frozenEvidenceUnchanged}));
}
