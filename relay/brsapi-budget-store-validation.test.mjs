import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import child from 'node:child_process';

const effects = { fetch: 0, http: 0, socket: 0, child: 0 };
const deny = (kind) => () => { effects[kind]++; throw new Error('Offline audit: forbidden effect'); };
globalThis.fetch = deny('fetch');
http.request = http.get = https.request = https.get = deny('http');
net.connect = net.createConnection = net.Socket.prototype.connect = deny('socket');
for (const key of ['exec','execFile','spawn','fork','execSync','execFileSync','spawnSync']) child[key] = deny('child');
const { makeSupabaseLeaseStore: candidate } = await import('./brsapi-budget-store.mjs');
const { PersistentDailyBudget } = await import('./brsapi-client.mjs');
const good = { granted: 5, leased_before: 50, hard_ceiling: 100 };
function fixture(make, value) {
  const calls = [];
  const store = make({ url: 'https://budget-audit.invalid/', serviceKey: 'synthetic-fixture-only', fetchImpl: async (url, options) => {
    calls.push({ url, method: options.method, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => value };
  }});
  return { store, calls };
}

for (const [name,value] of [
  ['missing prior',{granted:5,hard_ceiling:100}], ['null prior',{...good,leased_before:null}],
  ['missing ceiling',{granted:5,leased_before:50}], ['null ceiling',{...good,hard_ceiling:null}],
  ['missing grant',{leased_before:50,hard_ceiling:100}], ['negative grant',{...good,granted:-1}],
  ['fraction grant',{...good,granted:1.5}], ['NaN grant',{...good,granted:NaN}],
  ['infinite grant',{...good,granted:Infinity}], ['string grant',{...good,granted:'5'}],
  ['grant exceeds request',{...good,granted:6}], ['negative prior',{...good,leased_before:-1}],
  ['fraction prior',{...good,leased_before:1.5}], ['string prior',{...good,leased_before:'50'}],
  ['integer overflow',{...good,leased_before:2147483648}], ['zero ceiling',{...good,hard_ceiling:0}],
  ['fraction ceiling',{...good,hard_ceiling:99.5}], ['ceiling exceeds request',{...good,hard_ceiling:101}],
  ['total exceeds ceiling',{...good,leased_before:99}], ['null row',null],
  ['empty rows',[]], ['multiple rows',[good,good]],
]) test(`candidate rejects ${name} after exactly one request`, async () => {
  const {store,calls} = fixture(candidate,value);
  await assert.rejects(store.lease('2026-11-04',5,100),/بی‌شکل/);
  assert.equal(calls.length,1);
});

test('valid array and object preserve exact prior consumption and argument names', async () => {
  for (const value of [good,[good]]) {
    const {store,calls} = fixture(candidate,value);
    assert.deepEqual(await store.lease('commodity:2026-11-04',5,100), {granted:5,leasedBefore:50,hardCeiling:100});
    assert.deepEqual(calls,[{url:'https://budget-audit.invalid/rest/v1/rpc/brsapi_budget_lease',method:'POST',body:{p_day:'commodity:2026-11-04',p_want:5,p_hard:100}}]);
  }
});
test('known exhaustion is a valid zero grant, never an unknown baseline', async () => {
  const {store} = fixture(candidate,[{granted:0,leased_before:100,hard_ceiling:100}]);
  assert.deepEqual(await store.lease('d',5,100),{granted:0,leasedBefore:100,hardCeiling:100});
});
test('known zero baseline and exact-int32 boundary remain valid', async () => {
  const {store} = fixture(candidate,[{granted:1,leased_before:2147483646,hard_ceiling:2147483647}]);
  assert.equal((await store.lease('d',1,2147483647)).leasedBefore,2147483646);
  const zero = fixture(candidate,[{granted:5,leased_before:0,hard_ceiling:100}]);
  assert.equal((await zero.store.lease('d',5,100)).leasedBefore,0);
});
for (const value of [null,undefined,{},[],[0],'0',-1,1.5,Infinity,NaN,6,2147483648]) test(`invalid release ${String(value)} is an error, not success`, async () => {
  const {store,calls} = fixture(candidate,value);
  await assert.rejects(store.release('d',5),/بی‌شکل/);
  assert.equal(calls.length,1);
});
test('valid scalar release receipts keep the existing route and arguments', async () => {
  for (const n of [0,3,5]) {
    const {store,calls} = fixture(candidate,n);
    assert.equal(await store.release('d',5),n);
    assert.deepEqual(calls,[{url:'https://budget-audit.invalid/rest/v1/rpc/brsapi_budget_release',method:'POST',body:{p_day:'d',p_back:5}}]);
  }
});
test('existing SQL no-op contract for nonpositive or null release remains valid', async () => {
  for (const back of [0,-5,null]) {
    const {store} = fixture(candidate,0);
    assert.equal(await store.release('d',back),0);
  }
});
test('HTTP failure and committed-but-response-lost each issue no automatic replay', async () => {
  for (const outcome of ['http','lost']) {
    let calls=0;
    const store = candidate({url:'https://budget-audit.invalid',serviceKey:'synthetic-fixture-only',fetchImpl:async()=>{
      calls++;
      if(outcome==='lost') throw new Error('fixture response lost after commit');
      return {ok:false,status:404,text:async()=>'{"code":"PGRST202"}'};
    }});
    await assert.rejects(store.lease('d',5,100));
    assert.equal(calls,1);
  }
});
test('real budget consumer: malformed receipt grants no standard spending; unknown counters stay unknown', async () => {
  const {store} = fixture(candidate,[{granted:5}]);
  const b = new PersistentDailyBudget({store,softBudget:60,hardCeiling:100,now:()=>Date.UTC(2026,10,4,12)});
  await b.ensure();
  assert.equal(b.storeHealthy,false);
  assert.equal(b.leaseRemaining,0);
  assert.equal(b.wouldAdmit('standard'),false);
  // No successful store receipt exists, so usage and allowance remain unknown.
  assert.equal(b.snapshot().used,null);
  assert.equal(b.snapshot().remaining,null);
});
test('real budget consumer: previous confirmed lease counters survive malformed top-up', async () => {
  let index=0;
  const store = candidate({url:'https://budget-audit.invalid',serviceKey:'synthetic-fixture-only',fetchImpl:async()=>({ok:true,json:async()=>index++===0?[good]:[{granted:5}]})});
  const b = new PersistentDailyBudget({store,softBudget:90,hardCeiling:100,leaseSize:5,now:()=>Date.UTC(2026,10,4,12)});
  await b.ensure();
  for(let i=0;i<5;i++) assert.equal(b.reserve('standard'),true);
  const before={granted:b.granted,spent:b.spent,globalLeased:b.globalLeased};
  await b.ensure();
  assert.deepEqual({granted:b.granted,spent:b.spent,globalLeased:b.globalLeased},before);
  assert.equal(b.storeHealthy,false);
  assert.equal(b.wouldAdmit('standard'),false);
});
after(()=>{
  assert.deepEqual(effects,{fetch:0,http:0,socket:0,child:0});
  console.log('OFFLINE_EFFECT_COUNTERS '+JSON.stringify(effects));
});
