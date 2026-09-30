import {before,after,test,describe} from "node:test";
import assert from "node:assert/strict";
import {join} from "node:path";
import {execFileSync,psqlAsync} from "../ops/test-postgres";
const ENV={...process.env,PGHOST:"127.0.0.1",PGPORT:process.env.PGPORT ?? "5433",PGUSER:"postgres",PGPASSWORD:"postgres"};
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222",ADVISOR="33333333-3333-4333-8333-333333333333",ADMIN="44444444-4444-4444-8444-444444444444";
const KEY="55555555-5555-4555-8555-555555555555",TASK="66666666-6666-4666-8666-666666666666",DRAFT="77777777-7777-4777-8777-777777777777";
function sql(db:string,text:string){return execFileSync("psql",["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-c",text],{env:ENV,encoding:"utf8"}).trim();}
function file(db:string,path:string){execFileSync("psql",["-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f",join(process.cwd(),path)],{env:ENV,encoding:"utf8"});}
const wrap=(id:string|null,text:string)=>`BEGIN; SELECT set_config('request.jwt.claims','${JSON.stringify(id?{sub:id,role:"authenticated"}:{role:"anon"})}',true); SET LOCAL ROLE ${id?"authenticated":"anon"}; ${text}; COMMIT;`;
const last=(text:string)=>text.split("\n").filter(Boolean).at(-1)!;
function as(db:string,id:string|null,text:string){return last(sql(db,wrap(id,text)));}
function denied(db:string,id:string|null,text:string){try{sql(db,wrap(id,text));return "";}catch(e){return String((e as {stderr?:unknown}).stderr ?? e);}}
for(const profile of ["legacy","explicit"]){
  describe(`DEV-03/04/05/07 synthetic DB acceptance — ${profile}`,()=>{
    const db=`v1_delivery_${profile}`;let relation:string,holding:string,v1:string,v2:string;
    before(()=>{
      sql("postgres",`DROP DATABASE IF EXISTS ${db}`);sql("postgres",`CREATE DATABASE ${db}`);
      file(db,"sql/test/supabase_bootstrap.sql");file(db,`sql/test/profile_${profile==="legacy"?"legacy_default_privileges":"explicit_grants"}.sql`);
      file(db,"sql/test/portfolio_precondition.sql");
      // Intentionally no phase20/22: reference portfolio support is optional.
      file(db,"sql/phase32_member_holdings.sql");file(db,"sql/phase34_research_workbook_versions.sql");file(db,"sql/phase35_consultation.sql");
      sql(db,`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${ADVISOR}'),('${ADMIN}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADVISOR}','admin'),('${ADMIN}','admin'); INSERT INTO public.consultation_advisors(user_id,display_name) VALUES('${ADVISOR}','آرش · نمونهٔ آزمایشی');`);
    });
    after(()=>{sql("postgres",`DROP DATABASE IF EXISTS ${db}`);});
    test("migration order works without research engine tables and reruns preserve RLS",()=>{
      assert.equal(sql(db,"SELECT to_regclass('public.intel_reference_versions') IS NULL"),"t");
      file(db,"sql/phase32_member_holdings.sql");file(db,"sql/phase34_research_workbook_versions.sql");file(db,"sql/phase35_consultation.sql");
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
    test("revocation blocks advisor on the next request; client keeps their own published history",()=>{
      as(db,A,`SELECT public.revoke_consultation('${relation}')`);
      assert.equal(as(db,ADVISOR,"SELECT count(*) FROM public.consultation_sessions"),"0");
      assert.equal(as(db,ADVISOR,"SELECT count(*) FROM public.consultation_private_notes"),"0");
      assert.equal(as(db,ADVISOR,"SELECT count(*) FROM public.consultation_actions"),"0");
      assert.match(denied(db,ADVISOR,`SELECT public.save_consultation_session('${relation}',gen_random_uuid(),0,'${body("رد")}')`),/forbidden/);
      assert.match(denied(db,ADVISOR,`SELECT * FROM public.consultation_holding_versions('${relation}')`),/forbidden/);
      assert.equal(as(db,A,"SELECT count(*) FROM public.consultation_sessions"),"1");
    });
  });
}
