import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { toMarket } from './market-ir';
import { iranReadQuality } from './market-quality';
import { computeMoneyFlow } from './core/marketToday';

test('stored zero individual counts remain observed zero while per-capita zero denominators remain unavailable', () => {
  const row = { id: 'count-fixture', faName: 'Synthetic count', price: 101, closingPrice: 101, unit: 'toman',
    volume: 100, value: 10100, buyI: 1000, sellI: 500, buyCountI: 0, sellCountI: 0 };
  const market = toMarket({ stocks: [row] });
  assert.equal(market.stocks[0].buyCountI, 0); assert.equal(market.stocks[0].sellCountI, 0);
  const flow = computeMoneyFlow(market.stocks);
  assert.equal(flow.netRealFlowToman, 50500);
  assert.equal(flow.perCapitaBuyToman, null); assert.equal(flow.perCapitaSellToman, null); assert.equal(flow.powerRatio, null);
  const valid = computeMoneyFlow(toMarket({ stocks: [{ ...row, buyCountI: 2, sellCountI: 1 }] }).stocks);
  assert.equal(valid.perCapitaBuyToman, 50500); assert.equal(valid.perCapitaSellToman, 50500); assert.equal(valid.powerRatio, 1);
  for (const count of [null, undefined, -1, NaN, Infinity, '0']) {
    const stock = toMarket({ stocks: [{ ...row, buyCountI: count, sellCountI: count }] }).stocks[0];
    assert.equal(stock.buyCountI, null); assert.equal(stock.sellCountI, null);
  }
});

test('snapshot reader rejects non-positive quotes while preserving observed zero activity and clocks', () => {
  // Boundary cases only: these quotes are not evidence of live market data.
  const at = Date.parse('2026-10-11T08:00:00Z');
  const row = { id: 'boundary-fixture', faName: 'نمونه آزمون', price: 101, unit: 'toman',
    sourceDate: '1405-07-19', sourceTime: '11:30:00', change: 0, changePercent: 0,
    volume: 0, value: 0, bestBidVolume: 0, bestAskVolume: 0, nav: null };
  const quotes = [row, ...[0, -1, null, undefined, NaN, Infinity].map(price => ({ ...row, price }))];
  const market = toMarket({ stocks: quotes, funds: quotes, gold: quotes, currency: quotes, fetchedAt: at });
  for (const family of ['stocks', 'funds', 'gold', 'currency'] as const) {
    assert.equal(market[family].length, 1, family);
    assert.equal(market[family][0].price, row.price);
    assert.equal(market[family][0].unit, row.unit);
    assert.equal(market[family][0].sourceDate, row.sourceDate);
    assert.equal(market[family][0].sourceTime, row.sourceTime);
    assert.equal(market[family][0].changePercent, 0);
    assert.equal(iranReadQuality(market, at).families[family].rejectedRows, 6);
  }
  assert.equal(market.stocks[0].volume, 0);
  assert.equal(market.stocks[0].value, 0);
  assert.equal(market.stocks[0].bestBidVolume, 0);
  assert.equal(market.stocks[0].bestAskVolume, 0);
  assert.equal(market.stocks[0].nav, null);
  assert.equal(market.fetchedAt, at);
  assert.equal(iranReadQuality(market, at).reason, 'rejected-rows');
  assert.equal(toMarket({ stocks: [{ ...row, price: 0 }] }).ok, false);
});

