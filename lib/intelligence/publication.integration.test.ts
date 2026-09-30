import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import {createServer} from 'node:http';
import {postPublication} from './publication-http';
import {saveWorkbook,decideWorkbook,type WorkbookGateway,type StoredVersion} from './workbook-store';
import {publicationResearchFixture} from './publication-fixture';
// Dedicated synthetic local container, unique NEXT08 DBs only. Never reads env credentials.
const container='portfolio-next04-synthetic-db';
const seasonalMigration=process.env.NEXT04_MIGRATION??'supabase/migrations/20260930182629_seasonal_course_membership.sql';
console.log('NEXT04 migration SHA256:',createHash('sha256').update(readFileSync(seasonalMigration)).digest('hex'));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',U='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',OTHER='cccccccc-cccc-4ccc-8ccc-cccccccccccc',EXPIRED='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const C1='11111111-1111-4111-8111-111111111111',C2='22222222-2222-4222-8222-222222222222',WB='33333333-3333-4333-8333-333333333333';
const q=(v:unknown)=>v===null?'NULL':"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
function sql(db:string,text:string){if(!/^next08_publication_(legacy|explicit)$/.test(db)&&db!=='postgres')throw new Error('Synthetic DB required');return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function file(db:string,path:string){return sql(db,readFileSync(path,'utf8'));}
function as(db:string,id:string|null,text:string,role=id?'authenticated':'anon'){return sql(db,`BEGIN;SET LOCAL ROLE ${role};SELECT set_config('request.jwt.claims',${q(id?{sub:id,role}:{role})},true);${text};COMMIT;`).split('\n').at(-1)!;}
function denied(db:string,id:string|null,text:string,role=id?'authenticated':'anon'){try{as(db,id,text,role);return '';}catch(e){return String((e as {stderr?:unknown}).stderr??e);}}
for(const profile of ['legacy','explicit'])describe(`NEXT08 PostgreSQL real permissions/publication — ${profile}`,()=>{
 const db=`next08_publication_${profile}`;let w:string,p:string,privateId:string;
 const toStored=`jsonb_build_object('id',id,'workbookId',workbook_id,'version',version,'title',title,'body',body,'createdAt',created_at)`;
 const gateway:WorkbookGateway={getUser:async()=>({id:A}),getRole:async()=> 'admin',newId:()=>WB,createStore:()=>({recent:async()=>[],reviews:async()=>[],versions:async(id)=>JSON.parse(as(db,A,`SELECT coalesce(jsonb_agg(${toStored} ORDER BY version),'[]') FROM public.research_workbook_versions WHERE workbook_id='${id}'`)) as StoredVersion[],insertVersion:async(row)=>JSON.parse(as(db,A,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES(${q(row.workbookId)},${row.version},${q(row.title)},${q(row.body)}::jsonb) RETURNING ${toStored}`)),insertReview:async(row)=>JSON.parse(as(db,A,`INSERT INTO public.research_workbook_reviews(version_id,decision,note) VALUES(${q(row.versionId)},${q(row.decision)},${q(row.note)}) RETURNING jsonb_build_object('id',id,'versionId',version_id,'decision',decision,'note',note,'reviewedAt',reviewed_at)`))})};
 const body=(audience='public')=>({workbookVersionId:w,contentKind:'brief',title:'Synthetic teaching',summary:'Synthetic summary',content:'Audience content without personal notes',sources:[{url:'https://example.invalid/synthetic',asOf:'2026-09-30',privateNote:'PRIVATE'}],audience,cohortIds:audience==='cohort'?[C1]:[],channels:['site','telegram'],privateNote:'PRIVATE'});
 const save=(b=body(),aggregate:string|null=null,base=0,key=randomUUID())=>as(db,A,`SELECT public.save_research_publication(${q(aggregate)},${base},${q(b)}::jsonb,${q(key)})`);
 const cmd=(id:string,action:string,key=randomUUID())=>as(db,A,`SELECT public.command_research_publication('${id}','${action}','Synthetic reviewed action','${key}',true)`);
 const read=(id:string,user:string|null)=>as(db,user,`SELECT coalesce(public.read_research_publication('${id}')::text,'NULL')`);
 before(async()=>{
  sql('postgres',`DROP DATABASE IF EXISTS ${db}`);sql('postgres',`CREATE DATABASE ${db}`);
  file(db,'sql/test/supabase_bootstrap.sql');file(db,`sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`);
  sql(db,'ALTER TABLE auth.users ADD COLUMN email text,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN phone text,ADD COLUMN phone_confirmed_at timestamptz;CREATE TABLE public.payments(id uuid PRIMARY KEY);CREATE TABLE public.audit_log(actor_id uuid,action text,entity text,target_user_id uuid,after jsonb)');
  for(const path of ['sql/phase8_webinars.sql','sql/phase11_access_tiers.sql','sql/phase27_member_import.sql','sql/phase34_research_workbook_versions.sql'])file(db,path);
  file(db,seasonalMigration);
  file(db,'supabase/migrations/20260930182918_research_publication_queue.sql');
  sql(db,`GRANT SELECT ON public.entitlements TO authenticated;INSERT INTO auth.users(id) VALUES('${A}'),('${U}'),('${OTHER}'),('${EXPIRED}');INSERT INTO public.profiles(id,role) VALUES('${A}','admin'),('${U}','user'),('${OTHER}','user'),('${EXPIRED}','user');
  INSERT INTO public.courses(id,title,status) VALUES('${WB}','Synthetic course','published');
  INSERT INTO public.course_cohorts(id,course_id,title,starts_at,ends_at,policy_version,policy,status) VALUES('${C1}','${WB}','Synthetic A',now()-interval '1 day',now()+interval '60 days','sandbox.v1','{"commercialEnabled":false}','published'),('${C2}','${WB}','Synthetic B',now()-interval '1 day',now()+interval '60 days','sandbox.v1','{"commercialEnabled":false}','published');
  INSERT INTO public.entitlements(user_id,kind,starts_at,expires_at,cohort_id,module_keys) VALUES('${U}','manual',now()-interval '1 day',now()+interval '60 days','${C1}',ARRAY['resources']),('${OTHER}','manual',now()-interval '1 day',now()+interval '60 days','${C2}',ARRAY['resources']),('${EXPIRED}','manual',now()-interval '90 days',now()-interval '1 day','${C1}',ARRAY['resources']);`);
  const v1=await saveWorkbook(gateway,{workbookId:null,baseVersion:0,workbook:publicationResearchFixture(1)});assert.equal(v1.status,201);w=sql(db,`SELECT id FROM public.research_workbook_versions WHERE workbook_id='${WB}' AND version=1`);
 });
 after(()=>sql('postgres',`DROP DATABASE IF EXISTS ${db}`));
 test('direct writes, nonadmin commands and internal reads are denied under both privilege profiles',()=>{
  assert.match(denied(db,U,`SELECT public.save_research_publication(NULL,0,${q(body())}::jsonb,'${randomUUID()}')`),/forbidden/);
  assert.equal(as(db,U,'SELECT count(*) FROM public.research_publication_versions'),'0');
  assert.match(denied(db,U,'SELECT public.list_research_publications()'),/forbidden/);
  for(const table of ['research_publication_versions','research_publication_commands','research_publication_events'])for(const role of ['anon','authenticated','service_role'])for(const verb of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal(sql(db,`SELECT has_table_privilege('${role}','public.${table}','${verb}')`),'f');
  assert.match(denied(db,null,'SELECT count(*) FROM public.research_publication_events'),/permission denied/);
  assert.match(denied(db,A,`SELECT public.resolve_research_publication_distribution('${randomUUID()}')`),/permission denied/);
  assert.match(denied(db,A,'SELECT public.list_research_publication_distribution_events()'),/permission denied/);
  assert.throws(()=>sql(db,`BEGIN;SET LOCAL ROLE service_role;SELECT set_config('request.jwt.claims',${q({sub:A,role:'authenticated',user_metadata:{role:'service_role'}})},true);SELECT public.resolve_research_publication_distribution('${randomUUID()}');COMMIT;`),/service role required/);
 });
 test('draft remains private; unapproved or malformed source and incomplete audience cannot become ready',()=>{
  p=save();assert.equal(read(p,null),'NULL');assert.equal(read(p,U),'NULL');assert.match(denied(db,A,`SELECT public.command_research_publication('${p}','ready','review done','${randomUUID()}',true)`),/approval\/current version required/);
  const missing=body() as Record<string,unknown>;delete missing.audience;assert.match(denied(db,A,`SELECT public.save_research_publication(NULL,0,${q(missing)}::jsonb,'${randomUUID()}')`),/invalid draft/);
  assert.match(denied(db,A,`SELECT public.save_research_publication(NULL,0,${q({...body(),sources:[{url:'https://user:secret@example.invalid',asOf:'2026-09-30'}]})}::jsonb,'${randomUUID()}')`),/invalid audience/);
  assert.match(denied(db,A,`SELECT public.save_research_publication(NULL,0,${q({...body(),sources:[{url:'https://example.invalid',asOf:'2026-02-30'}]})}::jsonb,'${randomUUID()}')`),/invalid source date/);
 });
 test('actual HTTP handler over loopback reaches real session RPC; unauthorized and malformed requests stay blocked',async()=>{
  const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const role=req.headers['x-synthetic-role'];const out=await postPublication(new Request('http://localhost/test',{method:'POST',body:Buffer.concat(chunks).toString()}),async()=>({status:role==='admin'?200:role==='user'?403:401,rpc:async(name,args)=>{try{const result=as(db,A,`SELECT to_jsonb(public.${name}(${Object.entries(args).map(([key,v])=>`"${key}"=>${q(v)}`).join(',')}))`);return {data:JSON.parse(result),error:null};}catch(e){const message=String((e as {stderr?:unknown}).stderr??e);return {data:null,error:{code:message.includes('approval/current')?'22023':message.includes('key conflict')?'PT409':'P0001'}};}}}));res.writeHead(out.status,Object.fromEntries(out.headers));res.end(await out.text());});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));try{const endpoint=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const payload={action:'save',publicationId:null,baseVersion:0,draft:body(),idempotencyKey:randomUUID()};const post=(role:string,b:unknown)=>fetch(endpoint,{method:'POST',headers:{'x-synthetic-role':role},body:JSON.stringify(b)});assert.equal((await post('',payload)).status,401);assert.equal((await post('user',payload)).status,403);const saved=await post('admin',payload);assert.equal(saved.status,201);const id=(await saved.json()).receipt;assert.equal(read(id,null),'NULL');const malformed=await post('admin',{...payload,draft:{...body(),audience:'cohort'}});assert.equal(malformed.status,422);const ready=await post('admin',{action:'ready',versionId:id,idempotencyKey:randomUUID(),privacyConfirmed:true,reason:'Synthetic reviewed action'});assert.equal(ready.status,422);assert.match(ready.headers.get('cache-control')??'',/no-store/);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 test('latest research v2 approval through reused workbook service is required; ready is private; publish exposes only reviewed audience body',async()=>{
  assert.equal((await saveWorkbook(gateway,{workbookId:WB,baseVersion:1,workbook:publicationResearchFixture(2)})).status,201);w=sql(db,`SELECT id FROM public.research_workbook_versions WHERE workbook_id='${WB}' AND version=2`);
  assert.equal((await decideWorkbook(gateway,{workbookId:WB,version:1,decision:'approved_internal'})).status,409);assert.equal((await decideWorkbook(gateway,{workbookId:WB,version:2,decision:'approved_internal'})).status,201);
  assert.match(denied(db,A,`SELECT public.command_research_publication('${p}','ready','review done','${randomUUID()}',true)`),/approval\/current/);
  p=save();const key=randomUUID();const receipt=cmd(p,'ready',key);assert.equal(cmd(p,'ready',key),receipt);assert.equal(read(p,null),'NULL');cmd(p,'publish');const visible=read(p,null);assert.equal(visible.includes('PRIVATE'),false);assert.equal(JSON.parse(visible).title,'Synthetic teaching');
  assert.equal(sql(db,`SELECT count(*) FROM public.research_publication_events WHERE envelope->>'payloadRef'='${p}'`),'2');
  assert.equal(sql(db,`SELECT count(*) FROM public.research_publication_events WHERE envelope::text LIKE '%PRIVATE%'`),'0');
  const publishEvent=sql(db,`SELECT id FROM public.research_publication_events WHERE envelope->>'payloadRef'='${p}' AND envelope->>'type'='publication.published'`);
  const readyEvent=sql(db,`SELECT id FROM public.research_publication_events WHERE envelope->>'payloadRef'='${p}' AND envelope->>'type'='publication.ready_for_distribution'`);
  assert.equal(as(db,null,`SELECT coalesce(public.resolve_research_publication_distribution('${readyEvent}')::text,'NULL')`,'service_role'),'NULL');
  const machine=as(db,null,`SELECT public.resolve_research_publication_distribution('${publishEvent}')`,'service_role');assert.equal(machine.includes('PRIVATE'),false);assert.equal(JSON.parse(machine).sitePath,`/publications/${p}`);
  const events=JSON.parse(as(db,null,'SELECT public.list_research_publication_distribution_events()','service_role'));assert.equal(events.length,1);assert.equal(events[0].envelope.type,'publication.published');assert.equal(JSON.parse(as(db,null,`SELECT public.list_research_publication_distribution_events(${q(events[0].cursor.recordedAt)},${q(events[0].cursor.eventId)},100)`,'service_role')).length,0);
 });
 test('cohortA resource grants allow A, deny B/expired/anonymous; admin is independent of course membership',()=>{
  privateId=save(body('cohort'));cmd(privateId,'ready');cmd(privateId,'publish');assert.notEqual(read(privateId,U),'NULL');for(const user of [OTHER,EXPIRED,null,A])assert.equal(read(privateId,user),'NULL');
 });
 test('unpublished/cancelled course does not expose content or a machine payload despite an active resource grant',()=>{
  const event=sql(db,`SELECT id FROM public.research_publication_events WHERE envelope->>'payloadRef'='${privateId}' AND envelope->>'type'='publication.published'`);
  sql(db,`UPDATE public.course_cohorts SET status='draft' WHERE id='${C1}'`);try{assert.equal(read(privateId,U),'NULL');assert.equal(as(db,null,`SELECT coalesce(public.resolve_research_publication_distribution('${event}')::text,'NULL')`,'service_role'),'NULL');}finally{sql(db,`UPDATE public.course_cohorts SET status='published' WHERE id='${C1}'`);}
  const b=save({...body('cohort'),cohortIds:[C2]});cmd(b,'ready');cmd(b,'publish');assert.notEqual(read(b,OTHER),'NULL');const eventB=sql(db,`SELECT id FROM public.research_publication_events WHERE envelope->>'payloadRef'='${b}' AND envelope->>'type'='publication.published'`);
  as(db,A,`SELECT public.seasonal_operations(${q({action:'cancel-cohort',cohortId:C2,reason:'Synthetic audited cancellation',idempotencyKey:randomUUID()})}::jsonb)`);assert.equal(read(b,OTHER),'NULL');assert.equal(as(db,null,`SELECT coalesce(public.resolve_research_publication_distribution('${eventB}')::text,'NULL')`,'service_role'),'NULL');assert.notEqual(read(privateId,U),'NULL');
 });
 test('withdraw removes direct access and preserves historical versions/events',()=>{cmd(privateId,'withdraw');assert.equal(read(privateId,U),'NULL');assert.equal(sql(db,`SELECT count(*) FROM public.research_publication_versions WHERE id='${privateId}'`),'1');assert.equal(sql(db,`SELECT count(*) FROM public.research_publication_events WHERE envelope->>'payloadRef'='${privateId}'`),'3');});
 test('new publication version invalidates old direct URL; idempotency does not permit altered replay',()=>{
  const aggregate=sql(db,`SELECT publication_id FROM public.research_publication_versions WHERE id='${p}'`);const key=randomUUID();const n=save(body(),aggregate,1,key);assert.equal(save(body(),aggregate,1,key),n);assert.equal(read(p,null),'NULL');assert.match(denied(db,A,`SELECT public.save_research_publication('${aggregate}',1,${q({...body(),title:'changed'})}::jsonb,'${key}')`),/key conflict/);assert.equal(read(n,null),'NULL');p=n;cmd(p,'ready');cmd(p,'publish');
 });
 test('public to cohort audience change creates a new version and closes the old public URL',()=>{const previous=p;const aggregate=sql(db,`SELECT publication_id FROM public.research_publication_versions WHERE id='${p}'`);p=save(body('cohort'),aggregate,2);assert.equal(read(previous,null),'NULL');cmd(p,'ready');assert.equal(read(p,U),'NULL');cmd(p,'publish');assert.equal(read(p,null),'NULL');assert.equal(read(p,OTHER),'NULL');assert.notEqual(read(p,U),'NULL');});
 test('returned approval immediately denies published direct access and stale machine event without deleting private records',()=>{const event=sql(db,`SELECT id FROM public.research_publication_events WHERE envelope->>'payloadRef'='${p}' AND envelope->>'type'='publication.published'`);as(db,A,`INSERT INTO public.research_workbook_reviews(version_id,decision,note) VALUES('${w}','returned','Synthetic correction')`);assert.equal(read(p,null),'NULL');assert.equal(as(db,null,`SELECT coalesce(public.resolve_research_publication_distribution('${event}')::text,'NULL')`,'service_role'),'NULL');assert.equal(sql(db,`SELECT count(*) FROM public.research_workbook_versions WHERE workbook_id='${WB}'`),'2');assert.match(denied(db,A,'DELETE FROM public.research_publication_versions'),/permission denied/);});
 test('an approval and return sharing the transaction timestamp resolve to returned, not random UUID order',async()=>{assert.equal((await saveWorkbook(gateway,{workbookId:WB,baseVersion:2,workbook:publicationResearchFixture(2)})).status,201);w=sql(db,`SELECT id FROM public.research_workbook_versions WHERE workbook_id='${WB}' AND version=3`);as(db,A,`INSERT INTO public.research_workbook_reviews(version_id,decision) VALUES('${w}','approved_internal');INSERT INTO public.research_workbook_reviews(version_id,decision,note) VALUES('${w}','returned','Synthetic same transaction correction')`);const id=save();assert.equal(JSON.parse(as(db,A,`SELECT public.research_publication_status('${id}')`)).approvalCurrent,false);});
});
