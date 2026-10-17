/** Owned disposable PostgreSQL only. Uses cached image, no network, ports or persistent mounts.
 * Run: node scripts/testing/desk-preferences/run.mjs
 * Tests PostgreSQL authorization/CAS, not PostgREST JWT verification or production installation.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const migration=readFileSync(new URL('../../../sql/admin_desk_account_preferences_20261017.sql',import.meta.url),'utf8');
const fixture=readFileSync(new URL('./fixture.sql',import.meta.url),'utf8');
const token=randomUUID();
const name=`desk-preferences-test-${token}`;
const expectedImage='sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const results=[];
let created=false;
const args=['exec','-i',name,'psql','-X','-At','-U','postgres','-d','desk_fixture','-v','ON_ERROR_STOP=1'];
function docker(argv,input) {
  const r=spawnSync('docker',argv,{input,encoding:'utf8',cwd:root,timeout:30000});
  if(r.error)throw r.error;
  if(r.status!==0)throw new Error(`docker ${argv[0]} failed: ${r.stderr||r.stdout}`);
  return r.stdout.trim();
}
function sql(query){return docker(args,query);}
function inspect(){return JSON.parse(docker(['inspect',name]))[0];}
function attest(c){
  assert.equal(c.Name,`/${name}`); assert.equal(c.Config.Labels['arash.test.owner'],token);
  assert.equal(c.Image,expectedImage); assert.equal(c.HostConfig.NetworkMode,'none');
  assert.equal(c.HostConfig.ReadonlyRootfs,true);
  assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);
  assert.equal(Object.keys(c.NetworkSettings.Ports||{}).length,0);
  assert.deepEqual(c.HostConfig.Binds||[],[]);
  assert.ok(c.Mounts.every(m=>m.Type==='tmpfs'),'persistent/host mount forbidden');
  assert.ok(Object.keys(c.NetworkSettings.Networks||{}).every(n=>n==='none'));
}
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const M='00000000-0000-4000-8000-000000000003';
function as(role,actor,query){return `BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${actor}',true); ${query}; COMMIT;`;}
function check(name,query){sql(query);results.push({name,status:'PASS'});console.log(`PASS ${name}`);}
function expectError(query,state){return `DO $test$ BEGIN BEGIN ${query}; EXCEPTION WHEN SQLSTATE '${state}' THEN RETURN; END; RAISE EXCEPTION 'expected SQLSTATE ${state}'; END $test$`;}
function must(condition){return `DO $test$ BEGIN IF NOT (${condition}) THEN RAISE EXCEPTION 'assertion failed'; END IF; END $test$`;}
function asyncSql(query){return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe'],cwd:root});let out='',err='';
  child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);
  child.on('exit',code=>resolve({code,out,err}));child.stdin.end(query);
});}
try {
  assert.equal(docker(['image','inspect','postgres:17-alpine','--format','{{.Id}}']),expectedImage,'cached image drift');
  docker(['create','--pull','never','--name',name,'--label',`arash.test.owner=${token}`,'--network','none','--read-only',
    '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456',
    '--tmpfs','/var/run/postgresql:rw,noexec,nosuid,size=16777216','--tmpfs','/tmp:rw,noexec,nosuid,size=16777216',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=desk_fixture',expectedImage]);
  created=true;attest(inspect());
  console.log(JSON.stringify({attestation:{container:name,image:expectedImage,network:'none',ports:[],persistentMounts:[],readOnlyRoot:true,migrationSha256:createHash('sha256').update(migration).digest('hex')}}));
  docker(['start',name]);
  let ready=false;
  for(let i=0;i<50;i++){
    const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres','-d','desk_fixture'],{encoding:'utf8'});
    // Official image briefly starts a temporary bootstrap server. PID 1 becomes
    // postgres only after that server shuts down and initialization completes.
    const pid1=spawnSync('docker',['exec',name,'cat','/proc/1/comm'],{encoding:'utf8'});
    if(r.status===0 && pid1.stdout.trim()==='postgres'){ready=true;break;} await new Promise(r=>setTimeout(r,200));
  }
  assert.ok(ready,'isolated postgres failed readiness');attest(inspect());
  console.log(sql('SELECT current_database(), current_user, version();'));
  sql(fixture);sql(migration);
  check('admin A default receipt',as('authenticated',A,must(`(public.get_admin_desk_preferences()->>'revision')::bigint=0 AND public.get_admin_desk_preferences()->'preferences'->>'layout'='1'`)));
  check('admin A own append/read',as('authenticated',A,`SELECT public.save_admin_desk_preferences(1,2,ARRAY['alerts'],0); ${must(`(SELECT count(*)=1 AND bool_and(actor_id='${A}') FROM public.admin_desk_preference_versions) AND public.get_admin_desk_preferences()->'preferences'->>'layout'='2'`)}`));
  check('admin B cannot read A; independent write',as('authenticated',B,`${must(`(SELECT count(*)=0 FROM public.admin_desk_preference_versions) AND public.get_admin_desk_preferences()->>'revision'='0'`)}; SELECT public.save_admin_desk_preferences(1,3,ARRAY['reports'],0); ${must(`(SELECT count(*)=1 AND bool_and(actor_id='${B}') FROM public.admin_desk_preference_versions)`)}`));
  for(const [role,actor]of [['authenticated',M],['authenticated',''],['anon','']]){
    check(`${role} ${actor===M?'member':'no actor'} RPC denial`,as(role,actor,`${expectError('PERFORM public.get_admin_desk_preferences()','42501')}; ${expectError('PERFORM public.save_admin_desk_preferences(1,1,ARRAY[]::text[],0)','42501')}`));
  }
  check('ordinary member sees no history',as('authenticated',M,must('(SELECT count(*)=0 FROM public.admin_desk_preference_versions)')));
  check('forged role/app metadata cannot elevate member',as('authenticated',M,`SELECT set_config('request.jwt.claim.role','admin',true); SELECT set_config('request.jwt.claims','{"role":"admin","actor_id":"${A}","app_metadata":{"role":"admin"}}',true); ${expectError('PERFORM public.get_admin_desk_preferences()','42501')}; ${expectError('PERFORM public.save_admin_desk_preferences(1,1,ARRAY[]::text[],0)','42501')}`));
  check('forged actor/role RPC args have no overload',as('authenticated',A,`${expectError(`PERFORM public.save_admin_desk_preferences(p_schema_version=>1,p_layout=>1,p_hidden_tools=>ARRAY[]::text[],p_expected_revision=>1,p_actor_id=>'${B}'::uuid)`,'42883')}; ${expectError(`PERFORM public.get_admin_desk_preferences(p_role=>'admin')`,'42883')}`));
  for(const role of ['anon','authenticated','service_role']){
    check(`${role} direct table/sequence writes revoked`,as(role,A,`${expectError(`INSERT INTO public.admin_desk_preference_versions(actor_id,schema_version,layout) VALUES('${B}',1,1)`,'42501')}; ${expectError('UPDATE public.admin_desk_preference_versions SET layout=1','42501')}; ${expectError('DELETE FROM public.admin_desk_preference_versions','42501')}; ${expectError('TRUNCATE public.admin_desk_preference_versions','42501')}; ${expectError(`PERFORM nextval('public.admin_desk_preference_versions_revision_seq')`,'42501')}; ${expectError(`PERFORM setval('public.admin_desk_preference_versions_revision_seq',999)`,'42501')}`));
  }
  check('anon and service role cannot read table/RPC',`${as('anon','',expectError('PERFORM 1 FROM public.admin_desk_preference_versions','42501'))} ${as('service_role',A,`${expectError('PERFORM 1 FROM public.admin_desk_preference_versions','42501')}; ${expectError('PERFORM public.get_admin_desk_preferences()','42501')}`)}`);
  check('append-only triggers protect even fixture owner',`${expectError('UPDATE public.admin_desk_preference_versions SET layout=1','42501')}; ${expectError('DELETE FROM public.admin_desk_preference_versions','42501')}; ${expectError('TRUNCATE public.admin_desk_preference_versions','42501')}`);
  check('stale CAS leaves latest intact',as('authenticated',A,`${expectError('PERFORM public.save_admin_desk_preferences(1,3,ARRAY[]::text[],0)','40001')}; ${must(`public.get_admin_desk_preferences()->'preferences'->>'layout'='2' AND (SELECT count(*)=1 FROM public.admin_desk_preference_versions)`)}`));
  const rev=sql(`SELECT max(revision) FROM public.admin_desk_preference_versions WHERE actor_id='${A}'`);
  check('reset adds version while retaining old version',as('authenticated',A,`SELECT public.save_admin_desk_preferences(1,1,ARRAY[]::text[],${rev}); ${must(`(SELECT count(*)=2 FROM public.admin_desk_preference_versions) AND (SELECT count(*)=1 FROM public.admin_desk_preference_versions WHERE layout=2) AND public.get_admin_desk_preferences()->'preferences'->>'layout'='1'`)}`));
  const current=sql(`SELECT max(revision) FROM public.admin_desk_preference_versions WHERE actor_id='${A}'`);
  for(const [label,call]of [
    ['schema version',`2,1,ARRAY[]::text[],${current}`],['layout',`1,4,ARRAY[]::text[],${current}`],
    ['unknown tool',`1,1,ARRAY['admin'],${current}`],['duplicate tool',`1,1,ARRAY['chart','chart'],${current}`],
    ['null element',`1,1,ARRAY[NULL]::text[],${current}`],['null array',`1,1,NULL,${current}`],
    ['multidimensional',`1,1,ARRAY[['chart','alerts']],${current}`],['negative revision','1,1,ARRAY[]::text[],-1'],
  ])check(`invalid ${label} rejected`,as('authenticated',A,expectError(`PERFORM public.save_admin_desk_preferences(${call})`,'22023')));
  // Two sessions compete with same base; one commit succeeds, other gets 40001 after lock.
  const first=asyncSql(as('authenticated',A,`SELECT public.save_admin_desk_preferences(1,2,ARRAY[]::text[],${current}); SELECT pg_sleep(2)`));
  // Poll the first session's held advisory lock rather than relying on a sleep race.
  let held=false;for(let i=0;i<30;i++){
    if(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted")!=='0'){held=true;break;}
    await new Promise(r=>setTimeout(r,25));
  }
  assert.ok(held,'first concurrent write did not hold lock');
  const second=asyncSql(as('authenticated',A,`SELECT public.save_admin_desk_preferences(1,3,ARRAY[]::text[],${current})`));
  let waiting=false;for(let i=0;i<30;i++){
    if(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted")!=='0'){waiting=true;break;}
    await new Promise(r=>setTimeout(r,25));
  }
  assert.ok(waiting,'second writer did not overlap while first held advisory lock');
  const [one,two]=await Promise.all([first,second]);assert.equal(one.code,0,one.err);assert.notEqual(two.code,0);assert.match(two.err,/desk preferences revision conflict/);
  check('concurrent same-revision writers create exactly one version',must(`(SELECT count(*)=3 FROM public.admin_desk_preference_versions WHERE actor_id='${A}') AND (SELECT layout=2 FROM public.admin_desk_preference_versions WHERE actor_id='${A}' ORDER BY revision DESC LIMIT 1)`));
  sql(`UPDATE public.profiles SET role='member' WHERE id='${A}'`);
  check('demotion immediately revokes read and write',as('authenticated',A,`${must('(SELECT count(*)=0 FROM public.admin_desk_preference_versions)')}; ${expectError('PERFORM public.get_admin_desk_preferences()','42501')}; ${expectError('PERFORM public.save_admin_desk_preferences(1,1,ARRAY[]::text[],0)','42501')}`));
  check('demotion leaves append-only history intact for owner audit',must(`(SELECT count(*)=3 FROM public.admin_desk_preference_versions WHERE actor_id='${A}')`));
  console.log(JSON.stringify({summary:{passed:results.length,failed:0},results}));
}catch(error){console.error(error);process.exitCode=1;}finally{
  if(created){attest(inspect());docker(['rm','-f',name]);console.log(JSON.stringify({cleanup:{container:name,removed:true}}));}
}
