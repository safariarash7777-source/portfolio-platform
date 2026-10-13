import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOptions, optionsStatus } from './options.mjs';
import { retainMarketFamilies } from './market-retention.mjs';

async function mapped(overrides={}) {
  let calls=0;
  const client={request:async options=>{calls++;assert.equal(options.endpoint,'Tsetmc/Option.php');return [{l18:'synthetic-option',type:'call',base_l18:'synthetic-base',pl:1000,pc:900,price_strike:2000,date_end:'1405-10-09',...overrides}];}};
  const rows=await fetchOptions('https://synthetic.invalid','synthetic-only',{client});
  assert.equal(calls,1,'mapping reuses the one existing response');
  assert.equal(rows.length,1);
  return rows[0];
}
test('missing option measurements stay null rather than zero',async()=>{
  const row=await mapped({day_remain:null,interest_open:null,tvol:'',tval:'  ',tno:false,plp:undefined,pl:true,pc:null,price_strike:false});
  for(const field of ['dayRemain','openInterest','volume','value','trades','changePercent','price','closingPrice','strike'])assert.equal(row[field],null,field);
});
test('explicit zero and negative price change retain their meanings',async()=>{
  const row=await mapped({interest_open:0,tvol:'0',tno:0,plp:-1,day_remain:-2});
  assert.equal(row.openInterest,0);assert.equal(row.volume,0);assert.equal(row.trades,0);
  assert.equal(row.changePercent,-1);assert.equal(row.dayRemain,-2);
});
test('documented size and supplied clock are preserved without inventing a date or source unit',async()=>{
  const row=await mapped({size_contract:5000,time:'12:30:01',tval:1234000});
  assert.equal(row.contractSize,5000);assert.equal(row.sourceTime,'12:30:01');assert.equal(row.sourceDate,null);
  assert.equal(row.priceUnit,'toman');assert.equal(row.valueUnit,null);
  assert.equal(row.value,1234000,'unknown source value unit does not trigger a guessed conversion');
  assert.equal(row.valueSourceField,'tval');assert.equal(row.price,100,'existing price conversion is unchanged');
});
test('invalid or absent contract size is unknown, never a default of 1000',async()=>{
  for(const size of [undefined,null,0,-1,false,'',1.5,[],[1000],{}])assert.equal((await mapped({size_contract:size})).contractSize,null);
});

