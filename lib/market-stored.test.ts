import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStoredIrMarket, getIrMarket } from './market-ir';

test('stored snapshot reader bounds HTTP reads, isolates relay cache and preserves data clocks/units', async () => {
  const savedFetch = globalThis.fetch;
  const keys = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','IR_MARKET_RELAY_URL','IR_MARKET_RELAY_TOKEN'];
  const saved = Object.fromEntries(keys.map(k => [k,process.env[k]]));
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='dummy';
  process.env.IR_MARKET_RELAY_URL='https://relay.invalid';
  process.env.IR_MARKET_RELAY_TOKEN='dummy';
  let mode='ready', dbCalls=0, relayCalls=0;
  const fetchedAt=Date.parse('2026-10-11T08:00:00Z');
  const payload={gold:[],currency:[],crypto:[],options:[],funds:[],indices:null,fetchedAt,
    stocks:[{id:'fixture',faName:'نمونه',price:101,unit:'toman',sourceDate:'1405-07-19',sourceTime:'11:30:00',nav:null}],
  };
  globalThis.fetch=(async (input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='relay.invalid'){relayCalls++;return Response.json(payload);}
    assert.equal(url.hostname,'database.invalid');assert.equal(url.pathname,'/rest/v1/ir_market_snapshots');
    assert.equal(init?.method??'GET','GET');dbCalls++;
    if(mode==='http-error')return new Response(null,{status:503});
    if(mode==='empty')return Response.json([]);
    if(mode==='malformed')return new Response('not JSON',{status:200});
    if(mode==='timeout')return new Promise<Response>(()=>{});
    return Response.json([{payload}]);
  }) as typeof fetch;
  try {
    const [first,concurrent]=await Promise.all([getStoredIrMarket(),getStoredIrMarket()]);
    assert.equal(dbCalls,1);assert.equal(first,concurrent);
    assert.equal(first?.stocks[0].price,101);assert.equal(first?.stocks[0].unit,'toman');
    assert.equal(first?.stocks[0].sourceDate,'1405-07-19');assert.equal(first?.fetchedAt,fetchedAt);
    for(mode of ['http-error','empty','malformed'])assert.equal(await getStoredIrMarket(),null);
    assert.equal(relayCalls,0,'all failed stored reads must avoid relay');
    mode='http-error';assert.ok(await getIrMarket(),'legacy mocked fallback populates only the legacy cache');
    assert.equal(relayCalls,1);
    assert.equal(await getStoredIrMarket(),null,'must not borrow warm relay data');
    const before=relayCalls;mode='timeout';const started=Date.now();
    assert.equal(await getStoredIrMarket(),null);assert.ok(Date.now()-started<6500);
    assert.equal(relayCalls,before,'deadline failure must not fall back');
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.equal(await getStoredIrMarket(),null);assert.equal(relayCalls,before);
    mode='ready';process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.invalid';
    assert.equal((await getStoredIrMarket())?.fetchedAt,fetchedAt,'DB recovery preserves the stored receipt');
  } finally {
    globalThis.fetch=savedFetch;
    for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
  }
});
