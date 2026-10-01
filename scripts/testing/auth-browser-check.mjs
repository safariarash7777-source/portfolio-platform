import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const bin=process.env.AGENT_BROWSER_BIN;
if(!bin)throw Error('Set AGENT_BROWSER_BIN to installed browser CLI.');
const call=(...args)=>execFileSync(bin,['--session','followup-auth',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
const evidence='docs/ops/seasonal-program/followup-auth-evidence/';
const phone='+98900000'+String(8000+(Date.now()%1000));
const normalize=value=>value.replace(/[\u200c\s-]/g,'');
function ref(label){const snapshot=call('snapshot','-i');const line=snapshot.split('\n').find(line=>normalize(line).includes(normalize('"'+label+'"')));const id=line?.match(/ref=(e\d+)/)?.[1];if(!id)throw Error('Observed control unavailable');return '@'+id;}
let stage='open';
async function pause(ms){await new Promise(resolve=>setTimeout(resolve,ms));}
async function until(fn){for(let i=0;i<40;i++){if(await fn())return;await pause(250);}throw Error('UI transition timeout');}
try{
  call('cookies','clear');
  call('open','http://127.0.0.1:8792/login/mobile?next=%2Fmarket');call('set','viewport','390','844');
  stage='send';call('fill',ref('شماره همراه'),phone);call('click',ref('درخواست کد ورود'));await until(async()=>{try{return !!JSON.parse(await fs.readFile('.task/auth-sandbox/inbox.private.json','utf8'))[phone];}catch{return false;}});
  const inbox=JSON.parse(await fs.readFile('.task/auth-sandbox/inbox.private.json','utf8'));const otp=inbox[phone].otp;
  await until(()=>call('snapshot','-i').includes('کد شش'));
  const wrong=String((Number(otp)+1)%1000000).padStart(6,'0');
  stage='wrong-code';const codeRef=ref('کد شش‌رقمی پیامک');call('fill',codeRef,wrong);call('click',ref('تأیید کد'));await until(()=>call('eval',"!!document.querySelector('[role=alert]')?.textContent").trim()==='true');
  const retained=JSON.parse(call('eval',"JSON.stringify({retained:document.getElementById('mobile-code').value.length===6,error:document.querySelector('[role=alert]').textContent.length>0,overflow:document.documentElement.scrollWidth>innerWidth})"));
  // CLI returns a JSON-encoded evaluation result. Decode twice if needed.
  const state=typeof retained==='string'?JSON.parse(retained):retained;
  assert.equal(state.retained,true);assert.equal(state.error,true);assert.equal(state.overflow,false);
  call('fill',codeRef,'');call('screenshot',evidence+'mobile-invalid-390.png');
  stage='verify';call('fill',ref('کد شش‌رقمی پیامک'),otp);call('click',ref('تأیید کد'));await until(()=>/\/account\/mobile/.test(call('get','url')));
  assert.match(call('get','url'),/\/account\/mobile/);
  call('wait','--load','domcontentloaded');
  call('snapshot','-i');call('screenshot',evidence+'private-profile-empty-390.png');
  call('set','viewport','1440','1000');call('screenshot',evidence+'private-profile-empty-1440.png');
  stage='session';const sessionRaw=call('eval',"(async()=>JSON.stringify(await (await fetch('/api/auth/status')).json()))()");
  const session=JSON.parse(sessionRaw);const status=typeof session==='string'?JSON.parse(session):session;
  assert.equal(status.authenticated,true);assert.equal(status.role,'user');
  call('press','Tab');
  const focus=call('eval',"JSON.stringify({tag:document.activeElement.tagName,overflow:document.documentElement.scrollWidth>innerWidth,minButtonHeight:Math.min(...Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent!==null&&!b.textContent.includes('Next')).map(b=>b.getBoundingClientRect().height))})");
  const parsedFocus=JSON.parse(focus);
  await fs.writeFile(evidence+'browser.json',JSON.stringify({at:new Date().toISOString(),synthetic:true,browser:'Chromium via agent-browser',wrongOtpRetained:state.retained,errorVisible:state.error,ssrAuthenticated:status.authenticated,role:status.role,widths:[390,1440],focus:typeof parsedFocus==='string'?JSON.parse(parsedFocus):parsedFocus},null,2));
  console.log('Browser mobile OTP -> SSR private profile PASS; wrong-code input retained; artifacts contain no OTP/password.');
}catch(error){console.log(JSON.stringify({stage,contextChanged:/context.*destroy|navigation/i.test(error.message),timeout:/timeout/i.test(error.message)}));throw Error('Browser check failed at '+stage+'; credentials and input values suppressed.');}
