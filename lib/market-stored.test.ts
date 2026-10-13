import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStoredIrMarket, getIrMarket } from './market-ir';
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
    stocks:[{id:'fixture',faName:'نمونه',price:101,unit:'toman',sourceDate:'1405-07-19',sourceTime:'11:30:00',nav:null},
      {id:'rejected-zero-fixture',faName:'نمونه صفر نامعتبر',price:0,unit:'toman'}],
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
    assert.equal(first?.stocks.length,1,'stored HTTP snapshot must not publish a zero quote');
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