test('stored snapshot reader bounds HTTP reads, isolates relay cache and preserves data clocks/units', async () => {
  const env: Environment = { NEXT_PUBLIC_SUPABASE_URL:'https://database.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY:'dummy', IR_MARKET_RELAY_URL:'https://relay.invalid', IR_MARKET_RELAY_TOKEN:'dummy' };
  const h = privateReader(env, 15), { getStoredIrMarket, getIrMarket } = h.market;
  let mode='ready', dbCalls=0, relayCalls=0;
  const fetchedAt=Date.parse('2026-10-11T08:00:00Z');
  const payload={gold:[],currency:[],crypto:[],options:[],funds:[],indices:null,fetchedAt,
    stocks:[{id:'fixture',faName:'نمونه',price:101,unit:'toman',sourceDate:'1405-07-19',sourceTime:'11:30:00',nav:null},
      {id:'rejected-zero-fixture',faName:'نمونه صفر نامعتبر',price:0,unit:'toman'}],
  };
  h.respond(async (input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='relay.invalid'){relayCalls++;return Response.json(payload);}
    assert.equal(url.hostname,'database.invalid');assert.equal(url.pathname,'/rest/v1/ir_market_snapshots');
    assert.equal(init?.method??'GET','GET');dbCalls++;
    if(mode==='http-error')return new Response(null,{status:503});
    if(mode==='empty')return Response.json([]);
    if(mode==='malformed')return new Response('not JSON',{status:200});
    if(mode==='timeout')return new Promise<Response>(()=>{});
    return Response.json([{payload}]);
  });
    const [first,concurrent]=await Promise.all([getStoredIrMarket(),getStoredIrMarket()]);
    assert.equal(dbCalls,1);assert.equal(first,concurrent);
    assert.equal(first?.stocks.length,1,'stored HTTP snapshot must not publish a zero quote');
    assert.equal(first?.stocks[0].price,101);assert.equal(first?.stocks[0].unit,'toman');
    assert.equal(first?.stocks[0].sourceDate,'1405-07-19');assert.equal(first?.fetchedAt,fetchedAt);
    for(mode of ['http-error','empty','malformed'])assert.equal(await getStoredIrMarket(),null);
    assert.equal(relayCalls,0,'all failed stored reads must avoid relay');
    mode='http-error';assert.ok(await getIrMarket(),'legacy mocked fallback populates only the legacy cache');
    assert.equal(relayCalls,1);
    assert.equal(await getStoredIrMarket(),null,'must not borrow warm relay data');
    const before=relayCalls;mode='timeout';const started=performance.now();
    assert.equal(await getStoredIrMarket(),null);assert.ok(performance.now()-started<6500);assert.ok(h.deadlines.includes(5000));
    assert.equal(relayCalls,before,'deadline failure must not fall back');
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    assert.equal(await getStoredIrMarket(),null);assert.equal(relayCalls,before);
    mode='ready';env.NEXT_PUBLIC_SUPABASE_URL='https://database.invalid';
    assert.equal((await getStoredIrMarket())?.fetchedAt,fetchedAt,'DB recovery preserves the stored receipt');
});

