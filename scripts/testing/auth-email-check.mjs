import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';import {mimeHtml} from './auth-local-smtp.mjs';
const site='http://127.0.0.1:8792',auth='http://127.0.0.1:8789';
const secrets=JSON.parse(await fs.readFile('.task/auth-sandbox/secrets.private.json','utf8'));
const client=()=>createClient(auth,secrets.anon,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=text=>execFileSync('docker',['exec','-i','followup-auth-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const checks=[],jar=new Map();let identityId;
async function request(body,cookies=jar,path='/api/auth/email'){
  const response=await fetch(site+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin:site}:{}),cookie:[...cookies].map(([key,value])=>key+'='+value).join('; ')},body:body?JSON.stringify(body):undefined,redirect:'manual'});
  for(const header of response.headers.getSetCookie()){const pair=header.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
  return {status:response.status,data:await response.json()};
}
async function received(email){
  for(let i=0;i<40;i++){
    try{const messages=JSON.parse(await fs.readFile('.task/auth-sandbox/mail.private.json','utf8'));const message=messages.filter(x=>x.recipient===email).at(-1);if(message){const html=mimeHtml(message.mime);const href=html.match(/href="([^"]+)"/)?.[1];if(href)return {html,link:new URL(href)};}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }throw Error('Local SMTP receipt missing');
}
function payload(mail,type='signup'){const hash=new URLSearchParams(mail.link.hash.slice(1)).get('token_hash');return {action:'verify',type,tokenHash:hash,next:'/market'};}
async function check(label,fn){try{await fn();checks.push({label,status:'PASS'});}catch{checks.push({label,status:'FAIL'});await finish();throw Error('Email sandbox check failed: '+label+'; private details suppressed');}}
async function finish(){await fs.writeFile('docs/ops/seasonal-program/followup-auth-evidence/email-sandbox.json',JSON.stringify({at:new Date().toISOString(),synthetic:true,gotrue:'v2.197.0',smtp:'loopback receiver; no external delivery',checks},null,2));console.log(JSON.stringify(checks));}
const email='email-'+Date.now()+'@example.test',password='Synthetic-email-'+Date.now();let confirmation;
await check('Real GoTrue→local SMTP Persian confirmation; link has fragment, not HTTP token query',async()=>{
  const signup=await client().auth.signUp({email,password,options:{emailRedirectTo:site+'/auth/callback?next=%2Fmarket'}});assert.equal(signup.error,null);identityId=signup.data.user.id;
  assert.equal(sql("select email_confirmed_at is null from auth.users where id='"+identityId+"'"),'t');confirmation=await received(email);
  assert.equal(confirmation.link.pathname,'/auth/email-link');assert.equal(confirmation.link.search,'');assert.ok(confirmation.html.includes('تأیید ایمیل'));assert.ok(confirmation.link.hash.includes('token_hash='));
});
await check('Confirmation consumed by SSR cookie route; allowed destination, same UUID/role and refresh',async()=>{
  const verified=await request(payload(confirmation));assert.equal(verified.status,200);assert.equal(verified.data.next,'/market');
  assert.equal(sql("select email_confirmed_at is not null from auth.users where id='"+identityId+"'"),'t');
  const status=await request(null,jar,'/api/auth/status');assert.equal(status.data.authenticated,true);assert.equal(status.data.role,'user');
  assert.equal((await request({action:'refresh'},jar,'/api/auth/session')).status,200);
});
await check('Consumed/tampered confirmation rejected; public request cannot read private identity/admin health',async()=>{
  assert.equal((await request(payload(confirmation),new Map())).status,400);
  assert.equal((await request({...payload(confirmation),tokenHash:'f'.repeat(64)},new Map())).status,400);
  assert.equal((await request(null,new Map(),'/api/auth/identity')).status,401);
  assert.equal((await request(null,jar,'/api/admin/auth-health')).status,403);
});
let recovery;
await check('Recovery response is identical for known/missing email; SMTP receives valid recovery link',async()=>{
  const known=await request({action:'recover',email}),missing=await request({action:'recover',email:'missing-'+Date.now()+'@example.test'});
  assert.equal(known.status,200);assert.deepEqual(known,missing);recovery=await received(email);assert.ok(recovery.html.includes('بازیابی رمز'));assert.equal(recovery.link.search,'');
});
await check('Native email resend limiter rejects repeated request; BFF response stays neutral',async()=>{
  const response=await client().auth.resetPasswordForEmail(email);assert.ok(response.error);assert.equal(response.error.status,429);
  assert.equal((await request({action:'recover',email})).data.status,'recovery_requested');
});
await check('Recovery link creates real SSR session; password change, logout and same-account login',async()=>{
  const recoveryJar=new Map();const verified=await request({...payload(recovery,'recovery'),next:'https://evil.test'},recoveryJar);assert.equal(verified.status,200);assert.equal(verified.data.next,'/reset-password');
  const status=await request(null,recoveryJar,'/api/auth/status');assert.equal(status.data.authenticated,true);
  const nextPassword='Synthetic-recovered-'+Date.now();assert.equal((await request({action:'set-password',password:nextPassword},recoveryJar)).status,200);
  assert.equal((await request({action:'signout'},recoveryJar,'/api/auth/session')).status,200);
  const fresh=client();assert.equal((await fresh.auth.signInWithPassword({email,password:nextPassword})).error,null);assert.equal((await fresh.auth.getUser()).data.user.id,identityId);
  assert.equal((await request(payload(recovery,'recovery'),new Map())).status,400);
});
await check('Expired real email confirmation is rejected without session',async()=>{
  const address='expired-'+Date.now()+'@example.test';const signup=await client().auth.signUp({email:address,password});assert.equal(signup.error,null);const mail=await received(address);
  sql("update auth.users set confirmation_sent_at=now()-interval '121 seconds' where id='"+signup.data.user.id+"'");assert.equal((await request(payload(mail),new Map())).status,400);
});
await check('SMTP outage is neutral to recovery and does not break password or unrelated mobile channel',async()=>{
  await fetch(auth+'/fixture/email-outage',{method:'POST'});
  try{
    const address='outage-'+Date.now()+'@example.test';const failed=await client().auth.signUp({email:address,password});assert.ok(failed.error);
    assert.equal((await request({action:'recover',email:address})).status,200);
    // Mobile channel is a separate hook/adapter; no auto-confirm.
    const phone='+98900000'+String(9000+Number(sql('select count(*) from auth.users')));const sms=client();assert.equal((await sms.auth.signInWithOtp({phone})).error,null);
    const inbox=JSON.parse(await fs.readFile('.task/auth-sandbox/inbox.private.json','utf8'));assert.equal((await sms.auth.verifyOtp({phone,token:inbox[phone].otp,type:'sms'})).error,null);assert.ok((await sms.auth.getUser()).data.user.phone_confirmed_at);
  }finally{await fetch(auth+'/fixture/email-healthy',{method:'POST'});}
});
await finish();
