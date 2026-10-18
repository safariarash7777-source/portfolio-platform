import test from 'node:test';
import assert from 'node:assert/strict';
import { getSymbolHistory, readSymbolHistory, readUniqueHistoryRows } from './history';
import { getNavHistory } from './navHistory';
const credentials = { url: 'https://history.test', anon: 'synthetic' };
const row = (id: number, trade_date: string, close = id) => ({ id, trade_date, close, raw: { nav_toman: id } });

test('status reader separates failed, empty and observed history while preserving the array getter', async () => {
  const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL=credentials.url;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=credentials.anon;
  try {
    await mocked([new Response('',{status:503}), [], [row(11,'2026-10-17',0)]], async calls=>{
      assert.deepEqual(await readSymbolHistory('history-status-error',1),{data:[],state:'error'});
      assert.deepEqual(await readSymbolHistory('history-status-empty',1),{data:[],state:'empty'});
      const ready=await readSymbolHistory('history-status-observed',1);
      assert.equal(ready.state,'ready');assert.equal(ready.data[0].close,0);
      assert.deepEqual(await getSymbolHistory('history-status-observed',1),ready.data);
      assert.equal(calls.length,3,'compatibility getter shares the successful cache');
    });
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.equal((await readSymbolHistory('history-status-unconfigured',1)).state,'error');
    assert.deepEqual(await getSymbolHistory('history-compat-unconfigured',1),[]);
  } finally {
    if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=oldKey;
  }
});
async function mocked<T>(pages: unknown[], run: (calls: URL[]) => Promise<T>) {
  const original = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(new URL(String(input)));
    assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const next = pages.shift();
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : Response.json(next ?? []);
  };
  try { return await run(calls); } finally { globalThis.fetch = original; }
}
test('capped short pages continue through duplicate dates and retain newest ID', async () => {
  await mocked([[row(9,'2026-10-17'),row(8,'2026-10-17')],[row(7,'2026-10-17'),row(6,'2026-10-16')]], async calls => {
    const out = await readUniqueHistoryRows(credentials,new URLSearchParams(),2);
    assert.deepEqual(out?.map(r=>r.id),[9,6]);
    assert.equal(calls.length,2);
    assert.equal(calls[1].searchParams.get('or'),'(trade_date.lt.2026-10-17,and(trade_date.eq.2026-10-17,id.lt.8))');
  });
});
test('requested days greater than available return verified available series after empty page', async () => {
  await mocked([[row(4,'2026-10-17')],[row(3,'2026-10-16')],[]], async calls => {
    const out = await readUniqueHistoryRows(credentials,new URLSearchParams(),20000);
    assert.deepEqual(out?.map(r=>r.id),[4,3]); assert.equal(calls.length,3);
  });
});
test('HTTP failure, malformed page and ignored cursor never expose partial history', async () => {
  for (const second of [new Response('',{status:503}),{error:'bad'},[row(9,'2026-10-17')],new Error('timeout')]) {
    await mocked([[row(9,'2026-10-17')],second], async()=>{
      assert.equal(await readUniqueHistoryRows(credentials,new URLSearchParams(),2),null);
    });
  }
});
test('bounded scan stops when duplicate pages cannot satisfy requested coverage', async () => {
  await mocked(Array.from({length:24},(_,i)=>[row(100-i,'2026-10-17')]),async calls=>{
    assert.equal(await readUniqueHistoryRows(credentials,new URLSearchParams(),2),null);
    assert.equal(calls.length,24);
  });
});
test('symbol reader returns ascending dates and does not cache a failed partial read', async () => {
  const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL=credentials.url;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=credentials.anon;
  try {
    await mocked([[row(9,'2026-10-17')],new Response('',{status:500}),[row(10,'2026-10-17'),row(8,'2026-10-16')]],async calls=>{
      assert.deepEqual(await getSymbolHistory('history-pagination-fixture',2),[]);
      const out=await getSymbolHistory('history-pagination-fixture',2);
      assert.deepEqual(out.map(r=>r.trade_date),['2026-10-16','2026-10-17']);
      assert.deepEqual(out.map(r=>r.close),[8,10]);assert.equal(calls.length,3);
    });
  } finally {
    if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=oldKey;
  }
});
test('NAV rejects invalid latest version without reviving older version and continues to older eligible dates', async () => {
  const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL=credentials.url;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=credentials.anon;
  try {
    await mocked([[{...row(9,'2026-10-17'),raw:{nav_toman:-1}}],[row(8,'2026-10-17'),row(7,'2026-10-16',100)],[row(6,'2026-10-15',null as unknown as number)]],async calls=>{
      const out=await getNavHistory('nav-pagination-fixture',2);
      assert.deepEqual(out,[{trade_date:'2026-10-15',nav:6,close:null},{trade_date:'2026-10-16',nav:7,close:10}]);
      assert.equal(calls.length,3);assert.equal(calls[0].searchParams.get('raw->>nav_toman'),'not.is.null');
    });
  } finally {
    if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=oldKey;
  }
});
