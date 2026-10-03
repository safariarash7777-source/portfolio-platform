import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { execFileSync, psqlAsync } from "../ops/test-postgres";
import { buildBalanceSheet, positionFromStored, debtFromStored } from "./balanceSheet";
import { postFinancialSnapshot } from "./financialHttp";
import { normalisePosition, normaliseDebt } from "./financialInput";
import { postInvestmentScope } from "./scopeHttp";
import { scopeReviewFromStored } from "./scopeContract";
import { selectInvestmentScope } from "./investmentScope";
const ENV = { ...process.env, PGHOST: "127.0.0.1", PGPORT: process.env.PGPORT ?? "5433", PGUSER: "postgres", PGPASSWORD: "postgres" };
const A="11111111-1111-4111-8111-111111111111", B="22222222-2222-4222-8222-222222222222", ADVISOR="33333333-3333-4333-8333-333333333333", ADMIN="44444444-4444-4444-8444-444444444444";
const LEGACY="55555555-5555-4555-8555-555555555555";
const quote = (x: unknown): string => x === null ? "NULL" : typeof x === "number" ? String(x) : "'" + (typeof x === "object" ? JSON.stringify(x) : String(x)).replaceAll("'", "''") + "'";
const wrap = (id: string | null, query: string) => `BEGIN; SELECT set_config('request.jwt.claims','${JSON.stringify(id ? { sub:id, role:"authenticated" } : { role:"anon" })}',true); SET LOCAL ROLE ${id ? "authenticated" : "anon"}; ${query}; COMMIT;`;
function sql(db: string, query: string) { return execFileSync("psql", ["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",query], { env:ENV, encoding:"utf8", stdio:["ignore","pipe","pipe"] }).trim(); }
const last = (output: string) => output.split("\n").filter(Boolean).at(-1)!;
const as = (db: string, id: string | null, query: string) => last(sql(db,wrap(id,query)));
function denied(db: string, id: string | null, query: string) { try { sql(db,wrap(id,query)); return ""; } catch (e) { return String((e as { stderr?:unknown }).stderr ?? e); } }
const assets = (amount=2000) => [{ position_key:"valued", manual_label:"طلای نمونهٔ ساختگی", asset_class:"gold", unit:"قلم", qty:null, as_of:"2026-09-30", ownership_pct:50, valuation_mode:"declared", declared_value:amount, currency:"IRT", valuation_source:"اظهار آزمایشی", valuation_as_of:"2026-09-30", valuation_status:"valid" }, { position_key:"unpriced", manual_label:"دارایی بی‌قیمت نمونه", asset_class:"gold", unit:"گرم", qty:10, as_of:"2026-09-30", valuation_mode:"unpriced" }];
const debts = (balance=1500, currency="IRT") => [{ debt_key:"loan", title:"وام ساختگی", kind:"loan", balance, currency, balance_as_of:"2026-09-30", next_installment:currency==="IRR"?1000:100, next_due_on:"2026-10-01", note:"نمونهٔ آزمایشی" }];
async function post(db: string, id: string | null, kind: "holdings" | "debts", body: unknown) {
  return postFinancialSnapshot(new Request(`http://localhost/api/portfolio/${kind}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }), kind, async () => ({
    async authenticate() { return { user:id?{id}:null, error:false }; },
    async rpc(name,args) {
      assert.ok(["record_member_holdings","record_member_debts"].includes(name));
      try { const data=JSON.parse(as(db,id,`SELECT to_jsonb(r) FROM public.${name}(${Object.entries(args).map(([key,value])=>`${key} => ${quote(value)}`).join(",")}) r`));return {data,error:null}; }
      catch(e) {const err=String((e as {stderr?:unknown}).stderr??e);return {data:null,error:{code:err.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??"P0001"}};}
    },
  }));
}

for(const profile of ["legacy","explicit"])describe(`RECOVERY legacy holdings privacy / Postgres / ${profile}`,()=>{
 const db=`recovery_legacy_privacy_${profile}`;let legacyRow:string,targetRow:string;
 const applyPrivacy=()=>execFileSync("psql",["-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f",join(process.cwd(),"supabase/migrations/20261003100542_recovery_legacy_holdings_owner_only.sql")],{env:ENV,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 before(()=>{
  sql("postgres",`DROP DATABASE IF EXISTS ${db}`);sql("postgres",`CREATE DATABASE ${db}`);
  for(const file of ["sql/test/supabase_bootstrap.sql",`sql/test/profile_${profile==="legacy"?"legacy_default_privileges":"explicit_grants"}.sql`,"sql/test/portfolio_precondition.sql"]){execFileSync("psql",["-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f",join(process.cwd(),file)],{env:ENV,encoding:"utf8",stdio:["ignore","pipe","pipe"]});}
  sql(db,`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${ADMIN}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADMIN}','admin'); INSERT INTO public.holdings(user_id,symbol,name,qty,current_price) VALUES('${A}','LEGACY','ساختگی',12.5,100); INSERT INTO public.portfolio_versions(user_id,version,allocations,notes) VALUES('${A}',7,'[{"asset":"طلا","pct":100}]','ساختگی')`);
  legacyRow=as(db,A,"SELECT to_jsonb(h) FROM public.holdings h");targetRow=as(db,A,"SELECT to_jsonb(p) FROM public.portfolio_versions p");
  assert.equal(as(db,ADMIN,"SELECT count(*) FROM public.holdings"),"1","precondition reproduces actual admin exposure");
  applyPrivacy();applyPrivacy();
 });
 after(()=>{sql("postgres",`DROP DATABASE IF EXISTS ${db}`);});
 test("existing owner row and admin-assigned target are unchanged; no new tables required",()=>{
  assert.equal(as(db,A,"SELECT to_jsonb(h) FROM public.holdings h"),legacyRow);
  assert.equal(as(db,A,"SELECT to_jsonb(p) FROM public.portfolio_versions p"),targetRow);
  assert.equal(as(db,ADMIN,"SELECT to_jsonb(p) FROM public.portfolio_versions p"),targetRow);
  assert.equal(sql(db,"SELECT to_regclass('public.member_holding_versions') IS NULL AND to_regclass('public.consultation_relationships') IS NULL"),"t");
 });
 test("B/admin/anon cannot read or change A, including permissive ALL and TRUNCATE",()=>{
  for(const actor of [B,ADMIN,null]){
   assert.equal(as(db,actor,"SELECT count(*) FROM public.holdings"),"0");
   assert.equal(as(db,actor,`WITH changed AS (UPDATE public.holdings SET qty=999 WHERE user_id='${A}' RETURNING id) SELECT count(*) FROM changed`),"0");
   assert.equal(as(db,actor,`WITH changed AS (DELETE FROM public.holdings WHERE user_id='${A}' RETURNING id) SELECT count(*) FROM changed`),"0");
   assert.match(denied(db,actor,`INSERT INTO public.holdings(user_id,symbol,name) VALUES('${A}','FOREIGN','ساختگی')`),/42501/);
   assert.match(denied(db,actor,"TRUNCATE public.holdings"),/42501/);
  }
  assert.match(denied(db,A,"TRUNCATE public.holdings"),/42501/);
  assert.equal(as(db,A,"SELECT to_jsonb(h) FROM public.holdings h"),legacyRow);
 });
 test("owner retains own row insert/update/delete; cannot reassign ownership",()=>{
  as(db,A,`INSERT INTO public.holdings(user_id,symbol,name,qty) VALUES('${A}','NEW','ساختگی',1)`);
  assert.equal(as(db,A,"WITH changed AS (UPDATE public.holdings SET qty=2 WHERE symbol='NEW' RETURNING id) SELECT count(*) FROM changed"),"1");
  assert.match(denied(db,A,`UPDATE public.holdings SET user_id='${B}' WHERE symbol='NEW'`),/42501/);
  assert.equal(as(db,A,"WITH changed AS (DELETE FROM public.holdings WHERE symbol='NEW' RETURNING id) SELECT count(*) FROM changed"),"1");
  assert.equal(as(db,A,"SELECT to_jsonb(h) FROM public.holdings h"),legacyRow);
 });
});
for (const profile of ["legacy", "explicit"]) describe(`personal balance sheet / real Postgres / ${profile}`, () => {
  const db=`balance_sheet_${profile}`;let h1:string,h2:string,h3:string,relation:string;
  before(() => {
    sql("postgres",`DROP DATABASE IF EXISTS ${db}`);sql("postgres",`CREATE DATABASE ${db}`);
    for (const file of ["sql/test/supabase_bootstrap.sql",`sql/test/profile_${profile==="legacy"?"legacy_default_privileges":"explicit_grants"}.sql`,"sql/test/portfolio_precondition.sql","sql/phase32_member_holdings.sql","sql/phase34_research_workbook_versions.sql","sql/phase35_consultation.sql","sql/phase36_consultation_review_fixes.sql","sql/phase37_nonretryable_version_conflicts.sql","sql/phase38_personal_balance_sheet.sql","sql/phase38_personal_balance_sheet.sql"]) {
      if(file==="sql/phase36_consultation_review_fixes.sql") {
        sql(db,`INSERT INTO auth.users(id) VALUES('${LEGACY}'); INSERT INTO public.profiles(id,role) VALUES('${LEGACY}','user')`);
        as(db,LEGACY,`SELECT version FROM public.record_member_holdings('[{"position_key":"old","symbol":"فملی","asset_class":"equity_ir","qty":10,"unit":"سهم","as_of":"2026-09-30"}]',NULL,'legacy-request',0)`);
      }
      execFileSync("psql",["-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f",join(process.cwd(),file)],{env:ENV,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
    }
    sql(db,`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${ADVISOR}'),('${ADMIN}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADVISOR}','admin'),('${ADMIN}','admin'); INSERT INTO public.consultation_advisors(user_id,display_name) VALUES('${ADVISOR}','مشاور ساختگی')`);
  });
  after(() => {sql("postgres",`DROP DATABASE IF EXISTS ${db}`);});
  test("pre-migration snapshots stay readable and their exact network retries remain idempotent", async () => {
    const pos={position_key:"old",symbol:"فملی",asset_class:"equity_ir",qty:10,unit:"سهم",as_of:"2026-09-30"};
    const response=await post(db,LEGACY,"holdings",{positions:[pos],base_version:0,client_token:"legacy-request"});assert.equal(response.status,200);assert.equal((await response.json()).version,1);
    assert.equal((await post(db,LEGACY,"holdings",{positions:[{...pos,ownership_pct:50}],base_version:1,client_token:"legacy-request"})).status,409);
  });
  test("HTTP saves partial ownership and an unpriced asset in existing versions", async () => {
    const response=await post(db,A,"holdings",{positions:assets(),base_version:0,client_token:"asset1"});assert.equal(response.status,201);assert.equal(response.headers.get("cache-control"),"private, no-store");const body=await response.json();h1=body.version_id;
    assert.equal(as(db,A,`SELECT count(*) FROM public.member_holding_positions WHERE version_id='${h1}'`),"2");assert.equal(as(db,A,`SELECT ownership_pct FROM public.member_holding_positions WHERE position_key='valued'`),"50");
  });
  test("debt creates version 2, carries all assets and negative partial net worth", async () => {
    const response=await post(db,A,"debts",{debts:debts(15000,"IRR"),base_version:1,client_token:"debt2"});assert.equal(response.status,201);h2=(await response.json()).version_id;
    const rows=JSON.parse(as(db,A,`SELECT jsonb_build_object('positions',(SELECT jsonb_agg(to_jsonb(p)) FROM public.member_holding_positions p WHERE version_id='${h2}'),'debts',(SELECT jsonb_agg(to_jsonb(d)) FROM public.member_debt_positions d WHERE version_id='${h2}'))`));
    const r=buildBalanceSheet({positions:rows.positions.map(positionFromStored),debts:rows.debts.map(debtFromStored),priceRows:[],now:new Date("2026-09-30T10:00:00Z"),recorded:true,assetsReady:true,debtsReady:true});
    assert.equal(r.assetValue,1000);assert.equal(r.debtValue,1500);assert.equal(r.netWorth,-500);assert.equal(r.partial,true);assert.equal(r.valuation.positions.find(p=>p.position.positionKey==="unpriced")?.value,null);
  });
  test("editing debt changes result and preserves both previous snapshots", async () => {
    const response=await post(db,A,"debts",{debts:debts(800),base_version:2,client_token:"debt3"});assert.equal(response.status,201);h3=(await response.json()).version_id;
    assert.equal(as(db,A,`SELECT balance_toman FROM public.member_debt_positions WHERE version_id='${h2}'`),"1500");assert.equal(as(db,A,`SELECT balance_toman FROM public.member_debt_positions WHERE version_id='${h3}'`),"800");assert.equal(as(db,A,`SELECT count(*) FROM public.member_holding_positions WHERE version_id='${h1}'`),"2");
    const saved=JSON.parse(as(db,A,`SELECT jsonb_build_object('positions',(SELECT jsonb_agg(to_jsonb(p)) FROM public.member_holding_positions p WHERE version_id='${h3}'),'debts',(SELECT jsonb_agg(to_jsonb(d)) FROM public.member_debt_positions d WHERE version_id='${h3}'))`));
    assert.equal(buildBalanceSheet({positions:saved.positions.map(positionFromStored),debts:saved.debts.map(debtFromStored),priceRows:[],now:new Date("2026-09-30T10:00:00Z"),recorded:true,assetsReady:true,debtsReady:true}).netWorth,200);
    const response2=await post(db,A,"holdings",{positions:assets(4000),base_version:3,client_token:"asset4"});assert.equal(response2.status,201);const h4=(await response2.json()).version_id;
    assert.equal(as(db,A,`SELECT balance_toman FROM public.member_debt_positions WHERE version_id='${h4}'`),"800");assert.equal(as(db,A,`SELECT declared_value FROM public.member_holding_positions WHERE version_id='${h3}' AND position_key='valued'`),"2000");
  });
  test("replay is stable; mismatched tokens and stale cross-form edits return 409", async () => {
    assert.equal((await post(db,A,"debts",{debts:debts(800),base_version:2,client_token:"debt3"})).status,200);
    assert.equal((await post(db,A,"debts",{debts:debts(900),base_version:4,client_token:"debt3"})).status,409);
    assert.equal((await post(db,A,"holdings",{positions:assets(),base_version:2,client_token:"stale"})).status,409);
    assert.match(denied(db,A,`SELECT * FROM public.record_member_debts(${quote(debts().map(normaliseDebt))},2,'stale-direct')`),/PT409:/);
    assert.match(denied(db,A,`SELECT * FROM public.record_member_debts(${quote(debts(900).map(normaliseDebt))},4,'debt3')`),/PT409:/);
    assert.equal(as(db,A,"SELECT count(*) FROM public.member_holding_versions"),"4");
  });
  test("B, unrelated admin and anon cannot read or forge A's debts or assets", async () => {
    for(const id of [B,ADMIN,ADVISOR]) {assert.equal(as(db,id,"SELECT count(*) FROM public.member_debt_positions"),"0");assert.equal(as(db,id,"SELECT count(*) FROM public.member_holding_positions"),"0");assert.match(denied(db,id,`INSERT INTO public.member_debt_positions(version_id,debt_key,title,kind,balance_toman,currency,balance_as_of) VALUES('${h2}','forged','x','loan',1,'IRT','2026-09-30')`),/permission denied/);}
    assert.equal((await post(db,null,"debts",{debts:debts(),base_version:0,client_token:"anon"})).status,401);
    assert.match(denied(db,null,"SELECT public.consultation_balance_sheet(gen_random_uuid())"),/permission denied/);
    assert.match(denied(db,B,"SELECT * FROM portfolio_private.record_snapshot('debts','[]',NULL,NULL,0)"),/permission denied/);
  });
  test("existing explicit consent permits read-only advisor RPC, revocation applies next request", () => {
    relation=as(db,A,`SELECT public.grant_consultation('${ADVISOR}','پروندهٔ مصنوعی A')`);
    const file=JSON.parse(as(db,ADVISOR,`SELECT public.consultation_balance_sheet('${relation}')`));assert.equal(file.version.version,4);assert.equal(file.positions.length,2);assert.equal(file.debts[0].balance_toman,800);
    const historical=JSON.parse(as(db,ADVISOR,`SELECT public.consultation_balance_sheet('${relation}','${h2}')`));assert.equal(historical.version.version,2);assert.equal(historical.debts[0].balance_toman,1500);
    const foreignVersion=as(db,LEGACY,"SELECT id FROM public.member_holding_versions LIMIT 1");assert.match(denied(db,ADVISOR,`SELECT public.consultation_balance_sheet('${relation}','${foreignVersion}')`),/42501/);
    for(const id of [B,ADMIN]) assert.match(denied(db,id,`SELECT public.consultation_balance_sheet('${relation}')`),/42501/);
    as(db,A,`SELECT public.revoke_consultation('${relation}')`);
    assert.match(denied(db,ADVISOR,`SELECT public.consultation_balance_sheet('${relation}')`),/42501/);
    assert.match(denied(db,ADVISOR,`SELECT public.consultation_balance_sheet('${relation}','${h2}')`),/42501/);
    assert.equal(as(db,A,"SELECT count(*) FROM public.member_debt_positions"),"3");
    const renewed=as(db,A,`SELECT public.grant_consultation('${ADVISOR}','پروندهٔ دوبارهٔ ساختگی')`);
    sql(db,`UPDATE public.consultation_advisors SET enabled=false WHERE user_id='${ADVISOR}'`);
    assert.match(denied(db,ADVISOR,`SELECT public.consultation_balance_sheet('${renewed}')`),/42501/);
  });
  test("direct RPC rejects guarantee, invalid ownership and nonfinite values atomically", () => {
    const invalids=[{...normaliseDebt(debts()[0]),kind:"guarantee"},{...normaliseDebt(debts()[0]),balance_toman:"NaN"}];
    for(const d of invalids) assert.notEqual(denied(db,A,`SELECT * FROM public.record_member_debts(${quote([d])},4,'invalid')`),"");
    for(const bad of [{ownership_pct:101},{qty:"NaN",valuation_mode:"market",declared_value:null,valuation_source:null,valuation_as_of:null}]) {
      const p={...normalisePosition(assets()[0]),...bad};assert.notEqual(denied(db,A,`SELECT * FROM public.record_member_holdings(${quote([p])},NULL,'invalid',4)`),"");
    }
    assert.equal(as(db,A,"SELECT count(*) FROM public.member_holding_versions"),"4");
    assert.match(denied(db,A,`UPDATE public.member_debt_positions SET balance_toman=1 WHERE version_id='${h2}'`),/permission denied/);
    assert.match(denied(db,A,`DELETE FROM public.member_holding_positions WHERE version_id='${h1}'`),/permission denied/);
    assert.throws(()=>sql(db,`UPDATE public.member_debt_positions SET balance_toman=1 WHERE version_id='${h2}'`),/append|immutable|mutation|Command failed/);
    assert.equal(sql(db,"SELECT has_table_privilege('service_role','public.member_debt_positions','TRUNCATE')"),"f");
  });
  test("concurrent asset and debt saves on one base yield exactly one winner", async () => {
    const one=wrap(A,`SELECT version FROM public.record_member_holdings(${quote(assets().map(normalisePosition))},NULL,'race-assets',4)`);
    const two=wrap(A,`SELECT version FROM public.record_member_debts(${quote(debts().map(normaliseDebt))},4,'race-debts')`);
    const result=await Promise.allSettled([one,two].map(q=>psqlAsync(["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-c",q],ENV)));
    assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal(result.filter(r=>r.status==="rejected").length,1);assert.equal(as(db,A,"SELECT max(version) FROM public.member_holding_versions"),"5");
  });
});

// RECOVERY-01: actual disposable Postgres, same suite/CI invocation.
{
const ENV={...process.env,PGHOST:process.env.PGHOST??"127.0.0.1",PGPORT:process.env.PGPORT??"5433",PGUSER:process.env.PGUSER??"postgres",PGPASSWORD:process.env.PGPASSWORD??"postgres"};
const A="11111111-1111-4111-8111-111111111111", B="22222222-2222-4222-8222-222222222222", ADMIN="33333333-3333-4333-8333-333333333333";
const quote=(x:unknown):string=>x===null?"NULL":typeof x==="number"?String(x):"'"+(typeof x==="object"?JSON.stringify(x):String(x)).replaceAll("'","''")+"'";
const wrap=(id:string|null,q:string)=>`BEGIN; SELECT set_config('request.jwt.claims','${JSON.stringify(id?{sub:id,role:"authenticated"}:{role:"anon"})}',true); SET LOCAL ROLE ${id?"authenticated":"anon"}; ${q}; COMMIT;`;
function sql(db:string,q:string){return execFileSync("psql",["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",q],{env:ENV,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();}
const last=(s:string)=>s.split("\n").filter(Boolean).at(-1)!;
const as=(db:string,id:string|null,q:string)=>last(sql(db,wrap(id,q)));
function denied(db:string,id:string|null,q:string){try{sql(db,wrap(id,q));return "";}catch(e){return String((e as {stderr?:unknown}).stderr??e);}}
const choices=[{positionKey:"gold",use:"allocatable"},{positionKey:"unpriced",use:"excluded"}];
const assets=[{position_key:"gold",manual_label:"طلای ساختگی",asset_class:"gold",unit:"کل قلم",qty:null,as_of:"2026-10-03",ownership_pct:50,valuation_mode:"declared",declared_value:2000,valuation_source:"اظهار ساختگی",valuation_as_of:"2026-10-03",valuation_status:"valid"},{position_key:"unpriced",manual_label:"قلم بی‌قیمت ساختگی",asset_class:"gold",unit:"گرم",qty:12.5,as_of:"2026-10-03",ownership_pct:100,valuation_mode:"unpriced",valuation_status:"missing"}];
const debt=[{debt_key:"debt",title:"بدهی ساختگی",kind:"loan",balance_toman:1500,currency:"IRR",balance_as_of:"2026-10-03",next_installment_toman:null,next_due_on:null,note:null}];
for(const profile of ["legacy","explicit"])describe(`RECOVERY scope/minimum core / Postgres / ${profile}`,()=>{
 const db=`recovery_scope_${profile}`;let first:string,second:string,review:Record<string,unknown>,legacyTarget:string,legacyHolding:string;
 const scopeSql=(version:string,base:number,token:string,assignments:unknown=choices,rules="member-selected.v0.1")=>`SELECT public.record_member_investment_scope(${quote(version)}::uuid,${quote(rules)},${quote(assignments)}::jsonb,${base},${quote(token)})`;
 before(()=>{
  sql("postgres",`DROP DATABASE IF EXISTS ${db}`);sql("postgres",`CREATE DATABASE ${db}`);
  for(const file of ["sql/test/supabase_bootstrap.sql",`sql/test/profile_${profile==="legacy"?"legacy_default_privileges":"explicit_grants"}.sql`,"sql/test/portfolio_precondition.sql","sql/phase32_member_holdings.sql","supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql","supabase/migrations/20261003094327_member_investment_scope_reviews.sql"]){
   execFileSync("psql",["-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f",join(process.cwd(),file)],{env:ENV,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
   if(file==="sql/test/portfolio_precondition.sql"){
    sql(db,`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${ADMIN}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADMIN}','admin'); INSERT INTO public.portfolio_versions(user_id,version,allocations,notes) VALUES('${A}',7,'[{"asset":"طلا","pct":50},{"asset":"نقد","pct":50}]','سابقهٔ ساختگی'); INSERT INTO public.holdings(user_id,symbol,name,qty,current_price) VALUES('${A}','نمونه','سابقهٔ ساختگی',10,100)`);
    legacyTarget=as(db,A,"SELECT jsonb_build_object('id',id,'version',version,'allocations',allocations,'notes',notes,'created_at',created_at) FROM public.portfolio_versions");
    legacyHolding=as(db,A,"SELECT to_jsonb(h) FROM public.holdings h");
   }
  }
  first=JSON.parse(as(db,A,`SELECT to_jsonb(r) FROM public.record_member_holdings(${quote(assets)}::jsonb,NULL,'first-assets',0) r`)).version_id;
 });
 after(()=>{sql("postgres",`DROP DATABASE IF EXISTS ${db}`);});
 test("minimum closure needs no research or consultation schema; old target ledger unchanged",()=>{
  assert.equal(sql(db,"SELECT to_regclass('public.research_workbook_versions') IS NULL AND to_regclass('public.consultation_relationships') IS NULL AND to_regprocedure('public.consultation_balance_sheet(uuid,uuid)') IS NULL"),"t");
  assert.equal(sql(db,"SELECT to_regclass('public.portfolio_versions') IS NOT NULL"),"t");
  assert.equal(as(db,A,"SELECT jsonb_build_object('id',id,'version',version,'allocations',allocations,'notes',notes,'created_at',created_at) FROM public.portfolio_versions"),legacyTarget);
  assert.equal(as(db,A,"SELECT to_jsonb(h) FROM public.holdings h"),legacyHolding);
  assert.equal(sql(db,"SELECT has_function_privilege('anon','public.record_member_investment_scope(uuid,text,jsonb,integer,text)','EXECUTE')"),"f");
  assert.equal(sql(db,"SELECT has_function_privilege('authenticated','portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)','EXECUTE')"),"t");
 });
 test("API saves durable owner confirmation using server time; second connection sees same UUID/time",async()=>{
  const response=await postInvestmentScope(new Request("http://localhost/scope",{method:"POST",body:JSON.stringify({holding_version_id:first,rules_version:"member-selected.v0.1",base_scope_version:0,client_token:"scope-first",assignments:choices})}),async()=>({async authenticate(){return {user:{id:A},error:false};},async rpc(name,args){assert.equal(name,"record_member_investment_scope");const data=JSON.parse(as(db,A,`SELECT public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${quote(v)}`).join(",")})`));return {data,error:null};}}));
  assert.equal(response.status,201);review=await response.json();assert.equal(review.holdingVersionId,first);assert.equal(review.holdingVersion,1);
  const persisted=JSON.parse(as(db,A,`SELECT to_jsonb(r) FROM public.member_investment_scope_reviews r WHERE id=${quote(review.id)}::uuid`));
  assert.equal(persisted.id,review.id);assert.equal(Date.parse(persisted.member_confirmed_at),Date.parse(String(review.memberConfirmedAt)));
  assert.equal(selectInvestmentScope({id:first,version:1,positions:assets.map(positionFromStored)},scopeReviewFromStored(persisted,{id:first,version:1}),new Date()).status,"ready");
 });
 test("exact retry keeps revision and confirmation timestamp, including reordered payload; changed token content conflicts",()=>{
  const retry=JSON.parse(as(db,A,scopeSql(first,0,"scope-first",[...choices].reverse())));assert.equal(retry.reused,true);assert.equal(retry.id,review.id);assert.equal(retry.memberConfirmedAt,review.memberConfirmedAt);
  assert.match(denied(db,A,scopeSql(first,1,"scope-first",choices.map(a=>({...a,use:"excluded"})))),/PT409/);
  assert.match(denied(db,A,scopeSql(first,0,"stale-tab")),/PT409/);
 });
 test("unknown/incomplete/foreign/duplicate choices and guessed rules cannot become a durable review",()=>{
  for(const payload of [[],[choices[0]],[...choices,{positionKey:"foreign",use:"allocatable"}],[...choices,choices[0]],[{...choices[0],use:"unknown"},choices[1]],[{...choices[0],memberConfirmedAt:"forged"},choices[1]]])assert.match(denied(db,A,scopeSql(first,1,"invalid",payload)),/22023/);
  assert.match(denied(db,A,scopeSql(first,1,"rules",choices,"guessed")),/22023/);
 });
 test("B and admin have no private asset/debt/scope access; anonymous and direct mutations forbidden",()=>{
  for(const user of [B,ADMIN]){
   for(const table of ["member_holding_versions","member_holding_positions","member_debt_positions","member_investment_scope_reviews"])assert.equal(as(db,user,`SELECT count(*) FROM public.${table}`),"0");
   assert.match(denied(db,user,scopeSql(first,1,"foreign")),/42501/);
  }
  assert.match(denied(db,null,scopeSql(first,1,"anon")),/42501/);
  for(const action of ["UPDATE public.member_investment_scope_reviews SET rules_version='guessed'","DELETE FROM public.member_investment_scope_reviews","TRUNCATE public.member_investment_scope_reviews"])assert.match(denied(db,A,action),/42501/);
  assert.equal(sql(db,"SELECT has_table_privilege('authenticated','public.member_investment_scope_reviews','INSERT')"),"f");
  assert.throws(()=>sql(db,"UPDATE public.member_investment_scope_reviews SET member_confirmed_at=now()"));
 });
 test("two simultaneous scope corrections serialize: one revision succeeds, stale base conflicts",async()=>{
  const q1=wrap(A,scopeSql(first,1,"tab-a",choices.map(a=>({...a,use:"excluded"})))),q2=wrap(A,scopeSql(first,1,"tab-b",choices));
  const results=await Promise.allSettled([psqlAsync(["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",q1],ENV),psqlAsync(["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",q2],ENV)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
  for(const r of results)if(r.status==="rejected")assert.match(String(r.reason),/PT409/);
  assert.equal(as(db,A,"SELECT count(*) FROM public.member_investment_scope_reviews"),"2");
 });
 test("debt edit creates next canonical financial UUID, keeps assets and history but requires fresh scope",()=>{
  second=JSON.parse(as(db,A,`SELECT to_jsonb(r) FROM public.record_member_debts(${quote(debt)}::jsonb,1,'debt-next') r`)).version_id;
  assert.notEqual(second,first);assert.equal(as(db,A,`SELECT count(*) FROM public.member_investment_scope_reviews WHERE holding_version_id='${second}'`),"0");
  assert.equal(as(db,A,"SELECT count(*) FROM public.member_holding_versions"),"2");
  assert.equal(as(db,A,`SELECT count(*) FROM public.member_holding_positions WHERE version_id='${first}'`),"2");
  const positions=JSON.parse(as(db,A,`SELECT jsonb_agg(to_jsonb(p)) FROM public.member_holding_positions p WHERE version_id='${second}'`)).map(positionFromStored);
  const debts=JSON.parse(as(db,A,`SELECT jsonb_agg(to_jsonb(d)) FROM public.member_debt_positions d WHERE version_id='${second}'`)).map(debtFromStored);
  const sheet=buildBalanceSheet({positions,debts,priceRows:[],now:new Date(),recorded:true,assetsReady:true,debtsReady:true});assert.equal(sheet.assetValue,1000);assert.equal(sheet.debtValue,1500);assert.equal(sheet.netWorth,-500);assert.equal(sheet.partial,true);
  assert.match(denied(db,A,scopeSql(first,2,"historical-edit")),/PT409/);
  assert.equal(JSON.parse(as(db,A,scopeSql(first,0,"scope-first"))).id,review.id);
  const current=JSON.parse(as(db,A,scopeSql(second,0,"fresh-scope")));assert.equal(current.holdingVersion,2);assert.equal(current.scopeVersion,1);
 });
 test("scope and financial edit share the canonical per-owner lock",async()=>{
  // The real concurrent transaction test also protects against a second scope lock namespace.
  const holdingWriter=`SELECT to_jsonb(r) FROM public.record_member_holdings(${quote(assets)}::jsonb,NULL,'third-assets',2) r`;
  const waitingScope=scopeSql(second,1,"racing-scope",choices.map(a=>({...a,use:"excluded"})));
  const lock=wrap(A,`SELECT pg_advisory_xact_lock(hashtext('member_holdings'),hashtext('${A}')); SELECT pg_sleep(0.25); ${holdingWriter}`);
  const firstWrite=psqlAsync(["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-c",lock],ENV);
  // Start after the lock is held; the SQL assertion below additionally checks installed lock identity.
  assert.match(sql(db,"SELECT pg_get_functiondef('portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)'::regprocedure)"),/hashtext\('member_holdings'\)/);
  const outcomes=await Promise.allSettled([firstWrite,psqlAsync(["-d",db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",wrap(A,waitingScope)],ENV)]);
  assert.equal(outcomes[0].status,"fulfilled");
  // Either serial order is safe: if scope won it is attached only to the old UUID;
  // otherwise its stale financial UUID is rejected. It never migrates to version3.
  if(outcomes[1].status==="rejected")assert.match(String(outcomes[1].reason),/PT409/);
  assert.equal(as(db,A,"SELECT count(*) FROM public.member_investment_scope_reviews r JOIN public.member_holding_versions h ON h.id=r.holding_version_id WHERE h.version=3"),"0");
 });
 test("rollback freezes new RPC writes while preserving new and legacy UUID histories",()=>{
  const scopeCount=as(db,A,"SELECT count(*) FROM public.member_investment_scope_reviews");
  execFileSync("psql",["-d",db,"-X","-q","-v","ON_ERROR_STOP=1","-f",join(process.cwd(),"docs/ops/recovery-01/P04-ROLLBACK-FREEZE.sql")],{env:ENV,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  assert.match(denied(db,A,scopeSql(second,1,"after-freeze")),/42501/);
  assert.match(denied(db,A,`SELECT public.record_member_holdings(${quote(assets)}::jsonb,NULL,'after-freeze',3)`),/42501/);
  assert.match(denied(db,A,`SELECT public.record_member_debts(${quote(debt)}::jsonb,3,'after-freeze')`),/42501/);
  assert.equal(as(db,A,"SELECT count(*) FROM public.member_holding_versions"),"3");
  assert.equal(as(db,A,"SELECT count(*) FROM public.member_investment_scope_reviews"),scopeCount);
  assert.equal(as(db,A,"SELECT jsonb_build_object('id',id,'version',version,'allocations',allocations,'notes',notes,'created_at',created_at) FROM public.portfolio_versions"),legacyTarget);
  assert.equal(as(db,A,"SELECT to_jsonb(h) FROM public.holdings h"),legacyHolding);
 });
});

}