// Actual modules in private VM contexts. Never replace host fetch, Date, crypto,
// resolver or process.env. Only the local compiler/harness reads source files.
type Environment = Record<string, string | undefined>;
const origin = 'https://62.60.191.24/liara-preview';
const syntheticKey = (tag = 'a', exp = 4102444800, claims: Record<string, unknown> = {}) => [
  Buffer.from(JSON.stringify({ typ:'JWT',alg:'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role:'anon',iss:'supabase',exp,tag,...claims })).toString('base64url'),
  Buffer.from('synthetic-signature').toString('base64url'),
].join('.');
const environmentPair = (key = syntheticKey()): Environment => ({ FUNDAMENTAL_READ_URL:origin,FUNDAMENTAL_READ_ANON_KEY:key });
const transportPair = (tag = 'a', expiresAt = 4102444800) => ({ pair:{url:origin,anon:syntheticKey(tag,expiresAt),expiresAt} });
const snapshot = (id = 'only-test', sourceDate: string | null = null) => ({
  gold:[],currency:[],stocks:[],crypto:[],options:[],indices:null,fetchedAt:Date.parse('2026-10-31T08:00:00Z'),
  funds:[{id,faName:'Synthetic fund only',price:101,unit:'toman',sourceDate,sourceTime:'11:30:00',nav:100,navDate:'1405-08-09',navTime:'11:30:00'}],
});
function deferred<T>() { let done!: (value:T)=>void; const promise=new Promise<T>(resolve=>{done=resolve;});return{promise,done}; }
function privateReader(environment: Environment = {}, cap = 5000) {
  const modules = new Map<string, Record<string, unknown>>(), calls: {url:URL;init:RequestInit}[] = [], deadlines:number[]=[];
  const clock={now:Date.parse('2026-10-31T08:00:00Z')};
  let responder: (url:string,init:RequestInit)=>Promise<Response> = async()=>Response.json([{payload:snapshot()}]);
  let digester: (algorithm:AlgorithmIdentifier,data:BufferSource)=>Promise<ArrayBuffer> = (algorithm,data)=>globalThis.crypto.subtle.digest(algorithm,data);
  class PrivateDate extends Date { constructor(value?: string | number) { super(value ?? clock.now); } static now(){return clock.now;} }
  const load = (file:string):Record<string,unknown> => {
    const cached=modules.get(file);if(cached)return cached;
    const filename=resolve(file), taskModule={exports:{} as Record<string,unknown>};modules.set(file,taskModule.exports);
    const local=createRequire(filename);
    const dependency=(name:string):unknown=> {
      if(name==='server-only')return {};
      if(name==='./market')return {getMarketData(){throw Error('unused global market');},getCachedGlobalMarket(){return null;}};
      const paths:Record<string,string>={'./deadline':'lib/deadline.ts','./market-ir':'lib/market-ir.ts','./market-bounded':'lib/market-bounded.ts','./fundamental/read-config.server':'lib/fundamental/read-config.server.ts'};
      if(paths[name])return load(paths[name]);
      return local(name);
    };
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:filename}).outputText;
    vm.runInNewContext(code,{module:taskModule,exports:taskModule.exports,require:dependency,URL,Buffer,TextEncoder,AbortController,AbortSignal,Uint8Array,
      Date:PrivateDate,performance,process:{env:environment},
      crypto:{subtle:{digest:(algorithm:AlgorithmIdentifier,data:BufferSource)=>digester(algorithm,data)}},
      fetch:(url:string,init:RequestInit)=>{calls.push({url:new URL(String(url)),init});return responder(String(url),init);},
      setTimeout:(fn:()=>void,ms:number)=>{deadlines.push(ms);return setTimeout(fn,Math.min(ms,cap));},clearTimeout,
      console:{warn(){throw Error('unexpected raw log');},log(){throw Error('unexpected raw log');}},
    },{filename});return taskModule.exports;
  };
  return {clock,calls,deadlines,
    market:load('lib/market-ir.ts') as unknown as typeof import('./market-ir'),
    readFunds:(options?:import('./market-funds-read.server').FundsMarketReadOptions)=>(load('lib/market-funds-read.server.ts') as unknown as typeof import('./market-funds-read.server')).readFundsMarket(options),
    respond(fn:typeof responder){responder=fn;},digest(fn:typeof digester){digester=fn;},
  };
}

test('actual adapter captures only the existing server pair and sends one scoped anonymous stored GET', async()=>{
  const h=privateReader(), key=syntheticKey('capture');
  const environment:Environment={...environmentPair(key),get NEXT_PUBLIC_SUPABASE_URL():string{throw Error('legacy URL accessed');},get NEXT_PUBLIC_SUPABASE_ANON_KEY():string{throw Error('legacy key accessed');}};
  const pending=h.readFunds({environment});environment.FUNDAMENTAL_READ_ANON_KEY=syntheticKey('changed');
  const result=await pending;assert.equal(result.data?.funds.length,1);assert.equal(result.availability.families?.funds.state,'unknown-time');
  assert.equal(h.calls.length,1);const {url,init}=h.calls[0];assert.equal(url.origin+url.pathname,origin+'/rest/v1/ir_market_snapshots');
  assert.equal(url.search,'?key=eq.latest&select=payload');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
  const headers=new Headers(init.headers);assert.equal(headers.get('apikey'),key);assert.equal(headers.get('Authorization'),'Bearer '+key);assert.equal(headers.has('Cookie'),false);
  assert.deepEqual([...headers.keys()].sort(),['accept','apikey','authorization']);
  assert.doesNotMatch(JSON.stringify(result),/synthetic-signature|FUNDAMENTAL_READ|liara-preview/);assert.ok(h.deadlines.every(ms=>ms>0&&ms<=5000));
});

test('partial blank invalid and expired overrides perform zero GET and never inspect legacy fields', async()=>{
  const h=privateReader();
  const cases:Environment[]=[{FUNDAMENTAL_READ_URL:origin},{FUNDAMENTAL_READ_ANON_KEY:syntheticKey()},environmentPair(''),{...environmentPair(),FUNDAMENTAL_READ_URL:''},
    ...['http://62.60.191.24/liara-preview',origin+'/',origin+'?x=1','https://other.invalid/liara-preview'].map(url=>({...environmentPair(),FUNDAMENTAL_READ_URL:url})),
    ...[syntheticKey('expired',1),syntheticKey('role',4102444800,{role:'service_role'}),'not-a-jwt'].map(key=>environmentPair(key))];
  for(const value of cases){const environment={...value,get NEXT_PUBLIC_SUPABASE_URL():string{throw Error('legacy accessed');}};const result=await h.readFunds({environment});assert.equal(result.data,null);assert.equal(result.availability.state,'error');assert.notEqual(result.availability.families?.funds.state,'empty');}
  for(const value of [{pair:null},{pair:{}},{pair:{url:origin}},{pair:{url:'http://bad.invalid',anon:'dummy',expiresAt:4102444800}}]){
    const result=await h.market.getStoredIrMarket(value as import('./market-ir').StoredMarketReadOverride);assert.equal(result.reason,'configuration');
  }
  assert.equal(h.calls.length,0);
});

test('absent adapter override delegates to unchanged legacy fallback while stored no-argument reads remain DB-only', async()=>{
  const h=privateReader({NEXT_PUBLIC_SUPABASE_URL:'https://old.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'dummy',IR_MARKET_RELAY_URL:'https://relay.invalid'});
  h.respond(async url=>url.startsWith('https://relay.invalid')?Response.json(snapshot('legacy-relay')):new Response(null,{status:402}));
  const legacy=await h.readFunds({environment:{}});assert.equal(legacy.data?.funds[0].id,'legacy-relay');assert.equal(h.calls.length,2);
  assert.equal(await h.market.getStoredIrMarket(),null);assert.equal(h.calls.length,3);assert.equal(h.calls[2].url.host,'old.invalid');
  const failed=await h.readFunds({environment:{FUNDAMENTAL_READ_URL:origin}});assert.equal(failed.data,null);assert.equal(h.calls.length,3);
});

test('same explicit pair shares only its inflight GET and successful results are never cached', async()=>{
  const h=privateReader(), gate=deferred<Response>(), entered=deferred<void>(), pair=transportPair();
  h.respond(async()=>{entered.done();return gate.promise;});
  const a=h.market.getStoredIrMarket(pair);await entered.promise;const b=h.market.getStoredIrMarket(pair);
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,1);gate.done(Response.json([{payload:snapshot()}]));
  assert.equal((await a).state,'read');assert.equal((await b).state,'read');
  h.respond(async()=>Response.json([{payload:snapshot('fresh')} ]));assert.equal((await h.market.getStoredIrMarket(pair)).data?.funds[0].id,'fresh');assert.equal(h.calls.length,2);
});

test('different pairs and an A-to-B-to-A cycle cannot mix inflight results or cleanup', async()=>{
  const h=privateReader(), a=transportPair('a'),b=transportPair('b'),late=deferred<Response>(),entered=deferred<void>();
  h.respond(async(_url,init)=>{if(new Headers(init.headers).get('apikey')===a.pair.anon){entered.done();return late.promise;}return Response.json([{payload:snapshot('b')}]);});
  const oldA=h.market.getStoredIrMarket(a);await entered.promise;
  assert.equal((await h.market.getStoredIrMarket(b)).data?.funds[0].id,'b');
  const sameA=h.market.getStoredIrMarket(a);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,2);
  late.done(Response.json([{payload:snapshot('a')} ]));assert.equal((await oldA).data?.funds[0].id,'a');assert.equal((await sameA).data?.funds[0].id,'a');
  h.respond(async()=>Response.json([{payload:snapshot('a-new')} ]));assert.equal((await h.market.getStoredIrMarket(a)).data?.funds[0].id,'a-new');assert.equal(h.calls.length,3);
});

test('HTTP redirect malformed and absent reads never retry or become confirmed fund emptiness', async()=>{
  const h=privateReader();
  for(const value of [402,401,503,302,'object','json','request','missing','null','zero','invalid'] as const){
    h.respond(async()=>{if(typeof value==='number')return new Response(null,{status:value});if(value==='request')throw Error('untrusted-error-url-or-key');if(value==='json')return new Response('broken');
      return Response.json(value==='object'?{}:value==='missing'?[]:value==='null'?[{payload:null}]:value==='zero'?[{payload:0}]:[{payload:{funds:[]}}]);});
    const before=h.calls.length,result=await h.readFunds({environment:environmentPair()});assert.equal(h.calls.length,before+1);assert.equal(result.data,null);assert.equal(result.availability.state,'error');assert.notEqual(result.availability.families?.funds.state,'empty');
    assert.doesNotMatch(JSON.stringify(result),/untrusted-error|62\.60|signature/);
  }
});

test('a genuine family-empty snapshot stays distinct from unknown clocks partial rows and invalid payload', async()=>{
  const h=privateReader(), at=h.clock.now;
  const empty={...snapshot(),funds:[],snapshotQuality:{version:1,state:'partial',attemptedAt:at,families:{funds:{state:'empty',receivedAt:at,retained:false}}}};
  h.respond(async()=>Response.json([{payload:empty}]));assert.equal((await h.readFunds({environment:environmentPair()})).availability.families?.funds.state,'empty');
  h.respond(async()=>Response.json([{payload:snapshot('unknown-clock')} ]));const result=await h.readFunds({environment:environmentPair()});
  assert.equal(result.data?.funds.length,1);assert.equal(result.data?.funds[0].sourceDate,null);assert.equal(result.availability.families?.funds.validAt,null);assert.equal(result.availability.families?.funds.state,'unknown-time');assert.equal(result.availability.families?.funds.receivedAt,at);
});

test('expiry during digest or body withholds data and delayed digest after deadline cannot launch GET', async()=>{
  for(const phase of ['digest-expiry','body-expiry','digest-deadline'] as const){
    const h=privateReader({},phase==='digest-deadline'?10:5000),gate=deferred<ArrayBuffer>(),body=deferred<unknown>(),entered=deferred<void>();
    const pair=transportPair(phase,h.clock.now/1000+1);
    if(phase.startsWith('digest'))h.digest(async()=>{entered.done();return gate.promise;});
    else h.respond(async()=>{entered.done();return {ok:true,status:200,json:()=>body.promise} as Response;});
    const pending=h.market.getStoredIrMarket(pair);await entered.promise;
    if(phase==='digest-deadline') {await new Promise(resolve=>setTimeout(resolve,25));assert.equal((await pending).state,'timeout');}
    else h.clock.now+=2000;
    if(phase.startsWith('digest'))gate.done(new ArrayBuffer(32));else body.done([{payload:snapshot()}]);
    const result=await pending;if(phase!=='digest-deadline')assert.equal(result.reason,'configuration');assert.equal(result.data,null);
    await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,phase==='body-expiry'?1:0);
  }
});

