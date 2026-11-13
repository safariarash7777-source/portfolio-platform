/** Disposable cached PostgreSQL17 only. Never reads .env or connects to a live DB.
 * SQL role/claim fixtures prove access logic, not native Auth/PostgREST acceptance. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const image='sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const token=randomUUID(),name=`consultation-roster-${token}`;
const ciLocal=process.argv.includes('--ci-local'),ownedDatabases=new Set();
assert.ok(process.argv.slice(2).every(x=>x==='--ci-local'),'unknown test option');
if(ciLocal){
 assert.ok(process.env.GITHUB_ACTIONS==='true'&&process.env.CI==='true','explicit disposable GitHub CI required');
 assert.ok(process.env.PGHOST==='127.0.0.1'&&process.env.PGPORT==='5433'&&process.env.PGUSER==='postgres'&&process.env.PGPASSWORD==='postgres','fixed synthetic CI loopback service only');
 assert.ok(!process.env.PGSERVICE&&!process.env.PGSERVICEFILE&&!process.env.PGHOSTADDR,'indirect connections forbidden');
}
let created=false,database='postgres';const results=[];
const file=p=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const rosterMigration=file('sql/consultation_roster.sql');
function docker(args,input){const r=spawnSync('docker',args,{cwd:root,input,encoding:'utf8',timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();}
function attest(){const c=JSON.parse(docker(['inspect',name]))[0];assert.equal(c.Name,`/${name}`);assert.equal(c.Config.Labels['arash.test.owner'],token);assert.equal(c.Image,image);assert.equal(c.HostConfig.NetworkMode,'none');assert.equal(c.HostConfig.ReadonlyRootfs,true);assert.deepEqual(c.HostConfig.Binds||[],[]);assert.ok(c.Mounts.every(m=>m.Type==='tmpfs'));assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);assert.equal(Object.keys(c.NetworkSettings.Ports||{}).length,0);}
const args=()=>['exec','-i',name,'psql','-XqAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
const localArgs=db=>['-XqAt','-h','127.0.0.1','-p','5433','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
function localSql(db,q){const r=spawnSync('psql',localArgs(db),{input:q,encoding:'utf8',timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();}
function attestDatabase(){assert.ok(ownedDatabases.has(database));assert.equal(localSql('postgres',`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${database}'`),`roster-test:${token}`);}
function sql(q){if(ciLocal){if(database!=='postgres')attestDatabase();return localSql(database,q);}attest();return docker(args(),q);}
function asyncSql(q){if(ciLocal)attestDatabase();else attest();return new Promise((resolve,reject)=>{const c=spawn(ciLocal?'psql':'docker',ciLocal?localArgs(database):args(),{cwd:root,stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>c.kill(),20000);c.stdout.on('data',s=>out+=s);c.stderr.on('data',s=>err+=s);c.on('error',e=>{clearTimeout(timer);reject(e);});c.on('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error(err));else resolve(out.trim());});c.stdin.end(q);});}
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=uid(1),B=uid(2),O=uid(3),X=uid(4),Y=uid(5);
const quote=x=>`'${(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")}'`;
const as=(role,id,q)=>`BEGIN;SELECT set_config('request.jwt.claims',${quote(id?{sub:id,role}:{role})},true);SET LOCAL ROLE ${role};${q};COMMIT;`;
const rpc="SELECT public.load_consultation_roster('2026-10-01','2026-10-31')";
const pick=s=>s.split('\n').map(x=>{try{return JSON.parse(x);}catch{return null;}}).find(x=>x?.contractVersion==='consultation-roster.v1');
const read=(actor=O)=>pick(sql(as('authenticated',actor,rpc)));
const denied=(q,state)=>assert.throws(()=>sql(q),e=>String(e).includes(state));
const check=(label,fn)=>{fn();results.push(label);console.log(`PASS ${database}: ${label}`);};
function grant(client,label='SYNTHETIC'){const request={contractVersion:'consultation-request.v1',expectedActorId:client,clientToken:randomUUID(),command:{kind:'grant',advisorId:O,clientLabel:label}};sql(as('authenticated',client,`SELECT public.command_consultation(${quote(request)}::jsonb)`));return read().rows.find(r=>r.clientId===client).relationshipId;}
function revoke(client,relationshipId){const request={contractVersion:'consultation-request.v1',expectedActorId:client,clientToken:randomUUID(),command:{kind:'revoke',relationshipId}};sql(as('authenticated',client,`SELECT public.command_consultation(${quote(request)}::jsonb)`));}
async function waitLock(mode){for(let i=0;i<40;i++){if(sql(`SELECT count(*) FROM pg_locks WHERE relation='public.risk_assessments'::regclass AND mode='${mode}' AND ${mode==='AccessExclusiveLock'?'granted':'NOT granted'}`)!=='0')return;await new Promise(r=>setTimeout(r,50));}throw Error('test lock not observed');}
try{
 if(!ciLocal){
 assert.equal(docker(['image','inspect','postgres:17-alpine','--format','{{.Id}}']),image);
 docker(['create','--pull','never','--name',name,'--label',`arash.test.owner=${token}`,'--network','none','--read-only','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456','--tmpfs','/var/run/postgresql:rw,noexec,nosuid,size=16777216','--tmpfs','/tmp:rw,noexec,nosuid,size=16777216','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;attest();docker(['start',name]);
 let ready=false;for(let i=0;i<60;i++){const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});const p=spawnSync('docker',['exec',name,'cat','/proc/1/comm'],{encoding:'utf8'});if(r.status===0&&p.stdout.trim()==='postgres'){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
 }
 for(const profile of ['explicit','legacy']){
  database='postgres';const dbName=`roster_${profile}_${token.replaceAll('-','')}`;sql(`CREATE DATABASE ${dbName}`);
  if(ciLocal){ownedDatabases.add(dbName);localSql('postgres',`COMMENT ON DATABASE ${dbName} IS 'roster-test:${token}'`);}
  database=dbName;
  for(const f of ['sql/test/supabase_bootstrap.sql',`sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`,'sql/test/portfolio_precondition.sql','sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20261019215549_personal_cash_flow_versions.sql','sql/member_goals_versions_20261023.sql','sql/consultation_workflow.sql'])sql(file(f));
  sql(`CREATE TABLE public.risk_assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,total_score integer NOT NULL,risk_category text NOT NULL,answers_json jsonb,created_at timestamptz NOT NULL DEFAULT now());CREATE INDEX ON public.risk_assessments(user_id,created_at DESC);CREATE TABLE public.risk_revalidations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,expired_at timestamptz NOT NULL DEFAULT now(),reason text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now());CREATE INDEX ON public.risk_revalidations(user_id,expired_at DESC);ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;ALTER TABLE public.risk_revalidations ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.risk_assessments,public.risk_revalidations FROM PUBLIC,anon,authenticated,service_role;`);
  sql(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${O}'),('${X}'),('${Y}');INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${O}','admin'),('${X}','admin'),('${Y}','admin');INSERT INTO public.consultation_advisors(user_id,display_name,is_owner) VALUES('${O}','SYNTHETIC OWNER',true),('${Y}','UNRELATED ADVISOR',false);`);
  sql(rosterMigration);
  check('additive install refuses collision; ACL closes anonymous/service role',()=>{denied(rosterMigration,'55000');for(const role of ['anon','service_role'])assert.equal(sql(`SELECT has_function_privilege('${role}','public.load_consultation_roster(date,date)','EXECUTE')`),'f');});
  check('member, unrelated admin and null actor forbidden; authorized empty distinct',()=>{for(const actor of [A,B,X,null])denied(as('authenticated',actor,rpc),'42501');assert.equal(read(Y).totalAuthorized,0);assert.equal(read().rows.length,0);});
  const relationA=grant(A,'ALLOWED_A');const relationB=grant(B,'ALLOWED_B');
  check('consent roster isolated from unrelated enabled advisor and no questionnaire data',()=>{assert.equal(read().totalAuthorized,2);assert.equal(read(Y).rows.length,0);assert.ok(read().rows.every(r=>r.assetValue.totalToman===null&&r.missingCodes.includes('holdings_not_recorded')));});
  sql(`INSERT INTO public.risk_assessments(user_id,total_score,risk_category,answers_json,created_at) VALUES('${A}',55,'متعادل','{"PRIVATE_CANARY":"not exported"}',now()-interval '10 days'),('${B}',55,'متعادل','{}',now()-interval '181 days');`);
  check('latest real assessment, 180-day expiry and forced expiry use sources',()=>{const out=read();assert.equal(out.rows.find(r=>r.clientId===A).risk.state,'current');assert.equal(out.rows.find(r=>r.clientId===B).risk.state,'expired');assert.ok(!JSON.stringify(out).includes('PRIVATE_CANARY'));assert.ok(!JSON.stringify(out).includes('total_score'));sql(`INSERT INTO public.risk_revalidations(user_id,expired_at) VALUES('${A}',now()-interval '1 day'),('${A}',now()+interval '1 day')`);const r=read().rows.find(r=>r.clientId===A);assert.equal(r.risk.state,'expired');assert.ok(Date.parse(r.risk.forcedExpiredAt)<=Date.now());});
  check('same-time latest assessments ambiguous and future/unknown categories invalid',()=>{sql(`INSERT INTO public.risk_assessments(user_id,total_score,risk_category,created_at) VALUES('${A}',55,'متعادل',now()-interval '1 hour'),('${A}',90,'تهاجمی',now()-interval '1 hour')`);assert.equal(read().rows.find(r=>r.clientId===A).risk.state,'ambiguous');sql(`INSERT INTO public.risk_assessments(user_id,total_score,risk_category,created_at) VALUES('${B}',55,'UNKNOWN',now()-interval '1 hour')`);assert.equal(read().rows.find(r=>r.clientId===B).risk.state,'invalid');sql(`INSERT INTO public.risk_assessments(user_id,total_score,risk_category,created_at) VALUES('${B}',55,'متعادل',now()+interval '1 day')`);assert.equal(read().rows.find(r=>r.clientId===B).risk.category,null);});
  check('canonical holdings empty differs from absent; no invented asset valuation',()=>{sql(as('authenticated',A,"SELECT * FROM public.record_member_holdings('[]'::jsonb,NULL,'synthetic-empty',0)"));const r=read().rows.find(r=>r.clientId===A);assert.equal(r.holdings.state,'empty');assert.ok(r.holdings.versionId);assert.equal(r.assetValue.totalToman,null);assert.equal(read().capabilities.assetValueRange,false);});
  check('cash-flow period exact and canonical goals empty are presence, not completeness',()=>{
   sql(as('authenticated',A,`SELECT public.record_member_goals('{"contractVersion":1,"goals":[]}'::jsonb,'synthetic-empty-goals',0)`));
   const cash={contractVersion:1,period:{startOn:'2026-09-01',endOn:'2026-09-30'},accountDefinitions:[{accountKey:'cash',label:'Synthetic cash'}],scopeAccountKeys:['cash'],opening:{amountToman:null,atStartOn:'2026-09-01',source:null},coverage:{planned:{status:'unknown',memberAffirmed:false,source:null},actual:{status:'unknown',memberAffirmed:false,source:null}},entries:[]};
   sql(as('authenticated',A,`SELECT public.record_member_cash_flow(${quote(cash)}::jsonb,'synthetic-september',0)`));
   assert.equal(read().rows.find(r=>r.clientId===A).cashFlow.state,'not_recorded');
   const previous=pick(sql(as('authenticated',O,"SELECT public.load_consultation_roster('2026-09-01','2026-09-30')"))).rows.find(r=>r.clientId===A);
   assert.equal(previous.cashFlow.state,'recorded');assert.equal(previous.goals.state,'empty');assert.ok(previous.missingCodes.includes('goals_empty'));assert.equal(previous.assetValue.totalToman,null);
  });
  check('date pair and invalid period rejected directly at RPC',()=>{denied(as('authenticated',O,"SELECT public.load_consultation_roster('2026-10-01',null)"),'22023');denied(as('authenticated',O,"SELECT public.load_consultation_roster('2026-10-31','2026-10-01')"),'22023');});
  writeFileSync(new URL(`./fixture-${profile}.json`,import.meta.url),JSON.stringify(read(),null,2)+'\n');
  // Pause a real reader on risk table lock, revoke after it has begun. Recheck must remove A and recompute count.
  const lock=asyncSql("BEGIN;LOCK public.risk_assessments IN ACCESS EXCLUSIVE MODE;SELECT pg_sleep(5);COMMIT;");await waitLock('AccessExclusiveLock');const reading=asyncSql(as('authenticated',O,rpc));await waitLock('AccessShareLock');revoke(A,relationA);await lock;const after=pick(await reading);assert.equal(after.totalAuthorized,1);assert.equal(after.rows.length,1);assert.equal(after.rows[0].clientId,B);results.push('concurrent revoke');console.log(`PASS ${database}: concurrent revoke removes row and count`);
  const lock2=asyncSql("BEGIN;LOCK public.risk_assessments IN ACCESS EXCLUSIVE MODE;SELECT pg_sleep(5);COMMIT;");await waitLock('AccessExclusiveLock');const disabled=asyncSql(as('authenticated',O,rpc)).then(()=>({ok:true}),e=>({ok:false,error:String(e)}));await waitLock('AccessShareLock');sql(`UPDATE public.consultation_advisors SET enabled=false WHERE user_id='${O}'`);await lock2;const failure=await disabled;assert.equal(failure.ok,false);assert.ok(failure.error.includes('42501'));results.push('concurrent disable');console.log(`PASS ${database}: concurrent advisor disable fails closed`);
  check('disabled advisor denied on subsequent requests',()=>denied(as('authenticated',O,rpc),'42501'));
  sql(`UPDATE public.consultation_advisors SET enabled=true WHERE user_id='${O}'`);revoke(B,relationB);assert.equal(read().totalAuthorized,0);
  check('authorized relation limit fails rather than silently truncating',()=>{sql(`INSERT INTO auth.users(id) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,101)n;INSERT INTO public.consultation_relationships(client_id,advisor_id,client_label) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${O}','SYNTHETIC BOUND' FROM generate_series(1,101)n;`);denied(as('authenticated',O,rpc),'54000');assert.equal(read(Y).totalAuthorized,0);});
 }
 assert.equal(file('sql/consultation_roster.sql'),rosterMigration,'migration changed during test run');
 const receipt={status:'PASS',checkedAt:new Date().toISOString(),checks:results.length,results,transport:ciLocal?'explicit disposable CI PG':'owned isolated PG17',nativeAuth:false,installed:false,migrationSha256:createHash('sha256').update(rosterMigration).digest('hex')};
 writeFileSync(new URL('./receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{
 if(created){attest();docker(['rm','-f',name]);}
 if(ciLocal)for(const dbName of ownedDatabases){database=dbName;attestDatabase();localSql('postgres',`DROP DATABASE ${dbName} WITH (FORCE)`);}
}
