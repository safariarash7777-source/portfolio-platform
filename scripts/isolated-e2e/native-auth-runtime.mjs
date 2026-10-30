// Shared lifecycle extracted from accepted PF10@80582f1. Existing CI only.
// Exactly two compiled profiles; no external target, SQL path or route configuration.
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,openSync,writeSync,fsyncSync,closeSync,realpathSync,symlinkSync,copyFileSync} from 'node:fs';
import {resolve,dirname,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),label='pf10.native-lab';
export const origin='http://localhost:32189';
// Three START-A identities; root approved the explicit official v14.17 artifact
// mapping below for this lab only after legacy mirror 401 / digest 404.
export const restArtifact=Object.freeze({legacy:'sha256:34f9a5ffb70a016155142dfeb103b89523384b3f8d1a3087250c758675bf9272',index:'sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c',manifest:'sha256:aa7e96af2d01219a09bc00c75de28171b1f9fda17ea455a931e4fb6d317089e0',config:'sha256:fc3d286fec899d5a5bebbb98eac771ced1ccaa44deac8ce2fc23fe5d262eb3d9'});
export const images=Object.freeze({db:'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',auth:'supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',rest:'postgrest/postgrest@'+restArtifact.index,node:'node@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34'});
const check=(value,code)=>{if(!value)throw Error(code);},hash=value=>createHash('sha256').update(value).digest('hex');
export function verifyEnvironment(env=process.env,platform=process.platform){check(platform==='linux'&&env.CI==='true'&&env.GITHUB_ACTIONS==='true','pf10_native_requires_existing_linux_ci');check(env.RUNNER_TEMP&&posix.isAbsolute(env.RUNNER_TEMP)&&!env.RUNNER_TEMP.includes('\\'),'pf10_native_private_temp_required');}
export function verifyContainer(s,c,role){check(c.Config.Labels?.[label]===s.id&&c.State.Running&&c.Image===s.imageIds[role],'pf10_native_container_identity');check(!c.Mounts.some(m=>m.Type==='bind'),'pf10_native_host_bind');check(Object.keys(c.NetworkSettings.Networks).join()===s.network,'pf10_native_network_membership');check(!Object.keys(c.HostConfig.PortBindings??{}).length,'pf10_native_service_port');if(role==='db')check(c.Mounts.some(m=>m.Type==='tmpfs'&&m.Destination==='/var/lib/postgresql/data')||Object.hasOwn(c.HostConfig.Tmpfs??{},'/var/lib/postgresql/data'),'pf10_native_persistent_database');}
export function verifyIngress(s,c){check(c.Config.Labels?.[label]===s.id&&c.State.Running&&c.Image===s.imageIds.node&&!c.Mounts.some(m=>m.Type==='bind'),'pf10_native_ingress_identity');check(Object.keys(c.NetworkSettings.Networks).sort().join()===[s.network,s.edge].sort().join(),'pf10_native_ingress_network');const ports=c.HostConfig.PortBindings;check(Object.keys(ports).length===1&&ports['32190/tcp']?.length===1&&ports['32190/tcp'][0].HostIp==='127.0.0.1'&&ports['32190/tcp'][0].HostPort==='32190','pf10_native_ingress_exposure');}
export function verifyRestArtifact(details,index,version){check(details.Os==='linux'&&details.Architecture==='amd64'&&details.Id===restArtifact.config,'pf10_native_rest_platform_config');check(index.manifests?.some(m=>m.digest===restArtifact.manifest&&m.platform?.os==='linux'&&m.platform?.architecture==='amd64'),'pf10_native_rest_platform_manifest');check(/^PostgREST v?14\.17(?:[ .(-]|$)/.test(version),'pf10_native_rest_version');}
export function verifyDatabaseMountInfo(text){check(text.split('\n').some(line=>{const [mount,filesystem]=line.split(' - ');return mount?.split(' ')[4]==='/var/lib/postgresql/data'&&filesystem?.split(' ')[0]==='tmpfs';}),'pf10_native_database_kernel_not_tmpfs');}
export function allowedProfileURL(profile,value){const config=nativeAuthProfile(profile);const u=new URL(value);check(u.origin===origin&&u.username===''&&u.password===''&&(u.pathname.startsWith('/auth/v1/')||u.pathname.startsWith('/rest/v1/')||[config.identityPath,...config.routes].includes(u.pathname)),'pf10_native_http_destination');return u.href;}

const commonBootstrap=['sql/test/supabase_bootstrap.sql','sql/test/profile_explicit_grants.sql'];
const pf10Bootstrap=[...commonBootstrap,'sql/test/portfolio_precondition.sql','sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql','supabase/migrations/20261019215549_personal_cash_flow_versions.sql'];
const p09Bootstrap=[...commonBootstrap,'sql/phase34_research_workbook_versions.sql','docs/ops/research-workbook-recovery-20261029/intent-store.candidate.sql'];
const profiles={
 pf10:{sourceShaEnv:'PF10_NATIVE_SOURCE_SHA',logPrefix:'PF10',identityPath:'/__pf10_native_identity',phases:9,actors:{a:'user',b:'user',admin:'admin'},bootstrap:pf10Bootstrap,sql:[...pf10Bootstrap,'sql/debt_payment_links.sql'],routes:['/api/personal-finance/debt-payments','/api/personal-finance/cash-flow','/api/portfolio/holdings','/api/portfolio/debts'],warmup:[['/api/personal-finance/debt-payments',401],['/api/portfolio/holdings',401],['/api/portfolio/debts',405],['/api/personal-finance/cash-flow?startOn=2026-10-01&endOn=2026-10-31',401]]},
 p09:{sourceShaEnv:'P09_NATIVE_SOURCE_SHA',logPrefix:'P09',identityPath:'/__p09_native_identity',phases:9,actors:{a:'admin',b:'admin',member:'user'},bootstrap:p09Bootstrap,sql:p09Bootstrap,routes:['/api/admin/intelligence/workbooks'],warmup:[['/api/admin/intelligence/workbooks',401]]},
};
for(const config of Object.values(profiles)){for(const key of ['actors','bootstrap','sql','routes','warmup']){if(key==='warmup')config[key].forEach(Object.freeze);Object.freeze(config[key]);}Object.freeze(config);}Object.freeze(profiles);
export function nativeAuthProfile(profile){check(typeof profile==='string'&&Object.hasOwn(profiles,profile),'pf10_native_unknown_profile');return profiles[profile];}

const quote=x=>x===null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function bootstrapToken(secret,role){check(['anon','service_role'].includes(role),'pf10_native_member_token_must_come_from_auth');const body=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
export async function runNativeAuthProfile(profile,exercise){
 const config=nativeAuthProfile(profile);check(typeof exercise==='function','pf10_native_scenario_required');
 verifyEnvironment();const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000}).trim();
 const checkoutSha=git(['rev-parse','HEAD']),sha=process.env[config.sourceShaEnv]??checkoutSha;check(/^[a-f0-9]{40}$/.test(sha),'pf10_native_source_sha');check(git(['status','--porcelain','--untracked-files=no'])==='','pf10_native_dirty_source');
 try{git(['cat-file','-e',sha+'^{commit}']);}catch{check(git(['remote','get-url','origin']).replace(/\.git$/,'')==='https://github.com/safariarash7777-source/portfolio-platform','pf10_native_source_remote');git(['fetch','--no-tags','--depth=1','origin',sha]);}
 check(git(['rev-parse',checkoutSha+'^{tree}'])===git(['rev-parse',sha+'^{tree}']),'pf10_native_head_merge_tree_mismatch');
 const privateDir=mkdtempSync(resolve(process.env.RUNNER_TEMP,profile+'-native-'));check(realpathSync(privateDir)===privateDir,'pf10_native_private_path_redirect');
 const id=profile+'-'+randomUUID(),s={id,sha,network:id+'-internal',edge:id+'-edge',resources:[],imageIds:{},migrations:[],local:privateDir,password:randomBytes(24).toString('hex'),secret:randomBytes(32).toString('hex')};
 for(const role of ['db','auth','rest','ingress'])s[role]=id+'-'+role;
 let host;const results=[];let postCount=0;const write=(name,value,exclusive=false)=>{check(/^[a-z0-9.-]+$/.test(name),'pf10_native_private_filename');const fd=openSync(resolve(privateDir,name),exclusive?'wx':'w',0o600);try{writeSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}};
 const save=()=>write('state.json',s);
 const docker=(args,input)=>{try{return execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:8*1024*1024}).trim();}catch{throw Error('pf10_native_docker_operation_failed');}};
 const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
 const attestDB=()=>{const n=JSON.parse(docker(['network','inspect',s.network]))[0];check(n.Internal&&n.Labels?.[label]===id,'pf10_native_internal_network');verifyContainer(s,inspect(s.db),'db');verifyDatabaseMountInfo(docker(['exec',s.db,'cat','/proc/self/mountinfo']));};
 const sql=query=>{attestDB();return docker(['exec','-i',s.db,'psql','-U','postgres','-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],query);};
 const envFile=(role,values)=>{const path=resolve(privateDir,role+'.env');writeFileSync(path,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});return path;};
 const start=(role,values,extra=[])=>{docker(['run','-d','--pull','never','--name',s[role],'--label',`${label}=${id}`,'--network',s.network,'--network-alias',role,'--log-driver','none','--env-file',envFile(role,values),...extra,s.imageIds[role]]);s.resources.push({type:'container',name:s[role]});save();};
 const wait=async(fn,code,attempts=90)=>{let lastCode='not_ready';for(let i=0;i<attempts;i++){try{if(await fn())return;}catch(error){lastCode=/^pf10_native_[a-z0-9_]+$/.test(error.message)?error.message:'read_failed';}await new Promise(r=>setTimeout(r,1000));}throw Error(code+'_'+lastCode);};
 const transport=(url,options={})=>fetch(allowedProfileURL(profile,typeof url==='string'?url:url.url??String(url)),{...options,redirect:'error',signal:options.signal??AbortSignal.timeout(15000)});
 const post=async(path,body,headers={})=>{write('intent-'+String(++postCount).padStart(3,'0')+'.json',{path,body,sha},true);try{return await transport(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}catch{throw Error('pf10_native_write_outcome_unknown_stop_no_replay');}};
 const pass=(name,evidence={})=>{const item={name,status:'PASS',...evidence};results.push(item);write('results.json',{sha,results});console.log(config.logPrefix+'_NATIVE_CHECK '+JSON.stringify(item));};
 let cleanup='NOT_STARTED';
 try{
  // Immutable identities only: root-approved official REST mapping is explicit.
  // No paid service, tool installation, tag fallback or real credentials.
  for(const [role,image] of Object.entries(images)){console.log(config.logPrefix+'_NATIVE_SETUP '+JSON.stringify({phase:'pinned-image',role,image}));
   try{execFileSync('docker',['pull','--platform','linux/amd64',image],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});}
   catch(error){const detail=String(error.stderr??'');const code=/manifest unknown|not found/i.test(detail)?'manifest_missing':/denied|unauthorized|authentication required/i.test(detail)?'registry_denied':/timeout|TLS|x509|dial tcp/i.test(detail)?'registry_transport':'pull_failed';throw Error(`pf10_native_${role}_${code}`);}
   const details=JSON.parse(docker(['image','inspect',image]))[0];check(details.RepoDigests?.some(x=>x.endsWith('@'+image.split('@')[1])),'pf10_native_image_digest');s.imageIds[role]=details.Id;
   if(role==='rest'){const index=JSON.parse(docker(['manifest','inspect',image]));const version=docker(['run','--rm','--pull','never','--name',id+'-rest-version','--label',`${label}=${id}`,'--platform','linux/amd64','--network','none','--read-only','--cap-drop','ALL',details.Id,'/bin/postgrest','--version']);verifyRestArtifact(details,index,version);s.restArtifact={...restArtifact,version,primaryArtifactMatch:'NOT_CLAIMED'};console.log(config.logPrefix+'_NATIVE_SETUP '+JSON.stringify({phase:'rest-artifact-readback',...s.restArtifact}));}
  }
  save();docker(['network','create','--internal','--label',`${label}=${id}`,s.network]);s.resources.push({type:'network',name:s.network});save();
  start('db',{POSTGRES_PASSWORD:s.password},['--tmpfs','/var/lib/postgresql/data']);const dbMeta=inspect(s.db);console.log(config.logPrefix+'_NATIVE_SETUP '+JSON.stringify({phase:'db-mount-readback',mounts:dbMeta.Mounts.map(m=>({type:m.Type,destination:m.Destination})),tmpfs:Object.keys(dbMeta.HostConfig.Tmpfs??{}),ownerMatches:dbMeta.Config.Labels?.[label]===id,imageMatches:dbMeta.Image===s.imageIds.db,networks:Object.keys(dbMeta.NetworkSettings.Networks)}));await wait(()=>sql('SELECT 1')==='1','pf10_native_database_readiness');
  sql(`CREATE SCHEMA auth;CREATE SCHEMA e2e_identity;CREATE TABLE e2e_identity.environment(run_id text NOT NULL);INSERT INTO e2e_identity.environment VALUES(${quote(id)});`);
  const dbUrl=user=>{const u=new URL('postgres://db:5432/postgres');u.username=user;u.password=s.password;return u.href;};
  start('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:origin+'/auth/v1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:dbUrl('postgres')+'?search_path=auth',GOTRUE_SITE_URL:origin,GOTRUE_JWT_SECRET:s.secret,GOTRUE_JWT_EXP:3600,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:true,GOTRUE_MAILER_AUTOCONFIRM:true,GOTRUE_DISABLE_SIGNUP:true,GOTRUE_EXTERNAL_PHONE_ENABLED:false,GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:1,LOG_LEVEL:'error'});
  await wait(()=>sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email'")==='1','pf10_native_auth_schema');
  const apply=file=>{check(config.sql.includes(file),'pf10_native_migration_not_in_profile');const contents=readFileSync(resolve(root,file),'utf8');sql(contents);s.migrations.push({file,sha256:hash(contents)});save();};
  for(const file of config.bootstrap)apply(file);
  // Transport login only. No extra table/private-function grant is added.
  sql(`CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD ${quote(s.password)};GRANT anon,authenticated,service_role TO authenticator;`);
  start('rest',{PGRST_DB_URI:dbUrl('authenticator'),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:s.secret,PGRST_LOG_LEVEL:'crit'});
  docker(['network','create','--label',`${label}=${id}`,s.edge]);s.resources.push({type:'network',name:s.edge});save();
  const proxy="const h=require('http');h.createServer((q,s)=>{const auth=q.url.startsWith('/auth/v1/'),rest=q.url.startsWith('/rest/v1/');if(!auth&&!rest){s.writeHead(404);s.end();return}const r=h.request({hostname:auth?'auth':'rest',port:auth?9999:3000,path:q.url.slice(8),method:q.method,headers:q.headers},p=>{s.writeHead(p.statusCode,p.headers);p.pipe(s)});r.on('error',()=>{s.writeHead(502);s.end()});q.pipe(r)}).listen(32190,'0.0.0.0')";
  docker(['run','-d','--pull','never','--name',s.ingress,'--label',`${label}=${id}`,'--network',s.edge,'--log-driver','none','-p','127.0.0.1:32190:32190',s.imageIds.node,'node','-e',proxy]);s.resources.push({type:'container',name:s.ingress});save();docker(['network','connect',s.network,s.ingress]);
  const context=resolve(privateDir,'source');mkdirSync(context);const archive=resolve(privateDir,'source.tar');
  execFileSync('git',['-c','core.autocrlf=false','-c','core.eol=lf','archive','--format=tar','--output',archive,sha,'app','components','lib','public','middleware.ts','next.config.js','tsconfig.json','tailwind.config.js','postcss.config.js','package.json','package-lock.json'],{cwd:root,stdio:'pipe'});
  execFileSync('tar',['-xf',archive,'-C',context],{stdio:'pipe'});check(hash(readFileSync(resolve(context,'package-lock.json')))===hash(readFileSync(resolve(root,'package-lock.json'))),'pf10_native_dependency_lock');symlinkSync(resolve(root,'node_modules'),resolve(context,'node_modules'),'dir');copyFileSync(resolve(here,'native-auth-gateway.mjs'),resolve(context,'gateway.mjs'));
  const anon=bootstrapToken(s.secret,'anon'),service=bootstrapToken(s.secret,'service_role');s.anon=anon;s.service=service;save();
  const log=openSync(resolve(privateDir,'app.log'),'a',0o600),env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','TMPDIR','LANG'].includes(key)));
  Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,NEXT_PUBLIC_APP_URL:origin,NEXT_TELEMETRY_DISABLED:'1',NATIVE_AUTH_PROFILE:profile,NATIVE_AUTH_ORIGIN:origin,NATIVE_AUTH_SHA:sha,NATIVE_AUTH_RUN:id});
  host=spawn(process.execPath,['gateway.mjs'],{cwd:context,env,stdio:['ignore',log,log]});closeSync(log);host.on('error',()=>{});
  const identity=async()=>{const r=await transport(origin+config.identityPath);const body=await r.json();check(body.runId===id&&body.sha===sha&&body.profile===profile,'pf10_native_host_identity');return true;};
  await wait(identity,'pf10_native_app_readiness',120);
  const attest=async()=>{for(const role of ['db','auth','rest'])verifyContainer(s,inspect(s[role]),role);verifyIngress(s,inspect(s.ingress));check(sql('SELECT run_id FROM e2e_identity.environment')===id,'pf10_native_database_marker');await identity();return {sha,runId:id,images:Object.fromEntries(Object.entries(images)),restArtifact:s.restArtifact,database:'owned tmpfs',serviceNetwork:'internal/no host binds/no published service ports',ingress:'127.0.0.1:32190 only',app:'Linux runner loopback / sanitized env / exact Git archive',appDefaultRoutes:null,appNoEgressClaim:false};};
  pass('isolation-attested',await attest());
  await wait(async()=>{const r=await transport(origin+'/auth/v1/health');return r.ok;},'pf10_native_auth_ready');
  await wait(async()=>{const r=await transport(origin+'/rest/v1/',{headers:{apikey:anon}});return r.ok;},'pf10_native_rest_ready');
  for(const [path,status] of config.warmup){const r=await transport(origin+path,{signal:AbortSignal.timeout(120000)});check(r.status===status,'pf10_native_guest_warmup');}
  const {createServerClient}=createRequire(resolve(root,'package.json'))('@supabase/ssr');const users={};
  const newSession=async actor=>{const u=users[actor];const r=await post('/auth/v1/token?grant_type=password',{email:u.email,password:u.password},{apikey:anon});check(r.status===200,'pf10_native_auth_login');const session=await r.json();check(session.user?.id===u.id&&session.user?.app_metadata?.acceptance_run===id,'pf10_native_auth_issued_identity');check(typeof session.access_token==='string'&&typeof session.refresh_token==='string','pf10_native_auth_issued_tokens');const jar=new Map();
   const client=createServerClient(origin,anon,{auth:{autoRefreshToken:false,detectSessionInUrl:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))},global:{fetch:(url,init)=>transport(url,init)}});
   const set=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token}),verified=await client.auth.getUser();check(!set.error&&!verified.error&&verified.data.user?.id===u.id&&jar.size>0,'pf10_native_sdk_verified_identity');return {cookie:[...jar].map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('; '),token:session.access_token};
  };
  for(const actor of Object.keys(config.actors)){const u={email:`${actor}-${id}@example.invalid`,password:randomBytes(24).toString('hex')};const r=await post('/auth/v1/admin/users',{...u,email_confirm:true,app_metadata:{acceptance_run:id}},{Authorization:'Bearer '+service,apikey:anon});check(r.status===200||r.status===201,'pf10_native_auth_create');const value=await r.json();check(/^[a-f0-9-]{36}$/.test(value.id),'pf10_native_auth_new_uuid');u.id=value.id;users[actor]=u;sql(`INSERT INTO public.profiles(id,role) VALUES(${quote(u.id)},${quote(config.actors[actor])});`);u.session=await newSession(actor);}
  write('users.json',users,true);pass('three-fresh-auth-users-and-sdk-getuser',{members:Object.values(config.actors).filter(x=>x==='user').length,admin:Object.values(config.actors).filter(x=>x==='admin').length,memberTokenSource:'GoTrue password grant; no hand-signed member sub'});
  const api=async(actor,path,body)=>{const headers={Cookie:users[actor].session.cookie,Origin:origin};const r=body===undefined?await transport(origin+path,{headers}):await post(path,body,headers);return {status:r.status,value:await r.json(),cache:r.headers.get('cache-control')};};
  await exercise({sha,id,sql,apply,wait,transport,post,write,pass,users,newSession,api,anon,service,origin});
  await attest();cleanup='PENDING';
 }finally{
  if(host&&host.exitCode===null){host.kill('SIGTERM');await new Promise(r=>{const timer=setTimeout(()=>{host.kill('SIGKILL');r();},8000);host.once('exit',()=>{clearTimeout(timer);r();});});}
  for(const resource of [...s.resources].reverse()){const obj=JSON.parse(docker(resource.type==='network'?['network','inspect',resource.name]:['inspect',resource.name]))[0];check((resource.type==='network'?obj.Labels:obj.Config.Labels)?.[label]===id,'pf10_native_cleanup_owner');docker(resource.type==='network'?['network','rm',resource.name]:['rm','-f','-v',resource.name]);}
  cleanup='REMOVED_OWNED_RESOURCES';write('cleanup.json',{runId:id,sha,cleanup});console.log(config.logPrefix+'_NATIVE_CLEANUP '+JSON.stringify({sha,runId:id,status:cleanup,resources:s.resources.length}));
 }
 check(results.length===config.phases&&cleanup==='REMOVED_OWNED_RESOURCES','pf10_native_incomplete_acceptance');
 console.log(config.logPrefix+'_NATIVE_AUTH '+JSON.stringify({sha,status:'PASS',scenarios:results.length,cleanup,memberAuth:'real GoTrue-issued JWT validated by PostgREST and native Next/SSR routes',schema:'candidate in owned tmpfs only',targetInstall:'NOT_APPLIED',browser:'NOT_RUN',arashAcceptance:'UNOBSERVED',privateArtifactsUploaded:false}));
}