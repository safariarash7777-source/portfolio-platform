import {before,after,test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {publicationResearchFixture} from '../intelligence/publication-fixture';
const container='next09-synthetic-db';
const U='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',B='cccccccc-cccc-4ccc-8ccc-cccccccccccc',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',X='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const C1='11111111-1111-4111-8111-111111111111',C2='22222222-2222-4222-8222-222222222222',WB='33333333-3333-4333-8333-333333333333';
const q=(v:unknown)=>v===null?'NULL':"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function sql(db:string,body:string){if(!/^next09_(legacy|explicit)$/.test(db)&&db!=='postgres')throw new Error('dedicated DB required');return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],{encoding:'utf8',input:body,stdio:['pipe','pipe','pipe']}).trim();}
function as(db:string,id:string|null,body:string,role=id?'authenticated':'service_role',session='session-A'){return sql(db,`BEGIN;SET LOCAL ROLE ${role};SELECT set_config('request.jwt.claims',${q({sub:id,role,session_id:session==='session-A'?id:session==='session-other'?'ffffffff-ffff-4fff-8fff-ffffffffffff':session})},true);${body};COMMIT;`).split('\n').at(-1)!;}
function fails(fn:()=>unknown,pattern:RegExp){assert.throws(fn,e=>pattern.test(String((e as {stderr?:unknown}).stderr??e)));}
for(const profile of ['legacy','explicit'])describe('NEXT09 isolated PostgreSQL '+profile,()=>{
 const db='next09_'+profile;let w:string,publication:string,event:string;
 const file=(p:string)=>sql(db,readFileSync(p,'utf8'));
 const start=(id=U)=>JSON.parse(as(db,id,'SELECT public.next09_start_link()')) as {challengeId:string;token:string};
 const prove=(c:{challengeId:string;token:string},tg=100001,code='f'.repeat(64))=>as(db,null,`SELECT public.next09_prove_link(${q(c.token)},${tg},${q(hash(code))})`);
 const confirm=(c:{challengeId:string;token:string},id=U,code='f'.repeat(64),session='session-A')=>as(db,id,`SELECT public.next09_confirm_link(${q(c.challengeId)},${q(code)})`,'authenticated',session);
 const link=(id=U,tg=100001)=>{const c=start(id);prove(c,tg);confirm(c,id);};
 const publish=(cohorts=[C1],aggregate:string|null=null,base=0)=>{const body={workbookVersionId:w,contentKind:'lesson',title:'Synthetic lesson',summary:'Synthetic summary',content:'No personal content',sources:[{url:'https://example.invalid',asOf:'2026-10-01'}],audience:cohorts.length?'cohort':'public',cohortIds:cohorts,channels:['site','telegram']};const p=as(db,A,`SELECT public.save_research_publication(${q(aggregate)},${base},${q(body)}::jsonb,${q(randomUUID())})`);for(const a of ['ready','publish'])as(db,A,`SELECT public.command_research_publication(${q(p)},${q(a)},'Synthetic reviewed action',${q(randomUUID())},true)`);return p;};
 const stage=()=>as(db,null,'SELECT public.next09_stage()');
 const claim=()=>JSON.parse(as(db,null,'SELECT coalesce(public.next09_claim(),\'null\'::jsonb)'));
 before(()=>{
  sql('postgres',`DROP DATABASE IF EXISTS ${db}`);sql('postgres',`CREATE DATABASE ${db}`);
  file('sql/test/supabase_bootstrap.sql');file(`sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`);
  sql(db,'CREATE EXTENSION IF NOT EXISTS pgcrypto;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);ALTER TABLE auth.users ADD COLUMN email text,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN phone text,ADD COLUMN phone_confirmed_at timestamptz;CREATE TABLE public.audit_log(actor_id uuid,action text,entity text,target_user_id uuid,after jsonb)');
  for(const p of ['sql/phase5_payments_telegram.sql','sql/phase8b_leads.sql','sql/phase8_webinars.sql','sql/phase11_access_tiers.sql','sql/phase27_member_import.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20260930182629_seasonal_course_membership.sql','supabase/migrations/20260930182918_research_publication_queue.sql','supabase/migrations/20261001125428_next09_notifications.sql'])file(p);
  sql(db,`INSERT INTO auth.users(id) VALUES('${A}'),('${U}'),('${B}'),('${X}');INSERT INTO public.profiles(id,role) VALUES('${A}','admin'),('${U}','user'),('${B}','user'),('${X}','user');INSERT INTO public.courses(id,title,status)VALUES('${WB}','Synthetic course','published');
   INSERT INTO public.course_cohorts(id,course_id,title,starts_at,ends_at,policy_version,policy,status) VALUES('${C1}','${WB}','A',now()-interval '1 day',now()+interval '60 days','test.v1','{"commercialEnabled":false}','published'),('${C2}','${WB}','B',now()-interval '1 day',now()+interval '60 days','test.v1','{"commercialEnabled":false}','published');
   INSERT INTO public.entitlements(user_id,kind,starts_at,expires_at,cohort_id,module_keys) VALUES('${U}','manual',now()-interval '1 day',now()+interval '60 days','${C1}',ARRAY['resources']),('${B}','manual',now()-interval '1 day',now()+interval '60 days','${C2}',ARRAY['resources']),('${X}','manual',now()-interval '60 days',now()-interval '1 day','${C1}',ARRAY['resources']);`);
  w=as(db,A,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body)VALUES('${WB}',1,'Synthetic workbook',${q(publicationResearchFixture(2))}::jsonb)RETURNING id`);as(db,A,`INSERT INTO public.research_workbook_reviews(version_id,decision)VALUES('${w}','approved_internal')`);
  sql(db,`INSERT INTO auth.sessions(id,user_id)SELECT id,id FROM auth.users;INSERT INTO auth.sessions(id,user_id)VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','${U}')`);
 });
 after(()=>sql('postgres',`DROP DATABASE IF EXISTS ${db}`));
 test('RPC/table/private schema privileges and old one-way redemption fail closed',()=>{
  for(const role of ['anon','authenticated','service_role'])fails(()=>as(db,U,'SELECT * FROM next09_private.challenges',role),/permission denied/);
  fails(()=>as(db,U,'SELECT public.redeem_link_code(\'123456\',100001)'),/permission denied/);
  fails(()=>as(db,null,'SELECT public.next09_prove_link(\'a\',100001,\'b\')','authenticated'),/permission denied/);
  fails(()=>sql(db,`BEGIN;SET LOCAL ROLE service_role;SELECT set_config('request.jwt.claims',${q({sub:U,role:'authenticated',user_metadata:{role:'service_role'}})},true);SELECT public.next09_stage();COMMIT;`),/machine required/);
  fails(()=>as(db,U,'SELECT public.next09_start_link()','authenticated',''),/session required/);
  for(const t of ['challenges','proofs','link_events','preferences','notices','jobs','attempts','outcomes'])for(const r of ['anon','authenticated','service_role'])assert.equal(sql(db,`SELECT has_table_privilege('${r}','next09_private.${t}','INSERT,UPDATE,DELETE,TRUNCATE')`),'f');
 });
 test('wrong token, cross-account/site session, confirmation forgery and replay cannot link',()=>{
  const c=start();fails(()=>prove({...c,token:'a'.repeat(64)}),/invalid challenge/);prove(c);fails(()=>prove(c),/proof already consumed/);fails(()=>confirm(c,B),/invalid proof/);fails(()=>confirm(c,U,'f'.repeat(64),'session-other'),/invalid proof/);fails(()=>confirm(c,U,'e'.repeat(64)),/invalid proof/);assert.equal(sql(db,'SELECT count(*) FROM public.telegram_links'),'0');confirm(c);fails(()=>confirm(c),/invalid proof/);assert.equal(JSON.parse(as(db,U,'SELECT public.next09_connection()')).linked,true);assert.equal(JSON.parse(as(db,U,'SELECT public.next09_connection()')).course,false);
 });
 test('TTL and superseded challenge rejected, unlink invalidates existing ceremony; linkage unique',()=>{
  const c=start(B);sql(db,`ALTER TABLE next09_private.challenges DISABLE TRIGGER immutable;UPDATE next09_private.challenges SET expires_at=now()-interval '1 second' WHERE id='${c.challengeId}';ALTER TABLE next09_private.challenges ENABLE TRIGGER immutable;`);fails(()=>prove(c,100002),/invalid challenge/);
  const old=start(B),fresh=start(B);fails(()=>prove(old,100002),/invalid challenge/);prove(fresh,100001);fails(()=>confirm(fresh,B),/unlink existing/);
  as(db,U,'SELECT public.next09_unlink()');fails(()=>confirm(start(),U),/invalid proof/);link();link(B,100002);link(X,100003);
 });
 test('two cohorts, expiry, opt-in off, event replay and transport-independent site notice',()=>{
  publication=publish();stage();stage();assert.equal(sql(db,'SELECT count(*) FROM next09_private.notices'),'1');assert.equal(sql(db,'SELECT count(*) FROM next09_private.jobs'),'0');assert.equal(JSON.parse(as(db,B,'SELECT public.next09_notices()')).length,0);assert.equal(JSON.parse(as(db,X,'SELECT public.next09_notices()')).length,0);
  const notices=JSON.parse(as(db,U,'SELECT public.next09_notices()'));assert.match(notices[0].site_path,/publications/);assert.equal(notices[0].telegram_status,'not_sent');fails(()=>as(db,B,`SELECT public.next09_acknowledge('${notices[0].id}')`),/42501|permission denied|ERROR/);as(db,U,`SELECT public.next09_acknowledge('${notices[0].id}')`);assert.equal(JSON.parse(as(db,U,'SELECT public.next09_notices()'))[0].acknowledged,true);
 });
 test('opt-in, union dedupes recipients and concurrent workers never duplicate a lease',async()=>{
  as(db,U,'SELECT public.next09_preferences(true,false)');as(db,B,'SELECT public.next09_preferences(true,false)');
  sql(db,`INSERT INTO public.entitlements(user_id,kind,starts_at,expires_at,cohort_id,module_keys)VALUES('${U}','manual',now()-interval '1 day',now()+interval '60 days','${C2}',ARRAY['resources'])`);
  publication=publish([C1,C2]);event=sql(db,`SELECT id FROM public.research_publication_events WHERE envelope->>'payloadRef'='${publication}' AND envelope->>'type'='publication.published'`);stage();assert.equal(sql(db,`SELECT count(*) FROM next09_private.notices WHERE event_id='${event}'`),'2');assert.equal(sql(db,'SELECT count(*) FROM next09_private.jobs'),'2');
  const parallel=async()=>{const r=await promisify(execFile)('docker',['exec',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',`BEGIN;SET LOCAL ROLE service_role;SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);SELECT coalesce(public.next09_claim(),'null'::jsonb);SELECT pg_sleep(0.3);COMMIT;`]);return JSON.parse(r.stdout.trim().split('\n').at(-1)!);};
  const concurrent=await Promise.all([parallel(),parallel()]);const jobs=concurrent.filter(Boolean);
  // SKIP LOCKED may temporarily find no row while the competing cursor holds locks.
  assert.ok(jobs.length>=1);if(jobs.length===1)jobs.push(claim());
  assert.ok(jobs.every(Boolean));assert.notEqual(jobs[0].attemptId,jobs[1].attemptId);assert.notEqual(jobs[0].telegramId,jobs[1].telegramId);
  assert.equal(claim(),null);assert.equal(sql(db,'SELECT count(*) FROM next09_private.attempts'),'2');for(const j of jobs)as(db,null,`SELECT public.next09_finish('${j.attemptId}','accepted','ok',100,null)`);
 });
 test('correction invalidates old version; withdrawn cancels pending publication jobs and preserves site history',()=>{
  const agg=sql(db,`SELECT publication_id FROM public.research_publication_versions WHERE id='${publication}'`);const old=publication;publication=publish([C1],agg,1);stage();const oldNotices=JSON.parse(as(db,U,'SELECT public.next09_notices()')).filter((n:{site_path:string|null;version:number})=>n.version===1);assert.ok(oldNotices.some((n:{site_path:string|null})=>n.site_path===null));
  as(db,A,`SELECT public.command_research_publication('${publication}','withdraw','Synthetic withdrawal',${q(randomUUID())},false)`);stage();const j=claim();assert.equal(j.kind,'withdrawn');assert.equal(j.sitePath,'/notifications');assert.equal(sql(db,`SELECT count(*) FROM public.research_publication_versions WHERE id='${old}'`),'1');as(db,null,`SELECT public.next09_finish('${j.attemptId}','accepted','ok',101,null)`);assert.ok(JSON.parse(as(db,U,'SELECT public.next09_notices()')).some((n:{kind:string})=>n.kind==='withdrawn'));
 });
 test('preference and unlink revoke queued and already claimed sends before transport',()=>{
  publish();stage();const j=claim();assert.ok(j);const user=sql(db,`SELECT n.user_id FROM next09_private.notices n JOIN next09_private.jobs j ON j.notice_id=n.id JOIN next09_private.attempts a ON a.job_id=j.id WHERE a.id='${j.attemptId}'`);as(db,user,'SELECT public.next09_preferences(false,false)');assert.equal(as(db,null,`SELECT public.next09_check_attempt('${j.attemptId}')`),'f');as(db,null,`SELECT public.next09_finish('${j.attemptId}','cancelled','authorization_changed',null,null)`);as(db,user,'SELECT public.next09_unlink()');assert.equal(JSON.parse(as(db,user,'SELECT public.next09_connection()')).linked,false);
 });
 test('retry capped at three, unknown stops resend and lease expiration recorded separately from success',()=>{
  as(db,U,'SELECT public.next09_preferences(false,false)');as(db,B,'SELECT public.next09_preferences(false,false)');if(!JSON.parse(as(db,B,'SELECT public.next09_connection()')).linked)link(B,100002);
  as(db,B,'SELECT public.next09_preferences(true,false)');publish([C2]);stage();let j=claim();assert.ok(j);
  for(let i=0;i<3;i++){
   as(db,null,`SELECT public.next09_finish('${j.attemptId}','retry','rate_limit',null,1)`);
   sql(db,"ALTER TABLE next09_private.outcomes DISABLE TRIGGER immutable;UPDATE next09_private.outcomes SET retry_at=now()-interval '1 second' WHERE status='retry';ALTER TABLE next09_private.outcomes ENABLE TRIGGER immutable");if(i<2)j=claim();
  }
  assert.equal(claim(),null);publish([C2]);stage();j=claim();as(db,null,`SELECT public.next09_finish('${j.attemptId}','unknown','network_ambiguous',null,null)`);assert.equal(claim(),null);
  publish([C2]);stage();j=claim();sql(db,`ALTER TABLE next09_private.attempts DISABLE TRIGGER immutable;UPDATE next09_private.attempts SET created_at=now()-interval '40 seconds' WHERE id='${j.attemptId}';ALTER TABLE next09_private.attempts ENABLE TRIGGER immutable`);assert.equal(claim(),null);assert.equal(sql(db,`SELECT status FROM next09_private.outcomes WHERE attempt_id='${j.attemptId}'`),'unknown');
 });
 test('correlated consultation retry keeps one canonical lead and rejects altered body',()=>{
  const body={source:'miniapp',external_ref:'sandbox-01:10',name:'Synthetic',phone:'00000000000',topic:'other',message:null,preferred_date:null,preferred_time:null,telegram_username:null,telegram_id:'100001',status:'new'};
  const cmd=(b:unknown)=>as(db,null,`SELECT public.next09_copy_lead(${q(b)}::jsonb)`);assert.equal(JSON.parse(cmd(body)).duplicate,false);assert.equal(JSON.parse(cmd(body)).duplicate,true);assert.equal(sql(db,'SELECT count(*) FROM public.leads'),'1');fails(()=>cmd({...body,name:'Changed'}),/correlation conflict/);fails(()=>as(db,B,`SELECT public.next09_copy_lead(${q(body)}::jsonb)`),/permission denied/);
 });
 test('canonical expiry after queue/claim stops transport and removes site content link',()=>{
  publication=publish([C2]);stage();const j=claim();assert.ok(j);assert.equal(j.telegramId,'100002');
  // Advance synthetic fixture time only; provenance guards remain enabled in real operation.
  sql(db,`BEGIN;ALTER TABLE public.entitlements DISABLE TRIGGER USER;UPDATE public.entitlements SET expires_at=now()-interval '1 second' WHERE user_id='${B}';ALTER TABLE public.entitlements ENABLE TRIGGER USER;COMMIT;`);
  assert.equal(as(db,null,`SELECT public.next09_check_attempt('${j.attemptId}')`),'f');
  as(db,null,`SELECT public.next09_finish('${j.attemptId}','cancelled','authorization_changed',null,null)`);
  const notices=JSON.parse(as(db,B,'SELECT public.next09_notices()'));assert.ok(notices.filter((n:{kind:string})=>n.kind==='published').every((n:{site_path:string|null})=>n.site_path===null));
 });
 test('expired or removed canonical Auth session cannot begin/confirm/link preferences',()=>{
  sql(db,`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='${B}'`);fails(()=>start(B),/session required/);fails(()=>as(db,B,'SELECT public.next09_preferences(true,true)'),/session required/);sql(db,`UPDATE auth.sessions SET not_after=NULL WHERE id='${B}'`);
 });
});
