// Bounded real HTTP / PostgreSQL acceptance. No browser automation or mock responses.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { state, attest, sql, docker, local, origin, base } from './lab.mjs';
const s=state();
const report={base,runId:s.id,startedAt:new Date().toISOString(),isolation:attest(s),mode:'Real Auth-issued SSR cookies, Next API, PostgREST, PostgreSQL; UI separately accepted with CUA',scenarios:[]};
const flush=()=>writeFileSync(resolve(local,'api-results.json'),JSON.stringify(report,null,2));
async function scenario(id,fn){try{report.scenarios.push({id,status:'PASS',evidence:await fn()});}catch(e){report.scenarios.push({id,status:'FAIL',reason:String(e.message).split('\n')[0],location:String(e.stack).split('\n').find(l=>l.includes('api-acceptance.mjs:'))?.trim()});}flush();console.log(`${id}: ${report.scenarios.at(-1).status}`);}
// Use the installed SSR package's own cookie writer, not a handcrafted or forged JWT.
async function session(name){
 const source=`import { createServerClient } from '@supabase/ssr';
 const jar=new Map(); const db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});
 const {error}=await db.auth.signInWithPassword(${JSON.stringify({email:s.users[name].email,password:s.users[name].password})});
 if(error)throw new Error('Synthetic authentication failed'); console.log(JSON.stringify({cookie:[...jar].map(([k,v])=>k+'='+encodeURIComponent(v)).join('; ')}));`;
 return JSON.parse(docker(['exec','-i','-w','/app',s.web,'node','--input-type=module'],source)).cookie;
}
async function api(cookie,path,body,method){const r=await fetch(origin+path,{method:method??(body===undefined?'GET':'POST'),headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000),redirect:'manual'});return{status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}
const count=()=>Number(sql(s,`SELECT count(*) FROM public.member_holding_versions WHERE user_id='${s.users.A.id}'`));
const dbFinancial=id=>JSON.parse(sql(s,`SELECT json_build_object('version',(SELECT row_to_json(h) FROM public.member_holding_versions h WHERE id='${id}'),'positions',(SELECT coalesce(json_agg(p ORDER BY position_key),'[]') FROM public.member_holding_positions p WHERE version_id='${id}'),'debts',(SELECT coalesce(json_agg(d ORDER BY debt_key),'[]') FROM public.member_debt_positions d WHERE version_id='${id}'))`));
const holdingsPath='/api/portfolio/holdings', researchPath='/api/admin/intelligence/workbooks';
const position={position_key:'synthetic-gold',manual_label:'دارایی ساختگی پذیرش',asset_class:'gold',qty:2,unit:'گرم',as_of:'2026-10-17',ownership_pct:50,valuation_mode:'unpriced'};
const firstPayload={base_version:0,client_token:randomUUID(),positions:[position]};
let a,a2,b,admin,first,second,scope,wb1,workbook;
try {
 a=await session('A');a2=await session('A');b=await session('B');admin=await session('admin');
 await scenario('F01-real-save-independent-read-db',async()=>{
  assert.equal(count(),0,'Fresh run required'); first=await api(a,holdingsPath,firstPayload);assert.equal(first.status,201);assert.equal(first.body.version,1);assert.ok(first.body.version_id);
  const read=await api(a2,holdingsPath);assert.equal(read.status,200);assert.match(read.cache,/private.*no-store/);assert.equal(read.body.version.id,first.body.version_id);assert.equal(read.body.positions[0].manual_label,position.manual_label);assert.equal(read.body.positions[0].qty,2);assert.equal(read.body.positions[0].ownership_pct,50);assert.equal(read.body.positions[0].declared_value,null);
  const db=dbFinancial(first.body.version_id);assert.equal(db.version.user_id,s.users.A.id);assert.equal(db.positions[0].qty,2);assert.equal(db.positions[0].ownership_pct,50);assert.equal(db.positions[0].declared_value,null);assert.equal(count(),1);
  return {receipt:first.body,readStatus:read.status,cache:read.cache,db,independentAuthSession:true};
 });
 if(first?.status!==201)throw new Error('Financial prerequisite failed');
 await scenario('F02-second-version-preserves-first-and-assets',async()=>{
  second=await api(a2,'/api/portfolio/debts',{base_version:1,client_token:randomUUID(),debts:[{debt_key:'synthetic-loan',title:'بدهی صفر ساختگی',kind:'loan',currency:'IRT',balance:0,balance_as_of:'2026-10-17'}]});assert.equal(second.status,201);assert.equal(second.body.version,2);
  const old=await api(a,holdingsPath+'?version='+first.body.version_id);const read=await api(await session('A'),holdingsPath);assert.equal(old.body.version.version,1);assert.equal(old.body.debts.length,0);assert.equal(read.body.version.id,second.body.version_id);assert.equal(read.body.positions[0].qty,2);assert.equal(read.body.debts[0].balance_toman,0);assert.equal(count(),2);const db=dbFinancial(second.body.version_id);assert.equal(db.debts[0].balance_toman,0);assert.equal(db.positions[0].manual_label,position.manual_label);
  return {receipt:second.body,db,oldVersionRetained:true,newIndependentSession:true};
 });
 await scenario('F03-replay-and-stale-base',async()=>{
  const retry=await api(a,holdingsPath,firstPayload);assert.equal(retry.status,200);assert.equal(retry.body.version_id,first.body.version_id);assert.equal(retry.body.reused,true);const stale=await api(a,holdingsPath,{...firstPayload,client_token:randomUUID()});assert.equal(stale.status,409);assert.equal(count(),2);return{retryStatus:retry.status,staleStatus:stale.status,versionRows:2};
 });
 await scenario('S01-version-bound-scope-receipt-independent-read-db',async()=>{
  const payload={holding_version_id:second.body.version_id,rules_version:'member-selected.v0.1',base_scope_version:0,client_token:randomUUID(),assignments:[{positionKey:position.position_key,use:'excluded'}]};scope=await api(a,holdingsPath+'/scope',payload);assert.equal(scope.status,201);assert.ok(scope.body.memberConfirmedAt);const retry=await api(a2,holdingsPath+'/scope',payload);assert.equal(retry.body.id,scope.body.id);const db=JSON.parse(sql(s,`SELECT row_to_json(r) FROM public.member_investment_scope_reviews r WHERE id='${scope.body.id}'`));assert.equal(db.holding_version_id,second.body.version_id);assert.equal(Date.parse(db.member_confirmed_at),Date.parse(scope.body.memberConfirmedAt));return{receipt:scope.body,retryStatus:retry.status,db};
 });
 await scenario('P01-member-admin-anonymous-cannot-read-A',async()=>{
  const evidence=[];for(const [actor,cookie,want] of [['B',b,404],['admin',admin,404],['anonymous',null,401]]){const read=await api(cookie,holdingsPath+'?version='+first.body.version_id);assert.equal(read.status,want);assert.match(read.cache,/private.*no-store/);assert.ok(!JSON.stringify(read.body).includes(position.manual_label));evidence.push({actor,status:read.status,cache:read.cache});}return evidence;
 });
 await scenario('P02-B-native-save-isolated-from-A',async()=>{
  const bWrite=await api(b,holdingsPath,{base_version:0,client_token:randomUUID(),positions:[{...position,position_key:'b-only',manual_label:'دارایی ساختگی عضو دوم',qty:9}]});assert.equal(bWrite.status,201);assert.equal(sql(s,`SELECT user_id FROM public.member_holding_versions WHERE id='${bWrite.body.version_id}'`),s.users.B.id);const aRead=await api(a,holdingsPath);assert.equal(aRead.body.positions.length,1);assert.equal(aRead.body.positions[0].qty,2);assert.equal((await api(a,holdingsPath+'?version='+bWrite.body.version_id)).status,404);assert.equal(count(),2);return{receipt:bWrite.body,AUnchanged:true};
 });
 await scenario('P03-REST-and-valid-RPC-cross-user-isolation',async()=>{
  const evidence=[];for(const actor of ['B','admin']){const u=s.users[actor];const login=await fetch(origin+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});assert.equal(login.status,200);const token=(await login.json()).access_token;const headers={Authorization:'Bearer '+token,apikey:s.anon,'Content-Type':'application/json'};for(const table of ['member_holding_versions','member_holding_positions','member_debt_positions','member_investment_scope_reviews']){const filter=table === 'member_holding_versions' || table === 'member_investment_scope_reviews' ? `user_id=eq.${s.users.A.id}` : `version_id=in.(${first.body.version_id},${second.body.version_id})`;const r=await fetch(origin+`/rest/v1/${table}?select=*&${filter}`,{headers});assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);evidence.push({actor,table,status:r.status,foreignRows:0});}
   const rpc=await fetch(origin+'/rest/v1/rpc/record_member_investment_scope',{method:'POST',headers,body:JSON.stringify({p_holding_version_id:second.body.version_id,p_rules_version:'member-selected.v0.1',p_assignments:[{positionKey:position.position_key,use:'excluded'}],p_base_scope_version:1,p_client_token:randomUUID()})});assert.equal(rpc.status,403);evidence.push({actor,validForeignRpcStatus:rpc.status});}return evidence;
 });
 workbook={version:1,title:'پژوهش ساختگی پذیرش',domain:'macro_ir',question:'پرسش ساختگی',horizon:'کوتاه',evidence:[{id:'e1',statement:'',sourceUrl:'',observedOn:'',publishedOn:''}],interpretation:'',counterEvidence:'',scenarios:Object.fromEntries(['base','upside','downside'].map(k=>[k,{assumptions:'',mechanism:'',invalidation:''}])),portfolioImpact:'',reviewOn:''};
 await scenario('R01-admin-create-independent-read-db',async()=>{
  const id=randomUUID();wb1=await api(admin,researchPath,{action:'save',workbookId:id,creationId:id,baseVersion:0,workbook});assert.equal(wb1.status,201);assert.equal(wb1.body.workbookId,id);const read=await api(await session('admin'),researchPath+'?id='+id);assert.equal(read.status,200);assert.deepEqual(read.body.workbook,workbook);const db=JSON.parse(sql(s,`SELECT row_to_json(w) FROM public.research_workbook_versions w WHERE workbook_id='${id}' AND version=1`));assert.equal(db.created_by,s.users.admin.id);assert.deepEqual(db.body,workbook);return{receipt:wb1.body,db,independentAuthSession:true};
 });
 await scenario('R02-admin-second-version-preserves-first',async()=>{
  const id=wb1.body.workbookId;const next={...workbook,title:'نسخه دوم پژوهش ساختگی',interpretation:'تفسیر نسخه دوم ساختگی'};const r=await api(admin,researchPath,{action:'save',workbookId:id,baseVersion:1,workbook:next});assert.equal(r.status,201);assert.equal(r.body.version,2);const read=await api(await session('admin'),researchPath+'?id='+id);assert.deepEqual(read.body.workbook,next);const rows=JSON.parse(sql(s,`SELECT json_agg(w ORDER BY version) FROM public.research_workbook_versions w WHERE workbook_id='${id}'`));assert.equal(rows.length,2);assert.deepEqual(rows[0].body,workbook);assert.deepEqual(rows[1].body,next);return{receipt:r.body,versions:rows.map(x=>({id:x.id,version:x.version,createdAt:x.created_at,createdBy:x.created_by})),contentMatches:true};
 });
 await scenario('R03-initial-creation-replay-no-duplicate-content-conflict',async()=>{
  const id=randomUUID();const payload={action:'save',workbookId:id,creationId:id,baseVersion:0,workbook:{...workbook,title:'ثبت با نتیجه نامعلوم ساختگی'}};const n=Number(sql(s,'SELECT count(*) FROM public.research_workbook_versions'));const committed=await api(admin,researchPath,payload);assert.equal(committed.status,201);const replay=await api(await session('admin'),researchPath,payload);assert.equal(replay.status,200);assert.equal(replay.body.reused,true);assert.equal(replay.body.workbookId,id);assert.equal(replay.body.savedAt,committed.body.savedAt);const conflict=await api(admin,researchPath,{...payload,workbook:{...payload.workbook,title:'محتوای متفاوت'}});assert.equal(conflict.status,409);assert.equal(Number(sql(s,'SELECT count(*) FROM public.research_workbook_versions')),n+1);return{receipt:committed.body,replayStatus:replay.status,conflictStatus:conflict.status,rowsAdded:1,limitation:'HTTP response consumed then discarded by test; browser dropped-response recovery not exercised'};
 });
 await scenario('R04-research-native-admin-contract-members-denied',async()=>{
  const results=[];for(const [actor,cookie,want] of [['A',a,403],['B',b,403],['anonymous',null,401]]){const r=await api(cookie,researchPath+'?id='+wb1.body.workbookId);assert.equal(r.status,want);assert.ok(!JSON.stringify(r.body).includes(workbook.title));results.push({actor,status:r.status});}return{results,contract:'Research workbooks remain admin-only; private member research is not implemented'};
 });
 report.finalIsolation=attest(s);
}catch(e){report.scenarios.push({id:'dependent-execution',status:'BLOCKED',reason:String(e.message).split('\n')[0]});}
finally{report.finishedAt=new Date().toISOString();flush();}
process.exitCode=report.scenarios.some(x=>x.status==='FAIL')?1:report.scenarios.some(x=>x.status==='BLOCKED')?2:0;