test('late body cleanup cannot erase a fresh same-pair inflight read and no raw response crosses timeout', async()=>{
  const h=privateReader({},100),oldBody=deferred<unknown>(),newBody=deferred<unknown>(),entered=deferred<void>(),fresh=deferred<void>();let count=0;
  h.respond(async()=>{const old=++count===1;(old?entered:fresh).done();return {ok:true,status:200,json:()=>old?oldBody.promise:newBody.promise} as Response;});
  const pair=transportPair(),old=h.market.getStoredIrMarket(pair);await entered.promise;assert.equal((await old).state,'timeout');
  await new Promise(resolve=>setTimeout(resolve,5));
  const current=h.market.getStoredIrMarket(pair);await fresh.promise;oldBody.done([{payload:snapshot('old')}]);await new Promise(resolve=>setTimeout(resolve,2));
  const joined=h.market.getStoredIrMarket(pair);await new Promise(resolve=>setTimeout(resolve,2));assert.equal(h.calls.length,2);
  newBody.done([{payload:snapshot('new')}]);assert.equal((await current).data?.funds[0].id,'new');assert.equal((await joined).data?.funds[0].id,'new');
});

test('explicit availability ignores legacy diagnostics and leaves the host environment and globals untouched', async()=>{
  const before={fetch:globalThis.fetch,date:Date.now,digest:crypto.subtle.digest};
  const h=privateReader({NEXT_PUBLIC_SUPABASE_URL:'https://old.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'dummy'});
  h.respond(async url=>url.startsWith(origin)?Response.json([{payload:snapshot()}]):new Response(null,{status:402}));
  await h.market.getIrMarket();assert.equal(h.market.getLastIrDiag()?.error,'http_402');
  const result=await h.readFunds({environment:environmentPair()});assert.equal(result.data?.funds.length,1);assert.notEqual(result.availability.reason,'read-error');assert.equal(h.market.getLastIrDiag()?.error,'http_402');
  assert.equal(globalThis.fetch,before.fetch);assert.equal(Date.now,before.date);assert.equal(crypto.subtle.digest,before.digest);
});

test('explicit pair is copied before digest and URL identity separates otherwise identical credentials', async()=>{
  const h=privateReader(),gate=deferred<ArrayBuffer>(),entered=deferred<void>(),input=transportPair('copied');
  const original=input.pair.anon;h.digest(async()=>{entered.done();return gate.promise;});
  const pending=h.market.getStoredIrMarket(input);await entered.promise;input.pair.anon='changed';input.pair.url='https://wrong.invalid';input.pair.expiresAt=1;
  gate.done(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('test-only-binding')));assert.equal((await pending).state,'read');
  assert.equal(h.calls[0].url.origin+h.calls[0].url.pathname,origin+'/rest/v1/ir_market_snapshots');assert.equal(new Headers(h.calls[0].init.headers).get('apikey'),original);
  const isolated=privateReader(),a=transportPair('same-key'),b={pair:{...a.pair,url:'https://second.invalid'}};
  isolated.respond(async url=>Response.json([{payload:snapshot(new URL(url).hostname)}]));
  const results=await Promise.all([isolated.market.getStoredIrMarket(a),isolated.market.getStoredIrMarket(b)]);
  assert.equal(results[0].data?.funds[0].id,'62.60.191.24');assert.equal(results[1].data?.funds[0].id,'second.invalid');assert.equal(isolated.calls.length,2);
});

test('shared expiry and structured absent/body/HTTP results cannot borrow a previous successful read', async()=>{
  const h=privateReader(),body=deferred<unknown>(),entered=deferred<void>(),pair=transportPair('join-expiry',h.clock.now/1000+1);
  h.respond(async()=>{entered.done();return {ok:true,status:200,json:()=>body.promise} as Response;});
  const pending=h.market.getStoredIrMarket(pair);await entered.promise;h.clock.now+=2000;
  assert.equal((await h.market.getStoredIrMarket(pair)).reason,'configuration');assert.equal(h.calls.length,1);body.done([{payload:snapshot()}]);assert.equal((await pending).data,null);
  for(const [value,state,reason] of [[[], 'absent','absent'],[[{payload:null}],'absent','absent'],[{},'error','body'],[[{payload:0}],'error','body']] as const){
    h.respond(async()=>Response.json(value));const result=await h.market.getStoredIrMarket(transportPair());assert.equal(result.state,state);assert.equal(result.reason,reason);assert.equal(result.status,200);assert.equal(result.data,null);
  }
  h.respond(async()=>new Response(null,{status:402}));const denied=await h.market.getStoredIrMarket(transportPair());assert.equal(denied.reason,'http');assert.equal(denied.status,402);
});
