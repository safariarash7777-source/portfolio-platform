// Fresh local GoTrue/PostgREST/Postgres, random infrastructure credentials, no restore.
// Secret material stays in an ignored folder; output is status-only.
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {startService} from '../../services/auth-sms/server.mjs';
import {readConfig,SmsError} from '../../services/auth-sms/core.mjs';
import {localSmtp} from './auth-local-smtp.mjs';
const dir='.task/auth-sandbox';await fs.mkdir(dir,{recursive:true});
const docker=(args,input)=>{try{return execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});}catch{throw Error('Synthetic Docker operation failed ('+args.slice(0,2).join(' ')+'); sensitive details suppressed.');}};
function infrastructureKey(role,secret){const b=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const data=b({alg:'HS256',typ:'JWT'})+'.'+b({iss:'supabase',role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400});return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');}
const dbPassword=randomBytes(24).toString('hex'),jwtSecret=randomBytes(32).toString('hex');
const names={db:'followup-auth-db',auth:'followup-auth-gotrue',rest:'followup-auth-rest'};
const network='followup-auth-network';
if(docker(['ps','-a','--format','{{.Names}}']).split('\n').some(name=>Object.values(names).includes(name)))throw Error('Existing FOLLOWUP sandbox must be inspected before reusing.');
if(docker(['network','ls','--format','{{.Name}}']).split('\n').includes(network)) {
  if(docker(['network','inspect',network,'--format','{{len .Containers}}']).trim()!=='0')throw Error('Synthetic network already has members; inspect before reuse.');
} else docker(['network','create',network]);
docker(['run','-d','--name',names.db,'--network',network,'-e','POSTGRES_PASSWORD='+dbPassword,'postgres:17-alpine']);
for(let i=0;i<50;i++){try{docker(['exec',names.db,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,500));}}
const sql=text=>docker(['exec','-i',names.db,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],text);
sql("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE authenticator LOGIN PASSWORD '"+dbPassword+"'; GRANT anon,authenticated,service_role TO authenticator; CREATE SCHEMA auth;");
const hookSecret='v1,whsec_'+randomBytes(32).toString('base64');const controlSecret=randomBytes(32).toString('hex');
const env={NODE_ENV:'development',SMS_PROVIDER:'local-mock',AUTH_SMS_LOCAL_SANDBOX:'true',SMS_BIND:'127.0.0.1',PORT:'8788',SEND_SMS_HOOK_SECRET:hookSecret,AUTH_SMS_CONTROL_SECRET:controlSecret,AUTH_SMS_FINGERPRINT_SECRET:randomBytes(32).toString('hex'),AUTH_SMS_DB_PATH:dir+'/ledger.sqlite',SMS_DAILY_SEND_LIMIT:'100',SMS_DAILY_BUDGET_RIAL:'10000',SMS_MAX_MESSAGE_COST_RIAL:'100'};
const inbox=new Map();let outage=false;
const email=await localSmtp(dir,{sandbox:true});
startService(readConfig(env),{mockSend:async message=>{if(outage)throw new SmsError('provider_unavailable');inbox.set(message.phone,{otp:message.otp,receivedAt:Date.now()});await fs.writeFile(dir+'/inbox.private.json',JSON.stringify(Object.fromEntries(inbox)));return {accepted:true,costRial:1};}});
const authDatabase=new URL('postgres://' + names.db + ':5432/postgres');authDatabase.username='postgres';authDatabase.password=dbPassword;authDatabase.searchParams.set('search_path','auth');
const authEnv={GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:8789/auth/v1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:authDatabase.href,GOTRUE_SITE_URL:'http://127.0.0.1:8792',GOTRUE_URI_ALLOW_LIST:'http://127.0.0.1:8792/**',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_EXP:'300',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'true',GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_SMS_AUTOCONFIRM:'false',GOTRUE_SMS_MAX_FREQUENCY:'60s',GOTRUE_SMS_OTP_EXP:'120',GOTRUE_SMS_OTP_LENGTH:'6',GOTRUE_RATE_LIMIT_SMS_SENT:'100',GOTRUE_HOOK_SEND_SMS_ENABLED:'true',GOTRUE_HOOK_SEND_SMS_URI:'http://host.docker.internal:8788/hooks/send-sms',GOTRUE_HOOK_SEND_SMS_SECRETS:hookSecret};
// v2.197.0 skips verification rate limits when no trusted header is configured.
authEnv.GOTRUE_RATE_LIMIT_HEADER='X-Auth-Client-IP';
authEnv.GOTRUE_RATE_LIMIT_VERIFY='30';
Object.assign(authEnv,{GOTRUE_SMTP_HOST:'host.docker.internal',GOTRUE_SMTP_PORT:'8795',GOTRUE_SMTP_ADMIN_EMAIL:'auth@example.test',GOTRUE_SMTP_SENDER_NAME:'آرش صفری — محیط مصنوعی',GOTRUE_SMTP_LOGGING_ENABLED:'false',GOTRUE_SMTP_MAX_FREQUENCY:'60s',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_MAILER_OTP_EXP:'120',GOTRUE_MAILER_TEMPLATES_CONFIRMATION:'http://host.docker.internal:8796/confirmation',GOTRUE_MAILER_TEMPLATES_RECOVERY:'http://host.docker.internal:8796/recovery',GOTRUE_MAILER_SUBJECTS_CONFIRMATION:'تأیید ایمیل حساب',GOTRUE_MAILER_SUBJECTS_RECOVERY:'بازیابی رمز حساب',GOTRUE_RATE_LIMIT_EMAIL_SENT:'100'});
docker(['run','-d','--name',names.auth,'--network',network,'--add-host','host.docker.internal:host-gateway','-p','127.0.0.1:8790:9999',...Object.entries(authEnv).flatMap(([k,v])=>['-e',k+'='+v]),'sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b']);
let ready=false;for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:8790/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!ready)throw Error('Synthetic GoTrue failed to become healthy. Inspect redacted status only.');
sql("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;");
sql(await fs.readFile('sql/archive/supabase_schema.sql','utf8'));
sql('GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; GRANT SELECT ON public.profiles TO authenticated;');
sql(await fs.readFile('supabase/migrations/20261001083215_auth_private_identity_versions.sql','utf8'));
const restDatabase=new URL('postgres://' + names.db + ':5432/postgres');restDatabase.username='authenticator';restDatabase.password=dbPassword;
const restEnv={PGRST_DB_URI:restDatabase.href,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret};
docker(['run','-d','--name',names.rest,'--network',network,'-p','127.0.0.1:8791:3000',...Object.entries(restEnv).flatMap(([k,v])=>['-e',k+'='+v]),'dev07/postgrest:14.17']);
const anon=infrastructureKey('anon',jwtSecret),service=infrastructureKey('service_role',jwtSecret);
const gateway=createServer(async(req,res)=>{
  try{
    if(req.url==='/fixture/outage' && req.method==='POST'){outage=true;res.end('{}');return;}
    if(req.url==='/fixture/healthy' && req.method==='POST'){outage=false;res.end('{}');return;}
    if(req.url==='/fixture/email-outage' && req.method==='POST'){email.setOutage(true);res.end('{}');return;}
    if(req.url==='/fixture/email-healthy' && req.method==='POST'){email.setOutage(false);res.end('{}');return;}
    const prefix=req.url.startsWith('/auth/v1')?'/auth/v1':req.url.startsWith('/rest/v1')?'/rest/v1':null;
    if(!prefix){res.writeHead(404);res.end('{}');return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const headers={...req.headers};delete headers.host;delete headers['content-length'];
    // Never forward a client-supplied limiter identity. Synthetic loopback only.
    headers['x-auth-client-ip']=req.socket.remoteAddress;
    const response=await fetch('http://127.0.0.1:'+(prefix==='/auth/v1'?8790:8791)+req.url.slice(prefix.length),{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual'});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503);res.end('{}');}
});gateway.listen(8789,'127.0.0.1');
const nextEnv={...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:8789',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,NEXT_PUBLIC_APP_URL:'http://127.0.0.1:8792',AUTH_MOBILE_ENABLED:'true',AUTH_MOBILE_ALLOW_SIGNUP:'true',AUTH_MOBILE_LOCAL_SANDBOX:'true',AUTH_SMS_CONTROL_URL:'http://127.0.0.1:8788',AUTH_SMS_CONTROL_SECRET:controlSecret,AUTH_IDENTITY_KEY_VERSION:'v1',AUTH_IDENTITY_ENCRYPTION_KEY:randomBytes(32).toString('base64'),AUTH_IDENTITY_HMAC_KEY:randomBytes(32).toString('base64'),NODE_OPTIONS:'--require ./scripts/testing/local-network-only.cjs'};
delete nextEnv.NEXT_PUBLIC_LIARA_API_URL;delete nextEnv.NEXT_PUBLIC_LIARA_ANON_KEY;
nextEnv.AUTH_EMAIL_ENABLED='true';
await fs.writeFile(dir+'/secrets.private.json',JSON.stringify({anon,service,nextEnv,smsEnv:env,names}));
const output=await fs.open(dir+'/next.private.log','w');
const next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p','8792'],{env:nextEnv,stdio:['ignore',output.fd,output.fd]});
await output.close();
await fs.writeFile(dir+'/manifest.json',JSON.stringify({synthetic:true,site:'http://127.0.0.1:8792',auth:'http://127.0.0.1:8789',gotrue:'v2.197.0',names,nextPid:next.pid,supervisorPid:process.pid},null,2));
console.log('Synthetic sandbox started: http://127.0.0.1:8792/login/mobile; GoTrue v2.197.0; mock SMS only; no remote fetch.');
// This process owns the mock sink and gateway. Stop without touching other sessions.
process.on('SIGINT',()=>{next.kill();gateway.close();email.close();process.exit();});
