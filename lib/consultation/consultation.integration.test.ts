import {before,after,test,describe} from "node:test";
import assert from "node:assert/strict";
import {join} from "node:path";
import {execFileSync,psqlAsync} from "../ops/test-postgres";
import { createServer } from "node:http";
import { postConsultation } from "./http";
const ENV={...process.env,PGHOST:"127.0.0.1",PGPORT:process.env.PGPORT ?? "5433",PGUSER:"postgres",PGPASSWORD:"postgres"};
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222",ADVISOR="33333333-3333-4333-8333-333333333333",ADMIN="44444444-4444-4444-8444-444444444444";
const KEY="55555555-5555-4555-8555-555555555555",TASK="66666666-6666-4666-8666-666666666666",DRAFT="77777777-7777-4777-8777-777777777777";
function sql(db:string,text:string){return execFileSync("psql",["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",text],{env:ENV,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();}
function file(db:string,path:string){execFileSync("psql",["-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f",join(process.cwd(),path)],{env:ENV,encoding:"utf8"});}
const wrap=(id:string|null,text:string)=>`BEGIN; SELECT set_config('request.jwt.claims','${JSON.stringify(id?{sub:id,role:"authenticated"}:{role:"anon"})}',true); SET LOCAL ROLE ${id?"authenticated":"anon"}; ${text}; COMMIT;`;
const last=(text:string)=>text.split("\n").filter(Boolean).at(-1)!;
function as(db:string,id:string|null,text:string){return last(sql(db,wrap(id,text)));}
function denied(db:string,id:string|null,text:string){try{sql(db,wrap(id,text));return "";}catch(e){return String((e as {stderr?:unknown}).stderr ?? e);}}
// Real loopback HTTP -> the production handler -> real Postgres/RLS/RPC.
// Authentication is a labelled test identity, not a real staging login.
async function post(db:string,user:string|null,payload:Record<string,unknown>) {
  const server=createServer(async (req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req) chunks.push(Buffer.from(chunk));
    const response=await postConsultation(new Request("http://localhost/api/consultation",{method:"POST",headers:{"content-type":"application/json"},body:Buffer.concat(chunks).toString()}),async()=>({
      async authenticate(){return {user:user?{id:user}:null,error:false};},
      async rpc(name,args){
        assert.ok(["save_consultation_action","save_consultation_session"].includes(name));
        const literal=(value:unknown)=>value===null?"NULL":typeof value==="number"?String(value):"'"+(typeof value==="object"?JSON.stringify(value):String(value)).replaceAll("'","''")+"'";
        const parameters=Object.entries(args).map(([key,value])=>`"${key}" => ${literal(value)}`).join(",");
        try{return {data:JSON.parse(as(db,user,`SELECT to_jsonb(public.${name}(${parameters}))`)),error:null};}
        catch(error){const stderr=String((error as {stderr?:unknown}).stderr??error);return {data:null,error:{code:stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??"P0001"}};}
      },
    }));
    res.writeHead(response.status,{"content-type":"application/json"});res.end(await response.text());
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address() as {port:number};
  try {const response=await fetch(`http://127.0.0.1:${address.port}/api/consultation`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});return {status:response.status,body:await response.json()};}
  finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
for(const profile of ["legacy","explicit"]){
  describe(`DEV-03/04/05/07 synthetic DB acceptance — ${profile}`,()=>{
    const db=`v1_delivery_${profile}`;let relation:string,holding:string,v1:string,v2:string;
    before(()=>{
      sql("postgres",`DROP DATABASE IF EXISTS ${db}`);sql("postgres",`CREATE DATABASE ${db}`);
      file(db,"sql/test/supabase_bootstrap.sql");file(db,`sql/test/profile_${profile==="legacy"?"legacy_default_privileges":"explicit_grants"}.sql`);
      file(db,"sql/test/portfolio_precondition.sql");
      // Intentionally no phase20/22: reference portfolio support is optional.
      file(db,"sql/phase32_member_holdings.sql");file(db,"sql/phase34_research_workbook_versions.sql");file(db,"sql/phase35_consultation.sql");
      file(db,"sql/phase36_consultation_review_fixes.sql");
      sql(db,`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${ADVISOR}'),('${ADMIN}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADVISOR}','admin'),('${ADMIN}','admin'); INSERT INTO public.consultation_advisors(user_id,display_name) VALUES('${ADVISOR}','آرش · نمونهٔ آزمایشی');`);
    });
    after(()=>{sql("postgres",`DROP DATABASE IF EXISTS ${db}`);});
    test("migration order works without research engine tables and reruns preserve RLS",()=>{
      assert.equal(sql(db,"SELECT to_regclass('public.intel_reference_versions') IS NULL"),"t");
      file(db,"sql/phase32_member_holdings.sql");file(db,"sql/phase34_research_workbook_versions.sql");file(db,"sql/phase35_consultation.sql");
      file(db,"sql/phase36_consultation_review_fixes.sql");
      assert.equal(sql(db,"SELECT count(*) FROM pg_class WHERE relname LIKE 'consultation_%' AND relkind='r' AND relrowsecurity"),"7");
    });
    test("A explicitly grants only their own relationship; repeated grant is stable",()=>{
      relation=as(db,A,`SELECT public.grant_consultation('${ADVISOR}','مشتری آزمایشی A')`);
      assert.equal(as(db,A,`SELECT public.grant_consultation('${ADVISOR}','مشتری آزمایشی A')`),relation);
      assert.equal(as(db,B,"SELECT count(*) FROM public.consultation_relationships"),"0");
      assert.equal(as(db,ADMIN,"SELECT count(*) FROM public.consultation_relationships"),"0");
      assert.match(denied(db,null,`SELECT public.grant_consultation('${ADVISOR}','guest')`),/permission denied/);
      assert.match(denied(db,B,`INSERT INTO public.consultation_relationships(client_id,advisor_id,client_label) VALUES('${A}','${ADVISOR}','forged')`),/permission denied/);
    });
    test("versioned holdings reopen, old version stays fixed, unauthorized direct reads fail",()=>{
      const pos=`[{"position_key":"p","symbol":"فملی","asset_class":"equity_ir","qty":10,"unit":"سهم","as_of":"2026-09-30"}]`;
      holding=as(db,A,`SELECT version_id FROM public.record_member_holdings('${pos}',NULL,'v1',0)`);
      assert.equal(as(db,A,`SELECT version FROM public.record_member_holdings('${pos}',NULL,'v1',0)`),"1");
      assert.equal(as(db,A,`SELECT version FROM public.record_member_holdings('${pos.replace('qty":10','qty":20')}',NULL,'v2',1)`),"2");
      assert.equal(as(db,A,`SELECT qty FROM public.member_holding_positions WHERE version_id='${holding}'`),"10");
      assert.equal(as(db,B,`SELECT count(*) FROM public.member_holding_positions WHERE version_id='${holding}'`),"0");
      assert.equal(as(db,ADVISOR,"SELECT count(*) FROM public.member_holding_versions"),"0");
      assert.equal(as(db,ADVISOR,`SELECT count(*) FROM public.consultation_holding_versions('${relation}')`),"2");
      assert.match(denied(db,B,`SELECT * FROM public.consultation_holding_versions('${relation}')`),/forbidden/);
    });
    const body=(summary:string)=>JSON.stringify({occurs_at:"2026-09-30T10:00:00+03:30",topic:"جلسهٔ نمونهٔ آزمایشی",goal:"هدف آزمایشی",client_summary:summary,private_note:"PRIVATE_TEST_NOTE",holding_version_id:holding});
    test("private notes and unpubished summaries never reach A, B or an unrelated admin",()=>{
      v1=as(db,ADVISOR,`SELECT public.save_consultation_session('${relation}','${KEY}',0,'${body("خلاصهٔ نسخهٔ اول")}')`);
      for(const user of [A,B,ADMIN]){
        assert.equal(as(db,user,`SELECT count(*) FROM public.consultation_sessions WHERE id='${v1}'`),"0");
        assert.equal(as(db,user,`SELECT count(*) FROM public.consultation_private_notes WHERE session_id='${v1}'`),"0");
      }
      assert.equal(as(db,ADVISOR,`SELECT note FROM public.consultation_private_notes WHERE session_id='${v1}'`),"PRIVATE_TEST_NOTE");
    });
    test("publishing is explicit, v2 preserves v1 and old/conflicting approvals are rejected",()=>{
      as(db,ADVISOR,`SELECT public.publish_consultation_session('${v1}')`);
      assert.equal(as(db,A,`SELECT client_summary FROM public.consultation_sessions WHERE id='${v1}'`),"خلاصهٔ نسخهٔ اول");
      v2=as(db,ADVISOR,`SELECT public.save_consultation_session('${relation}','${KEY}',1,'${body("خلاصهٔ نسخهٔ دوم")}')`);
      assert.equal(as(db,A,"SELECT count(*) FROM public.consultation_sessions"),"1");
      assert.match(denied(db,ADVISOR,`SELECT public.publish_consultation_session('${v1}')`),/stale/);
      assert.match(denied(db,ADVISOR,`SELECT public.save_consultation_session('${relation}','${KEY}',1,'${body("تعارض")}')`),/stale/);
      assert.equal(as(db,ADVISOR,`SELECT client_summary FROM public.consultation_sessions WHERE id='${v1}'`),"خلاصهٔ نسخهٔ اول");
      assert.equal(as(db,B,"SELECT count(*) FROM public.consultation_sessions"),"0");
      assert.match(denied(db,A,`SELECT public.publish_consultation_session('${v2}')`),/forbidden/);
    });
    test("two concurrent edits share a base; exactly one succeeds",async()=>{
      const cmd=wrap(ADVISOR,`SELECT public.save_consultation_session('${relation}','${KEY}',2,'${body("نسخهٔ هم‌زمان")}')`);
      const run=()=>psqlAsync(["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-c",cmd],ENV);
      const outcomes=await Promise.allSettled([run(),run()]);
      assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);assert.equal(outcomes.filter(r=>r.status==="rejected").length,1);
      assert.equal(as(db,ADVISOR,"SELECT max(version) FROM public.consultation_sessions"),"3");
    });
    test("an internal research draft cannot be linked for a client",()=>{
      as(db,ADVISOR,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES('${DRAFT}',1,'نمونه','{"version":1,"title":"نمونه","domain":"macro_ir","evidence":[]}')`);
      const research=sql(db,`SELECT id FROM public.research_workbook_versions WHERE workbook_id='${DRAFT}'`);
      const payload={...JSON.parse(body("پژوهش")),research_version_id:research};
      assert.match(denied(db,ADVISOR,`SELECT public.save_consultation_session('${relation}',gen_random_uuid(),0,'${JSON.stringify(payload)}')`),/research not approved/);
      assert.equal(as(db,A,"SELECT count(*) FROM public.research_workbook_versions"),"0");
    });
    test("client changes own action status with an append-only history; B cannot",()=>{
      const task=JSON.stringify({session_id:v1,title:"اقدام آزمایشی",responsible_id:A,due_on:"2026-10-01",status:"open"});
      as(db,ADVISOR,`SELECT public.save_consultation_action('${relation}','${TASK}',0,'${task}')`);
      assert.equal(as(db,A,"SELECT title FROM public.consultation_actions"),"اقدام آزمایشی");
      assert.match(denied(db,B,`SELECT public.save_consultation_action('${relation}','${TASK}',1,'{"status":"done"}')`),/forbidden/);
      as(db,A,`SELECT public.save_consultation_action('${relation}','${TASK}',1,'{"status":"done","title":"forged title"}')`);
      assert.equal(as(db,A,"SELECT count(*) FROM public.consultation_actions"),"2");
      assert.equal(as(db,A,"SELECT title FROM public.consultation_actions ORDER BY version DESC LIMIT 1"),"اقدام آزمایشی");
      assert.equal(as(db,A,"SELECT status FROM public.consultation_actions ORDER BY version DESC LIMIT 1"),"done");
      assert.match(denied(db,A,"DELETE FROM public.consultation_actions"),/permission denied/);
    });
    test("phase36 repairs the advisor status-only regression and preserves every prior field",()=>{
      const prior=as(db,ADVISOR,`SELECT ROW(session_id,title,responsible_id,due_on)::text FROM public.consultation_actions WHERE action_key='${TASK}' ORDER BY version DESC LIMIT 1`);
      // Reproduce the actual old RPC, then prove the new migration fixes it in place.
      file(db,"sql/phase35_consultation.sql");
      assert.match(denied(db,ADVISOR,`SELECT public.save_consultation_action('${relation}','${TASK}',2,'{"status":"doing"}')`),/session not published/);
      file(db,"sql/phase36_consultation_review_fixes.sql");
      as(db,ADVISOR,`SELECT public.save_consultation_action('${relation}','${TASK}',2,'{"status":"doing"}')`);
      assert.equal(as(db,ADVISOR,`SELECT ROW(session_id,title,responsible_id,due_on)::text FROM public.consultation_actions WHERE action_key='${TASK}' ORDER BY version DESC LIMIT 1`),prior);
      assert.equal(as(db,ADVISOR,`SELECT status||':'||version FROM public.consultation_actions WHERE action_key='${TASK}' ORDER BY version DESC LIMIT 1`),"doing:3");
      assert.equal(as(db,ADVISOR,`SELECT actor_id FROM public.consultation_actions WHERE action_key='${TASK}' ORDER BY version DESC LIMIT 1`),ADVISOR);
      for(const user of [A,ADVISOR]) assert.match(denied(db,user,`SELECT public.save_consultation_action('${relation}','${TASK}',2,'{"status":"done"}')`),/stale/);
      assert.match(denied(db,ADVISOR,`SELECT public.save_consultation_action('${relation}',gen_random_uuid(),0,'{"status":"done"}')`),/forbidden/);
      file(db,"sql/phase36_consultation_review_fixes.sql");
      assert.equal(as(db,ADVISOR,`SELECT count(*) FROM public.consultation_actions WHERE action_key='${TASK}'`),"3");
    });
    test("HTTP status-only for customer AND advisor creates a version, preserves fields, and rejects stale/unauthorized writes",async()=>{
      const key="88888888-8888-4888-8888-888888888888";
      const command={action:"task",relationshipId:relation,actionKey:key,baseVersion:0,status:"open",title:"HTTP اقدام مصنوعی",responsibleId:A,dueOn:"۲۰۲۶-۱۰-۰۲",sessionId:v1};
      assert.equal((await post(db,ADVISOR,command)).status,201);
      const immutable=as(db,A,`SELECT ROW(session_id,title,responsible_id,due_on)::text FROM public.consultation_actions WHERE action_key='${key}'`);
      for(const [user,baseVersion,status] of [[A,1,"done"],[ADVISOR,2,"doing"]] as const){
        const response=await post(db,user,{action:"task",relationshipId:relation,actionKey:key,baseVersion,status,user_id:B,actor_id:B});
        assert.equal(response.status,201,JSON.stringify(response.body));
        const row=as(db,user,`SELECT ROW(session_id,title,responsible_id,due_on)::text FROM public.consultation_actions WHERE id='${response.body.id}'`);
        assert.equal(row,immutable);
        assert.equal(as(db,user,`SELECT actor_id||':'||version||':'||status FROM public.consultation_actions WHERE id='${response.body.id}'`),`${user}:${baseVersion+1}:${status}`);
      }
      for(const user of [A,ADVISOR]) assert.equal((await post(db,user,{action:"task",relationshipId:relation,actionKey:key,baseVersion:1,status:"done"})).status,409);
      assert.equal((await post(db,B,{action:"task",relationshipId:relation,actionKey:key,baseVersion:3,status:"done"})).status,403);
      assert.equal((await post(db,null,{action:"task",relationshipId:relation,actionKey:key,baseVersion:3,status:"done"})).status,401);
      const ownKey="abababab-abab-4bab-8bab-abababababab";
      assert.equal((await post(db,ADVISOR,{...command,actionKey:ownKey,responsibleId:ADVISOR})).status,201);
      assert.equal((await post(db,A,{action:"task",relationshipId:relation,actionKey:ownKey,baseVersion:1,status:"done"})).status,403);
      assert.equal(as(db,ADVISOR,`SELECT count(*) FROM public.consultation_actions WHERE action_key='${key}'`),"3");
    });
    test("research picker lists only latest approved metadata to the authorized advisor; stale/draft links still fail at HTTP/DB",async()=>{
      const wb="99999999-9999-4999-8999-999999999999";
      const evidence=JSON.stringify({version:1,title:"پژوهش مصنوعی",domain:"macro_ir",evidence:[{id:"e1",statement:"شاهد مصنوعی",sourceUrl:"https://example.invalid/evidence",observedOn:"2026-09-30",publishedOn:"2026-09-30"}]});
      const research=as(db,ADVISOR,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES('${wb}',1,'عنوان پژوهش تأییدشده','${evidence}') RETURNING id`);
      const picker=()=>JSON.parse(as(db,ADVISOR,`SELECT coalesce(jsonb_agg(x),'[]') FROM public.consultation_approved_research_versions('${relation}') x`)) as {id:string;title:string;version:number}[];
      assert.deepEqual(picker(),[]);
      as(db,ADVISOR,`INSERT INTO public.research_workbook_reviews(version_id,decision) VALUES('${research}','approved_internal')`);
      assert.deepEqual(picker(),[{id:research,title:"عنوان پژوهش تأییدشده",version:1}]);
      for(const user of [A,B,ADMIN]) assert.match(denied(db,user,`SELECT * FROM public.consultation_approved_research_versions('${relation}')`),/forbidden/);
      assert.match(denied(db,null,`SELECT * FROM public.consultation_approved_research_versions('${relation}')`),/permission denied/);
      const command={action:"session",relationshipId:relation,sessionKey:"cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",baseVersion:0,occursAt:"2026-10-01T12:00:00+03:30",topic:"پژوهش",goal:"هدف",summary:"خلاصه",privateNote:"private synthetic",researchVersionId:research};
      assert.equal((await post(db,ADVISOR,command)).status,201);
      as(db,ADVISOR,`INSERT INTO public.research_workbook_reviews(version_id,decision,note) VALUES('${research}','returned','بازگردانی مصنوعی')`);
      assert.deepEqual(picker(),[]);
      assert.equal((await post(db,ADVISOR,{...command,baseVersion:1})).status,422);
      const next=as(db,ADVISOR,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES('${wb}',2,'نسخهٔ دوم تأییدشده','${evidence}') RETURNING id`);
      as(db,ADVISOR,`INSERT INTO public.research_workbook_reviews(version_id,decision) VALUES('${next}','approved_internal')`);
      assert.deepEqual(picker(),[{id:next,title:"نسخهٔ دوم تأییدشده",version:2}]);
      assert.equal((await post(db,ADVISOR,{...command,baseVersion:1,researchVersionId:next})).status,201);
      as(db,ADVISOR,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES('${wb}',3,'نسخهٔ سوم پیش‌نویس','${evidence}')`);
      assert.deepEqual(picker(),[]);
      assert.equal((await post(db,ADVISOR,{...command,baseVersion:2,researchVersionId:next})).status,422);
      assert.equal(as(db,A,"SELECT count(*) FROM public.research_workbook_versions"),"0");
    });
    test("revocation blocks advisor on the next request; client keeps their own published history",async()=>{
      as(db,A,`SELECT public.revoke_consultation('${relation}')`);
      assert.equal(as(db,ADVISOR,"SELECT count(*) FROM public.consultation_sessions"),"0");
      assert.equal(as(db,ADVISOR,"SELECT count(*) FROM public.consultation_private_notes"),"0");
      assert.equal(as(db,ADVISOR,"SELECT count(*) FROM public.consultation_actions"),"0");
      assert.match(denied(db,ADVISOR,`SELECT public.save_consultation_session('${relation}',gen_random_uuid(),0,'${body("رد")}')`),/forbidden/);
      assert.match(denied(db,ADVISOR,`SELECT * FROM public.consultation_holding_versions('${relation}')`),/forbidden/);
      assert.match(denied(db,ADVISOR,`SELECT * FROM public.consultation_approved_research_versions('${relation}')`),/forbidden/);
      assert.equal((await post(db,ADVISOR,{action:"task",relationshipId:relation,actionKey:TASK,baseVersion:3,status:"done"})).status,403);
      assert.equal(as(db,A,"SELECT count(*) FROM public.consultation_sessions"),"1");
    });
  });
}
