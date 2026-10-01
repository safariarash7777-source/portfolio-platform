import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import cp from 'node:child_process';import {randomUUID,randomBytes,createHash} from 'node:crypto';
const dir=path.join(os.homedir(),'.codex/private/followup06-auth-storage'),s=JSON.parse(fs.readFileSync(path.join(dir,'secrets.json'))),out='../portfolio-followup06-integration/docs/ops/seasonal-program/followup-06-auth-storage-evidence/';
const credentialFile=path.join(dir,'reviewer-credentials.json');
const sql=t=>cp.execFileSync('docker',['exec','-i','followup06-accept-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:t,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
if(fs.existsSync(out+'fixtures.json'))throw Error('Fixtures already exist; resume existing accounts rather than recreating');
let accounts=fs.existsSync(credentialFile)?JSON.parse(fs.readFileSync(credentialFile)):{};
for(const role of ['A','B','expired','cancelled','nonmember','admin']){
 if(accounts[role])continue;
 const email='followup06-'+role.toLowerCase()+'-'+randomBytes(4).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url');
 const response=await fetch(s.origin+'/supabase/auth/v1/admin/users',{method:'POST',headers:{apikey:s.service,authorization:'Bearer '+s.service,'content-type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name:'FOLLOWUP06 synthetic '+role}})});
 if(!response.ok)throw Error('Native account creation HTTP '+response.status+' role '+role);
 const user=await response.json();accounts[role]={id:user.id,email,password};fs.writeFileSync(credentialFile,JSON.stringify(accounts,null,2));
 sql(`INSERT INTO public.profiles(id,full_name,email,role) VALUES('${user.id}','FOLLOWUP06 synthetic ${role}','${email}','${role==='admin'?'admin':'user'}') ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,role=excluded.role;`);
}
const course=randomUUID(),cohorts={A:randomUUID(),B:randomUUID(),cancel:randomUUID()},resources={};
sql(`INSERT INTO public.courses(id,title,status) VALUES('${course}','FOLLOWUP06 synthetic course','published');`);
for(const [label,id] of Object.entries(cohorts)){
 sql(`INSERT INTO public.course_cohorts(id,course_id,title,starts_at,ends_at,policy_version,policy,status,module_keys) VALUES('${id}','${course}','FOLLOWUP06 synthetic ${label}',now()-interval '2 days',now()+interval '30 days','followup06-synthetic-v1','{"commercialEnabled":false,"calendar":"fixed-days","amount":32}','published',ARRAY['resources','webinar','market-overview']);`);
 const resource=randomUUID(),storagePath='followup06-'+label+'/synthetic.txt',bytes='FOLLOWUP06 SYNTHETIC PRIVATE FILE '+label+'\n';
 const response=await fetch(s.origin+'/supabase/storage/v1/object/course-private/'+storagePath,{method:'POST',headers:{apikey:s.service,authorization:'Bearer '+s.service,'content-type':'text/plain','x-upsert':'false'},body:bytes});
 if(!response.ok)throw Error('Native file upload HTTP '+response.status+' label '+label);
 sql(`INSERT INTO public.course_resources(id,cohort_id,title,storage_bucket,storage_path,published) VALUES('${resource}','${id}','FOLLOWUP06 private ${label}','course-private','${storagePath}',true);`);
 resources[label]={id:resource,storagePath,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes),uploadHTTP:response.status};
}
const manifest={sha:'2605a0ff11ff5cb0f83837528aed230846469b16',environment:'followup06-auth-storage-2605-local',createdAt:new Date().toISOString(),accounts:Object.fromEntries(Object.entries(accounts).map(([r,a])=>[r,{id:a.id,profileRole:r==='admin'?'admin':'user'}])),course,cohorts,resources,accountCreation:'Native GoTrue admin API; email confirmed test users; login must still use product UI',storage:'Native Storage upload API; real storage.objects; no scaffold objects',credentialFile:'C:/Users/Asus/.codex/private/followup06-auth-storage/reviewer-credentials.json'};
fs.writeFileSync(out+'fixtures.json',JSON.stringify(manifest,null,2)+'\n');
const env=JSON.parse(fs.readFileSync(out+'environment.json'));if(env.blocker){env.historicalSetupBlocker=env.blocker;delete env.blocker;}env.status='NATIVE_SERVICES_READY';fs.writeFileSync(out+'environment.json',JSON.stringify(env,null,2)+'\n');
console.log(JSON.stringify({accounts:Object.keys(accounts),nativeFiles:Object.keys(resources),status:'SYNTHETIC_FIXTURES_READY'}));
