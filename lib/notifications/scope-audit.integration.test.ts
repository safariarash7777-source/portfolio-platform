import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {publicationResearchFixture} from '../intelligence/publication-fixture';
const container='next09-synthetic-db';
const U='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',B='cccccccc-cccc-4ccc-8ccc-cccccccccccc',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C1='11111111-1111-4111-8111-111111111111',C2='22222222-2222-4222-8222-222222222222',WB='33333333-3333-4333-8333-333333333333';
const q=(v:unknown)=>"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
function sql(db:string,body:string){if(db!=='postgres'&&!/^next09_scope_(legacy|explicit)$/.test(db))throw Error('dedicated audit DB required');return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:body,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function as(db:string,u:string|null,body:string){return sql(db,`BEGIN;SET LOCAL ROLE ${u?'authenticated':'service_role'};SELECT set_config('request.jwt.claims',${q({role:u?'authenticated':'service_role',sub:u,session_id:u})},true);${body};COMMIT;`).split('\n').at(-1)!;}
const feedCommit='a54b161b8df88f83e8624273b1c4bb2ffd10f787',composition='a83f71d922a93ec2bfb398a306d7b282ce1db81f';
const feedPath='supabase/migrations/20261001121858_member_publication_feed_reads.sql';
for(const profile of ['legacy','explicit'])describe('NEXT09 scoped link patch + read-only feed185: '+profile,()=>{
 const db='next09_scope_'+profile;let version:string,workbook:string,priorPath:string;
 const notices=(u=U)=>JSON.parse(as(db,u,'SELECT public.next09_notices()')) as {id:string;site_path:string|null;acknowledged:boolean;version:number;kind:string}[];
 const claim=()=>JSON.parse(as(db,null,"SELECT coalesce(public.next09_claim(),'null'::jsonb)"));
 const file=(path:string)=>sql(db,readFileSync(path,'utf8'));
 const publish=(aggregate:string|null=null,base=0)=>{
  const body={workbookVersionId:workbook,contentKind:'lesson',title:'Synthetic audit',summary:'No private data',content:'Synthetic only',sources:[{url:'https://example.invalid',asOf:'2026-10-02'}],audience:'cohort',cohortIds:[C2,C1],channels:['site','telegram']};
  const id=as(db,A,`SELECT public.save_research_publication(${aggregate?q(aggregate):'NULL'},${base},${q(body)}::jsonb,${q(randomUUID())})`);
  for(const action of ['ready','publish'])as(db,A,`SELECT public.command_research_publication('${id}','${action}','Synthetic audit reason',${q(randomUUID())},true)`);return id;
 };
 before(()=>{
  assert.equal(execFileSync('docker',['inspect',container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim(),'none');
  const blob=(sha:string)=>execFileSync('git',['rev-parse',`${sha}:${feedPath}`],{encoding:'utf8'}).trim();assert.equal(blob(feedCommit),blob(composition),'feed SQL must match191 exactly');
  sql('postgres',`DROP DATABASE IF EXISTS ${db}`);sql('postgres',`CREATE DATABASE ${db}`);
  file('sql/test/supabase_bootstrap.sql');file(`sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`);
  sql(db,'CREATE EXTENSION IF NOT EXISTS pgcrypto;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);ALTER TABLE auth.users ADD COLUMN email text,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN phone text,ADD COLUMN phone_confirmed_at timestamptz;CREATE TABLE public.audit_log(actor_id uuid,action text,entity text,target_user_id uuid,after jsonb)');
  for(const path of ['sql/phase5_payments_telegram.sql','sql/phase8b_leads.sql','sql/phase8_webinars.sql','sql/phase11_access_tiers.sql','sql/phase27_member_import.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20260930182629_seasonal_course_membership.sql','supabase/migrations/20260930182918_research_publication_queue.sql','supabase/migrations/20261001125428_next09_notifications.sql'])file(path);
  // Read-only pinned source, installed into this disposable DB only; never edits owner files.
  sql(db,execFileSync('git',['show',`${feedCommit}:${feedPath}`],{encoding:'utf8'}));
  sql(db,`INSERT INTO auth.users(id)VALUES('${A}'),('${U}'),('${B}');INSERT INTO public.profiles(id,role)VALUES('${A}','admin'),('${U}','user'),('${B}','user');INSERT INTO auth.sessions(id,user_id)SELECT id,id FROM auth.users;
   INSERT INTO public.courses(id,title,status)VALUES('${WB}','Synthetic','published');INSERT INTO public.course_cohorts(id,course_id,title,starts_at,ends_at,policy_version,policy,status)VALUES('${C1}','${WB}','A',now()-interval '1 day',now()+interval '60 days','test','{"commercialEnabled":false}','published'),('${C2}','${WB}','B',now()-interval '1 day',now()+interval '60 days','test','{"commercialEnabled":false}','published');
   INSERT INTO public.entitlements(user_id,kind,starts_at,expires_at,cohort_id,module_keys)VALUES('${U}','manual',now()-interval '1 day',now()+interval '60 days','${C1}',ARRAY['resources']),('${U}','manual',now()-interval '1 day',now()+interval '60 days','${C2}',ARRAY['resources']),('${B}','manual',now()-interval '1 day',now()+interval '60 days','${C2}',ARRAY['resources']);`);
  workbook=as(db,A,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body)VALUES('${WB}',1,'Synthetic',${q(publicationResearchFixture(2))}::jsonb)RETURNING id`);as(db,A,`INSERT INTO public.research_workbook_reviews(version_id,decision)VALUES('${workbook}','approved_internal')`);
  for(const [u,tg] of [[U,100001],[B,100002]] as const){const c=JSON.parse(as(db,u,'SELECT public.next09_start_link()'));const hash=createHash('sha256').update('f'.repeat(64)).digest('hex');as(db,null,`SELECT public.next09_prove_link('${c.token}',${tg},'${hash}')`);as(db,u,`SELECT public.next09_confirm_link('${c.challengeId}','${'f'.repeat(64)}')`);as(db,u,'SELECT public.next09_preferences(true,false)');}
  version=publish();as(db,null,'SELECT public.next09_stage()');priorPath=notices()[0].site_path!;
  file('supabase/migrations/20261001221342_next09_scoped_notification_links.sql');
 });
 after(()=>sql('postgres',`DROP DATABASE IF EXISTS ${db}`));
 test('existing189 notices gain deterministic eligible cohort; no recipient/job duplication',()=>{
  assert.equal(priorPath,'/publications/'+version);assert.equal(notices()[0].site_path,`/publications/${version}?cohort=${C1}`);assert.equal(notices(B)[0].site_path,`/publications/${version}?cohort=${C2}`);
  as(db,null,'SELECT public.next09_stage()');assert.equal(sql(db,'SELECT count(*) FROM next09_private.jobs'),'2');
  const jobs=[claim(),claim()];assert.deepEqual(new Set(jobs.map(j=>j.sitePath)),new Set([`/publications/${version}?cohort=${C1}`,`/publications/${version}?cohort=${C2}`]));assert.equal(claim(),null);
  for(const j of jobs)as(db,null,`SELECT public.next09_finish('${j.attemptId}','accepted','ok',100,null)`);
 });
 test('notice seen and actual version read remain independent; a new version starts unread',()=>{
  const notice=notices()[0];as(db,U,`SELECT public.next09_acknowledge('${notice.id}')`);assert.equal(sql(db,'SELECT count(*) FROM publication_private.research_publication_reads'),'0');
  as(db,B,`SELECT public.mark_research_publication_read('${version}','${C2}')`);assert.equal(notices(B)[0].acknowledged,false);
  const aggregate=sql(db,`SELECT publication_id FROM public.research_publication_versions WHERE id='${version}'`);version=publish(aggregate,1);as(db,null,'SELECT public.next09_stage()');
  const feed=JSON.parse(as(db,B,`SELECT public.list_cohort_research_publications('${C2}')`));assert.equal(feed.items[0].versionId,version);assert.equal(feed.items[0].hasBeenRead,false);assert.equal(sql(db,'SELECT count(*) FROM publication_private.research_publication_reads'),'1');
 });
 test('revoked chosen cohort switches to another valid cohort; other account cannot borrow it',()=>{
  const grant=sql(db,`SELECT id FROM public.entitlements WHERE user_id='${U}' AND cohort_id='${C1}' LIMIT 1`);
  as(db,A,`SELECT public.seasonal_access_command(${q({action:'revoke',userId:U,cohortId:C1,grantRef:grant,reason:'Synthetic scoped audit revocation',idempotencyKey:randomUUID()})}::jsonb)`);
  assert.equal(notices().find(n=>n.version===2)!.site_path,`/publications/${version}?cohort=${C2}`);
  assert.throws(()=>as(db,B,`SELECT public.read_cohort_research_publication('${version}','${C1}')`));
  for(const role of ['anon','authenticated','service_role'])assert.throws(()=>sql(db,`BEGIN;SET LOCAL ROLE ${role};SELECT next09_private.publication_path('${U}','${version}');COMMIT;`));
 });
 test('opt-out/unlink preserve site/receipt history while claimed work is cancelled; expiry removes links',()=>{
  const j=claim();assert.ok(j);const u=j.telegramId==='100001'?U:B;as(db,u,'SELECT public.next09_preferences(false,false)');assert.equal(as(db,null,`SELECT public.next09_check_attempt('${j.attemptId}')`),'f');as(db,u,'SELECT public.next09_unlink()');assert.ok(notices(u).length);
  sql(db,`BEGIN;ALTER TABLE public.entitlements DISABLE TRIGGER USER;UPDATE public.entitlements SET expires_at=now()-interval '1 second';ALTER TABLE public.entitlements ENABLE TRIGGER USER;COMMIT;`);
  assert.ok(notices().every(n=>n.site_path===null));assert.ok(notices(B).every(n=>n.site_path===null));assert.equal(sql(db,'SELECT count(*) FROM publication_private.research_publication_reads'),'1');
 });
 test('withdrawn content does not regain a cohort link or mutate either receipt ledger',()=>{
  as(db,A,`SELECT public.command_research_publication('${version}','withdraw','Synthetic withdrawn reason',${q(randomUUID())},false)`);as(db,null,'SELECT public.next09_stage()');
  assert.ok(notices().some(n=>n.kind==='withdrawn'));assert.ok(notices().every(n=>n.site_path===null));assert.equal(sql(db,'SELECT count(*) FROM publication_private.research_publication_reads'),'1');assert.equal(sql(db,'SELECT count(*) FROM next09_private.acknowledgements'),'1');
 });
});
