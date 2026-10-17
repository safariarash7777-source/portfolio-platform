import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const load=(file,dependencies={})=>{const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,Date,Number,process:{env:{}},require(name){if(name in dependencies)return dependencies[name];throw Error('Unmocked dependency '+name);}});return exports;};
const contract=load('lib/webinars/contracts.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={registration_id:id(1),webinar_id:id(2),user_id:id(3),payment_id:id(4),amount:100,authority:'SYNTHETIC',payment_status:'paid',registration_payment_status:'paid',ref_id:'101',verified_at:'2026-10-17T00:00:00.000Z',access_qualified:false,fulfillment_state:'paid_pending_resolution',resolution_kind:'refund_due',confirmed_at:null,access_enabled:true,access_starts_at:'2026-10-01T00:00:00.000Z',access_ends_at:'2027-01-01T00:00:00.000Z'};
test('v1 defaults exactly 90 elapsed days after the explicit event end and grants no account-wide field',()=>{
 const input={title:'Synthetic',starts_at:'2030-10-01T00:00:00.000Z',ends_at:'2030-10-02T00:00:00.000Z',price_toman:100,max_capacity:1,access_enabled:true,registration_open:true,platform_url:'https://session.invalid/test'};
 const parsed=contract.webinarInput(input);assert.ok(parsed);assert.equal(Date.parse(parsed.access_ends_at)-Date.parse(input.ends_at),90*24*60*60*1000);assert.equal(parsed.max_capacity,1);assert.equal(Object.hasOwn(parsed,'membership'),false);assert.equal(Object.hasOwn(parsed,'entitlement'),false);
 assert.equal(contract.webinarInput({...input,ends_at:null}),null);
 assert.ok(contract.webinarInput({...input,ends_at:null,access_starts_at:'2030-10-01T00:00:00.000Z',access_ends_at:'2031-01-01T00:00:00.000Z'}));
});
test('paid without a seat is a valid financial receipt only with explicit refund_due, never forged success',()=>{
 assert.ok(contract.paymentContext(context,'SYNTHETIC',id(1)));
 for(const changed of [{resolution_kind:null},{fulfillment_state:'confirmed'},{confirmed_at:'2026-10-17T00:00:00.000Z'},{access_qualified:true}])assert.equal(contract.paymentContext({...context,...changed},'SYNTHETIC',id(1)),null);
 assert.equal(contract.settledReceipt({...context,settled:true},context,'101'),true);
});
const callback=async initial=>{
 let verifies=0,settles=0;
 const pending={...context,payment_status:'pending',registration_payment_status:'pending',access_qualified:false,ref_id:null,verified_at:null,fulfillment_state:'pending',resolution_kind:null};
 const route=load('app/api/webinars/payment/callback/route.ts',{'next/server':{NextResponse:{redirect:url=>({url:String(url)})}},'@/lib/webinars/contracts':contract,
  '@/lib/supabase/admin':{tryCreateAdminClient:()=>({rpc:async name=>{if(name==='read_webinar_payment_context')return{data:initial==='paid'?context:pending};if(name==='settle_webinar_payment'){settles++;return{data:{...context,settled:true,reused:false}};}throw Error('Unexpected RPC '+name);}})},
  '@/lib/zarinpal':{verifyPayment:async()=>{verifies++;return{outcome:'verified',code:100,refId:'101'};}}});
 const result=await route.GET({nextUrl:new URL(`https://app.invalid/api/webinars/payment/callback?Authority=SYNTHETIC&registration_id=${id(1)}&Status=OK`)});
 return{status:new URL(result.url).searchParams.get('status'),verifies,settles};
};
test('already-paid resolution replay does not call provider or settlement and cannot redirect to registration success',async()=>{assert.deepEqual(await callback('paid'),{status:'paid_pending_resolution',verifies:0,settles:0});});
test('verified late settlement without a seat redirects to resolution, preserving the financial fact',async()=>{assert.deepEqual(await callback('pending'),{status:'paid_pending_resolution',verifies:1,settles:1});});
