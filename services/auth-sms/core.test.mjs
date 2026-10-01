import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyHook,phone,kavenegarSend,readConfig} from './core.mjs';
import {Ledger} from './ledger.mjs';
const key=randomBytes(32),secret='v1,whsec_'+key.toString('base64');
const now=Date.now(), raw=JSON.stringify({user:{phone:'+989000000001'},sms:{otp:String(Math.floor(100000+Math.random()*900000))}});
function signed(body=raw,id='test-webhook',at=Math.floor(now/1000)) {return {'webhook-id':id,'webhook-timestamp':String(at),'webhook-signature':'v1,'+createHmac('sha256',key).update(`${id}.${at}.${body}`).digest('base64')};}
test('Standard Webhooks raw body, age, future, missing and rotation',()=>{
  assert.equal(verifyHook(raw,signed(),secret,now).phone,'+989000000001');
  assert.equal(verifyHook(raw,signed(),`v1,whsec_${randomBytes(32).toString('base64')}|${secret}`,now).phone,'+989000000001');
  for(const headers of [{},signed(raw,'test',Math.floor(now/1000)-301),signed(raw,'test',Math.floor(now/1000)+301)])assert.throws(()=>verifyHook(raw,headers,secret,now),/invalid_signature/);
  assert.throws(()=>verifyHook(raw+' ',signed(),secret,now),/invalid_signature/);
});
test('Iranian canonical mobile equivalents and rejection',()=>{
  for(const input of ['۰۹۰۰۰۰۰۰۰۰۱','٠٩٠٠٠٠٠٠٠٠١','00989000000001','989000000001','+98 900 000 0001'])assert.equal(phone(input),'+989000000001');
  for(const input of ['email@example.test','0912','+15551234567','091200000000'])assert.throws(()=>phone(input),/invalid_phone/);
});
test('GoTrue phone_change uses signed sms.phone, not old user.phone',()=>{
  const changed=JSON.stringify({user:{phone:'+989000000001',new_phone:'+989000000002'},sms:{phone:'989000000002',otp:JSON.parse(raw).sms.otp}});
  assert.equal(verifyHook(changed,signed(changed),secret,now).phone,'+989000000002');
});
test('Provider POST only, no key/OTP receipt, transport and provider errors',async()=>{
  const config={apiKey:'synthetic-key',template:'arashlogin'};
  const send=async (url,request)=>{assert.equal(request.method,'POST');assert.equal(new URL(url).search,'');assert.equal(new URLSearchParams(request.body).get('receptor'),'09000000001');return Response.json({return:{status:200},entries:[{messageid:1,status:5,cost:20,message:'not returned'}]});};
  assert.deepEqual(await kavenegarSend(config,verifyHook(raw,signed(),secret,now),send),{accepted:true,costRial:20});
  for(const status of [418,424,429,500])await assert.rejects(kavenegarSend(config,{phone:'+989000000001',otp:'random-test'},async()=>Response.json({return:{status}},{status})),/provider_rejected/);
  await assert.rejects(kavenegarSend(config,{phone:'+989000000001'},async()=>{throw Error('sensitive provider URL');}),/provider_unavailable/);
});
test('No production mock, implicit template approval or budget',()=>{
  assert.throws(()=>readConfig({SMS_PROVIDER:'local-mock',NODE_ENV:'production',AUTH_SMS_LOCAL_SANDBOX:'true'}),/mock_forbidden/);
  assert.throws(()=>readConfig({SMS_PROVIDER:'local-mock',NODE_ENV:'development'}),/mock_forbidden/);
  assert.throws(()=>readConfig({SMS_PROVIDER:'kavenegar'}),/configuration_missing/);
});
test('Durable reservation: replay, resend, global budget and failure cost',()=>{
  const dir=mkdtempSync(join(tmpdir(),'auth-sms-'));const config={dbPath:join(dir,'ledger.sqlite'),hmacSecret:'test'.repeat(10),dailySends:3,dailyBudget:300,reserveCost:100};
  let ledger=new Ledger(config);const message={id:'one',phone:'+989000000001'};
  try {
    assert.equal(ledger.reserve(message,now),true);assert.throws(()=>ledger.reserve(message,now),/replay_rejected/);
    ledger.settle(message,{accepted:true,costRial:80},now);ledger.close();ledger=new Ledger(config);
    assert.equal(ledger.reserve(message,now),false);
    assert.throws(()=>ledger.reserve({...message,id:'two'},now+59999),/rate_limited/);
    assert.equal(ledger.reserve({...message,id:'two'},now+60000),true);ledger.settle({...message,id:'two'},null,now);
    assert.equal(ledger.reserve({...message,id:'three',phone:'+989000000002'},now),true);
    assert.throws(()=>ledger.reserve({...message,id:'four',phone:'+989000000003'},now),/budget_exhausted/);
    assert.equal(JSON.stringify(ledger.db.prepare('SELECT * FROM sends').all()).includes(message.phone),false);
  } finally {ledger.close();rmSync(dir,{recursive:true});}
});
test('Durable verification caps and circuit after three failures',()=>{
  const dir=mkdtempSync(join(tmpdir(),'auth-sms-'));const ledger=new Ledger({dbPath:join(dir,'ledger.sqlite'),hmacSecret:'test'.repeat(10),dailySends:100,dailyBudget:10000,reserveCost:100});
  try {
    for(let i=0;i<10;i++)ledger.admit('verify','loopback','device','+989000000001',now);
    assert.throws(()=>ledger.admit('verify','loopback','device','+989000000001',now),/rate_limited/);
    for(let i=0;i<3;i++){const m={id:'failure-'+i,phone:'+98900000000'+i};ledger.reserve(m,now);ledger.settle(m,null,now);}
    assert.throws(()=>ledger.reserve({id:'failure-four',phone:'+989000000004'},now),/circuit_open/);
  }finally{ledger.close();rmSync(dir,{recursive:true});}
});
