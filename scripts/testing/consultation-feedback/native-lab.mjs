// Disposable local native Auth/PostgREST acceptance. Never accepts a remote host.
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,realpathSync,openSync,writeSync,fsyncSync,closeSync,copyFileSync,symlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {runNative} from './native-scenarios.mjs';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const legacyMode=process.argv.includes('--legacy');
export const local=resolve(root,'scripts/isolated-e2e/.local-goals-members/'+(legacyMode?'start-a-native-legacy-20261029-r1':'start-a-native-lab-20261029-r3'));
export const origin='http://localhost:32189';
const here=dirname(fileURLToPath(import.meta.url)),label='start-a.native-lab';
const images={db:'sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',auth:'sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',rest:'sha256:34f9a5ffb70a016155142dfeb103b89523384b3f8d1a3087250c758675bf9272',node:'sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34',cache:'sha256:ceacae303527a0652b6f0adfd85c5bbe38fbc89bd6ffe20ee2ce5f6141addc96'};
const check=(v,m)=>{if(!v)throw Error(m);};
const hash=v=>createHash('sha256').update(v).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const docker=(args,input)=>{try{return execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:8*1024*1024}).trim();}catch{throw Error('local_docker_operation_failed');}};
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
function privateDir(){mkdirSync(local,{recursive:true});check(realpathSync(local).toLowerCase()===resolve(local).toLowerCase(),'private_path_redirect');if(process.platform==='win32'){const principal=execFileSync('whoami',[],{encoding:'utf8'}).trim();execFileSync('icacls',[local,'/inheritance:r','/grant:r',principal+':(OI)(CI)F'],{stdio:'pipe'});}}
function write(name,value,exclusive=false){check(/^[a-z0-9.-]+$/.test(name),'private_filename');const p=resolve(local,name),fd=openSync(p,exclusive?'wx':'w',0o600);try{writeSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
const state=()=>json(resolve(local,'lab-state.json'));
const save=s=>write('lab-state.json',s);
function envFile(name,values){const p=resolve(local,name+'.env');writeFileSync(p,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});return p;}
function jwt(secret,role){const body=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
export function verifyContainer(s,c,role){check(c.Config.Labels?.[label]===s.id&&c.State.Running,'lab_container_identity');check(c.Image===s.imageIds[role],'lab_image_changed');check(!c.Mounts.some(m=>m.Type==='bind'),'lab_host_bind_forbidden');check(Object.keys(c.NetworkSettings.Networks).join()===s.network,'lab_network_changed');check(!Object.keys(c.HostConfig.PortBindings??{}).length,'lab_service_port_exposed');}
function sql(s,query){const n=JSON.parse(docker(['network','inspect',s.network]))[0];check(n.Internal&&n.Labels?.[label]===s.id,'lab_network_not_internal');verifyContainer(s,inspect(s.db),'db');return docker(['exec','-i',s.db,'psql','-U','postgres','-XqAt','-v','ON_ERROR_STOP=1'],query);}
export function attest(s){
 for(const role of s.hostApp?['db','auth','rest']:['db','auth','rest','web'])verifyContainer(s,inspect(s[role]),role);
 const ingress=inspect(s.ingress),edge=JSON.parse(docker(['network','inspect',s.edge]))[0];
 check(edge.Labels?.[label]===s.id&&ingress.Config.Labels?.[label]===s.id&&ingress.Image===s.imageIds.node&&ingress.State.Running&&!ingress.Mounts.some(m=>m.Type==='bind'),'lab_ingress_identity');
 check(Object.keys(ingress.NetworkSettings.Networks).sort().join()===[s.network,s.edge].sort().join(),'lab_ingress_network');
 const port=s.hostApp?'32190':'32189',ports=ingress.HostConfig.PortBindings;check(Object.keys(ports).length===1&&ports[port+'/tcp']?.length===1&&ports[port+'/tcp'][0].HostIp==='127.0.0.1'&&ports[port+'/tcp'][0].HostPort===port,'lab_loopback_binding');
 check(sql(s,'SELECT run_id FROM e2e_identity.environment')===s.id,'lab_database_marker');
 if(!s.hostApp){const routeCount=docker(['exec',s.web,'node','-e',"console.log(require('fs').readFileSync('/proc/net/route','utf8').trim().split('\\n').slice(1).filter(l=>l.trim().split(/\\s+/)[1]==='00000000').length)"]);check(routeCount==='0','lab_app_egress');}
 else if(s.hostPid)process.kill(s.hostPid,0);
 return {status:'ISOLATED',runId:s.id,sha:s.sha,schemaMode:s.schemaMode,origin,images:s.imageIds,migrations:s.migrations,appRuntime:s.hostApp?'host-loopback-sanitized-env':'docker-internal',defaultRoutes:s.hostApp?null:0,realAccounts:0};
}
async function wait(fn){for(let i=0;i<60;i++){try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('local_readiness_failed');}
function snapshot(sha){check(/^[a-f0-9]{40}$/.test(sha),'exact_sha_required');privateDir();check(!existsSync(resolve(local,'prepared.json')),'lab_snapshot_exists');
 const context=resolve(local,'source');mkdirSync(context,{recursive:true});const archive=resolve(local,'source.tar');
 execFileSync('git',['-c','core.autocrlf=false','-c','core.eol=lf','archive','--format=tar','--output',archive,sha,'app','components','lib','public','sql','supabase','middleware.ts','next.config.js','tsconfig.json','tailwind.config.js','postcss.config.js','package.json','package-lock.json'],{cwd:root,stdio:'pipe'});
 execFileSync('tar',['-xf','source.tar','-C','source'],{cwd:local,stdio:'pipe'});copyFileSync(resolve(here,'lab-gateway.mjs'),resolve(context,'gateway.mjs'));
 const dockerfile=`FROM ${images.cache}\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --offline --ignore-scripts --no-audit --no-fund\nRUN rm -rf /app/app /app/components /app/lib /app/public /app/.next\nCOPY app ./app\nCOPY components ./components\nCOPY lib ./lib\nCOPY public ./public\nCOPY middleware.ts next.config.js tsconfig.json tailwind.config.js postcss.config.js ./\nCOPY gateway.mjs ./gateway.mjs\nENV NEXT_TELEMETRY_DISABLED=1\nLABEL consultation-next.sha=${sha}\nCMD ["node","gateway.mjs"]\n`;
 if(!legacyMode){const exported=JSON.parse(execFileSync(process.env.PYTHON||'python3',[resolve(here,'payload-fixture.py'),'--repo',context,'--operation','apply'],{encoding:'utf8',stdio:'pipe',windowsHide:true}));
 check(exported.sha256==='c53de46a216a57b90afaff760c0474cb5d95911f56ff022832fd1536affae8a8','prepared_guarded_payload_changed');
 writeFileSync(resolve(context,'guarded-payload.sql'),exported.payload,{flag:'wx',mode:0o600});}
 writeFileSync(resolve(context,'Dockerfile'),dockerfile);write('prepared.json',{sha,context,schemaMode:legacyMode?'legacy5':'guarded7',archiveSha256:hash(readFileSync(archive)),image:'consultation-next-native-'+sha.slice(0,12)},true);
 console.log(JSON.stringify({status:'PREPARED',sha,origin,credentials:'not_created',dependencyInstall:'offline_only'}));
}
async function up(hostApp=false){
 privateDir();check(!existsSync(resolve(local,'lab-state.json')),'existing_lab_requires_readback');const p=json(resolve(local,'prepared.json'));
 check(p.schemaMode===(legacyMode?'legacy5':'guarded7'),'prepared_schema_mode_changed');
 const imageIds=Object.fromEntries(Object.entries(images).map(([role,image])=>[role,docker(['image','inspect',image,'--format','{{.Id}}'])]));
 if(!hostApp){imageIds.web=docker(['image','inspect',p.image,'--format','{{.Id}}']);check(inspectImageLabel(p.image)===p.sha,'lab_app_sha_mismatch');}
 const id='consultation-next-'+randomUUID().slice(0,8),s={id,sha:p.sha,network:id+'-internal',edge:id+'-edge',db:id+'-db',auth:id+'-auth',rest:id+'-rest',web:id+'-web',ingress:id+'-ingress',imageIds,password:randomBytes(24).toString('hex'),secret:randomBytes(32).toString('hex'),resources:[],migrations:[],users:{}};
 s.schemaMode=p.schemaMode;s.hostApp=hostApp;s.anon=jwt(s.secret,'anon');s.service=jwt(s.secret,'service_role');save(s);
 docker(['network','create','--internal','--label',`${label}=${id}`,s.network]);s.resources.push({type:'network',name:s.network});save(s);
 const run=(role,env,extra=[])=>{docker(['run','-d','--pull','never','--name',s[role],'--label',`${label}=${id}`,'--network',s.network,'--network-alias',role,'--log-driver','none','--env-file',envFile(role,env),...extra,imageIds[role]]);s.resources.push({type:'container',name:s[role]});save(s);};
 run('db',{POSTGRES_PASSWORD:s.password},['--tmpfs','/var/lib/postgresql/data']);await wait(()=>sql(s,'SELECT 1')==='1');
 sql(s,`CREATE SCHEMA auth;CREATE SCHEMA e2e_identity;CREATE TABLE e2e_identity.environment(run_id text);INSERT INTO e2e_identity.environment VALUES('${id}');`);
 const dbUrl=user=>{const url=new URL('postgres://db:5432/postgres');url.username=user;url.password=s.password;return url.href;};
 run('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:origin+'/auth/v1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:dbUrl('postgres')+'?search_path=auth',GOTRUE_SITE_URL:origin,GOTRUE_JWT_SECRET:s.secret,GOTRUE_JWT_EXP:3600,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:true,GOTRUE_MAILER_AUTOCONFIRM:true,GOTRUE_DISABLE_SIGNUP:true,GOTRUE_EXTERNAL_PHONE_ENABLED:false,GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:1,LOG_LEVEL:'error'});
 await wait(()=>sql(s,"SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email'")==='1');
 const files=['sql/test/supabase_bootstrap.sql','sql/test/profile_explicit_grants.sql','sql/test/portfolio_precondition.sql','sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20261019215549_personal_cash_flow_versions.sql','sql/member_goals_versions_20261023.sql','sql/consultation_workflow.sql'];
 for(const file of files){const contents=readFileSync(resolve(p.context,file),'utf8');sql(s,contents);s.migrations.push({file,sha256:hash(contents)});save(s);}
 sql(s,"CREATE TABLE public.risk_assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,total_score integer NOT NULL,risk_category text NOT NULL,answers_json jsonb,created_at timestamptz NOT NULL DEFAULT now());CREATE TABLE public.risk_revalidations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,expired_at timestamptz NOT NULL DEFAULT now(),reason text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now());ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;ALTER TABLE public.risk_revalidations ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.risk_assessments,public.risk_revalidations FROM PUBLIC,anon,authenticated,service_role;");
 for(const file of ['sql/consultation_roster.sql','sql/consultation_replies.sql']){const contents=readFileSync(resolve(p.context,file),'utf8');sql(s,contents);s.migrations.push({file,sha256:hash(contents)});save(s);}
 // Test-only: the exact guarded adapter payload, in one transaction before web start.
 if(!legacyMode){const payload=readFileSync(resolve(p.context,'guarded-payload.sql'),'utf8');
 check(hash(payload)==='c53de46a216a57b90afaff760c0474cb5d95911f56ff022832fd1536affae8a8','guarded_payload_hash_changed');
 sql(s,payload);s.migrations.push({file:'START-A guarded atomic apply',sha256:hash(payload)});save(s);}
 sql(s,`CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${s.password}';GRANT anon,authenticated,service_role TO authenticator;`);
 run('rest',{PGRST_DB_URI:dbUrl('authenticator'),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:s.secret,PGRST_LOG_LEVEL:'crit'});
 if(!hostApp)run('web',{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:s.anon,NEXT_PUBLIC_APP_URL:origin,NEXT_TELEMETRY_DISABLED:1});
 docker(['network','create','--label',`${label}=${id}`,s.edge]);s.resources.push({type:'network',name:s.edge});save(s);
 const proxy=hostApp?"const h=require('http');h.createServer((q,s)=>{const auth=q.url.startsWith('/auth/v1/'),rest=q.url.startsWith('/rest/v1/');if(!auth&&!rest){s.writeHead(404);s.end();return;}const r=h.request({hostname:auth?'auth':'rest',port:auth?9999:3000,path:q.url.slice(8),method:q.method,headers:q.headers},p=>{s.writeHead(p.statusCode,p.headers);p.pipe(s)});r.on('error',()=>{s.writeHead(502);s.end()});q.pipe(r)}).listen(32190,'0.0.0.0')":"const h=require('http');h.createServer((q,s)=>{const r=h.request({hostname:'web',port:32189,path:q.url,method:q.method,headers:q.headers},p=>{s.writeHead(p.statusCode,p.headers);p.pipe(s)});r.on('error',()=>{s.writeHead(502);s.end()});q.pipe(r)}).listen(32189,'0.0.0.0')";
 const ingressPort=hostApp?'32190':'32189';
 docker(['run','-d','--pull','never','--name',s.ingress,'--label',`${label}=${id}`,'--network',s.edge,'--log-driver','none','-p',`127.0.0.1:${ingressPort}:${ingressPort}`,imageIds.node,'node','-e',proxy]);s.resources.push({type:'container',name:s.ingress});save(s);docker(['network','connect',s.network,s.ingress]);
 if(hostApp){
  const modules=resolve(p.context,'node_modules');if(!existsSync(modules))symlinkSync(resolve(root,'node_modules'),modules,'junction');
  const nextVersion=createRequire(resolve(p.context,'package.json'))('next/package.json').version,lockedNext=json(resolve(p.context,'package-lock.json')).packages['node_modules/next'].version;check(nextVersion===lockedNext,'host_next_version_mismatch');
  copyFileSync(resolve(here,'lab-host-gateway.mjs'),resolve(p.context,'gateway.mjs'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['systemroot','windir','path','pathext','temp','tmp','comspec'].includes(key.toLowerCase())));
  Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:s.anon,NEXT_PUBLIC_APP_URL:origin,NEXT_TELEMETRY_DISABLED:'1',LAB_RUN_ID:s.id,LAB_SHA:s.sha});
  const log=openSync(resolve(local,'host-app.log'),'a',0o600),child=spawn(process.execPath,['gateway.mjs'],{cwd:p.context,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();closeSync(log);s.hostPid=child.pid;s.hostNextVersion=nextVersion;save(s);
 }
 await wait(async()=> (await fetch(origin+'/auth/v1/health',{signal:AbortSignal.timeout(2000)})).ok);write('isolation.json',attest(s));console.log(JSON.stringify(attest(s)));
}
function inspectImageLabel(image){return JSON.parse(docker(['image','inspect',image]))[0].Config.Labels?.['consultation-next.sha'];}
async function hostIdentity(s){if(s.hostApp){const r=await fetch(origin+'/__consultation_lab_identity',{signal:AbortSignal.timeout(3000),redirect:'error'});const v=await r.json();check(v.runId===s.id&&v.sha===s.sha,'host_lab_identity_changed');}}
async function stopHost(s){if(!s.hostApp||!s.hostPid)return;await hostIdentity(s);const script="if ((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 32189 -State Listen).OwningProcess -eq "+s.hostPid+") { 'OWNED' }";check(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',stdio:'pipe',windowsHide:true}).trim()==='OWNED','host_process_ownership');execFileSync('taskkill.exe',['/PID',String(s.hostPid),'/T','/F'],{stdio:'pipe',windowsHide:true});}
async function restartHost(){const s=state(),p=json(resolve(local,'prepared.json'));attest(s);await stopHost(s);copyFileSync(resolve(here,'lab-host-gateway.mjs'),resolve(p.context,'gateway.mjs'));const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['systemroot','windir','path','pathext','temp','tmp','comspec'].includes(key.toLowerCase())));Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:s.anon,NEXT_PUBLIC_APP_URL:origin,NEXT_TELEMETRY_DISABLED:'1',LAB_RUN_ID:s.id,LAB_SHA:s.sha});const log=openSync(resolve(local,'host-app.log'),'a',0o600),child=spawn(process.execPath,['gateway.mjs'],{cwd:p.context,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();closeSync(log);s.hostPid=child.pid;save(s);await wait(async()=>{await hostIdentity(s);return true;});console.log(JSON.stringify({status:'HOST_RESTARTED',sha:s.sha,origin}));}
async function acceptAfterRejectedOrigin(){
 const s=state();attest(s);await hostIdentity(s);
 const prefix=existsSync(resolve(local,'accept-r2-response-002.json'))?'accept-r3-':'accept-r2-';const prior=json(resolve(local,prefix==='accept-r3-'?'accept-r2-response-002.json':'accept-response-002.json'));check(prior.status===403&&prior.value?.code==='ORIGIN_FORBIDDEN','prior_write_not_known_rejected');
 check(sql(s,'SELECT count(*) FROM public.consultation_relationships')==='0','prior_relationship_not_empty');
 write(prefix+'start.json',{sha:s.sha,reason:'known_origin_rejection_fixed_only_in_lab_gateway'},true);
 const states=json(resolve(local,'native-sessions.json'));
 const warm=await fetch(origin+'/api/consultation',{signal:AbortSignal.timeout(120000)});check(warm.status===401,'lab_guest_route_not_ready');
 const load=async name=>{const m=await import(pathToFileURL(resolve(root,'lib/consultation/'+name+'.ts')));return m.default??m;};const {createServerClient}=createRequire(resolve(root,'package.json'))('@supabase/ssr');
 const result=await runNative({preview:origin,localLab:true,states,contract:await load('contracts'),errors:await load('errors'),replies:await load('replies'),roster:await load('rosterContracts'),createServerClient,store:async(name,value)=>write(prefix+name,value,true)});
 write('acceptance.json',{...result,sha:s.sha,isolation:attest(s)},true);console.log(JSON.stringify({...result,sha:s.sha,environment:'disposable-local-native'}));
}
async function finishAddons(){
 const s=state();attest(s);await hostIdentity(s);write('accept-r4-start.json',{sha:s.sha,reason:'baseline_completed_roster_error_shape_corrected_in_harness'},true);
 const grant=json(resolve(local,'accept-r3-response-002.json')),saved=json(resolve(local,'accept-r3-response-004.json'));
 check(grant.status===201&&saved.status===201,'baseline_receipts_missing');
 check([grant.value.id,saved.value.id].every(id=>typeof id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)),'baseline_receipt_identity');
 const baselineResume={relationshipId:grant.value.id,sessionId:saved.value.id,contentHash:saved.value.canonicalContentHash,posts:14};
 // Session content hash belongs to the persisted session, not the write receipt request hash.
 baselineResume.contentHash=sql(s,`SELECT content_hash FROM public.consultation_sessions WHERE id='${saved.value.id}'::uuid`);
 const states=json(resolve(local,'native-sessions.json')),load=async name=>{const m=await import(pathToFileURL(resolve(root,'lib/consultation/'+name+'.ts')));return m.default??m;};const {createServerClient}=createRequire(resolve(root,'package.json'))('@supabase/ssr');
 const result=await runNative({preview:origin,localLab:true,baselineResume,states,contract:await load('contracts'),errors:await load('errors'),replies:await load('replies'),roster:await load('rosterContracts'),createServerClient,store:async(name,value)=>write('accept-r4-'+name,value,true)});
 write('acceptance.json',{...result,sha:s.sha,baselineScenarios:17,isolation:attest(s)},true);console.log(JSON.stringify({...result,baselineScenarios:17,sha:s.sha,environment:'disposable-local-native'}));
}
async function nativePost(s,name,path,body,service=false){attest(s);await hostIdentity(s);write(name+'-intent.json',{path,body},true);let r;try{r=await fetch(origin+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',apikey:s.anon,...(service?{Authorization:'Bearer '+s.service}:{})},body:JSON.stringify(body)});}catch{throw Error('native_outcome_unknown_readback_required');}check(r.ok,'native_auth_failed_no_replay');return r.json();}
async function seed(){const s=state();attest(s);check(!Object.keys(s.users).length,'lab_seed_already_started');for(const role of ['owner','a','b','admin']){const marker='start-a-native-20261029-'+role,password=randomBytes(24).toString('hex'),email=marker+'-a@example.invalid';s.users[role]={marker,email,password};save(s);const user=await nativePost(s,'create-'+role,'/auth/v1/admin/users',{email,password,email_confirm:true,app_metadata:{acceptance_run:marker}},true);check(/^[a-f0-9-]{36}$/.test(user.id)&&user.email===email,'lab_native_user_identity');s.users[role].id=user.id;save(s);sql(s,`INSERT INTO public.profiles(id,role) VALUES('${user.id}','${['owner','admin'].includes(role)?'admin':'user'}');`);}sql(s,`INSERT INTO public.consultation_advisors(user_id,display_name,is_owner) VALUES('${s.users.owner.id}','Synthetic isolated owner',true);`);console.log(JSON.stringify({status:'SYNTHETIC_USERS_CREATED',count:4,realAccounts:0}));}
async function loginOnly(){const s=state();attest(s);const states={};for(const role of ['owner','a','b','admin']){const u=s.users[role];check(u?.id,'lab_user_missing');const session=await nativePost(s,'session-'+role,'/auth/v1/token?grant_type=password',{email:u.email,password:u.password});check(session.user?.id===u.id&&session.user?.app_metadata?.acceptance_run===u.marker,'lab_session_identity');states[role]={id:u.id,marker:u.marker,anonKey:s.anon,session};}write('native-sessions.json',states,true);
 console.log(JSON.stringify({status:'NATIVE_SESSIONS_READY',count:4,sha:s.sha,schemaMode:s.schemaMode}));return states;}
async function accept(){const s=state();attest(s);write('accept-start.json',{sha:s.sha,startedAt:new Date().toISOString()},true);const states=await loginOnly();
 // Warm only the read-only guest route before bounded one-shot writes.
 const warm=await fetch(origin+'/api/consultation',{signal:AbortSignal.timeout(120000)});check(warm.status===401,'lab_guest_route_not_ready');
 const load=async name=>{const m=await import(pathToFileURL(resolve(root,'lib/consultation/'+name+'.ts')));return m.default??m;};
 const {createServerClient}=createRequire(resolve(root,'package.json'))('@supabase/ssr');
 const result=await runNative({preview:origin,localLab:true,states,contract:await load('contracts'),errors:await load('errors'),replies:await load('replies'),roster:await load('rosterContracts'),createServerClient,store:async(name,value)=>write('accept-'+name,value,true)});write('acceptance.json',{...result,sha:s.sha,isolation:attest(s)},true);console.log(JSON.stringify({...result,sha:s.sha,environment:'disposable-local-native'}));}
async function down(){const s=state();await stopHost(s);for(const r of [...s.resources].reverse()){const c=JSON.parse(docker(r.type==='network'?['network','inspect',r.name]:['inspect',r.name]))[0];check((r.type==='network'?c.Labels:c.Config.Labels)?.[label]===s.id,'cleanup_ownership_mismatch');docker(r.type==='network'?['network','rm',r.name]:['rm','-f','-v',r.name]);}write('cleanup.json',{runId:s.id,status:'REMOVED_OWNED_RESOURCES',sha:s.sha});console.log('Owned local resources removed; private evidence retained.');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const mode=process.argv[2];if(mode==='prepare')snapshot(process.argv[3]);else if(mode==='up')await up();else if(mode==='up-host')await up(true);else if(mode==='restart-host')await restartHost();else if(mode==='accept-after-rejected-origin')await acceptAfterRejectedOrigin();else if(mode==='finish-addons')await finishAddons();else if(mode==='seed')await seed();else if(mode==='login-only')await loginOnly();else if(mode==='accept')await accept();else if(mode==='attest')console.log(JSON.stringify(attest(state())));else if(mode==='down')await down();else throw Error('prepare_up_seed_accept_attest_down_only');}catch(e){console.error(JSON.stringify({status:'BLOCKED',reason:/^[a-z0-9_]+$/.test(e.message)?e.message:'isolated_lab_failed_review_private_state',automaticReplay:false}));process.exitCode=2;}}
