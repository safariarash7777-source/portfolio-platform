import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';import {mimeHtml} from './auth-local-smtp.mjs';
const bin=process.env.AGENT_BROWSER_BIN;if(!bin)throw Error('Set installed AGENT_BROWSER_BIN');
const call=(...args)=>execFileSync(bin,['--session','followup-auth',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
const secrets=JSON.parse(await fs.readFile('.task/auth-sandbox/secrets.private.json','utf8'));
const client=createClient('http://127.0.0.1:8789',secrets.anon,{auth:{persistSession:false,autoRefreshToken:false}});
const email='browser-email-'+Date.now()+'@example.test',password='Synthetic-browser-'+Date.now();
const evidence='docs/ops/seasonal-program/followup-auth-evidence/';
const decode=value=>{const parsed=JSON.parse(value);return typeof parsed==='string'?JSON.parse(parsed):parsed;};
function ref(label){const clean=value=>value.replace(/[\u200c\s*]/g,'');const line=call('snapshot','-i').split('\n').find(x=>clean(x).includes(clean('"'+label+'"')));const id=line?.match(/ref=(e\d+)/)?.[1];if(!id)throw Error('Expected control absent');return '@'+id;}
async function until(fn){for(let i=0;i<50;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,200));}throw Error('Email browser transition timeout');}
async function link(type){let target;await until(async()=>{try{const messages=JSON.parse(await fs.readFile('.task/auth-sandbox/mail.private.json','utf8'));const html=mimeHtml(messages.filter(x=>x.recipient===email).at(-1).mime);target=html.match(/href="([^"]+)"/)?.[1];return new URL(target).hash.includes('type='+type);}catch{return false;}});return target;}
let stage='signup';
try{
  const signup=await client.auth.signUp({email,password,options:{emailRedirectTo:'http://127.0.0.1:8792/auth/callback?next=%2Fmarket'}});assert.equal(signup.error,null);
  call('cookies','clear');call('set','viewport','390','844');call('open',await link('signup'));
  await until(()=>/\/market/.test(call('get','url')));call('wait','--load','domcontentloaded');assert.equal(call('eval','location.hash.length').trim(),'0');
  assert.equal(decode(call('eval',"(async()=>JSON.stringify(await(await fetch('/api/auth/status')).json()))()")).authenticated,true);
  stage='request-recovery';call('open','http://127.0.0.1:8792/forgot-password');call('fill',ref('آدرس ایمیل'),email);call('click',ref('ارسال لینک بازیابی'));
  await until(()=>call('eval',"document.body.innerText.includes('درخواست بازیابی ثبت شد')").trim()==='true');
  stage='consume-recovery';call('cookies','clear');call('open',await link('recovery'));await until(()=>/\/reset-password/.test(call('get','url')));call('wait','--load','domcontentloaded');
  await until(()=>call('eval',"Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('ذخیره رمز جدید')&&!b.disabled)").trim()==='true');
  assert.equal(call('eval','location.hash.length').trim(),'0');
  const nextPassword='Synthetic-new-'+Date.now();call('fill',ref('رمز عبور جدید'),nextPassword);call('fill',ref('تکرار رمز عبور'),nextPassword);call('click',ref('ذخیره رمز جدید'));
  await until(()=>call('eval',"document.body.innerText.includes('رمز عبور با موفقیت تغییر کرد')").trim()==='true');
  assert.equal((await client.auth.signInWithPassword({email,password:nextPassword})).error,null);
  call('screenshot',evidence+'email-recovery-390.png');
  const result={at:new Date().toISOString(),synthetic:true,realSmtpReceipt:true,signupFragmentConsumed:true,fragmentCleared:true,allowedReturnToPreserved:true,forgotFormRequested:true,recoveryFormSaved:true,sameUuidAfterPasswordLogin:(await client.auth.getUser()).data.user.id===signup.data.user.id,width:390};
  await fs.writeFile(evidence+'email-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.log(JSON.stringify({stage,contextChanged:/context.*destroy|navigation/i.test(error.message),timeout:/timeout/i.test(error.message)}));throw Error('Email browser failed at '+stage+'; private details suppressed');}
