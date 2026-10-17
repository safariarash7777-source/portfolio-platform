import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHmac, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '../..');
export const local = resolve(here, '.local');
export const base = '582fba194b2565f6dee046deafbff147bffcf375';
export const origin = 'http://127.0.0.1:32188';
export const docker = (args, input) => execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
export const state = () => JSON.parse(readFileSync(resolve(local, 'state.json'), 'utf8'));
export const sql = (s, query) => {
  // Attest the new, run-owned database destination before even setup writes.
  const net=JSON.parse(docker(['network','inspect',s.network]))[0];
  const c=JSON.parse(docker(['inspect',s.db]))[0];
  if(!net.Internal || net.Labels['isolated-e2e.run']!==s.id || c.Config.Labels['isolated-e2e.run']!==s.id || !c.State.Running || Object.keys(c.NetworkSettings.Networks).join()!==s.network || c.Mounts.some(m=>m.Type==='bind') || Object.keys(c.HostConfig.PortBindings??{}).length) throw new Error('Pre-query database ownership/isolation mismatch');
  return docker(['exec', '-i', s.db, 'psql', '-U', 'postgres', '-XAtq', '-v', 'ON_ERROR_STOP=1'], query).trim();
};
const save = s => writeFileSync(resolve(local, 'state.json'), JSON.stringify(s, null, 2), { mode: 0o600 });
export function databaseUrl(user,password,auth=false){const url=new URL('postgres://db:5432/postgres');url.username=user;url.password=password;if(auth)url.searchParams.set('search_path','auth');return url.href;}
const jwt = (secret, role) => {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400 })).toString('base64url');
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
};
async function wait(check) { for (let i=0;i<60;i++) { try { if (await check()) return; } catch {} await new Promise(r=>setTimeout(r,1000)); } throw new Error('Service readiness blocked'); }
function envFile(name, values) { const path=resolve(local,`${name}.env`); writeFileSync(path,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});return path; }
export function attest(s) {
  const net=JSON.parse(docker(['network','inspect',s.network]))[0];
  if (!net.Internal || net.Labels['isolated-e2e.run']!==s.id) throw new Error('Isolation network mismatch');
  const receipts=[];
  for (const name of [s.db,s.auth,s.rest,s.web]) {
    const c=JSON.parse(docker(['inspect',name]))[0];
    if(c.Config.Labels['isolated-e2e.run']!==s.id || !c.State.Running || Object.keys(c.NetworkSettings.Networks).join()!==s.network) throw new Error('Container ownership/network mismatch');
    if(c.Mounts.some(m=>m.Type==='bind')) throw new Error('Unexpected host bind mount');
    const env=Object.fromEntries(c.Config.Env.map(x=>{const n=x.indexOf('=');return [x.slice(0,n),x.slice(n+1)];}));
    if(name===s.web && (env.NEXT_PUBLIC_SUPABASE_URL!==origin || env.NEXT_PUBLIC_LIARA_API_URL || env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Frontend destination mismatch');
    if(name===s.auth && !env.GOTRUE_DB_DATABASE_URL?.includes('@db:5432/postgres')) throw new Error('Auth DB mismatch');
    if(name===s.rest && !env.PGRST_DB_URI?.includes('@db:5432/postgres')) throw new Error('REST DB mismatch');
    for(const binds of Object.values(c.HostConfig.PortBindings??{})) for(const b of binds??[]) if(name!==s.web || b.HostIp!=='127.0.0.1' || b.HostPort!=='32188') throw new Error('Unexpected exposed port');
    receipts.push({name,id:c.Id,image:c.Image});
  }
  const ingress=JSON.parse(docker(['inspect',s.ingress]))[0];
  if(ingress.Config.Labels['isolated-e2e.run']!==s.id || !ingress.State.Running || Object.keys(ingress.NetworkSettings.Networks).sort().join()!==[s.network,s.edge].sort().join()) throw new Error('Ingress identity mismatch');
  const binds=ingress.HostConfig.PortBindings['32188/tcp'];
  if(binds.length!==1 || binds[0].HostIp!=='127.0.0.1' || binds[0].HostPort!=='32188') throw new Error('Ingress exposure mismatch');
  receipts.push({name:s.ingress,id:ingress.Id,image:ingress.Image,role:'Fixed target ingress web:32188; no Auth or DB credentials'});
  const defaultRoutes=Number(docker(['exec',s.web,'node','-e',"console.log(require('fs').readFileSync('/proc/net/route','utf8').trim().split('\\n').slice(1).filter(l=>l.trim().split(/\\s+/)[1]==='00000000').length)"]).trim());
  if(defaultRoutes!==0)throw new Error('Application has an outbound default route');
  if(sql(s,'SELECT run_id FROM e2e_identity.environment')!==s.id) throw new Error('Database identity mismatch');
  return {runId:s.id,base,origin,internalNetwork:net.Id,containers:receipts,defaultRoutes,checkedAt:new Date().toISOString(),outbound:'Docker internal network; no SMTP/SMS/payment/market credentials; no collectors',migrations:s.migrations};
}
async function up() {
  mkdirSync(local,{recursive:true});
  if(existsSync(resolve(local,'state.json'))) throw new Error('Existing run manifest; inspect or clean it first');
  execFileSync('git',['merge-base','--is-ancestor',base,'HEAD'],{cwd:root,stdio:'pipe'});
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==base) throw new Error('Exact approved baseline required');
  const product=['app','components','lib','public','sql','supabase','middleware.ts','next.config.js','tsconfig.json','tailwind.config.js','postcss.config.js','package.json','package-lock.json'];
  execFileSync('git',['diff','--quiet',base,'--',...product],{cwd:root,stdio:'pipe'});
  if(execFileSync('git',['ls-files','--others','--exclude-standard','--',...product],{cwd:root,encoding:'utf8'}).trim())throw new Error('Untracked product source is not the approved baseline');
  const id=`e2e228-${randomUUID().slice(0,8)}`;
  const s={id,network:`${id}-net`,edge:`${id}-edge`,ingress:`${id}-ingress`,db:`${id}-db`,auth:`${id}-auth`,rest:`${id}-rest`,web:`${id}-web`,secret:randomBytes(32).toString('hex'),password:randomBytes(24).toString('hex'),migrations:[],resources:[]};
  s.anon=jwt(s.secret,'anon');s.service=jwt(s.secret,'service_role');save(s);
  docker(['network','create','--internal','--label',`isolated-e2e.run=${id}`,s.network]);s.resources.push({type:'network',name:s.network});save(s);
  const run=(name,alias,image,env,extra=[])=>{docker(['run','-d','--name',name,'--label',`isolated-e2e.run=${id}`,'--network',s.network,'--network-alias',alias,'--log-driver','none','--env-file',envFile(alias,env),...extra,image]);s.resources.push({type:'container',name});save(s);};
  run(s.db,'db','postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',{POSTGRES_PASSWORD:s.password},['--tmpfs','/var/lib/postgresql/data']);
  await wait(()=>sql(s,'SELECT 1')==='1');
  sql(s,`CREATE SCHEMA auth; CREATE SCHEMA e2e_identity; CREATE TABLE e2e_identity.environment(run_id text); INSERT INTO e2e_identity.environment VALUES ('${id}');`);
  run(s.auth,'auth','public.ecr.aws/supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',{
    GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:`${origin}/auth/v1`,GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:databaseUrl('postgres',s.password,true),GOTRUE_SITE_URL:origin,GOTRUE_JWT_SECRET:s.secret,GOTRUE_JWT_EXP:3600,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:true,GOTRUE_MAILER_AUTOCONFIRM:true,GOTRUE_DISABLE_SIGNUP:true,GOTRUE_EXTERNAL_PHONE_ENABLED:false,GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:1,LOG_LEVEL:'error'
  });
  await wait(()=>sql(s,"SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email'")==='1');
  const files=['sql/test/supabase_bootstrap.sql','sql/test/profile_explicit_grants.sql','sql/test/portfolio_precondition.sql','sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql','supabase/migrations/20261003094327_member_investment_scope_reviews.sql','supabase/migrations/20261003100542_recovery_legacy_holdings_owner_only.sql','sql/phase34_research_workbook_versions.sql'];
  for(const f of files){const contents=readFileSync(resolve(root,f),'utf8');sql(s,contents);s.migrations.push({file:f,sha256:createHash('sha256').update(contents).digest('hex')});save(s);}
  // Transport login only: table/RPC privileges remain the repository migrations.
  sql(s,`CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${s.password}'; GRANT anon, authenticated, service_role TO authenticator;`);
  run(s.rest,'rest','dev07/postgrest:14.17',{PGRST_DB_URI:databaseUrl('authenticator',s.password),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:s.secret,PGRST_LOG_LEVEL:'crit'});
  run(s.web,'web','isolated-financial-582fba1',{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:s.anon,NEXT_PUBLIC_APP_URL:origin,NEXT_TELEMETRY_DISABLED:1});
  docker(['network','create','--label',`isolated-e2e.run=${id}`,s.edge]);s.resources.push({type:'network',name:s.edge});save(s);
  const proxy="const h=require('http');h.createServer((q,s)=>{const r=h.request({hostname:'web',port:32188,path:q.url,method:q.method,headers:q.headers},p=>{s.writeHead(p.statusCode,p.headers);p.pipe(s)});r.on('error',()=>{s.writeHead(502);s.end()});q.pipe(r)}).listen(32188,'0.0.0.0')";
  docker(['run','-d','--name',s.ingress,'--label',`isolated-e2e.run=${id}`,'--network',s.edge,'--log-driver','none','-p','127.0.0.1:32188:32188','node:22.22.0-alpine','node','-e',proxy]);s.resources.push({type:'container',name:s.ingress});save(s);
  docker(['network','connect',s.network,s.ingress]);
  await wait(async()=> (await fetch(`${origin}/auth/v1/health`)).ok);
  writeFileSync(resolve(local,'isolation.json'),JSON.stringify(attest(s),null,2));
  s.users={};
  for(const name of ['A','B','admin']){
    const password=randomBytes(20).toString('hex'); const email=`${name.toLowerCase()}-${id}@example.invalid`;
    const r=await fetch(`${origin}/auth/v1/admin/users`,{method:'POST',headers:{Authorization:`Bearer ${s.service}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
    if(!r.ok) throw new Error(`Seed Auth status ${r.status}`);
    const u=await r.json(); if(!/^[0-9a-f-]{36}$/.test(u.id)) throw new Error('Invalid Auth identity');
    s.users[name]={id:u.id,email,password};save(s);
    sql(s,`INSERT INTO public.profiles(id,role) VALUES('${u.id}','${name==='admin'?'admin':'user'}');`);
  }
  console.log(JSON.stringify({runId:id,status:'ISOLATED',accounts:3,origin}));
}
function down() {
  const s=state();
  for(const r of [...s.resources].reverse()){
    const v=JSON.parse(docker(r.type==='network'?['network','inspect',r.name]:['inspect',r.name]))[0];
    if((r.type==='network'?v.Labels:v.Config.Labels)['isolated-e2e.run']!==s.id) throw new Error('Cleanup ownership mismatch');
    docker(r.type==='network'?['network','rm',r.name]:['rm','-f','-v',r.name]);
  }
  writeFileSync(resolve(local,'cleanup.json'),JSON.stringify({runId:s.id,status:'PASS',resources:s.resources,at:new Date().toISOString()},null,2));
  console.log('Run-owned containers and network removed; manifest retained (contains synthetic credentials).');
}
function shortSessions(expiry=60) {
  const s=state();attest(s);
  const c=JSON.parse(docker(['inspect',s.auth]))[0];
  const values=Object.fromEntries(c.Config.Env.map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
  values.GOTRUE_JWT_EXP=String(expiry);
  const file=envFile('auth',values);
  docker(['rm','-f',s.auth]);
  docker(['run','-d','--name',s.auth,'--label',`isolated-e2e.run=${s.id}`,'--network',s.network,'--network-alias','auth','--log-driver','none','--env-file',file,c.Image]);
  console.log(`Disposable Auth now issues real ${expiry}-second sessions; no production configuration used.`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try { if(process.argv[2]==='up') await up(); else if(process.argv[2]==='attest') console.log(JSON.stringify(attest(state()),null,2)); else if(process.argv[2]==='short-sessions') shortSessions(); else if(process.argv[2]==='normal-sessions') shortSessions(3600); else if(process.argv[2]==='down') down(); else throw new Error('Use up | attest | short-sessions | normal-sessions | down'); }
  catch(e){console.error(`BLOCKED: ${e.message?.split('\n')[0]}`);process.exitCode=2;}
}
