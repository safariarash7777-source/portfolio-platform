import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const site='http://127.0.0.1:8792';const checks=[];
const secrets=JSON.parse(await fs.readFile('.task/auth-sandbox/secrets.private.json','utf8'));
const cookies=new Map();
const db=text=>execFileSync('docker',['exec','-i','followup-auth-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const phone='+98900000'+String(1000+Number(db('select count(*) from auth.users')));
const firstNine=String(100+Number(db('select count(*) from auth.users'))).padStart(9,'0');
const rem=[...firstNine].reduce((sum,digit,i)=>sum+Number(digit)*(10-i),0)%11;
const nationalId=firstNine+String(rem<2?rem:11-rem);
async function request(path,body,jar=cookies){
  const response=await fetch(site+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin:site}:{}),cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});
  for(const header of response.headers.getSetCookie()){const pair=header.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={};}
  return {status:response.status,data,location:response.headers.get('location'),raw};
}
async function check(label,fn){try{await fn();checks.push({label,status:'PASS'});}catch{checks.push({label,status:'FAIL'});await finish();throw Error('Synthetic check failed: '+label+'; sensitive details suppressed.');}}
async function finish(){await fs.mkdir('docs/ops/seasonal-program/followup-auth-evidence',{recursive:true});await fs.writeFile('docs/ops/seasonal-program/followup-auth-evidence/sandbox-check.json',JSON.stringify({at:new Date().toISOString(),synthetic:true,gotrue:'v2.197.0',checks},null,2));console.log(JSON.stringify(checks));}
let otp,userId;
await check('OTP request executes real signed GoTrue hook',async()=>{
  const result=await request('/api/auth/mobile',{action:'send',phone});assert.equal(result.status,200);
  const inbox=JSON.parse(await fs.readFile('.task/auth-sandbox/inbox.private.json','utf8'));otp=inbox[phone].otp;assert.match(otp,/^\d{6}$/);
  assert.equal(db("select phone_confirmed_at is null from auth.users where phone='"+phone.slice(1)+"'"),'t');
});
await check('Wrong OTP rejected without clearing input or creating session',async()=>{const wrong=String((Number(otp)+1)%1000000).padStart(6,'0');assert.equal((await request('/api/auth/mobile',{action:'verify',phone,code:wrong})).status,400);assert.equal((await request('/api/auth/status')).data.authenticated,false);});
await check('GoTrue OTP verification -> SSR cookie -> profiles.user',async()=>{assert.equal((await request('/api/auth/mobile',{action:'verify',phone,code:otp})).status,200);const status=await request('/api/auth/status');assert.equal(status.data.authenticated,true);assert.equal(status.data.role,'user');userId=db("select id from auth.users where phone='"+phone.slice(1)+"'");});
await check('OTP replay rejected by GoTrue',async()=>{assert.equal((await request('/api/auth/mobile',{action:'verify',phone,code:otp})).status,400);});
await check('Unrelated user cannot enter admin and anonymous cannot read identity',async()=>{assert.equal(new URL((await request('/admin')).location).pathname,'/dashboard');assert.equal((await request('/api/auth/identity',undefined,new Map())).status,401);});
await check('Private identity encryption and append-only optimistic version',async()=>{
  const value={firstName:'نمونه',lastName:'مصنوعی',nationalId,baseVersion:0,consent:'identity-v1'};
  const saved=await request('/api/auth/identity',value);assert.equal(saved.status,200);assert.equal(saved.data.version,1);
  assert.equal((await request('/api/auth/identity',value)).status,409);
  value.baseVersion=1;value.firstName='نمونهٔ اصلاح‌شده';assert.equal((await request('/api/auth/identity',value)).status,200);
  const read=await request('/api/auth/identity');assert.equal(read.data.version,2);assert.equal(read.data.profile.firstName,value.firstName);assert.equal(read.data.identityMatch,'pending');
  assert.equal(db("select count(*) from identity_private.profile_versions where user_id='"+userId+"'"),'2');assert.equal(db("select bool_and(position('"+nationalId+"' in ciphertext)=0) from identity_private.profile_versions"),'t');
});
await check('Optional password needs fresh OTP and accepts legitimate GoTrue AMR',async()=>{assert.equal((await request('/api/auth/mobile',{action:'set-password',phone,password:'Synthetic-only-'+secrets.anon.slice(-20)})).status,200);});
await check('SSR refresh retains UUID and private versions',async()=>{assert.equal((await request('/api/auth/session',{action:'refresh'})).status,200);assert.equal((await request('/api/auth/status')).data.authenticated,true);assert.equal(db("select id from auth.users where phone='"+phone.slice(1)+"'"),userId);assert.equal((await request('/api/auth/identity')).data.version,2);});
await check('Logout -> no private access -> phone/password login same UUID',async()=>{
  assert.equal((await request('/api/auth/session',{action:'signout'})).status,200);assert.equal((await request('/api/auth/identity')).status,401);
  assert.equal((await request('/api/auth/mobile',{action:'password',phone,password:'Synthetic-only-'+secrets.anon.slice(-20)})).status,200);assert.equal((await request('/api/auth/status')).data.authenticated,true);assert.equal(db("select id from auth.users where phone='"+phone.slice(1)+"'"),userId);
});
await check('Password change blocked after password-only authentication',async()=>{assert.equal((await request('/api/auth/mobile',{action:'set-password',phone,password:'Synthetic-only-new-password'})).status,403);});
await check('CSRF origin mismatch rejected',async()=>{const response=await fetch(site+'/api/auth/mobile',{method:'POST',headers:{origin:'https://unrelated.example','content-type':'application/json'},body:JSON.stringify({action:'send',phone})});assert.equal(response.status,403);});
await finish();
