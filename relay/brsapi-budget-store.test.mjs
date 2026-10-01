import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseLeaseStore } from './brsapi-budget-store.mjs';
import { PersistentDailyBudget } from './brsapi-client.mjs';
const store = response => makeSupabaseLeaseStore({ url:'https://isolated.invalid',serviceKey:'synthetic',fetchImpl:async()=>response });
test('RPC errors expose code but never remote message/details',async()=>{
  const s=store({ok:false,status:400,json:async()=>({code:'BRSB4',message:'private remote text',details:'private detail'})});
  await assert.rejects(()=>s.lease('2026-10-01',10,100),e=>e.code==='BRSB4'&&!e.message.includes('private'));
});
test('invalid or over-ceiling grants fail closed',async()=>{
  for(const r of [{granted:-1,leased_before:0,hard_ceiling:100},{granted:11,leased_before:0,hard_ceiling:100},
    {granted:1,leased_before:100,hard_ceiling:100},{granted:0.5,leased_before:0,hard_ceiling:100},
    {granted:1,leased_before:null,hard_ceiling:100}]) {
    await assert.rejects(()=>store({ok:true,json:async()=>[r]}).lease('2026-10-01',10,100));
  }
});
test('valid lease preserves real shared-counter metadata',async()=>{
  const s=store({ok:true,json:async()=>[{granted:7,leased_before:93,hard_ceiling:100}]});
  assert.deepEqual(await s.lease('2026-10-01',10,100),{granted:7,leasedBefore:93,hardCeiling:100});
});
for(const oldFails of [true,false]) test(`previous-day RPC ${oldFails?'failure':'success'} cannot clear the new pending lease`,async()=>{
  let now=Date.parse('2026-09-30T20:29:00Z');
  const calls=[];
  const st={lease:()=>new Promise((resolve,reject)=>calls.push({resolve,reject}))};
  const b=new PersistentDailyBudget({store:st,softBudget:100,hardCeiling:100,leaseSize:7,now:()=>now});
  const old=b.ensure();
  now+=120000;
  const current=b.ensure();
  if(oldFails)calls[0].reject(new Error('old day disconnected'));
  else calls[0].resolve({granted:7,leasedBefore:0,hardCeiling:100});
  await old;
  const simultaneous=b.ensure();
  assert.equal(calls.length,2,'new-day pending RPC must remain shared');
  calls[1].resolve({granted:7,leasedBefore:13,hardCeiling:100});
  await Promise.all([current,simultaneous]);
  assert.equal(b.snapshot().store.errors,0);
  assert.equal(b.snapshot().remainingKnown,true);
  assert.equal(b.snapshot().lease.granted,7,'old-day lease must be discarded');
});
