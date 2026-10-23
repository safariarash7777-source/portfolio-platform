/** Derived from the existing desk-preferences owned-PG harness.
 * Cached PG17 only; no network/ports/host mounts, secrets, JWT minting or live DB.
 * SQL claims fixture proves DB ownership/RLS, not native Auth/PostgREST verification.
 * Run: node scripts/testing/goals/run.mjs
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const migration=readFileSync(new URL('../../../sql/member_goals_versions_20261023.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../../sql/test/supabase_bootstrap.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('./rollback.sql',import.meta.url),'utf8');
const token=randomUUID(), name=`goals-test-${token}`;
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
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
const quote=x=>`'${(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")}'`;
const as=(role,id,q)=>`BEGIN; SELECT set_config('request.jwt.claims',${quote(id?{sub:id,role}:{role})},true); SET LOCAL ROLE ${role}; ${q}; COMMIT;`;
const call=(p,t,b)=>`SELECT public.record_member_goals(${quote(p)}::jsonb,${quote(t)},${b})`;
const source={label:'اعلام آزمایشی عضو',observedOn:'2026-10-23'};
function payload(){return {contractVersion:1,goals:[{goalKey:'reserve',title:'ذخیره ساختگی',targetAmountToman:1000,targetOn:'2027-01-01',declaredSavedToman:100,source:{...source},note:null}]};}
function receipt(out){return out.split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(x=>x?.contractVersion==='goals-write.v1');}
function denied(query,state){assert.throws(()=>sql(query),e=>String(e).includes(state));}
function check(label,fn){fn();results.push({profile:database,name:label,status:'PASS'});console.log(`PASS ${database}: ${label}`);}
function count(){return Number(sql('SELECT count(*) FROM public.member_goals_versions'));}
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
  database='postgres';sql(`CREATE DATABASE goals_${profile}`);
  if(ciLocal){ownedDatabases.add(`goals_${profile}`);localSql('postgres',`COMMENT ON DATABASE goals_${profile} IS 'pf3-test:${token}'`);}
  database=`goals_${profile}`;
  sql(bootstrap);sql(readFileSync(new URL(`../../../sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`,import.meta.url),'utf8'));
  sql(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}')`);const before=sql(inventory);sql(migration);
  check('forced owner RLS; private helpers and elevated/direct writes closed',()=>{
   assert.equal(sql("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.member_goals_versions'::regclass"),'t');
   for(const role of ['anon','service_role'])assert.equal(sql(`SELECT has_function_privilege('${role}','public.record_member_goals(jsonb,text,integer)','EXECUTE')`),'f');
   for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`SELECT has_schema_privilege('${role}','goals_private','USAGE')`),'f');
   for(const role of ['anon','authenticated','service_role'])for(const op of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal(sql(`SELECT has_table_privilege('${role}','public.member_goals_versions','${op}')`),'f');
   assert.equal(sql("SELECT bool_and(proconfig @> ARRAY['search_path=\"\"']) FROM pg_proc WHERE pronamespace='goals_private'::regnamespace"),'t');
  });
  const p=payload();let one,two;
  check('append and owner-only independent read; B own series',()=>{
   one=receipt(sql(as('authenticated',A,call(p,'first',0))));assert.equal(one.version,1);assert.equal(one.goal_count,1);assert.equal(one.reused,false);
   assert.equal(sql(as('authenticated',A,'SELECT count(*) FROM public.member_goals_versions')).split('\n').at(-1),'1');
   assert.equal(sql(as('authenticated',B,'SELECT count(*) FROM public.member_goals_versions')).split('\n').at(-1),'0');
   assert.equal(receipt(sql(as('authenticated',B,call(p,'first',0)))).version,1);
  });
  check('identical replay does not duplicate; token/body/base conflict rejects',()=>{
   const r=receipt(sql(as('authenticated',A,call(p,'first',0))));assert.equal(r.version_id,one.version_id);assert.equal(r.reused,true);assert.equal(count(),2);
   const changed=payload();changed.goals[0].declaredSavedToman=200;denied(as('authenticated',A,call(changed,'first',0)),'PT409');denied(as('authenticated',A,call(p,'first',1)),'PT409');
   denied(as('authenticated',A,call(p,'stale',0)),'PT409');assert.equal(count(),2);
  });
  check('v2 preserves v1; empty list is explicit removal snapshot',()=>{
   const changed=payload();changed.goals[0].targetAmountToman=2000;
   two=receipt(sql(as('authenticated',A,call(changed,'second',1))));assert.equal(two.version,2);
   assert.equal(sql(`SELECT payload->'goals'->0->>'targetAmountToman' FROM public.member_goals_versions WHERE id=${quote(one.version_id)}::uuid`),'1000');
   assert.equal(receipt(sql(as('authenticated',A,call({contractVersion:1,goals:[]},'clear',2)))).goal_count,0);
  });
  check('invalid dates/overflow/fractions/duplicates/unknown source/forged keys rejected',()=>{
   const mutations=[p=>p.goals[0].title='\t',p=>p.goals[0].goalKey='\u00a0',p=>p.goals[0].source.label='\tunknown\t',p=>p.goals[0].targetOn='2026-02-30',p=>p.goals[0].targetOn='0000-01-01',p=>p.goals[0].targetAmountToman=0,p=>p.goals[0].targetAmountToman=9007199254740992,p=>p.goals[0].declaredSavedToman=0.5,p=>p.goals[0].declaredSavedToman=-1,p=>p.goals[0].source=null,p=>p.goals[0].source.label='unknown',p=>p.goals.push({...p.goals[0]}),p=>p.goals[0].user_id=B,p=>p.user_id=B,p=>p.goals=Array.from({length:51},(_,i)=>({...p.goals[0],goalKey:String(i)})),p=>p.goals[0].note='x'.repeat(2001)];
   const before=count();for(const mutate of mutations){const bad=payload();mutate(bad);denied(as('authenticated',A,call(bad,'invalid',3)),'22');}assert.equal(count(),before);
  });
  check('null saved amount remains null; maximum safe integers retained',()=>{
   const unknown=payload();unknown.goals[0].declaredSavedToman=null;unknown.goals[0].source=null;unknown.goals[0].targetAmountToman=9007199254740991;
   const r=receipt(sql(as('authenticated',A,call(unknown,'unknown',3))));assert.equal(r.version,4);
   assert.equal(sql(`SELECT payload->'goals'->0->'declaredSavedToman' FROM public.member_goals_versions WHERE id=${quote(r.version_id)}::uuid`),'null');
  });
  check('unauthenticated RPC and all historical mutation rejected even privileged',()=>{
   denied(as('authenticated',null,call(p,'no-user',0)),'42501');denied(as('anon',null,call(p,'anon',0)),'42501');
   denied('UPDATE public.member_goals_versions SET version=99','42501');denied('DELETE FROM public.member_goals_versions','42501');denied('TRUNCATE public.member_goals_versions','42501');
  });
  const first=asyncSql(as('authenticated',A,`${call(p,'race-a',4)}; SELECT pg_sleep(2)`));
  let held=false;for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0){held=true;break;}await new Promise(r=>setTimeout(r,25));}assert.ok(held);
  const second=asyncSql(as('authenticated',A,call(p,'race-b',4)));
  const [r1,r2]=await Promise.all([first,second]);
  check('independent concurrent sessions allow exactly one same-base writer',()=>{assert.equal(r1.code,0,r1.err);assert.notEqual(r2.code,0);assert.match(r2.err,/PT409/);assert.equal(sql(`SELECT max(version) FROM public.member_goals_versions WHERE user_id='${A}'`),'5');});
  const original=asyncSql(as('authenticated',A,`${call(p,'retry-race',5)}; SELECT pg_sleep(2)`));
  for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))>0)break;await new Promise(r=>setTimeout(r,25));}
  const retry=asyncSql(as('authenticated',A,call(p,'retry-race',5)));
  const [r3,r4]=await Promise.all([original,retry]);
  check('concurrent exact retry returns same id once',()=>{assert.equal(r3.code,0,r3.err);assert.equal(r4.code,0,r4.err);assert.equal(receipt(r3.out).version_id,receipt(r4.out).version_id);assert.equal(receipt(r4.out).reused,true);});
  check('installer collision fails closed',()=>denied(migration,'55000'));
  check('lab rollback requires marker and preserves prior inventory',()=>{
   denied(rollback,'rollback requires owned synthetic lab');sql("SELECT set_config('portfolio.pf3_lab_marker','pf3-isolated-20261023',false);"+rollback);assert.equal(sql(inventory),before);
  });
 }
 console.log(JSON.stringify({summary:{passed:results.length,failed:0},results,limitations:['SQL claims fixture; not native Auth/PostgREST acceptance','No operational installation or app/API/UI writes','Only local owned synthetic databases']}));
}catch(error){console.error(error);process.exitCode=1;}finally{
 if(ciLocal)for(const db of ownedDatabases){database=db;attestDatabase();localSql('postgres',`DROP DATABASE ${db} WITH (FORCE)`);console.log(JSON.stringify({cleanup:{database:db,ownedMarkerVerified:true,removed:true}}));}
 if(created){attest(inspect());docker(['rm','-f',name]);console.log(JSON.stringify({cleanup:{container:name,removed:true}}));}
}