async function response(items) {
  let requests = 0;
  const rows = await fetchOptions('https://synthetic.invalid', 'synthetic-only', {
    client: { request: async () => { requests++; return items; } },
  });
  assert.equal(requests, 1);
  return rows;
}
const contract = { l18: 'synthetic-option', type: 'call', pl: 1000 };
test('actual mixed option mapping retains a known baseline stale and stays unavailable without one', async () => {
  const now = Date.now(), candidate = options => ({ options, stocks: [], funds: [], gold: [], currency: [], crypto: [], indices: null, fetchedAt: now });
  const previousRows = await response([{ ...contract, l18: 'previous-option' }]);
  const previous = retainMarketFamilies(null, candidate(previousRows), { options: { ok: optionsStatus.ok } }, now - 1000).payload;
  const rows = await response([contract, { ...contract, type: 'future' }]);
  assert.equal(rows.length, 1); assert.equal(optionsStatus.ok, false);
  const outcome = { options: { ok: optionsStatus.ok, error: optionsStatus.error } };
  const warm = retainMarketFamilies(previous, candidate(rows), outcome, now);
  assert.deepEqual(warm.payload.options, previousRows);
  assert.equal(warm.payload.snapshotQuality.families.options.state, 'stale');
  assert.equal(warm.payload.snapshotQuality.families.options.retained, true);
  assert.equal(warm.payload.snapshotQuality.families.options.receivedAt, now - 1000);
  assert.deepEqual(warm.fresh.options, []);
  const cold = retainMarketFamilies(null, candidate(rows), outcome, now);
  assert.deepEqual(cold.payload.options, []);
  assert.equal(cold.payload.snapshotQuality.families.options.state, 'unavailable');
  assert.equal(cold.payload.snapshotQuality.families.options.receivedAt, null);
});
test('actual successful empty option mapping remains authoritative empty at retention boundary', async () => {
  const rows = await response([]); assert.equal(optionsStatus.ok, true);
  const now = Date.now();
  const result = retainMarketFamilies(null, { options: rows, stocks: [], funds: [], gold: [], currency: [], crypto: [], indices: null, fetchedAt: now }, { options: { ok: optionsStatus.ok } }, now);
  assert.equal(result.payload.snapshotQuality.families.options.state, 'empty');
  assert.equal(result.payload.snapshotQuality.families.options.receivedAt, now);
  assert.equal(result.payload.snapshotQuality.families.options.retained, false);
});
test('partial option responses expose rejected rows and cannot advance lastOk', async () => {
  await response([contract]);
  const lastOk = optionsStatus.lastOk;
  const rows = await response([contract, null, { ...contract, l18: '' }, { ...contract, type: 'future' }]);
  assert.equal(rows.length, 1);
  assert.equal(optionsStatus.ok, false);
  assert.equal(optionsStatus.inputRows, 4);
  assert.equal(optionsStatus.contracts, 1);
  assert.equal(optionsStatus.rejectedRows, 3);
  assert.deepEqual(optionsStatus.rejectionReasons, { invalidRow: 1, invalidId: 1, invalidType: 1 });
  assert.match(optionsStatus.error, /partial/i);
  assert.equal(optionsStatus.lastOk, lastOk);
});
test('malformed option IDs and types are counted without coercing objects into strings', async () => {
  const badIds = [undefined, null, '', '  ', 10, true, [], ['synthetic-option'], {}];
  const badTypes = [undefined, null, '', 'future', 10, true, ['call'], { toString: () => 'call' }];
  const rows = await response([
    ...badIds.map(l18 => ({ ...contract, l18 })), ...badTypes.map(type => ({ ...contract, type })),
  ]);
  assert.equal(rows.length, 0);
  assert.equal(optionsStatus.ok, false);
  assert.equal(optionsStatus.contracts, 0);
  assert.equal(optionsStatus.inputRows, badIds.length + badTypes.length);
  assert.equal(optionsStatus.rejectedRows, optionsStatus.inputRows);
  assert.deepEqual(optionsStatus.rejectionReasons, { invalidRow: 0, invalidId: badIds.length, invalidType: badTypes.length });
});
test('non-object option rows have their own rejection reason', async () => {
  const invalid = [null, undefined, false, 10, 'call', [], Object.assign([], contract)];
  const rows = await response([contract, ...invalid]);
  assert.equal(rows.length, 1);
  assert.equal(optionsStatus.ok, false);
  assert.equal(optionsStatus.inputRows, 8);
  assert.equal(optionsStatus.rejectedRows, 7);
  assert.deepEqual(optionsStatus.rejectionReasons, { invalidRow: 7, invalidId: 0, invalidType: 0 });
});
test('healthy and empty option arrays reset attempt counts without claiming market coverage', async () => {
  await response([contract, null]);
  await response([contract, { ...contract, l18: 'synthetic-put', type: 'PUT' }]);
  assert.equal(optionsStatus.ok, true);
  assert.equal(optionsStatus.inputRows, 2);
  assert.equal(optionsStatus.rejectedRows, 0);
  assert.equal(optionsStatus.contracts, 2);
  assert.equal(optionsStatus.calls, 1);
  assert.equal(optionsStatus.puts, 1);
  assert.equal(optionsStatus.error, null);
  assert.deepEqual(optionsStatus.rejectionReasons, { invalidRow: 0, invalidId: 0, invalidType: 0 });
  await response([]);
  assert.equal(optionsStatus.ok, true);
  assert.equal(optionsStatus.inputRows, 0);
  assert.equal(optionsStatus.rejectedRows, 0);
  assert.equal(optionsStatus.contracts, 0);
  assert.equal(optionsStatus.calls, 0);
  assert.equal(optionsStatus.puts, 0);
});
test('failed option attempts clear current counts and keep the last success clock', async () => {
  for (const failure of ['schema', 'request', 'key']) {
    await response([contract]);
    const lastOk = optionsStatus.lastOk;
    if (failure === 'schema') await response({ contracts: [contract] });
    if (failure === 'request') await fetchOptions('https://synthetic.invalid', 'synthetic-only', {
      client: { request: async () => { throw new Error('synthetic failure'); } },
    });
    if (failure === 'key') await fetchOptions('https://synthetic.invalid', '', {
      client: { request: async () => { assert.fail('Missing key must not request'); } },
    });
    assert.equal(optionsStatus.ok, false, failure);
    assert.equal(optionsStatus.inputRows, null, failure);
    assert.equal(optionsStatus.rejectedRows, null, failure);
    assert.equal(optionsStatus.contracts, 0, failure);
    assert.equal(optionsStatus.calls, 0, failure);
    assert.equal(optionsStatus.puts, 0, failure);
    assert.equal(optionsStatus.lastOk, lastOk, failure);
    assert.ok(optionsStatus.error, failure);
  }
});
test('negative option quantities are unknown while signed change and expired days remain valid', async () => {
  const row = await mapped({ tvol: -1, tval: '-2', tno: -3, interest_open: -4,
    Buy_I_Volume: -5, Sell_I_Volume: -6, Buy_N_Volume: -7, Sell_N_Volume: -8, plp: 0, day_remain: -2 });
  for (const field of ['volume', 'value', 'trades', 'openInterest', 'buyI', 'sellI', 'buyN', 'sellN']) {
    assert.equal(row[field], null, field);
  }
  assert.equal(row.changePercent, 0);
  assert.equal(row.dayRemain, -2);
});
test('actual zero option quantities remain measured zero', async () => {
  for (const zero of [0, '0']) {
    const row = await mapped(Object.fromEntries(['tvol', 'tval', 'tno', 'interest_open',
      'Buy_I_Volume', 'Sell_I_Volume', 'Buy_N_Volume', 'Sell_N_Volume', 'plp', 'day_remain'].map(field => [field, zero])));
    for (const field of ['volume', 'value', 'trades', 'openInterest', 'buyI', 'sellI', 'buyN', 'sellN', 'changePercent', 'dayRemain']) {
      assert.equal(row[field], 0, field);
    }
  }
});
test('option measurement validation does not manufacture zero from malformed input', async () => {
  for (const value of [undefined, null, '', '  ', 'invalid', NaN, Infinity, -Infinity, true, false, [], [10], {}]) {
    const row = await mapped(Object.fromEntries(['tvol', 'tval', 'tno', 'interest_open',
      'Buy_I_Volume', 'Sell_I_Volume', 'Buy_N_Volume', 'Sell_N_Volume', 'plp', 'day_remain'].map(field => [field, value])));
    for (const field of ['volume', 'value', 'trades', 'openInterest', 'buyI', 'sellI', 'buyN', 'sellN', 'changePercent', 'dayRemain']) {
      assert.equal(row[field], null, field);
    }
  }
});
test('option price rounding remains the existing boundary until precision is attested', async () => {
  const row = await mapped({ pl: 15, pc: 25, price_strike: 35 });
  assert.equal(row.price, 2);
  assert.equal(row.closingPrice, 3);
  assert.equal(row.strike, 4);
  for (const value of [null, '', 'invalid', 0, -10, true, [], [10], Infinity]) {
    const missing = await mapped({ pl: value, pc: value, price_strike: value });
    assert.equal(missing.price, null);
    assert.equal(missing.closingPrice, null);
    assert.equal(missing.strike, null);
  }
});
