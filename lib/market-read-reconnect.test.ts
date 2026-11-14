import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchStoredMarketRows } from './market-ir';
const url='https://database.invalid/rest/v1/ir_market_snapshots?key=eq.latest&select=payload';
const init=(signal:AbortSignal)=>({signal,headers:{apikey:'synthetic',Authorization:'Bearer synthetic'},cache:'no-store' as const});
const hanging=(signal:AbortSignal)=>new Promise<Response>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
test('stalled snapshot headers reconnect once without changing read identity or source clock',async()=>{
 const calls:RequestInit[]=[];
 const response=await fetchStoredMarketRows(url,init(AbortSignal.timeout(500)),async(target,options)=>{
  assert.equal(target,url);calls.push(options!);
  return calls.length===1?hanging(options!.signal!):Response.json([{payload:{fetchedAt:123}}]);
 },10);
 assert.deepEqual(await response.json(),[{payload:{fetchedAt:123}}]);assert.equal(calls.length,2);
 for(const call of calls){assert.equal(call.method,'GET');assert.equal(call.redirect,'error');assert.equal(call.credentials,'omit');assert.deepEqual(call.headers,init(new AbortController().signal).headers);}
 assert.ok(calls[0].signal!.aborted);
});
test('original deadline bounds both attempts; pre-aborted requests never send',async()=>{
 const keepAlive=setTimeout(()=>{},500);let calls=0;
 try{
  await assert.rejects(fetchStoredMarketRows(url,init(AbortSignal.timeout(50)),async(_,options)=>{calls++;return hanging(options!.signal!);},10));
  assert.equal(calls,2);const c=new AbortController();c.abort();
  await assert.rejects(fetchStoredMarketRows(url,init(c.signal),async()=>{throw Error('must not send');}));
 }finally{clearTimeout(keepAlive);}
});
test('HTTP, body, TLS and unrelated connection failures are not retried',async()=>{
 for(const status of [200,401,429,503]){let calls=0;const r=await fetchStoredMarketRows(url,init(AbortSignal.timeout(500)),async()=>{calls++;return new Response('invalid',{status});});await assert.rejects(r.json());assert.equal(calls,1);}
 for(const code of ['CERT_HAS_EXPIRED','ECONNREFUSED','UND_ERR_BODY_TIMEOUT']){let calls=0;await assert.rejects(fetchStoredMarketRows(url,init(AbortSignal.timeout(500)),async()=>{calls++;throw Object.assign(new Error('transport'),{cause:{code}});}));assert.equal(calls,1);}
});
test('completed headers cancel cutoff while body stays within parent deadline',async()=>{
 let signal:AbortSignal;const c=new AbortController();
 const r=await fetchStoredMarketRows(url,init(c.signal),async(_,options)=>{signal=options!.signal!;return Response.json([]);},5);
 await new Promise(resolve=>setTimeout(resolve,15));assert.equal(signal!.aborted,false);assert.deepEqual(await r.json(),[]);c.abort();assert.equal(signal!.aborted,true);
});
test('TLS failure racing a header cutoff cannot borrow permission to retry',async()=>{
 let calls=0;await assert.rejects(fetchStoredMarketRows(url,init(AbortSignal.timeout(500)),async(_,options)=>{calls++;return new Promise<Response>((_,reject)=>options!.signal!.addEventListener('abort',()=>reject(Object.assign(new Error('TLS'),{cause:{code:'CERT_HAS_EXPIRED'}}))));},5),/TLS/);assert.equal(calls,1);
});
