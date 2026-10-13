import test from 'node:test';
import assert from 'node:assert/strict';
import { planDailyFx, writeDailyFx } from './daily-fx.mjs';
import { readFileSync } from 'node:fs';

// Offline boundary fixture; no claim about current provider data or its units.
const now = new Date('2026-10-13T12:00:00Z');
const usd = { id: 'USD', price: 100000, unit: 'toman', sourceUnit: 'تومان', sourceDate: '1405/07/21', sourceTime: '15:00:00' };
const payload = row => ({ currency: [row] });

test('daily FX uses independently valid source date/time and explicit raw toman', () => {
  assert.deepEqual(planDailyFx(payload(usd), now), { row: { rate_date: '2026-10-13', usd_toman: 100000, source: 'brsapi' } });
  assert.deepEqual(planDailyFx(payload({ ...usd, sourceDate: '۱۴۰۵/۰۷/۲۱', sourceTime: '۱۵:۰۰' }), now), planDailyFx(payload(usd), now));
  assert.equal(planDailyFx(payload(usd), new Date('2026-10-13T00:00:00Z')).skip, 'before-close');
});

test('unknown/stale/future clocks and unproved units never reach the request port', async () => {
  const cases = [
    [{ sourceDate: '1405/07/20' }, 'usd-source-not-today'],
    [{ sourceDate: null }, 'unknown-usd-source-clock'],
    [{ sourceTime: null }, 'unknown-usd-source-clock'],
    [{ sourceDate: '1405/07/31' }, 'invalid-usd-source-clock'],
    [{ sourceTime: '24:00:00' }, 'invalid-usd-source-clock'],
    [{ sourceTime: '14:60:00' }, 'invalid-usd-source-clock'],
    [{ sourceTime: '14:00:60' }, 'invalid-usd-source-clock'],
    [{ sourceDate: '1405/12/30' }, 'invalid-usd-source-clock'],
    [{ sourceTime: '16:00:00' }, 'future-usd-source-clock'],
    [{ sourceTime: '10:00:00' }, 'usd-source-before-close'],
    [{ sourceUnit: null }, 'unverified-usd-unit'],
    [{ sourceUnit: 'ریال' }, 'unverified-usd-unit'],
    [{ unit: 'usd' }, 'unverified-usd-unit'],
    [{ price: 0 }, 'invalid-usd-price'],
    [{ price: '100000' }, 'invalid-usd-price'],
    [{ price: Infinity }, 'invalid-usd-price'],
    [{ price: true }, 'invalid-usd-price'],
    [{ price: [100000] }, 'invalid-usd-price'],
  ];
  for (const [change, reason] of cases) {
    const result = await writeDailyFx({ payload: payload({ ...usd, ...change }), now, request: () => assert.fail('Rejected input must not write or read DB') });
    assert.deepEqual(result, { complete: false, reason });
  }
});

test('FX failed writes and unreadable conflict readbacks never claim completion', async () => {
  for (const status of [401, 404, 503]) {
    let requests=0;
    const result=await writeDailyFx({payload:payload(usd),now,request:async()=>{requests++;return new Response(null,{status});}});
    assert.deepEqual(result,{complete:false,reason:`fx-write-http-${status}`});
    assert.equal(requests,1);
  }
  await assert.rejects(writeDailyFx({payload:payload(usd),now,request:async method=>
    method==='POST'?new Response(null,{status:409}):new Response('invalid-json',{status:200})}));
  await assert.rejects(writeDailyFx({payload:payload(usd),now,request:async()=>{throw new Error('offline timeout');}}),/offline timeout/);
});

test('successful FX insert preserves source-derived date and price without another conversion', async () => {
  const calls = [];
  const result = await writeDailyFx({ payload: payload(usd), now, request: async (...args) => { calls.push(args); return new Response(null, { status: 201 }); } });
  assert.equal(result.complete, true);
  assert.deepEqual(calls, [['POST', 'fx_rates', [{ rate_date: '2026-10-13', usd_toman: 100000, source: 'brsapi' }]]]);
});

test('409 completes only after exact readback of date, rate and source; every mismatch stays retryable', async () => {
  const exact = { rate_date: '2026-10-13', usd_toman: 100000, source: 'brsapi' };
  for (const rows of [[exact], [], [exact, exact], [{ ...exact, usd_toman: 99999 }], [{ ...exact, source: 'other' }], [{ ...exact, rate_date: '2026-10-12' }], [{ ...exact, usd_toman: '100000' }], {}]) {
    const calls = [];
    const result = await writeDailyFx({ payload: payload(usd), now, request: async (method, path) => {
      calls.push([method, path]);
      return method === 'POST' ? new Response(null, { status: 409 }) : Response.json(rows);
    } });
    assert.equal(result.complete, rows.length === 1 && rows[0] === exact);
    assert.equal(calls[1][1], 'fx_rates?select=rate_date,usd_toman,source&rate_date=eq.2026-10-13&limit=2');
  }
  for (const status of [401, 404, 503]) {
    const result = await writeDailyFx({ payload: payload(usd), now, request: async method => new Response(null, { status: method === 'POST' ? 409 : status }) });
    assert.deepEqual(result, { complete: false, reason: `fx-readback-http-${status}` });
  }
});

test('server wires the guarded writer and carries raw currency unit instead of attesting the forced label', () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.match(source, /sourceUnit: typeof item.unit === "string" \? item.unit : null/);
  assert.match(source, /await writeDailyFx\(/);
  assert.doesNotMatch(source.slice(source.indexOf('async function pushDailyFx('), source.indexOf('let indexHistStatus')), /res.ok \|\| res.status === 409/);
});
