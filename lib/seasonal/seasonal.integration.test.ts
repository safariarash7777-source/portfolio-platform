import {test,before,after,describe} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createServer} from "node:http";
import {postSeasonal,type Command} from "./http";
import {parseImport,CSV_HEADER} from "./import";
// Dedicated disposable Docker DB only. Never reads an env file or connects to a remote DB.
const CONTAINER="portfolio-next04-synthetic-db";
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222",ADMIN="33333333-3333-4333-8333-333333333333",UNVERIFIED="44444444-4444-4444-8444-444444444444";
const C1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",C2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",EXPIRED="cccccccc-cccc-4ccc-8ccc-cccccccccccc",CANCELLED="dddddddd-dddd-4ddd-8ddd-dddddddddddd",W="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const quote=(v:unknown)=>v===null?"NULL":typeof v==="number"||typeof v==="boolean"?String(v):"'"+(typeof v==="object"?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
function sql(db:string,text:string){return execFileSync("docker",["exec",CONTAINER,"psql","-U","postgres","-d",db,"-X","-qAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",text],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();}
function file(db:string,path:string){execFileSync("docker",["exec",CONTAINER,"psql","-U","postgres","-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f","/workspace/"+path],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});}
function as(db:string,id:string|null,text:string){return sql(db,`BEGIN;SET LOCAL ROLE ${id?"authenticated":"anon"};SELECT set_config('request.jwt.claims',${quote(JSON.stringify(id?{sub:id,role:"authenticated"}:{role:"anon"}))},true);${text};COMMIT;`).split("\n").filter(Boolean).at(-1)!;}
function denied(db:string,id:string|null,text:string){try{as(db,id,text);return "";}catch(e){return String((e as {stderr?:unknown}).stderr??e);}}
function rpc(db:string,id:string|null,name:string,args:Record<string,unknown>){return as(db,id,`SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`"${k}"=>${quote(v)}`).join(",")}))`);}
async function http(db:string,id:string|null,command:Command,body:unknown,ref?:string){
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const out=await postSeasonal(new Request("http://localhost/test",{method:"POST",body:Buffer.concat(chunks).toString()}),async()=>({async authenticate(){return {user:id?{id}:null,error:false};},async rpc(name,args){try{return {data:JSON.parse(rpc(db,id,name,args)),error:null};}catch(e){const msg=String((e as {stderr?:unknown}).stderr??e);return {data:null,error:{code:msg.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??"P0001"}};}}}),command,ref);res.writeHead(out.status,{"Content-Type":"application/json"});res.end(await out.text());});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));try{const port=(server.address() as {port:number}).port;const r=await fetch(`http://127.0.0.1:${port}`,{method:"POST",body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
for(const profile of ["legacy","explicit"]){describe(`NEXT04 real SQL/RLS + loopback HTTP — ${profile}`,()=>{
 const db=`seasonal_next04_${profile}`;let batch:number,hash:string,rowA:number,grantA:string,grantB:string;
 before(()=>{
  sql("postgres",`DROP DATABASE IF EXISTS ${db}`);sql("postgres",`CREATE DATABASE ${db}`);
  file(db,"sql/test/supabase_bootstrap.sql");file(db,`sql/test/profile_${profile==="legacy"?"legacy_default_privileges":"explicit_grants"}.sql`);
  sql(db,"ALTER TABLE auth.users ADD COLUMN email text,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN phone text,ADD COLUMN phone_confirmed_at timestamptz;CREATE TABLE public.payments(id uuid PRIMARY KEY);CREATE TABLE public.audit_log(actor_id uuid,action text,entity text,target_user_id uuid,after jsonb);CREATE SCHEMA storage;GRANT USAGE ON SCHEMA storage TO anon,authenticated;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT ON storage.objects TO anon,authenticated;CREATE POLICY deliberately_permissive_test_read ON storage.objects FOR SELECT TO anon,authenticated USING(true)");
  file(db,"sql/phase8_webinars.sql");file(db,"sql/phase11_access_tiers.sql");file(db,"sql/phase27_member_import.sql");file(db,"supabase/migrations/20260930182629_seasonal_course_membership.sql");
  sql(db,`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${A}','a@example.invalid',now()),('${B}','b@example.invalid',now()),('${ADMIN}','admin@example.invalid',now()),('${UNVERIFIED}','unverified@example.invalid',NULL);INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADMIN}','admin'),('${UNVERIFIED}','user');
  INSERT INTO public.courses(id,title,status) VALUES('99999999-9999-4999-8999-999999999999','Synthetic course','published');
  INSERT INTO public.course_cohorts(id,course_id,title,starts_at,ends_at,policy_version,policy,status,module_keys) VALUES
  ('${C1}','99999999-9999-4999-8999-999999999999','Synthetic A',now()-interval '30 days',now()+interval '60 days','sandbox.v1','{"commercialEnabled":false}','published',ARRAY['webinar','resources','funds']),
  ('${C2}','99999999-9999-4999-8999-999999999999','Synthetic B',now()-interval '1 day',now()+interval '90 days','sandbox.v1','{"commercialEnabled":false}','published',ARRAY['resources','symbol']),
  ('${EXPIRED}','99999999-9999-4999-8999-999999999999','Synthetic expired',now()-interval '100 days',now()-interval '1 day','sandbox.v1','{"commercialEnabled":false}','published',ARRAY['resources']),
  ('${CANCELLED}','99999999-9999-4999-8999-999999999999','Synthetic cancelled',now()-interval '1 day',now()+interval '90 days','sandbox.v1','{"commercialEnabled":false}','cancelled',ARRAY['resources']);
  INSERT INTO public.webinars(id,title,starts_at,ends_at,platform_url,status,cohort_id) VALUES('${W}','Synthetic private webinar',now()-interval '10 minutes',now()+interval '1 hour','https://example.invalid/PRIVATE_JOIN','live','${C1}');`);
 });
 after(()=>sql("postgres",`DROP DATABASE IF EXISTS ${db}`));
 const csv=(id:string,c:string,contact="a@example.invalid",status="accepted",at=new Date(Date.now()-86400000).toISOString())=>CSV_HEADER+`\npartner,${id},${c},${status},${at},1,email,${contact}`;
 async function importRow(external:string,c:string,contact="a@example.invalid",status="accepted"){
  const p=await http(db,ADMIN,"preview",{csv:csv(external,c,contact,status),cohortId:c,cohortRef:c,evidence:"Synthetic registration evidence only"});assert.equal(p.status,200,JSON.stringify(p.body));
  const commit=await http(db,ADMIN,"commit",{hash:p.body.data.hash},String(p.body.data.importId));assert.equal(commit.status,200);
  return Number(sql(db,`SELECT id FROM public.member_import_rows WHERE batch_id=${p.body.data.importId}`));
 }
 test("permissions and public links: direct reads and forged writes denied",()=>{
  assert.match(denied(db,null,"SELECT platform_url FROM public.webinars"),/permission denied/);
  assert.match(denied(db,A,"SELECT platform_url FROM public.webinars"),/permission denied/);
  assert.equal(as(db,null,"SELECT count(*) FROM public.courses"),"1");
  assert.match(denied(db,A,`INSERT INTO public.entitlements(user_id,kind,expires_at,cohort_id,module_keys) VALUES('${A}','webinar',now()+interval '10 days','${C1}',ARRAY['resources'])`),/permission denied|row-level security/);
  assert.match(denied(db,ADMIN,`INSERT INTO public.entitlements(user_id,kind,expires_at,cohort_id,module_keys,note) VALUES('${A}','manual',now()+interval '10 days','${C1}',ARRAY['resources'],'Bypass audit attempt')`),/row-level security/);
  for(const table of ["courses","course_cohorts","needs_assessment_versions","course_resources","seasonal_events","entitlements","webinars","webinar_registrations"]){assert.equal(sql(db,`SELECT has_table_privilege('authenticated','public.${table}','TRUNCATE')`),"f");}
 });
 test("preview contains masked samples; no grant; commit hash conflict and replay",async()=>{
  const p=await http(db,ADMIN,"preview",{csv:csv("A-1",C1),cohortId:C1,cohortRef:C1,evidence:"Synthetic registration evidence only"});assert.equal(p.status,200,JSON.stringify(p.body));batch=p.body.data.importId;hash=p.body.data.hash;
  assert.equal(JSON.stringify(p.body).includes("a@example.invalid"),false);assert.equal(sql(db,"SELECT count(*) FROM public.entitlements"),"0");
  assert.equal((await http(db,ADMIN,"commit",{hash:"f".repeat(64)},String(batch))).status,409);
  assert.equal((await http(db,ADMIN,"commit",{hash},String(batch))).status,200);assert.equal((await http(db,ADMIN,"commit",{hash},String(batch))).status,200);
  rowA=Number(sql(db,`SELECT id FROM public.member_import_rows WHERE batch_id=${batch}`));
 });
 test("correct account claims; unrelated/unverified/forged account cannot; request retry does not extend",async()=>{
  assert.equal((await http(db,B,"claim",{registrationRef:rowA})).status,403);
  assert.equal((await http(db,null,"claim",{registrationRef:rowA})).status,401);
  assert.equal((await http(db,A,"claim",{registrationRef:rowA,userId:B})).status,422);
  const first=await http(db,A,"claim",{registrationRef:rowA});assert.equal(first.status,200,JSON.stringify(first.body));grantA=first.body.data.grantRef;
  const again=await http(db,A,"claim",{registrationRef:rowA});assert.equal(again.body.data.grantRef,grantA);assert.equal(sql(db,"SELECT count(*) FROM public.entitlements"),"1");
  assert.equal(as(db,ADMIN,`WITH changed AS (UPDATE public.entitlements SET revoked_at=now(),note='Bypass audit attempt' WHERE id='${grantA}' RETURNING id) SELECT count(*) FROM changed`),"0");
  const uv=await importRow("UNVERIFIED",C1,"unverified@example.invalid");assert.equal((await http(db,UNVERIFIED,"claim",{registrationRef:uv})).status,403);
 });
 test("needs assessment amendable with optimistic version; private and surplus fields denied",async()=>{
  const body={experience:"new",interests:["صندوق"],goal:"آموزش",question:"پرسش نمونه"};
  assert.equal((await http(db,A,"needs",{body,baseVersion:0,submitted:true},C1)).status,200);
  assert.equal((await http(db,A,"needs",{body:{...body,goal:"هدف تازه"},baseVersion:1,submitted:true},C1)).status,200);
  assert.equal((await http(db,A,"needs",{body,baseVersion:0,submitted:true},C1)).status,409);
  assert.equal((await http(db,B,"needs",{body,baseVersion:0,submitted:true},C1)).status,403);
  assert.equal(as(db,B,"SELECT count(*) FROM public.needs_assessment_versions"),"0");
  assert.equal((await http(db,A,"needs",{body:{...body,riskTolerance:"high"},baseVersion:2,submitted:true},C1)).status,422);
  assert.match(denied(db,A,"UPDATE public.needs_assessment_versions SET version=9"),/permission denied/);
  assert.match(denied(db,A,`SELECT public.seasonal_save_needs('${C1}',2,'{"experience":null,"interests":[],"goal":"","question":""}',false)`),/invalid needs/);
  assert.equal((await http(db,A,"needs",{body:{...body,interests:["صندوق","صندوق"]},baseVersion:2,submitted:true},C1)).status,200);
  assert.equal((await http(db,A,"needs",{body:{...body,interests:[],question:"پیش‌نویس تازه"},baseVersion:3,submitted:false},C1)).status,200);
  const summary=JSON.parse(rpc(db,ADMIN,"seasonal_assessment_summary",{p_cohort:C1}));assert.equal(summary.submittedCount,1);assert.equal(summary.interests[0].count,1);assert.equal(summary.questions[0],"پرسش نمونه");
  assert.match(denied(db,B,`SELECT public.seasonal_assessment_summary('${C1}')`),/forbidden/);
 });
 test("two cohorts coexist, exact resource scope and shared module union; legacy full not widened",async()=>{
  const row=await importRow("B-1",C2);const claim=await http(db,A,"claim",{registrationRef:row});assert.equal(claim.status,200);grantB=claim.body.data.grantRef;
  assert.equal(as(db,A,`SELECT public.fn_user_access('${A}')`),"registered");
  assert.equal(JSON.parse(rpc(db,A,"seasonal_module_access",{p_module:"symbol",p_cohort:C1})).allowed,false);
  assert.equal(JSON.parse(rpc(db,A,"seasonal_module_access",{p_module:"symbol",p_cohort:C2})).allowed,true);
  assert.deepEqual(JSON.parse(rpc(db,A,"seasonal_module_access",{p_module:"resources",p_cohort:null})).authorizedByCohortIds.sort(),[C1,C2].sort());
  sql(db,`INSERT INTO public.course_resources(id,cohort_id,title,storage_bucket,storage_path,published) VALUES('88888888-8888-4888-8888-888888888888','${C1}','Private file','course-private','synthetic/A.pdf',true)`);
  assert.equal(as(db,A,"SELECT count(*) FROM public.course_resources"),"1");assert.equal(as(db,B,"SELECT count(*) FROM public.course_resources"),"0");
  sql(db,"INSERT INTO storage.objects(bucket_id,name) VALUES('course-private','synthetic/A.pdf'),('course-private','synthetic/NOT_GRANTED.pdf')");
  assert.equal(sql(db,"SELECT public FROM storage.buckets WHERE id='course-private'"),"f");
  assert.equal(as(db,A,"SELECT count(*) FROM storage.objects"),"1");assert.equal(as(db,B,"SELECT count(*) FROM storage.objects"),"0");
  assert.equal(as(db,null,"SELECT count(*) FROM storage.objects"),"0");
  sql(db,"INSERT INTO storage.objects(bucket_id,name) VALUES('existing-public-bucket','public-example.txt')");
  assert.equal(as(db,null,"SELECT count(*) FROM storage.objects"),"1");
  assert.match(rpc(db,A,"seasonal_join_webinar",{p_cohort:C1,p_webinar:W}),/PRIVATE_JOIN/);
  assert.match(denied(db,B,`SELECT public.seasonal_join_webinar('${C1}','${W}')`),/webinar not granted/);
  assert.match(denied(db,A,`SELECT public.register_for_webinar('${W}')`),/commercial registration not enabled/);
 });
 test("late signup ends at original cohort date; duplicate source does not renew or mutate",async()=>{
  assert.equal(sql(db,`SELECT e.expires_at=c.ends_at AND e.starts_at>c.starts_at FROM public.entitlements e JOIN public.course_cohorts c ON c.id=e.cohort_id WHERE e.id='${grantA}'`),"t");
  const row=await importRow("A-1",C1);assert.equal(sql(db,`SELECT status FROM public.member_import_rows WHERE id=${row}`),"duplicate");
  assert.equal((await http(db,A,"claim",{registrationRef:row})).status,409);assert.equal(sql(db,"SELECT count(*) FROM public.entitlements"),"2");
 });
 test("expiry/cancellation and manual revoke never grant; B and personal history survive",async()=>{
  const expired=await importRow("expired",EXPIRED);assert.equal((await http(db,A,"claim",{registrationRef:expired})).body.data.status,"expired");
  const cancelled=await importRow("cancelled",CANCELLED);assert.equal((await http(db,A,"claim",{registrationRef:cancelled})).body.data.status,"pending_review");
  const body={action:"revoke",userId:A,cohortId:C1,grantRef:grantA,reason:"Synthetic cancellation reason",idempotencyKey:"revoke-A-unique"};
  assert.equal((await http(db,B,"access",body)).status,403);assert.equal((await http(db,ADMIN,"access",body)).status,200);assert.equal((await http(db,ADMIN,"access",body)).status,200);
  assert.equal(JSON.parse(rpc(db,A,"seasonal_module_access",{p_module:"resources",p_cohort:C1})).allowed,false);assert.equal(JSON.parse(rpc(db,A,"seasonal_module_access",{p_module:"resources",p_cohort:C2})).allowed,true);
  assert.equal(as(db,A,"SELECT count(*) FROM public.needs_assessment_versions"),"4");assert.equal(as(db,A,"SELECT count(*) FROM public.course_resources"),"0");
  assert.equal(as(db,A,"SELECT count(*) FROM storage.objects WHERE bucket_id='course-private'"),"0");
  assert.match(denied(db,A,`SELECT public.seasonal_join_webinar('${C1}','${W}')`),/webinar not granted/);
 });
 test("manual grant/renew history and idempotency body conflict; consultation independent",async()=>{
  const body={action:"renew",grantRef:grantB,userId:A,cohortId:C2,moduleKeys:["resources"],startsAt:new Date().toISOString(),endsAtExclusive:new Date(Date.now()+100*86400000).toISOString(),reason:"Synthetic manual extension approval",idempotencyKey:"renew-B-unique"};
  const first=await http(db,ADMIN,"access",body);assert.equal(first.status,200,JSON.stringify(first.body));assert.notEqual(first.body.data.grantRef,grantB);
  assert.equal((await http(db,ADMIN,"access",body)).body.data.grantRef,first.body.data.grantRef);assert.equal((await http(db,ADMIN,"access",{...body,reason:"Changed body on the same key"})).status,409);
  assert.equal(sql(db,`SELECT renewed_from FROM public.entitlements WHERE id='${first.body.data.grantRef}'`),grantB);
  sql(db,`INSERT INTO public.entitlements(user_id,kind,source,starts_at,expires_at) VALUES('${B}','consulting','synthetic independent consultation',now()-interval '1 day',now()+interval '2 days')`);
  assert.equal(as(db,B,`SELECT public.fn_user_access('${B}')`),"full");assert.equal(JSON.parse(rpc(db,B,"seasonal_module_access",{p_module:"resources",p_cohort:C1})).allowed,false);
 });
 test("ambiguous confirmed identity enters review; evidence and chosen canonical account required",async()=>{
  sql(db,`UPDATE auth.users SET email='a@example.invalid',email_confirmed_at=now() WHERE id='${UNVERIFIED}'`);
  const row=await importRow("ambiguous",C2);assert.equal((await http(db,A,"claim",{registrationRef:row})).body.data.status,"pending_review");
  assert.equal(sql(db,`SELECT status FROM public.member_import_rows WHERE id=${row}`),"unmatched");
  const review=await http(db,ADMIN,"operations",{action:"review",registrationRef:row,userId:A,reason:"Synthetic independent registration ownership proof"});assert.equal(review.status,200,JSON.stringify(review.body));
  assert.equal((await http(db,A,"claim",{registrationRef:row})).body.data.status,"claimed");assert.equal((await http(db,UNVERIFIED,"claim",{registrationRef:row})).body.data.status,"pending_review");
 });
 test("SQL cohort policy calendar, draft privacy, replay and audited cancellation",async()=>{
  const create={action:"create-cohort",title:"Synthetic Jan31 draft",startsLocal:"2027-01-31T09:00",calendar:"gregorian-calendar-months",amount:3,policyVersion:"synthetic.policy.3m",idempotencyKey:"cohort-create-sample"};
  const first=await http(db,ADMIN,"operations",create);assert.equal(first.status,200,JSON.stringify(first.body));const item=first.body.data.cohorts.find((c:{title:string})=>c.title===create.title);
  assert.equal(Date.parse(item.ends_at),Date.parse("2027-04-30T09:00:00+03:30"));assert.equal(item.policy.commercialEnabled,false);assert.equal(item.registration_open,false);
  const retry=await http(db,ADMIN,"operations",create);assert.equal(retry.body.data.cohorts.filter((c:{title:string})=>c.title===create.title).length,1);assert.equal((await http(db,ADMIN,"operations",{...create,amount:90})).status,409);
  assert.equal(as(db,null,"SELECT count(*) FROM public.course_cohorts WHERE title='Synthetic Jan31 draft'"),"0");
  assert.match(denied(db,ADMIN,`UPDATE public.course_cohorts SET status='cancelled' WHERE id='${C2}'`),/cancellation requires/);
  assert.match(denied(db,ADMIN,`UPDATE public.course_cohorts SET ends_at=ends_at+interval '1 day' WHERE id='${C2}'`),/policy immutable/);
  const cancel={action:"cancel-cohort",cohortId:C2,reason:"Synthetic provider cancellation reason",idempotencyKey:"cancel-cohort-sample"};assert.equal((await http(db,ADMIN,"operations",cancel)).status,200);assert.equal((await http(db,ADMIN,"operations",cancel)).status,200);
  assert.equal(JSON.parse(rpc(db,A,"seasonal_module_access",{p_module:"resources",p_cohort:C2})).reason,"cohort_cancelled");assert.equal(as(db,A,"SELECT count(*) FROM public.needs_assessment_versions"),"4");
 });
 test("legacy phase27 and noncohort webinar remain compatible; scoped lifetime always finite",()=>{
  sql(db,`INSERT INTO public.webinars(title,starts_at,status,registration_open) VALUES('Synthetic legacy event',now()+interval '1 day','published',true)`);
  const webinar=sql(db,"SELECT id FROM public.webinars WHERE title='Synthetic legacy event'");assert.ok(JSON.parse(as(db,B,`SELECT public.register_for_webinar('${webinar}')`)).registration_id);
  const batch=sql(db,`INSERT INTO public.member_import_batches(source_label,evidence,imported_by,approved_at,approved_by) VALUES('legacy.csv','Synthetic legacy evidence','${ADMIN}',now(),'${ADMIN}') RETURNING id`);
  const row=sql(db,`INSERT INTO public.member_import_rows(batch_id,contact_kind,contact_value,access_from,access_until,status,matched_user_id) VALUES(${batch},'email','legacy@example.invalid',DATE '2026-09-01',DATE '2026-12-01','matched','${B}') RETURNING id`);
  assert.ok(Number(sql(db,`BEGIN;SET LOCAL ROLE service_role;SELECT set_config('request.jwt.claims','{"sub":"${ADMIN}","role":"service_role"}',true);SELECT public.grant_member_access(${row},'webinar');COMMIT;`).split("\n").at(-1))>0);
  sql(db,"ALTER TABLE public.entitlements ALTER COLUMN expires_at DROP NOT NULL");
  assert.match(denied(db,ADMIN,`INSERT INTO public.entitlements(user_id,kind,expires_at,cohort_id,module_keys) VALUES('${A}','webinar',NULL,'${C1}',ARRAY['resources'])`),/row-level security|check constraint/);
  const lifetime=sql(db,`INSERT INTO public.entitlements(user_id,kind,expires_at) VALUES('${B}','manual',NULL) RETURNING id`);assert.equal(as(db,B,`SELECT public.fn_user_access('${B}')`),"full");
  assert.match(denied(db,ADMIN,`UPDATE public.entitlements SET expires_at=now() WHERE id='${lifetime}'`),/only revoked_at|immutable entitlement/);
 });
});}
