import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const secrets=JSON.parse(await fs.readFile('.task/auth-sandbox/secrets.private.json','utf8'));
const auth='http://127.0.0.1:8789';const checks=[];
const sql=text=>execFileSync('docker',['exec','-i','followup-auth-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
async function check(label,fn){try{await fn();checks.push({label,status:'PASS'});}catch{checks.push({label,status:'FAIL'});await finish();throw Error('Synthetic boundary failed: '+label+'; private details suppressed.');}}
async function finish(){await fs.writeFile('docs/ops/seasonal-program/followup-auth-evidence/sandbox-boundaries.json',JSON.stringify({at:new Date().toISOString(),synthetic:true,checks},null,2));console.log(JSON.stringify(checks));}
const phoneFor=n=>'+98900000'+String(5000+n+10*Number(sql('select count(*) from auth.users')));
const client=()=>createClient(auth,secrets.anon,{auth:{persistSession:false,autoRefreshToken:false}});
const admin=createClient(auth,secrets.service,{auth:{persistSession:false,autoRefreshToken:false}});
async function inbox(phone){return JSON.parse(await fs.readFile('.task/auth-sandbox/inbox.private.json','utf8'))[phone].otp;}
let original;
await check('Legacy account linking keeps UUID, email, profile and existing personal record',async()=>{
  const email='legacy-'+Date.now()+'@example.test',password='Synthetic-only-'+Date.now();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);original=created.data.user.id;
  sql("create table if not exists public.synthetic_personal_records(user_id uuid references auth.users(id),note text);insert into public.synthetic_personal_records values('"+original+"','SYNTHETIC_HISTORY');");
  const legacy=client();assert.equal((await legacy.auth.signInWithPassword({email,password})).error,null);
  const phone=phoneFor(1);assert.equal((await legacy.auth.updateUser({phone})).error,null);
  assert.equal((await legacy.auth.verifyOtp({phone,token:await inbox(phone),type:'phone_change'})).error,null);
  const user=(await legacy.auth.getUser()).data.user;assert.equal(user.id,original);assert.equal(user.email,email);assert.ok(user.phone_confirmed_at);
  assert.equal(sql("select count(*) from public.profiles p join public.synthetic_personal_records r on r.user_id=p.id where p.id='"+original+"'"),'1');
});
await check('Claiming an already-linked mobile never silently merges another account',async()=>{
  const phone=sql("select phone from auth.users where id='"+original+"'");const other=client();const newPhone=phoneFor(2);
  assert.equal((await other.auth.signInWithOtp({phone:newPhone})).error,null);assert.equal((await other.auth.verifyOtp({phone:newPhone,token:await inbox(newPhone),type:'sms'})).error,null);
  const id=(await other.auth.getUser()).data.user.id;
  assert.notEqual((await other.auth.updateUser({phone})).error,null);assert.equal((await other.auth.getUser()).data.user.id,id);
});
await check('Expired GoTrue OTP rejected, independent of message receipt',async()=>{
  const c=client(),phone=phoneFor(3);assert.equal((await c.auth.signInWithOtp({phone})).error,null);const otp=await inbox(phone);
  sql("update auth.users set confirmation_sent_at=now()-interval '121 seconds' where phone='"+phone.slice(1)+"'");
  assert.notEqual((await c.auth.verifyOtp({phone,token:otp,type:'sms'})).error,null);assert.equal((await c.auth.getUser()).data.user,null);
});
await check('Provider outage returns failure, no confirmed phone or new session',async()=>{
  await fetch(auth+'/fixture/outage',{method:'POST'});const c=client(),phone=phoneFor(4);
  try{assert.notEqual((await c.auth.signInWithOtp({phone})).error,null);assert.equal((await c.auth.getUser()).data.user,null);assert.equal(sql("select count(*) from auth.users where phone='"+phone.slice(1)+"' and phone_confirmed_at is not null"),'0');}
  finally{await fetch(auth+'/fixture/healthy',{method:'POST'});}
});
await check('Public/authenticated cannot write digest, verify identity, read private tables or truncate',async()=>{
  assert.equal(sql("select has_function_privilege('anon','public.auth_read_private_identity()','EXECUTE')"),'f');
  assert.equal(sql("select has_function_privilege('authenticated','public.auth_save_private_identity(uuid,integer,text,text,text,text)','EXECUTE')"),'f');
  assert.equal(sql("select has_table_privilege('authenticated','identity_private.profile_versions','SELECT')"),'f');
  assert.equal(sql("select has_table_privilege('authenticated','identity_private.profile_versions','TRUNCATE')"),'f');
  const c=client(),phone=phoneFor(5);await c.auth.signInWithOtp({phone});await c.auth.verifyOtp({phone,token:await inbox(phone),type:'sms'});
  const read=await c.rpc('auth_read_private_identity');assert.equal(read.error,null);assert.equal(read.data,null);
  const write=await c.rpc('auth_save_private_identity',{p_user:original,p_base:0,p_ciphertext:'x'.repeat(40),p_digest:'f'.repeat(64),p_key_version:'v1',p_consent:'identity-v1'});assert.notEqual(write.error,null);
});
await finish();
