import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {publicationResearchFixture} from './publication-fixture';
const container=process.env.FEED_DB_CONTAINER;
if(container&&container!=='feed06-db')throw Error('Only own feed06 sandbox allowed');
if(!container&&!process.env.PGHOST)throw Error('Explicit isolated PostgreSQL configuration required');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ADMIN='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const C1='11111111-1111-4111-8111-111111111111',C2='22222222-2222-4222-8222-222222222222';
const q=(v:unknown)=>v===null?'NULL':typeof v==='number'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
function sql(db:string,query:string){
 if(db!=='postgres'&&!/^next06_feed_(legacy|explicit)$/.test(db))throw Error('Own synthetic DB required');
 const args=['-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
 return execFileSync(container?'docker':'psql',container?['exec','-i',container,'psql',...args]:args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
const as=(db:string,uid:string|null,query:string,role=uid?'authenticated':'anon')=>sql(db,`BEGIN;SET LOCAL ROLE ${role};SELECT set_config('request.jwt.claims',${q(uid?{sub:uid,role}:{role})},true);${query};COMMIT;`).split('\n').at(-1)!;
const denied=(db:string,uid:string|null,query:string,role=uid?'authenticated':'anon')=>{try{as(db,uid,query,role);return '';}catch(e){return String((e as {stderr?:unknown}).stderr??e);}};
for(const profile of ['legacy','explicit'])describe('publication feed / real SQL permissions / '+profile,()=>{
 const db='next06_feed_'+profile;
 const research=()=>{
  const w=as(db,ADMIN,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES('${randomUUID()}',1,'Synthetic research',${q(publicationResearchFixture(1))}::jsonb) RETURNING id`);
  as(db,ADMIN,`INSERT INTO public.research_workbook_reviews(version_id,decision,note) VALUES('${w}','approved_internal','Synthetic approval')`);return w;
 };
 const save=(w:string,targets=[C1],aggregate:string|null=null,base=0)=>as(db,ADMIN,`SELECT public.save_research_publication(${q(aggregate)},${base},${q({workbookVersionId:w,contentKind:'brief',title:'Synthetic teaching',summary:'Synthetic summary',content:'Audience teaching',sources:[{url:'https://example.invalid/source',asOf:'2026-10-01',privateNote:'PRIVATE'}],audience:targets.length?'cohort':'public',cohortIds:targets,channels:['site'],privateNote:'PRIVATE'})}::jsonb,'${randomUUID()}')`);
 const command=(v:string,action:string)=>as(db,ADMIN,`SELECT public.command_research_publication('${v}','${action}','Synthetic reviewed action','${randomUUID()}',true)`);
 const publish=(v:string)=>{command(v,'ready');command(v,'publish');return v;};
 const list=(uid=A,c=C1,at:string|null=null,id:string|null=null,limit=20)=>JSON.parse(as(db,uid,`SELECT public.list_cohort_research_publications('${c}',${q(at)},${q(id)},${limit})`));
 const detail=(v:string,uid=A,c=C1)=>as(db,uid,`SELECT coalesce(public.read_cohort_research_publication('${v}','${c}')::text,'NULL')`);
 const mark=(v:string,uid=A,c=C1)=>JSON.parse(as(db,uid,`SELECT public.mark_research_publication_read('${v}','${c}')`));
 before(()=>{
  sql('postgres',`DROP DATABASE IF EXISTS ${db}`);sql('postgres',`CREATE DATABASE ${db}`);
  for(const file of ['sql/test/supabase_bootstrap.sql',`sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`])sql(db,readFileSync(file,'utf8'));
  sql(db,'ALTER TABLE auth.users ADD COLUMN email text,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN phone text,ADD COLUMN phone_confirmed_at timestamptz;CREATE TABLE public.payments(id uuid PRIMARY KEY);CREATE TABLE public.audit_log(actor_id uuid,action text,entity text,target_user_id uuid,after jsonb)');
  for(const file of ['sql/phase8_webinars.sql','sql/phase11_access_tiers.sql','sql/phase27_member_import.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20260930182629_seasonal_course_membership.sql','supabase/migrations/20260930182918_research_publication_queue.sql','supabase/migrations/20261001121858_member_publication_feed_reads.sql'])sql(db,readFileSync(file,'utf8'));
  sql(db,`GRANT SELECT ON public.entitlements TO authenticated;INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${ADMIN}');INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADMIN}','admin');INSERT INTO public.courses(id,title,status) VALUES('${C1}','Synthetic course','published');
   INSERT INTO public.course_cohorts(id,course_id,title,starts_at,ends_at,policy_version,policy,status) VALUES('${C1}','${C1}','A',now()-interval '1 day',now()+interval '60 days','sandbox.v1','{"commercialEnabled":false}','published'),('${C2}','${C1}','B',now()-interval '1 day',now()+interval '60 days','sandbox.v1','{"commercialEnabled":false}','published');
   INSERT INTO public.entitlements(user_id,kind,starts_at,expires_at,cohort_id,module_keys) VALUES('${A}','manual',now()-interval '1 day',now()+interval '60 days','${C1}',ARRAY['resources']),('${B}','manual',now()-interval '1 day',now()+interval '60 days','${C2}',ARRAY['resources']);`);
 });
 after(()=>sql('postgres',`DROP DATABASE IF EXISTS ${db}`));
 test('all direct table privileges denied including service role; RLS FORCE and locked private definers',()=>{
  for(const role of ['anon','authenticated','service_role'])for(const verb of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal(sql(db,`SELECT has_table_privilege('${role}','publication_private.research_publication_reads','${verb}')`),'f');
  assert.equal(sql(db,"SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='publication_private.research_publication_reads'::regclass"),'t');
  assert.match(denied(db,A,'SELECT * FROM publication_private.research_publication_reads'),/42501/);
  assert.match(denied(db,null,`SELECT public.list_cohort_research_publications('${C1}')`),/42501/);
  assert.match(denied(db,A,`SELECT public.list_cohort_research_publications('${C1}')`,'service_role'),/42501/);
  assert.equal(sql(db,"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='publication_private' AND p.proname IN('require_cohort','read_cohort','list_cohort','mark_read') AND (NOT p.prosecdef OR NOT p.proconfig @> ARRAY['search_path=\"\"'])"),'0');
 });
 test('draft/ready and foreign/public content absent; A/B scopes and scoped detail never use another grant',()=>{
  const w=research(),draft=save(w),ready=save(w);command(ready,'ready');const visible=publish(save(w));const other=publish(save(w,[C2]));const global=publish(save(w,[]));
  const page=list();assert.deepEqual(page.items.map((i:{versionId:string})=>i.versionId),[visible]);assert.equal(JSON.stringify(page).includes('PRIVATE'),false);assert.equal(JSON.stringify(page).includes(w),false);assert.equal(JSON.stringify(page).includes(ADMIN),false);
  for(const v of [draft,ready,other,global])assert.equal(detail(v),'NULL');assert.notEqual(detail(visible),'NULL');
  assert.match(denied(db,B,`SELECT public.read_cohort_research_publication('${visible}','${C1}')`),/42501/);
  assert.notEqual(as(db,null,`SELECT coalesce(public.read_research_publication('${global}')::text,'NULL')`),'NULL');
 });
 test('GET is side-effect-free; read is version/user idempotent, emits no new event, and receipt survives newer unread version',()=>{
  const w=research(),v=publish(save(w));detail(v);const before=sql(db,'SELECT count(*) FROM publication_private.research_publication_reads');assert.equal(before,'0');
  const events=sql(db,'SELECT count(*) FROM public.research_publication_events');const first=mark(v);assert.deepEqual(mark(v),first);assert.equal(sql(db,'SELECT count(*) FROM public.research_publication_events'),events);
  const aggregate=sql(db,`SELECT publication_id FROM public.research_publication_versions WHERE id='${v}'`),next=publish(save(w,[C1],aggregate,1));
  const row=list().items.find((i:{versionId:string})=>i.versionId===next);assert.equal(row.hasBeenRead,false);assert.equal(row.readAt,null);assert.equal(detail(v),'NULL');assert.match(denied(db,A,`SELECT public.mark_research_publication_read('${v}','${C1}')`),/P0002/);
  assert.equal(sql(db,`SELECT count(*) FROM publication_private.research_publication_reads WHERE user_id='${A}' AND version_id='${v}'`),'1');
  const both=publish(save(research(),[C1,C2]));mark(both);assert.equal(list(B,C2).items.find((i:{versionId:string})=>i.versionId===both).hasBeenRead,false);mark(both,B,C2);assert.equal(sql(db,`SELECT count(*) FROM publication_private.research_publication_reads WHERE version_id='${both}'`),'2');
 });
 test('keyset pages exclude hidden before limit and preserve ordering across a new publication',()=>{
  const w=research();const versions=[publish(save(w)),publish(save(w)),publish(save(w))];
  const seen:string[]=[];let page=list(A,C1,null,null,1);let turns=0;
  while(true){seen.push(...page.items.map((i:{versionId:string})=>i.versionId));if(!page.nextCursor)break;assert.ok(++turns<20);const c=page.nextCursor;page=list(A,C1,c.publishedAt,c.versionId,1);}
  assert.equal(new Set(seen).size,seen.length);for(const v of versions)assert.ok(seen.includes(v));
  const last=list(A,C1,null,null,1).nextCursor;const baseline=list(A,C1,last.publishedAt,last.versionId,50).items.map((i:{versionId:string})=>i.versionId);publish(save(w));assert.deepEqual(list(A,C1,last.publishedAt,last.versionId,50).items.map((i:{versionId:string})=>i.versionId),baseline);
  assert.match(denied(db,A,`SELECT public.list_cohort_research_publications('${C1}',now(),NULL,20)`),/22023/);
 });
 test('tied publication timestamps use UUID keyset and microsecond boundary without rounding',()=>{
  const w=research();const ids=[save(w),save(w),save(w)];ids.forEach(v=>command(v,'ready'));
  // Synthetic inserts only: immutable command rows are never updated, even in this test.
  ids.forEach((v,i)=>sql(db,`INSERT INTO public.research_publication_commands(version_id,action,reason,actor_id,created_at,idempotency_key,request_hash) VALUES('${v}','publish','Synthetic timestamp fixture','${ADMIN}','2026-10-01T23:59:00.${i===2?'123457':'123456'}Z','${randomUUID()}','${randomUUID()}')`));
  const first=list(A,C1,null,null,1);assert.equal(first.items[0].versionId,ids[2]);assert.match(first.nextCursor.publishedAt,/123457/);
  const second=list(A,C1,first.nextCursor.publishedAt,first.nextCursor.versionId,1);const tied=ids.slice(0,2).sort().reverse();assert.equal(second.items[0].versionId,tied[0]);assert.match(second.nextCursor.publishedAt,/123456/);
  const third=list(A,C1,second.nextCursor.publishedAt,second.nextCursor.versionId,1);assert.equal(third.items[0].versionId,tied[1]);
 });
 test('concurrent repeated mark-read creates one receipt with the same first timestamp',async()=>{
  const v=publish(save(research()));const query=`BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claims',${q({sub:A,role:'authenticated'})},true);SELECT public.mark_research_publication_read('${v}','${C1}');COMMIT;`;
  const args=['-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',query];
  const run=()=>promisify(execFile)(container?'docker':'psql',container?['exec',container,'psql',...args]:args,{encoding:'utf8'});
  const [one,two]=await Promise.all([run(),run()]);assert.equal(one.stdout.trim().split('\n').at(-1),two.stdout.trim().split('\n').at(-1));assert.equal(sql(db,`SELECT count(*) FROM publication_private.research_publication_reads WHERE user_id='${A}' AND version_id='${v}'`),'1');
 });
 test('withdrawn research approval, new workbook version and publication withdrawal hide detail and reject replay',()=>{
  const w=research(),v=publish(save(w));mark(v);as(db,ADMIN,`INSERT INTO public.research_workbook_reviews(version_id,decision,note) VALUES('${w}','returned','Synthetic correction')`);
  assert.equal(detail(v),'NULL');assert.equal(list().items.some((i:{versionId:string})=>i.versionId===v),false);assert.match(denied(db,A,`SELECT public.mark_research_publication_read('${v}','${C1}')`),/P0002/);
  const w2=research(),v2=publish(save(w2));command(v2,'withdraw');assert.equal(detail(v2),'NULL');assert.match(denied(db,A,`SELECT public.mark_research_publication_read('${v2}','${C1}')`),/P0002/);
  const w3=research(),v3=publish(save(w3));const aggregate=sql(db,`SELECT workbook_id FROM public.research_workbook_versions WHERE id='${w3}'`);as(db,ADMIN,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES('${aggregate}',2,'Synthetic new research',${q(publicationResearchFixture(2))}::jsonb)`);assert.equal(detail(v3),'NULL');
 });
 test('expiry, revocation, cancellation and wrong module deny next request including old receipts and multi-cohort content',()=>{
  const v=publish(save(research(),[C1,C2]));mark(v);sql(db,`INSERT INTO public.entitlements(user_id,kind,starts_at,expires_at,cohort_id,module_keys) VALUES('${A}','manual',now()-interval '1 day',now()+interval '60 days','${C2}',ARRAY['resources'])`);
  sql(db,`UPDATE public.entitlements SET revoked_at=now(),note='Synthetic revoke reason' WHERE user_id='${A}' AND cohort_id='${C1}'`);
  const requireDenied=(user:string)=>{for(const query of [`SELECT public.list_cohort_research_publications('${C1}')`,`SELECT public.read_cohort_research_publication('${v}','${C1}')`,`SELECT public.mark_research_publication_read('${v}','${C1}')`])assert.match(denied(db,user,query),/42501/);};
  requireDenied(A);assert.notEqual(detail(v,A,C2),'NULL');
  // Existing provenance is immutable: independently insert each invalid grant; never rewrite it.
  for(const expired of [true,false]){
   const u=randomUUID();sql(db,`INSERT INTO auth.users(id) VALUES('${u}');INSERT INTO public.profiles(id,role) VALUES('${u}','user');INSERT INTO public.entitlements(user_id,kind,starts_at,expires_at,cohort_id,module_keys) VALUES('${u}','manual',now()-interval '2 days',${expired?"now()-interval '1 day'":"now()+interval '30 days'"},'${C1}',ARRAY['${expired?'resources':'webinar'}'])`);requireDenied(u);
  }
  as(db,ADMIN,`SELECT public.seasonal_operations(${q({action:'cancel-cohort',cohortId:C2,reason:'Synthetic audited cancellation',idempotencyKey:randomUUID()})}::jsonb)`);
  assert.match(denied(db,B,`SELECT public.list_cohort_research_publications('${C2}')`),/42501/);
  assert.throws(()=>sql(db,`UPDATE publication_private.research_publication_reads SET read_at=now()`),/append|immutable|mutation|Command failed/);
 });
});
