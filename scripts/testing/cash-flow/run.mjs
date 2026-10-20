/** Derived from the existing desk-preferences owned-PG harness.
 * Cached PG17 only; no network/ports/host mounts, secrets, JWT minting or live DB.
 * SQL claims fixture proves DB ownership/RLS, not native Auth/PostgREST verification.
 * Run: node scripts/testing/cash-flow/run.mjs
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const migration=readFileSync(new URL('../../../supabase/migrations/20261019215549_personal_cash_flow_versions.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../../sql/test/supabase_bootstrap.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('./rollback.sql',import.meta.url),'utf8');
const token=randomUUID(), name=`cash-flow-test-${token}`;
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
 assert.equal(localSql('postgres',`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${database}'`),`pf2b-test:${token}`,'CI test database ownership marker changed');
}
function sql(query){if(ciLocal){if(database!=='postgres')attestDatabase();return localSql(database,query);}attest(inspect());return docker(args(),query);}
function asyncSql(query){if(ciLocal)attestDatabase();else attest(inspect());return new Promise((resolve,reject)=>{
 const child=spawn(ciLocal?'psql':'docker',ciLocal?localArgs(database):args(),{cwd:root,stdio:['pipe','pipe','pipe']});let out='',err='';
 const timer=setTimeout(()=>child.kill(),30000);child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);
 child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);resolve({code,out,err});});child.stdin.end(query);
});}
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
const quote=x=>`'${(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")}'`;
const as=(role,id,q)=>`BEGIN; SELECT set_config('request.jwt.claims',${quote(id?{sub:id,role}:{role})},true); SET LOCAL ROLE ${role}; ${q}; COMMIT;`;
const call=(p,t,b)=>`SELECT public.record_member_cash_flow(${quote(p)}::jsonb,${quote(t)},${b})`;
const source=Object.freeze({label:'اظهار عضو مصنوعی',observedOn:'2026-10-20'});
const event=(o={})=>({entryKey:'income',basis:'actual',kind:'income',accountKey:'cash',amountToman:1000,occurredOn:'2026-10-01',source:structuredClone(source),category:null,note:null,...o});
function payload(){return structuredClone({contractVersion:1,period:{startOn:'2026-10-01',endOn:'2026-10-31'},accountDefinitions:[{accountKey:'cash',label:'نقد ساختگی'},{accountKey:'bank',label:'حساب ساختگی'}],scopeAccountKeys:['cash','bank'],opening:{amountToman:500,atStartOn:'2026-10-01',source},coverage:{planned:{status:'unknown',memberAffirmed:false,source:null},actual:{status:'complete',memberAffirmed:true,source}},entries:[event()]});}
function receipt(out){return out.split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(x=>x?.contractVersion==='cash-flow-write.v1');}
function denied(query,state){assert.throws(()=>sql(query),e=>String(e).includes(state));}
function check(label,fn){fn();results.push({profile:database,name:label,status:'PASS'});console.log(`PASS ${database}: ${label}`);}
function count(){return Number(sql('SELECT count(*) FROM public.member_cash_flow_versions'));}
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
  database='postgres';sql(`CREATE DATABASE cash_flow_${profile}`);
  if(ciLocal){ownedDatabases.add(`cash_flow_${profile}`);localSql('postgres',`COMMENT ON DATABASE cash_flow_${profile} IS 'pf2b-test:${token}'`);}
  database=`cash_flow_${profile}`;
  sql(bootstrap);sql(readFileSync(new URL(`../../../sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`,import.meta.url),'utf8'));
  sql(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}')`);const before=sql(inventory);sql(migration);
  check('RLS forced; private kernel and anon/service execution closed',()=>{
   assert.equal(sql("SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN ('public.member_cash_flow_versions'::regclass,'public.member_cash_flow_entries'::regclass)"),'t');
   for(const role of ['anon','service_role'])assert.equal(sql(`SELECT has_function_privilege('${role}','public.record_member_cash_flow(jsonb,text,integer)','EXECUTE')`),'f');
   for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`SELECT has_schema_privilege('${role}','cash_flow_private','USAGE')`),'f');
  });
  const p=payload();let one,two;
  check('first append and independent connection owner read',()=>{
   one=receipt(sql(as('authenticated',A,call(p,'first',0))));assert.equal(one.version,1);assert.equal(one.entry_count,1);assert.equal(one.reused,false);
   assert.equal(sql(as('authenticated',A,`SELECT count(*) FROM public.member_cash_flow_versions WHERE id=${quote(one.version_id)}::uuid`)).split('\n').at(-1),'1');
   assert.equal(sql(`SELECT amount_toman FROM public.member_cash_flow_entries WHERE version_id=${quote(one.version_id)}::uuid`),'1000');
  });
  check('same attempt replays one version; reordered arrays canonicalize consistently',()=>{
   const reorder=structuredClone(p);reorder.accountDefinitions.reverse();reorder.scopeAccountKeys.reverse();
   const retry=receipt(sql(as('authenticated',A,call(reorder,'first',0))));assert.equal(retry.version_id,one.version_id);assert.equal(retry.reused,true);assert.equal(count(),1);
  });
  check('same token changed amount/base/period conflicts without another version',()=>{
   const changed=structuredClone(p);changed.entries[0].amountToman=2000;denied(as('authenticated',A,call(changed,'first',0)),'PT409');
   denied(as('authenticated',A,call(p,'first',1)),'PT409');
   const period=structuredClone(p);period.period.endOn='2026-11-01';denied(as('authenticated',A,call(period,'first',0)),'PT409');assert.equal(count(),1);
  });
  check('second version preserves first amount and old token replay still returns v1',()=>{
   const v2=structuredClone(p);v2.entries[0].amountToman=700;two=receipt(sql(as('authenticated',A,call(v2,'second',1))));assert.equal(two.version,2);
   assert.equal(sql(`SELECT amount_toman FROM public.member_cash_flow_entries WHERE version_id=${quote(one.version_id)}::uuid`),'1000');
   assert.equal(receipt(sql(as('authenticated',A,call(p,'first',0)))).version_id,one.version_id);denied(as('authenticated',A,call(p,'stale',0)),'PT409');
  });
  check('B cannot read A headers/entries, own same token is independent; anon cannot call/read',()=>{
   assert.equal(sql(as('authenticated',B,'SELECT count(*) FROM public.member_cash_flow_versions')).split('\n').at(-1),'0');
   assert.equal(sql(as('authenticated',B,'SELECT count(*) FROM public.member_cash_flow_entries')).split('\n').at(-1),'0');
   const b=receipt(sql(as('authenticated',B,call(p,'first',0))));assert.notEqual(b.version_id,one.version_id);assert.equal(b.version,1);
   denied(as('anon',null,call(p,'anonymous',0)),'42501');denied(as('authenticated',null,call(p,'no-uid',0)),'42501');
   denied(as('anon',null,'SELECT * FROM public.member_cash_flow_versions'),'42501');
  });
  check('owner and foreign direct writes, TRUNCATE and private kernel are denied',()=>{
   for(const role of ['authenticated','anon','service_role']){
    for(const query of ['INSERT INTO public.member_cash_flow_versions DEFAULT VALUES','INSERT INTO public.member_cash_flow_entries DEFAULT VALUES','UPDATE public.member_cash_flow_versions SET version=99','DELETE FROM public.member_cash_flow_entries','TRUNCATE public.member_cash_flow_versions',`SELECT cash_flow_private.record_snapshot(${quote(p)}::jsonb,'bypass',0)`])denied(as(role,A,query),'42501');
   }
   denied('UPDATE public.member_cash_flow_versions SET version=99','42501');denied('TRUNCATE public.member_cash_flow_entries','42501');
  });
  check('forged owner/account/source/basis and unknown complete fields reject atomically',()=>{
   const invalid=[];let x;
   x=payload();x.user_id=B;invalid.push(x);
   x=payload();x.entries[0].ownerId=B;invalid.push(x);
   x=payload();x.entries[0].accountKey='B-private-account';invalid.push(x);
   x=payload();x.coverage.actual.memberAffirmed=false;invalid.push(x);
   x=payload();x.coverage.actual.source=null;invalid.push(x);
   x=payload();x.entries[0].amountToman=null;invalid.push(x);
   x=payload();x.entries[0].occurredOn=null;invalid.push(x);
   x=payload();x.entries[0].source=null;invalid.push(x);
   x=payload();x.entries[0].source.label='unknown';invalid.push(x);
   x=payload();x.entries[0].basis='assumed';invalid.push(x);
   x=payload();x.entries.push(x.entries[0]);invalid.push(x);
   const n=count();for(const [i,bad]of invalid.entries())denied(as('authenticated',A,call(bad,`invalid-${i}`,2)),'22023');assert.equal(count(),n);
  });
  check('fixed limits and calendar/numeric validation reject without partial headers',()=>{
   const invalid=[];let x;
   x=payload();x.accountDefinitions=Array.from({length:51},(_,i)=>({accountKey:`a${i}`,label:'x'}));invalid.push(x);
   x=payload();x.accountDefinitions[0].label='x'.repeat(161);invalid.push(x);
   x=payload();x.period.endOn='2027-10-02';invalid.push(x);
   x=payload();x.entries=Array.from({length:501},(_,i)=>event({entryKey:`a${i}`}));invalid.push(x);
   x=payload();x.entries[0].note='x'.repeat(2001);invalid.push(x);
   x=payload();x.entries[0].occurredOn='2026-02-31';invalid.push(x);
   x=payload();x.entries[0].amountToman=0.5;invalid.push(x);
   x=payload();x.entries[0].amountToman=-1;invalid.push(x);
   x=payload();x.entries[0].amountToman=9007199254740992;invalid.push(x);
   x=payload();x.entries=Array.from({length:500},(_,i)=>event({entryKey:`a${i}`,note:'x'.repeat(2000)}));invalid.push(x);
   const n=count();for(const [i,bad]of invalid.entries())denied(as('authenticated',A,call(bad,`limit-${i}`,2)),'22023');assert.equal(count(),n);
  });
  check('unknown and partial persist null; no automatic complete zero assertion',()=>{
   const partial=payload();partial.coverage.actual={status:'partial',memberAffirmed:false,source:null};partial.opening=null;partial.entries[0].amountToman=null;partial.entries[0].occurredOn=null;partial.entries[0].source=null;
   const r=receipt(sql(as('authenticated',A,call(partial,'partial',2))));assert.equal(r.version,3);
   assert.equal(sql(`SELECT amount_toman IS NULL AND occurred_on IS NULL AND source IS NULL FROM public.member_cash_flow_entries WHERE version_id=${quote(r.version_id)}::uuid`),'t');
   assert.equal(sql(`SELECT opening IS NULL AND coverage->'actual'->>'status'='partial' AND coverage->'planned'->>'status'='unknown' FROM public.member_cash_flow_versions WHERE id=${quote(r.version_id)}::uuid`),'t');
  });
  check('one transfer persists once; foreign endpoints and malformed same-account transfer rejected',()=>{
   const t=payload();t.entries=[{entryKey:'internal',basis:'actual',kind:'transfer',amountToman:30,occurredOn:'2026-10-20',source,category:null,note:null,fromAccountKey:'cash',toAccountKey:'bank'}];t.scopeAccountKeys=['cash'];
   const r=receipt(sql(as('authenticated',A,call(t,'transfer',3))));assert.equal(r.entry_count,1);
   assert.equal(sql(`SELECT count(*)=1 AND bool_and(kind='transfer' AND account_key IS NULL) FROM public.member_cash_flow_entries WHERE version_id=${quote(r.version_id)}::uuid`),'t');
   t.entries[0].toAccountKey='foreign';denied(as('authenticated',A,call(t,'foreign-transfer',4)),'22023');t.entries[0].toAccountKey='cash';denied(as('authenticated',A,call(t,'same-account',4)),'22023');
  });
  check('failure after header insert rolls back entire version and does not consume base',()=>{
   sql("CREATE FUNCTION public.pf2b_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic insert failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER pf2b_tripwire BEFORE INSERT ON public.member_cash_flow_entries FOR EACH ROW EXECUTE FUNCTION public.pf2b_test_failure()");
   const n=count();denied(as('authenticated',A,call(p,'tripwire',4)),'23514');assert.equal(count(),n);
   sql('DROP TRIGGER pf2b_tripwire ON public.member_cash_flow_entries; DROP FUNCTION public.pf2b_test_failure()');
  });
  const first=asyncSql(as('authenticated',A,`${call(p,'race-a',4)}; SELECT pg_sleep(2)`));
  let held=false;for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0){held=true;break;}await new Promise(r=>setTimeout(r,25));}assert.ok(held);
  const second=asyncSql(as('authenticated',A,call(p,'race-b',4)));
  let waiting=false;for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted"))>0){waiting=true;break;}await new Promise(r=>setTimeout(r,25));}assert.ok(waiting);
  const [r1,r2]=await Promise.all([first,second]);assert.equal(r1.code,0,r1.err);assert.notEqual(r2.code,0);assert.match(r2.err,/PT409/);
  check('overlapping independent sessions: same base creates exactly one version',()=>assert.equal(sql(`SELECT max(version) FROM public.member_cash_flow_versions WHERE user_id='${A}'`),'5'));
  const other=payload();other.period={startOn:'2026-11-01',endOn:'2026-11-30'};other.opening.atStartOn='2026-11-01';other.entries[0].occurredOn='2026-11-01';
  check('another period starts its own series; overlapping ranges remain separate snapshots',()=>{
   assert.equal(receipt(sql(as('authenticated',A,call(other,'november',0)))).version,1);
   const overlap=payload();overlap.period={startOn:'2026-10-01',endOn:'2026-11-01'};
   assert.equal(receipt(sql(as('authenticated',A,call(overlap,'overlap',0)))).version,1);
   assert.equal(sql(`SELECT max(version) FROM public.member_cash_flow_versions WHERE user_id='${A}' AND period_end='2026-10-31'`),'5');
  });
  const concurrentRetry=asyncSql(as('authenticated',A,`${call(p,'concurrent-retry',5)}; SELECT pg_sleep(2)`));
  for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0)break;await new Promise(r=>setTimeout(r,25));}
  const retry=asyncSql(as('authenticated',A,call(p,'concurrent-retry',5)));
  const [original,replayed]=await Promise.all([concurrentRetry,retry]);
  check('simultaneous identical token/body returns same UUID exactly once',()=>{
   assert.equal(original.code,0,original.err);assert.equal(replayed.code,0,replayed.err);
   assert.equal(receipt(original.out).version_id,receipt(replayed.out).version_id);assert.equal(receipt(replayed.out).reused,true);
   assert.equal(sql(`SELECT count(*) FROM public.member_cash_flow_versions WHERE user_id='${A}' AND client_token='concurrent-retry'`),'1');
  });
  const tokenRace=asyncSql(as('authenticated',A,`${call(p,'ownerwide-token',6)}; SELECT pg_sleep(2)`));
  for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0)break;await new Promise(r=>setTimeout(r,25));}
  const wrongPeriod=asyncSql(as('authenticated',A,call(other,'ownerwide-token',1)));
  const [won,lost]=await Promise.all([tokenRace,wrongPeriod]);
  check('ownerwide same-token race across periods conflicts instead of duplicate or unique-error fallback',()=>{
   assert.equal(won.code,0,won.err);assert.notEqual(lost.code,0);assert.match(lost.err,/PT409/);
   assert.equal(sql(`SELECT count(*) FROM public.member_cash_flow_versions WHERE user_id='${A}' AND client_token='ownerwide-token'`),'1');
  });
  check('accepted boundary limits: 366 days,50 definitions,500 events,160 label,2000 note',()=>{
   const max=payload();max.period={startOn:'2024-01-01',endOn:'2024-12-31'};max.opening.atStartOn='2024-01-01';
   max.accountDefinitions=Array.from({length:50},(_,i)=>({accountKey:`a${i}`,label:'x'.repeat(160)}));max.scopeAccountKeys=max.accountDefinitions.map(x=>x.accountKey);
   max.entries=Array.from({length:500},(_,i)=>event({entryKey:`e${i}`,accountKey:'a0',occurredOn:'2024-01-01',note:i===0?'x'.repeat(2000):null}));
   const r=receipt(sql(as('authenticated',A,call(max,'max-valid',0))));assert.equal(r.entry_count,500);
  });
  check('rollback refuses absent marker then restores exact existing schema/functions/ACL inventory',()=>{
   denied(rollback,'rollback requires owned synthetic lab');
   sql("SELECT set_config('portfolio.pf2b_lab_marker','pf2b-isolated-20261020',false);"+rollback);
   assert.equal(sql(inventory),before);assert.equal(sql("SELECT to_regnamespace('cash_flow_private') IS NULL"),'t');
  });
 }
 console.log(JSON.stringify({summary:{passed:results.length,failed:0},results,limitations:['SQL claims fixture; not native Auth/PostgREST acceptance','No operational installation or app/API/UI writes','Only local owned synthetic databases']}));
}catch(error){console.error(error);process.exitCode=1;}finally{
 if(ciLocal)for(const db of ownedDatabases){database=db;attestDatabase();localSql('postgres',`DROP DATABASE ${db} WITH (FORCE)`);console.log(JSON.stringify({cleanup:{database:db,ownedMarkerVerified:true,removed:true}}));}
 if(created){attest(inspect());docker(['rm','-f',name]);console.log(JSON.stringify({cleanup:{container:name,removed:true}}));}
}
