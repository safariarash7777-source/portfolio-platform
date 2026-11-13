import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PersistentDailyBudget} from './brsapi-client.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const next=()=>new Promise(resolve=>setImmediate(resolve));
function make(store,opts={}){return new PersistentDailyBudget({store,softBudget:100,hardCeiling:100,leaseSize:10,
 now:()=>Date.parse('2026-11-04T10:00:00Z'),...opts});}
function ledger(){let total=0;const releases=[];return {releases,get total(){return total;},
 async lease(day,want,hard){const before=total;const granted=Math.max(0,Math.min(want,hard-before));total+=granted;return {granted,leasedBefore:before,hardCeiling:hard};},
 async release(day,back){releases.push({day,back});total-=back;return back;}};}

test('store unavailable admits no class even with former explicit emergency override',async()=>{
 const budget=make({lease:async()=>{throw Error('unavailable');}},{degradedCeiling:999});
 await budget.ensure();assert.equal(budget.degradedCeiling,0);
 for(const kind of ['critical','standard','bulk']){assert.equal(budget.reserve(kind),false);assert.equal(budget.wouldAdmit(kind),false);}
 assert.equal(budget.snapshot().used,null);assert.equal(budget.snapshot().store.degradedUsed,0);
});
test('confirmed already-issued balance survives store failure without inventing extra units',async()=>{
 const store=ledger();const budget=make(store,{lowWaterRatio:1});await budget.ensure();
 assert.equal(budget.reserve('critical'),true);
 store.lease=async()=>{throw Error('db lost');};await budget.ensure();await next();
 assert.equal(budget.storeHealthy,false);for(let i=0;i<9;i++)assert.equal(budget.reserve('critical'),true);
 assert.equal(budget.reserve('critical'),false);assert.equal(budget.spent,10);assert.equal(store.total,10);
});
test('concurrent release shares one outcome, retains spent and permanently quiesces instance',async()=>{
 const store=ledger();const wait=deferred();const original=store.release;
 store.release=async(day,back)=>{await wait.promise;return original.call(store,day,back);};
 const budget=make(store);await budget.ensure();assert.equal(budget.reserve('critical'),true);
 const first=budget.release(),second=budget.release();assert.equal(first,second);
 assert.equal(budget.leaseRemaining,0);assert.equal(budget.reserve('critical'),false);await budget.ensure();
 assert.equal(budget.wouldAdmit('critical'),false);wait.resolve();assert.equal(await first,9);
 assert.equal(await budget.release(),9);assert.equal(store.releases.length,1);assert.equal(store.total,1);
 assert.equal(budget.granted,1);assert.equal(budget.spent,1);assert.equal(budget.snapshot().remaining,0);
});
test('unknown release never retries, refunds locally or reopens after midnight',async()=>{
 let now=Date.parse('2026-11-04T10:00:00Z'),calls=0;const store=ledger();
 store.release=async()=>{calls++;throw Error('timeout after commit');};
 const budget=make(store,{now:()=>now});await budget.ensure();budget.reserve('critical');const old=budget.day;
 assert.equal(await budget.release(),0);assert.equal(await budget.release(),0);assert.equal(calls,1);
 assert.equal(budget.granted,10);assert.equal(budget.spent,1);assert.equal(budget.leaseRemaining,0);
 now+=86400000;await budget.ensure();assert.equal(budget.reserve('critical'),false);assert.equal(budget.day,old);
 assert.equal(budget.snapshot().releaseState,'unknown');assert.equal(budget.snapshot().used,null);
});
test('release waits in-flight lease and refunds its confirmed unused grant once',async()=>{
 const wait=deferred();let leases=0;const released=[];
 const budget=make({lease:async()=>{leases++;return wait.promise;},release:async(day,back)=>{released.push({day,back});return back;}});
 const pending=budget.ensure();await next();const closing=budget.release();await next();assert.equal(released.length,0);
 await budget.ensure();assert.equal(leases,1);wait.resolve({granted:10,leasedBefore:0,hardCeiling:100});
 await pending;assert.equal(await closing,10);assert.equal(released.length,1);assert.equal(budget.granted,0);
});
test('queued topup does not start after shutdown',async()=>{
 let leases=0;const budget=make({lease:async()=>{leases++;return {granted:10,leasedBefore:0,hardCeiling:100};}});
 const pending=budget.ensure();const closing=budget.release();await pending;assert.equal(await closing,0);assert.equal(leases,0);
});
test('prior-day lease completion cannot clear new-day pending lease or cause duplicate topup',async()=>{
 let now=Date.parse('2026-11-04T10:00:00Z'),calls=0;const old=deferred(),current=deferred();
 const budget=make({lease:async()=>{calls++;return calls===1?old.promise:current.promise;}},{now:()=>now});
 const a=budget.ensure();await next();now+=86400000;const b=budget.ensure();await next();
 old.resolve({granted:10,leasedBefore:0,hardCeiling:100});await a;
 const c=budget.ensure();await next();assert.equal(calls,2);assert.notEqual(budget.pending,null);
 current.resolve({granted:10,leasedBefore:0,hardCeiling:100});await Promise.all([b,c]);
 assert.equal(budget.granted,10);assert.equal(budget.spent,0);assert.equal(budget.inFlight.size,0);
});
test('late prior-day failure cannot poison healthy current-day accounting',async()=>{
 let now=Date.parse('2026-11-04T10:00:00Z'),calls=0;const old=deferred();
 const budget=make({lease:async()=>++calls===1?old.promise:{granted:10,leasedBefore:0,hardCeiling:100}},{now:()=>now});
 const a=budget.ensure();await next();now+=86400000;await budget.ensure();old.reject(Error('old failure'));await a;
 assert.equal(budget.storeHealthy,true);assert.equal(budget.storeErrors,0);assert.equal(budget.granted,10);
});
test('synchronous lease failure does not wedge future confirmed acquisition',async()=>{
 let calls=0;const budget=make({lease:()=>{if(++calls===1)throw Error('sync failure');return Promise.resolve({granted:10,leasedBefore:0,hardCeiling:100});}});
 await budget.ensure();assert.equal(budget.pending,null);await budget.ensure();assert.equal(calls,2);
 assert.equal(budget.reserve('critical'),true);assert.equal(budget.storeHealthy,true);
});
test('invalid release response leaves accounting unknown and cannot be repeated',async()=>{
 const store=ledger();let calls=0;store.release=async()=>{calls++;return 1000;};const budget=make(store);await budget.ensure();
 assert.equal(await budget.release(),0);assert.equal(await budget.release(),0);assert.equal(calls,1);
 assert.equal(budget.granted,10);assert.equal(budget.snapshot().releaseState,'unknown');
});

test('shutdown after rollover waits old and current leases but refunds only current-day balance',async()=>{
 let now=Date.parse('2026-11-04T10:00:00Z'),calls=0;const old=deferred(),current=deferred(),released=[];
 const budget=make({lease:async()=>++calls===1?old.promise:current.promise,
  release:async(day,back)=>{released.push({day,back});return back;}},{now:()=>now});
 const a=budget.ensure();await next();const oldDay=budget.day;now+=86400000;const b=budget.ensure();await next();
 const currentDay=budget.day,closing=budget.release();current.resolve({granted:10,leasedBefore:0,hardCeiling:100});
 await b;await next();assert.equal(released.length,0);assert.equal(budget.reserve('critical'),false);
 old.resolve({granted:10,leasedBefore:0,hardCeiling:100});await a;assert.equal(await closing,10);
 assert.notEqual(currentDay,oldDay);assert.deepEqual(released,[{day:currentDay,back:10}]);assert.equal(calls,2);
});
