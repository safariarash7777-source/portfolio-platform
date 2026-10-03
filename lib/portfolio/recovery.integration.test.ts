// RECOVERY-01 standalone disposable Postgres suite; no research/consultation schema.
// Run only against the existing CI-local Postgres with synthetic databases.
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { execFileSync, psqlAsync } from "../ops/test-postgres";
import { buildBalanceSheet, positionFromStored, debtFromStored } from "./balanceSheet";
import { postInvestmentScope } from "./scopeHttp";
import { scopeReviewFromStored } from "./scopeContract";
import { selectInvestmentScope } from "./investmentScope";
const ENV={...process.env,PGHOST:process.env.PGHOST??"127.0.0.1",PGPORT:process.env.PGPORT??"5433",PGUSER:process.env.PGUSER??"postgres",PGPASSWORD:process.env.PGPASSWORD??"postgres"};
if(!["127.0.0.1","localhost","::1"].includes(ENV.PGHOST))throw new Error("Recovery tests require CI-local synthetic Postgres");
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
  for(const file of ["sql/test/supabase_bootstrap.sql",`sql/test/profile_${profile==="legacy"?"legacy_default_privileges":"explicit_grants"}.sql`,"sql/test/portfolio_precondition.sql","sql/phase32_member_holdings.sql","supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql","supabase/migrations/20261003094327_member_investment_scope_reviews.sql","supabase/migrations/20261003100542_recovery_legacy_holdings_owner_only.sql"]){
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
  assert.equal(as(db,ADMIN,"SELECT count(*) FROM public.holdings"),"0");
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
  assert.equal(as(db,ADMIN,"SELECT count(*) FROM public.holdings"),"0","rollback retains legacy privacy correction");
 });
});

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
