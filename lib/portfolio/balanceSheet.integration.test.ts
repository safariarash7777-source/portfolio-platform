import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { execFileSync, psqlAsync } from "../ops/test-postgres";
import { buildBalanceSheet, positionFromStored, debtFromStored } from "./balanceSheet";
import { postFinancialSnapshot } from "./financialHttp";
import { normalisePosition, normaliseDebt } from "./financialInput";
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
