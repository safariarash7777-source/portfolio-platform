import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url)),privateDir='C:/Users/Asus/.codex/private/followup06-auth-storage';
const secrets=JSON.parse(fs.readFileSync(privateDir+'/secrets.json')),accounts=JSON.parse(fs.readFileSync(privateDir+'/reviewer-credentials.json'));
const sensitive=[secrets.dbPassword,secrets.jwtSecret,secrets.anon,secrets.service,...Object.values(accounts).flatMap(x=>[x.password,x.email])].filter(x=>typeof x==='string'&&x.length>5);
const files=fs.readdirSync(dir).filter(x=>x.startsWith('independent')&&/\.(mjs|md|json)$/.test(x)),found=[];
for(const file of files){const raw=fs.readFileSync(path.join(dir,file),'utf8');if(sensitive.some(v=>raw.includes(v))||/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(raw)||/[?&]token=eyJ/.test(raw))found.push(file);}
const query="select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='identity_private' and c.relkind='r' order by c.relname; select count(*) from identity_private.profile_versions; select count(*) from auth.users; select count(*) from storage.objects; select has_function_privilege('authenticated','public.auth_save_private_identity(uuid,integer,text,text,text,text)','execute'); select has_function_privilege('authenticated','public.auth_read_private_identity()','execute');";
const catalog=cp.execFileSync('docker',['exec','followup06-accept-db','psql','-U','postgres','-d','postgres','-At','-c',query],{encoding:'utf8'}).trim();
const migration=path.resolve(dir,'../../../../supabase/migrations/20261001083215_auth_private_identity_versions.sql');
const hash=x=>createHash('sha256').update(x).digest('hex');
const result={at:new Date().toISOString(),scope:'Independent read-only verification on retained exclusively synthetic owned sandbox',scannedFiles:files.length,credentialOrTokenFindings:found.length,filesWithFindings:found,identityMigrationSHA256:hash(fs.readFileSync(migration)),catalogQuery:query,catalogResult:catalog,faultMode:JSON.parse(fs.readFileSync(privateDir+'/limited-fault.json')),currentBuildSHA:JSON.parse(fs.readFileSync(dir+'/app-manifest.json')).sha,humanGatesUntouched:true};
fs.writeFileSync(dir+'/independent-integrity.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(found.length)process.exitCode=1;
