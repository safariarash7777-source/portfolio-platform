/** Derived from the existing desk-preferences owned-PG harness.
 * Cached PG17 only; no network/ports/host mounts, secrets, JWT minting or live DB.
 * SQL claims fixture proves DB ownership/RLS, not native Auth/PostgREST verification.
 * Run: node scripts/testing/consultation/run.mjs
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const migration=readFileSync(new URL('../../../sql/consultation_workflow.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../../sql/test/supabase_bootstrap.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('./rollback.sql',import.meta.url),'utf8');
const token=randomUUID(), name=`consultation-test-${token}`;
const ciLocal=process.argv.includes('--ci-local'), ownedDatabases=new Set();
assert.ok(process.argv.slice(2).every(arg=>arg==='--ci-local'),'unknown test transport option');
if(ciLocal){
 assert.ok(process.env.GITHUB_ACTIONS==='true','CI-local transport requires explicit GitHub disposable service');
 assert.ok(process.env.CI==='true'&&process.env.PGHOST==='127.0.0.1'&&process.env.PGPORT==='5433'&&process.env.PGUSER==='postgres','CI-local requires the fixed disposable loopback service');
 assert.ok(process.env.PGPASSWORD==='postgres','only the existing synthetic CI service credential is accepted');
 assert.ok(!process.env.PGSERVICE&&!process.env.PGSERVICEFILE&&!process.env.PGHOSTADDR,'indirect connection configuration forbidden');
}
const image='sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const results=[]; let created=false, database='postgres';
function docker(argv,input){const r=spawnSync('docker',argv,{input,encoding:'utf8',cwd:root,timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();}
function inspect(){return JSON.parse(docker(['inspect',name]))[0];}
function attest(c){
 assert.equal(c.Name,`/${name}`);assert.equal(c.Config.Labels['arash.test.owner'],token);assert.equal(c.Image,image);
 assert.equal(c.HostConfig.NetworkMode,'none');assert.equal(c.HostConfig.ReadonlyRootfs,true);
 assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);assert.equal(Object.keys(c.NetworkSettings.Ports||{}).length,0);
 assert.deepEqual(c.HostConfig.Binds||[],[]);assert.ok(c.Mounts.every(m=>m.Type==='tmpfs'));
 assert.ok(Object.keys(c.NetworkSettings.Networks||{}).every(n=>n==='none'));
}
const args=()=>['exec','-i',name,'psql','-XqAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
const localArgs=db=>['-XqAt','-h','127.0.0.1','-p','5433','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
function localSql(db,query){const r=spawnSync('psql',localArgs(db),{input:query,encoding:'utf8',timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();}
function attestDatabase(){
 assert.ok(ownedDatabases.has(database),'unowned CI database forbidden');
 assert.equal(localSql('postgres',`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${database}'`),`pf3-test:${token}`,'CI test database ownership marker changed');
}
function sql(query){if(ciLocal){if(database!=='postgres')attestDatabase();return localSql(database,query);}attest(inspect());return docker(args(),query);}
function asyncSql(query){if(ciLocal)attestDatabase();else attest(inspect());return new Promise((resolve,reject)=>{
 const child=spawn(ciLocal?'psql':'docker',ciLocal?localArgs(database):args(),{cwd:root,stdio:['pipe','pipe','pipe']});let out='',err='';
 const timer=setTimeout(()=>child.kill(),30000);child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);
 child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);resolve({code,out,err});});child.stdin.end(query);
});}
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',O='00000000-0000-4000-8000-000000000003',X='00000000-0000-4000-8000-000000000004',KEY='10000000-0000-4000-8000-000000000001',ACTION='20000000-0000-4000-8000-000000000001';
const quote=x=>`'${(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")}'`;
const as=(role,id,q)=>`BEGIN; SELECT set_config('request.jwt.claims',${quote(id?{sub:id,role}:{role})},true); SET LOCAL ROLE ${role}; ${q}; COMMIT;`;
let counter=0;
const req=(actor,command,token='synthetic-'+(++counter))=>({contractVersion:'consultation-request.v1',expectedActorId:actor,clientToken:token,command});
const call=p=>`SELECT public.command_consultation(${quote(p)}::jsonb)`;
const pick=(out,contract)=>out.split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(x=>x?.contractVersion===contract);
const send=(actor,request)=>pick(sql(as('authenticated',actor,call(request))),'consultation-write.v1');
const read=(actor,relation=null)=>pick(sql(as('authenticated',actor,`SELECT public.load_consultation(${relation?quote(relation)+'::uuid':'null'},'2026-10-01','2026-10-31')`)),'consultation-read.v1');
const body=basis=>({topic:'نمونه ساختگی',goal:'هدف ساختگی',clientSummary:'خلاصه عضو مصنوعی',rationale:'دلیل ساختگی',limitations:'فقط پذیرش مصنوعی؛ مقادیر نامعلوم‌اند',reviewOn:'2099-12-31',basis,researchVersionIds:[],evidence:[{label:'سند مصنوعی',url:null,asOf:'2026-10-23'}],actions:[{actionKey:ACTION,title:'اقدام صرفاً ساختگی',dueOn:'2099-12-31',responsible:'member'}]});
function denied(query,state){assert.throws(()=>sql(query),e=>String(e).includes(state));}
function check(label,fn){fn();results.push({profile:database,name:label,status:'PASS'});console.log(`PASS ${database}: ${label}`);}
function count(){return Number(sql('SELECT count(*) FROM public.consultation_sessions'));}
// Existing schemas/functions/ACL must return byte-for-byte after lab-only rollback.
const inventory=`SELECT jsonb_build_object('relations',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.proacl::text,md5(pg_get_functiondef(p.oid))) ORDER BY n.nspname,p.proname,p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth')))::text`;
try{
 if(!ciLocal){
 assert.equal(docker(['image','inspect','postgres:17-alpine','--format','{{.Id}}']),image,'cached image drift');
 docker(['create','--pull','never','--name',name,'--label',`arash.test.owner=${token}`,'--network','none','--read-only',
  '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456','--tmpfs','/var/run/postgresql:rw,noexec,nosuid,size=16777216','--tmpfs','/tmp:rw,noexec,nosuid,size=16777216',
  '-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;attest(inspect());docker(['start',name]);
 let ready=false;for(let i=0;i<60;i++){
  const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});
  const pid=spawnSync('docker',['exec',name,'cat','/proc/1/comm'],{encoding:'utf8'});
  if(r.status===0&&pid.stdout.trim()==='postgres'){ready=true;break;}await new Promise(r=>setTimeout(r,200));
 }
 assert.ok(ready,'owned PG readiness failed');attest(inspect());
 console.log(JSON.stringify({attestation:{container:name,image,network:'none',ports:[],persistentMounts:[],readOnlyRoot:true,migrationSha256:createHash('sha256').update(migration).digest('hex'),server:sql('SELECT version()')}}));
 }else{
  assert.equal(localSql('postgres','SELECT current_database()'),'postgres');
  console.log(JSON.stringify({attestation:{transport:'explicit-GitHub-disposable-PG',host:'127.0.0.1',port:5433,migrationSha256:createHash('sha256').update(migration).digest('hex'),server:localSql('postgres','SELECT version()')}}));
 }
 for(const profile of ['explicit','legacy']){
  database='postgres';sql(`CREATE DATABASE consultation_${profile}`);
  if(ciLocal){ownedDatabases.add(`consultation_${profile}`);localSql('postgres',`COMMENT ON DATABASE consultation_${profile} IS 'pf3-test:${token}'`);}
  database=`consultation_${profile}`;
  sql(bootstrap);sql(readFileSync(new URL(`../../../sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`,import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../../sql/test/portfolio_precondition.sql',import.meta.url),'utf8'));
  for(const file of ['sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20261019215549_personal_cash_flow_versions.sql','sql/member_goals_versions_20261023.sql'])sql(readFileSync(new URL('../../../'+file,import.meta.url),'utf8'));
  sql(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${O}'),('${X}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${O}','admin'),('${X}','admin')`);
  const before=sql(inventory);sql(migration);
  sql(`INSERT INTO public.consultation_advisors(user_id,display_name,is_owner) VALUES('${O}','مالک ساختگی',true),('${X}','مدیر نامرتبط ساختگی',false)`);
  let relation,v1,v2,draft,approval;
  const workflow=(kind,session)=>req(O,{kind,relationshipId:relation,sessionId:session.id,contentHash:session.contentHash,note:'INTERNAL_ONLY'});
  check('nine forced-RLS tables and all direct authenticated writes/reads closed; wrappers restricted',()=>{
   assert.equal(sql("SELECT count(*)=9 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relname LIKE 'consultation_%' AND relkind='r'"),'t');
   for(const role of ['anon','authenticated','service_role']) {assert.equal(sql(`SELECT has_schema_privilege('${role}','consultation_private','USAGE')`),'f');for(const op of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal(sql(`SELECT has_table_privilege('${role}','public.consultation_sessions','${op}')`),'f');}
   for(const role of ['anon','service_role'])assert.equal(sql(`SELECT has_function_privilege('${role}','public.command_consultation(jsonb)','EXECUTE')`),'f');
  });
  check('owner-only explicit consent; unrelated admin has no file; idempotency matches exact label',()=>{
   denied(as('authenticated',A,call(req(A,{kind:'grant',advisorId:X,clientLabel:'A'}))),'42501');
   const input=req(A,{kind:'grant',advisorId:O,clientLabel:'عضو ساختگی A'});const result=send(A,input);relation=result.id;
   assert.equal(send(A,input).reused,true);assert.equal(read(X).relationships.length,0);assert.equal(read(B).relationships.length,0);
   denied(as('authenticated',B,`SELECT public.load_consultation('${relation}','2026-10-01','2026-10-31')`),'42501');
   denied(as('authenticated',A,call(req(A,{kind:'grant',advisorId:O,clientLabel:'changed'}))),'PT409');
  });
  check('canonical populated holdings debt and cashflow dossier preserve mapping provenance and unknowns',()=>{
   const holdings=[{position_key:'declared',manual_label:'Synthetic declared asset',symbol:null,asset_class:'other',qty:null,unit:'item',cost_basis:null,as_of:'2026-10-23',title:'Declared title',ownership_pct:50,valuation_mode:'declared',declared_value:1000000,valuation_source:'Synthetic member declaration',valuation_as_of:'2026-10-23',valuation_status:'estimated'},{position_key:'unpriced',manual_label:'Synthetic unpriced asset',symbol:null,asset_class:'other',qty:2.5,unit:'item',cost_basis:null,as_of:'2026-10-23',title:null,ownership_pct:100,valuation_mode:'unpriced',declared_value:null,valuation_source:null,valuation_as_of:null,valuation_status:'missing'}];
   const debts=[{debt_key:'loan',title:'Synthetic loan',kind:'loan',balance_toman:250000,currency:'IRT',balance_as_of:'2026-10-23',next_installment_toman:10000,next_due_on:'2026-11-01',note:null},{debt_key:'unknown-installment',title:'Synthetic personal debt',kind:'personal',balance_toman:20000,currency:'IRR',balance_as_of:'2026-10-23',next_installment_toman:null,next_due_on:null,note:null}];
   sql(as('authenticated',A,`SELECT * FROM public.record_member_holdings(${quote(holdings)}::jsonb,NULL,'consultation-holdings',0);SELECT * FROM public.record_member_debts(${quote(debts)}::jsonb,1,'consultation-debts')`));
   const source={label:'Synthetic member declaration',observedOn:'2026-10-23'};
   const cash={contractVersion:1,period:{startOn:'2026-10-01',endOn:'2026-10-31'},accountDefinitions:[{accountKey:'cash',label:'Cash'},{accountKey:'bank',label:'Bank'}],scopeAccountKeys:['cash','bank'],opening:{amountToman:null,atStartOn:'2026-10-01',source:null},coverage:{planned:{status:'partial',memberAffirmed:false,source},actual:{status:'complete',memberAffirmed:true,source}},entries:[{entryKey:'actual-income',basis:'actual',kind:'income',accountKey:'bank',amountToman:1000,occurredOn:'2026-10-01',source,category:null,note:null},{entryKey:'planned-expense',basis:'planned',kind:'expense',accountKey:'cash',amountToman:null,occurredOn:null,source:null,category:null,note:null},{entryKey:'transfer',basis:'actual',kind:'transfer',fromAccountKey:'bank',toAccountKey:'cash',amountToman:300,occurredOn:'2026-10-02',source,category:null,note:null}]};
   sql(as('authenticated',A,`SELECT public.record_member_cash_flow(${quote(cash)}::jsonb,'consultation-cashflow',0)`));
   const loaded=read(O,relation),d=loaded.dossier;
   assert.equal(d.holdings.version,2);assert.equal(d.holdings.positions.length,2);assert.equal(d.holdings.debts.length,2);
   assert.deepEqual(d.holdings.positions[0],{key:'declared',title:'Declared title',quantity:null,unit:'item',ownershipPercent:'50',declaredValueToman:1000000,source:'Synthetic member declaration',asOf:'2026-10-23'});
   assert.equal(d.holdings.positions[1].quantity,'2.5');assert.equal(d.holdings.positions[1].declaredValueToman,null);assert.equal(d.holdings.positions[1].source,null);
   assert.equal(d.holdings.debts[0].balanceToman,250000);assert.equal(d.holdings.debts[0].nextInstallmentToman,10000);assert.equal(d.holdings.debts[1].nextDueOn,null);
   assert.deepEqual(d.cashFlow.payload,{...cash,accountDefinitions:[cash.accountDefinitions[1],cash.accountDefinitions[0]],scopeAccountKeys:['bank','cash']});assert.equal(d.basis.holdingsVersionId,d.holdings.id);assert.equal(d.basis.cashFlowVersionId,d.cashFlow.id);assert.equal(d.goals,null);
   console.log(JSON.stringify({syntheticDossierFixture:loaded,profile:database}));
  });
  check('strict direct-RPC keys, actor, empty limitations, bad dates/URL and whitespace validation',()=>{
   const base=body(read(O,relation).dossier.basis);
   const save=b=>req(O,{kind:'save',relationshipId:relation,sessionKey:KEY,baseVersion:0,body:b,privateNote:'PRIVATE_CANARY'});
   for(const mutate of [b=>b.limitations='',b=>b.reviewOn='2026-02-30',b=>b.evidence=[],b=>b.evidence[0].url='javascript:bad',b=>b.evidence[0].url='https://user:secret@example.com/',b=>b.topic='\t',b=>b.actions.push({...b.actions[0]}),b=>b.extra='bad']){const b=structuredClone(base);mutate(b);denied(as('authenticated',O,call(save(b))),'22');}
   denied(as('authenticated',A,call(save(base))),'42501');
   const forged=save(base);forged.extra='bad';denied(as('authenticated',O,call(forged)),'22023');
   draft=save(base);v1=send(O,draft);assert.equal(v1.version,1);assert.equal(send(O,draft).reused,true);
   const changed=structuredClone(draft);changed.command.body.topic='changed';denied(as('authenticated',O,call(changed)),'PT409');
   assert.equal(read(A,relation).sessions.length,0);assert.equal(read(A,relation).notes.length,0);assert.equal(read(O,relation).notes[0].note,'PRIVATE_CANARY');
  });
  check('save submit approve publish are distinct; owner approval metadata visible, private notes never',()=>{
   let session=read(O,relation).sessions[0];
   denied(as('authenticated',O,call(workflow('publish',session))),'PT409');
   send(O,workflow('submit',session));assert.equal(read(A,relation).sessions.length,0);
   denied(as('authenticated',X,call(req(X,{...workflow('approve',session).command}))),'42501');
   approval=send(O,workflow('approve',session));assert.equal(read(A,relation).sessions.length,0);
   send(O,workflow('publish',session));const member=read(A,relation);
   assert.equal(member.sessions[0].state,'published');assert.equal(member.sessions[0].approval.actorId,O);assert.equal(member.notes.length,0);
   assert.ok(!JSON.stringify(member).includes('PRIVATE_CANARY'));assert.ok(!JSON.stringify(member).includes('INTERNAL_ONLY'));assert.equal(member.events[0].kind,'publish');
  });
  check('member feedback references exact published action; CAS/actor and immutable action definitions',()=>{
   const feedback=req(A,{kind:'feedback',relationshipId:relation,sessionId:v1.id,actionKey:ACTION,baseVersion:0,status:'doing',text:null});
   assert.equal(send(A,feedback).version,1);assert.equal(send(A,feedback).reused,true);
   denied(as('authenticated',A,call(req(A,{...feedback.command,status:'done'}))),'PT409');
   denied(as('authenticated',B,call(req(B,feedback.command))),'42501');
   denied(as('authenticated',O,call(req(O,{...feedback.command,baseVersion:1,status:'done'}))),'42501');
   assert.equal(send(A,req(A,{...feedback.command,baseVersion:1,status:'done'})).version,2);
   assert.equal(read(A,relation).sessions[0].body.actions[0].title,'اقدام صرفاً ساختگی');
  });
  check('new draft preserves published v1; old published version remains withdrawable',()=>{
   v2=send(O,req(O,{...draft.command,baseVersion:1,body:{...draft.command.body,clientSummary:'نسخه دوم'}}));
   const old=read(O,relation).sessions.find(s=>s.id===v1.id);
   send(O,workflow('withdraw',old));assert.equal(read(A,relation).sessions[0].state,'withdrawn');
   denied(as('authenticated',A,call(req(A,{kind:'feedback',relationshipId:relation,sessionId:v1.id,actionKey:null,baseVersion:0,status:'viewed',text:null}))),'42501');
  });
  check('financial latest change blocks approval, exact new basis works; canonical financial ledger is untouched',()=>{
   let session=read(O,relation).sessions.find(s=>s.id===v2.id);send(O,workflow('submit',session));
   sql(as('authenticated',A,`SELECT public.record_member_goals('{"contractVersion":1,"goals":[]}'::jsonb,'goals-fixture',0)`));
   denied(as('authenticated',O,call(workflow('approve',session))),'PT409');
   const basis=read(O,relation).dossier.basis;assert.ok(basis.goalsVersionId);
   const v3=send(O,req(O,{...draft.command,baseVersion:2,body:body(basis)}));session=read(O,relation).sessions.find(s=>s.id===v3.id);
   send(O,workflow('submit',session));send(O,workflow('approve',session));
   sql(as('authenticated',A,`SELECT public.record_member_goals('{"contractVersion":1,"goals":[]}'::jsonb,'goals-fixture2',1)`));
   denied(as('authenticated',O,call(workflow('publish',session))),'PT409');
   assert.equal(sql(`SELECT count(*) FROM public.member_goals_versions WHERE user_id='${A}'`),'2');
  });
  const raceBody=body(read(O,relation).dossier.basis);
  const raceOne=req(O,{...draft.command,baseVersion:3,body:raceBody});
  const raceTwo=req(O,{...draft.command,baseVersion:3,body:raceBody});
  const heldWrite=asyncSql(as('authenticated',O,`${call(raceOne)};SELECT pg_sleep(2)`));
  let held=false;for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0){held=true;break;}await new Promise(r=>setTimeout(r,25));}assert.ok(held);
  const competing=asyncSql(as('authenticated',O,call(raceTwo)));const [won,lost]=await Promise.all([heldWrite,competing]);
  check('concurrent same-base draft writers create one immutable version',()=>{assert.equal(won.code,0,won.err);assert.notEqual(lost.code,0);assert.match(lost.err,/PT409/);assert.equal(read(O,relation).sessions.filter(s=>s.version===4).length,1);});
  const exact=req(O,{...draft.command,baseVersion:4,body:raceBody});
  const retryFirst=asyncSql(as('authenticated',O,`${call(exact)};SELECT pg_sleep(2)`));
  for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0)break;await new Promise(r=>setTimeout(r,25));}
  const retrySecond=asyncSql(as('authenticated',O,call(exact)));const [firstResult,retryResult]=await Promise.all([retryFirst,retrySecond]);
  check('concurrent exact attempt reuses same receipt and does not create a version',()=>{assert.equal(firstResult.code,0,firstResult.err);assert.equal(retryResult.code,0,retryResult.err);assert.equal(pick(firstResult.out,'consultation-write.v1').id,pick(retryResult.out,'consultation-write.v1').id);assert.equal(pick(retryResult.out,'consultation-write.v1').reused,true);});
  const current=read(O,relation).sessions.find(s=>s.version===5);send(O,workflow('submit',current));
  const financialWriter=asyncSql(as('authenticated',A,`SELECT public.record_member_goals('{"contractVersion":1,"goals":[]}'::jsonb,'goals-concurrent',2);SELECT pg_sleep(2)`));
  for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0)break;await new Promise(r=>setTimeout(r,25));}
  const competingApproval=asyncSql(as('authenticated',O,call(workflow('approve',current))));
  const [financialResult,approvalResult]=await Promise.all([financialWriter,competingApproval]);
  check('approval waits canonical financial writer lock then rejects changed latest basis',()=>{assert.equal(financialResult.code,0,financialResult.err);assert.notEqual(approvalResult.code,0);assert.match(approvalResult.err,/PT409/);assert.equal(read(O,relation).sessions.find(s=>s.id===current.id).state,'submitted');});
  const workbook=randomUUID(),researchId=randomUUID(),researchKey=randomUUID();
  const researchBody={evidence:[{statement:'Synthetic evidence',sourceUrl:'https://example.com/source',observedOn:'2026-10-23',publishedOn:'2026-10-23'}]};
  sql(as('authenticated',O,`INSERT INTO public.research_workbook_versions(id,workbook_id,version,title,body) VALUES('${researchId}','${workbook}',1,'Synthetic',${quote(researchBody)}::jsonb)`));
  const sourcedBody={...body(read(O,relation).dossier.basis),researchVersionIds:[researchId]};
  const sourcedDraft=req(O,{...draft.command,sessionKey:researchKey,baseVersion:0,body:sourcedBody});
  check('unapproved research refused; latest approved evidence can support exact draft',()=>{
   denied(as('authenticated',O,call(sourcedDraft)),'22023');
   sql(as('authenticated',O,`INSERT INTO public.research_workbook_reviews(version_id,decision) VALUES('${researchId}','approved_internal')`));
   assert.ok(send(O,sourcedDraft).id);
  });
  const sourcedSession=read(O,relation).sessions.find(s=>s.sessionKey===researchKey);send(O,workflow('submit',sourcedSession));
  const researchWriter=asyncSql(as('authenticated',O,`INSERT INTO public.research_workbook_versions(workbook_id,version,title,body) VALUES('${workbook}',2,'Synthetic next',${quote(researchBody)}::jsonb);SELECT pg_sleep(2)`));
  let researchHeld=false;for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE relation='public.research_workbook_versions'::regclass AND mode='RowExclusiveLock' AND granted"))>0){researchHeld=true;break;}await new Promise(r=>setTimeout(r,25));}assert.ok(researchHeld);
  const researchApproval=asyncSql(as('authenticated',O,call(workflow('approve',sourcedSession))));
  const [researchWriteResult,researchApprovalResult]=await Promise.all([researchWriter,researchApproval]);
  check('approval waits research writer then rejects superseded source; no approval appended',()=>{assert.equal(researchWriteResult.code,0,researchWriteResult.err);assert.notEqual(researchApprovalResult.code,0);assert.match(researchApprovalResult.err,/22023/);assert.equal(read(O,relation).sessions.find(s=>s.id===sourcedSession.id).state,'submitted');});
  check('same-transaction approved and returned research timestamps fail closed',()=>{
   const tieId=randomUUID(),tieWorkbook=randomUUID();
   sql(as('authenticated',O,`INSERT INTO public.research_workbook_versions(id,workbook_id,version,title,body) VALUES('${tieId}','${tieWorkbook}',1,'Synthetic tie',${quote(researchBody)}::jsonb);INSERT INTO public.research_workbook_reviews(version_id,decision) VALUES('${tieId}','approved_internal'),('${tieId}','returned')`));
   const tieDraft=req(O,{...draft.command,sessionKey:randomUUID(),baseVersion:0,body:{...sourcedBody,researchVersionIds:[tieId]}});
   denied(as('authenticated',O,call(tieDraft)),'22023');
  });
  check('member revocation blocks advisor next read and all new mutations; member history retained',()=>{
   const input=req(A,{kind:'revoke',relationshipId:relation});send(A,input);assert.equal(send(A,input).reused,true);
   denied(as('authenticated',O,`SELECT public.load_consultation('${relation}','2026-10-01','2026-10-31')`),'42501');
   denied(as('authenticated',O,call(req(O,{...draft.command,baseVersion:3}))),'42501');
   assert.equal(read(A,relation).selected.revoked,true);assert.equal(read(A,relation).sessions.length,1);assert.equal(read(A,relation).notes.length,0);
  });
  check('all history rejects UPDATE DELETE TRUNCATE, owner registry unique, installer collision fails closed',()=>{
   denied('UPDATE public.consultation_sessions SET version=99','42501');denied('DELETE FROM public.consultation_sessions','42501');denied('TRUNCATE public.consultation_sessions CASCADE','42501');
   denied(`UPDATE public.consultation_advisors SET is_owner=true WHERE user_id='${X}'`,'23505');denied(migration,'55000');
  });
  check('lab rollback only; preserves exact prior schema/functions/ACL inventory',()=>{
   denied(rollback,'rollback requires owned synthetic lab');sql("SELECT set_config('portfolio.consultation_lab_marker','consultation-isolated-20261023',false);"+rollback);assert.equal(sql(inventory),before);
  });
 }
 console.log(JSON.stringify({summary:{passed:results.length,failed:0},results,limitations:['SQL claims fixture; not native Auth/PostgREST acceptance','No operational installation or app/API/UI writes','Only local owned synthetic databases']}));
}catch(error){console.error(error);process.exitCode=1;}finally{
 if(ciLocal)for(const db of ownedDatabases){database=db;attestDatabase();localSql('postgres',`DROP DATABASE ${db} WITH (FORCE)`);console.log(JSON.stringify({cleanup:{database:db,ownedMarkerVerified:true,removed:true}}));}
 if(created){attest(inspect());docker(['rm','-f',name]);console.log(JSON.stringify({cleanup:{container:name,removed:true}}));}
}
