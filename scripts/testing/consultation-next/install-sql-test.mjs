/** Derived from the existing desk-preferences owned-PG harness.
 * Cached PG17 only; no network/ports/host mounts, secrets, JWT minting or live DB.
 * SQL claims fixture proves DB ownership/RLS, not native Auth/PostgREST verification.
 * Run: node scripts/testing/consultation-next/install-sql-test.mjs [--ci-local]
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const migration=readFileSync(new URL('../../../sql/consultation_workflow.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../../sql/test/supabase_bootstrap.sql',import.meta.url),'utf8');
const replyMigration=readFileSync(new URL('../../../sql/consultation_replies.sql',import.meta.url),'utf8');
const token=randomUUID(), name=`consultation-install-test-${token}`;
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
const fixtureResult=spawnSync(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),[fileURLToPath(new URL('./install-fixtures.py',import.meta.url))],{encoding:'utf8',timeout:10000});
assert.equal(fixtureResult.status,0,fixtureResult.stderr);const installFixture=JSON.parse(fixtureResult.stdout);
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
 console.log(JSON.stringify({attestation:{container:name,image,network:'none',ports:[],persistentMounts:[],readOnlyRoot:true,migrationSha256:createHash('sha256').update(migration).digest('hex'),replyMigrationSha256:createHash('sha256').update(replyMigration).digest('hex'),server:sql('SELECT version()')}}));
 }else{
  assert.equal(localSql('postgres','SELECT current_database()'),'postgres');
  console.log(JSON.stringify({attestation:{transport:'explicit-GitHub-disposable-PG',host:'127.0.0.1',port:5433,migrationSha256:createHash('sha256').update(migration).digest('hex'),replyMigrationSha256:createHash('sha256').update(replyMigration).digest('hex'),server:localSql('postgres','SELECT version()')}}));
 }
 for(const profile of ['explicit','legacy']){
  database='postgres';sql(`CREATE DATABASE consultation_install_${profile}`);
  if(ciLocal){ownedDatabases.add(`consultation_install_${profile}`);localSql('postgres',`COMMENT ON DATABASE consultation_install_${profile} IS 'pf3-test:${token}'`);}
  database=`consultation_install_${profile}`;
  sql(bootstrap);sql(readFileSync(new URL(`../../../sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`,import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../../sql/test/portfolio_precondition.sql',import.meta.url),'utf8'));
  for(const file of ['sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20261019215549_personal_cash_flow_versions.sql','sql/member_goals_versions_20261023.sql'])sql(readFileSync(new URL('../../../'+file,import.meta.url),'utf8'));
  sql(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${O}'),('${X}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${O}','admin'),('${X}','admin')`);


  sql(migration);
  sql(`CREATE TABLE public.risk_assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,total_score integer NOT NULL,risk_category text NOT NULL,answers_json jsonb,created_at timestamptz NOT NULL DEFAULT now());CREATE TABLE public.risk_revalidations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,expired_at timestamptz NOT NULL DEFAULT now(),reason text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now());ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;ALTER TABLE public.risk_revalidations ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.risk_assessments,public.risk_revalidations FROM PUBLIC,anon,authenticated,service_role;`);
  check('installer preflight requires clean additive namespace and baseline',()=>assert.deepEqual(Object.values(JSON.parse(sql(installFixture.preflight))),[true,true,true]));
  const before=JSON.parse(sql(installFixture.inventory));
  sql(installFixture.payload);
  check('atomic combined install preserves all preexisting catalog tuples and function ACLs',()=>assert.deepEqual(JSON.parse(sql(installFixture.inventory)),before));
  check('all eight installer postconditions hold in real isolated PostgreSQL',()=>{
   const checks=JSON.parse(sql(installFixture.checks));assert.equal(Object.keys(checks).length,8);assert.ok(Object.values(checks).every(v=>v===true),JSON.stringify(checks));
  });
  check('second install fails collision and leaves baseline unchanged',()=>{
   const preflight=JSON.parse(sql(installFixture.preflight));assert.equal(preflight.noRelations,false);assert.equal(preflight.noFunctions,false);
   denied(installFixture.payload,'55000');assert.deepEqual(JSON.parse(sql(installFixture.inventory)),before);
  });
 }
 console.log(JSON.stringify({summary:{passed:results.length,failed:0},results,limitations:['Owned synthetic PostgreSQL only','Installer OS/attestation actions covered by separate mocks','No SSH or operational access']}));
}catch(error){console.error(error);process.exitCode=1;}finally{
 if(ciLocal)for(const db of ownedDatabases){database=db;attestDatabase();localSql('postgres',`DROP DATABASE ${db} WITH (FORCE)`);console.log(JSON.stringify({cleanup:{database:db,ownedMarkerVerified:true,removed:true}}));}
 if(created){attest(inspect());docker(['rm','-f',name]);console.log(JSON.stringify({cleanup:{container:name,removed:true}}));}
}
