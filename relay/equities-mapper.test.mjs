import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isSubTicker, isRightsIssue } from './symbols-util.mjs';

// Execute the actual AllSymbols section with only its source request mocked.
// Do not import/start the server, refresh jobs, transports, timers, or DB ports.
const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
const sectionStart = source.indexOf('// ── BrsApi: سهام + صندوق‌ها');
const sectionEnd = source.indexOf('// ── BrsApi: NAV صندوق‌ها', sectionStart);
const clockStart = source.indexOf('function sourceClock(item)');
const clockEnd = source.indexOf('\nasync function buildPayload()', clockStart);
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart && clockEnd > clockStart);
const mapperSource = source.slice(sectionStart, sectionEnd) + source.slice(clockStart, clockEnd);

const base = { l18: 'synthetic-stock', l30: 'Synthetic stock', cs_id: 1, pl: 1000, pc: 900 };
async function mapped(items) {
  let requests = 0;
  const status = { sources: {} };
  const client = { request: async request => {
    requests++;
    assert.equal(request.endpoint, 'Tsetmc/AllSymbols.php');
    assert.equal(request.params.type, 1);
    return items;
  } };
  const fetchRows = runInNewContext(mapperSource + '\nfetchStocksAndFunds;', {
    BRSAPI_KEY: 'placeholder-key', BRSAPI_BASE: 'https://synthetic.invalid',
    brsClient: () => client, status, isSubTicker, isRightsIssue,
    recoveredFrom: () => false, wasFailing: {}, errMsg: e => e.message,
    console: { error() {}, log() {} },
    fetch: () => { throw new Error('Unexpected transport call'); },
  });
  const result = await fetchRows();
  assert.equal(requests, 1);
  return JSON.parse(JSON.stringify(result));
}
async function row(overrides = {}) {
  const result = await mapped([{ ...base, ...overrides }]);
  assert.equal(result.stocks.length, 1);
  return result.stocks[0];
}

const signed = { plc: 'change', plp: 'changePercent', pcp: 'closingChangePercent', eps: 'eps', pe: 'pe' };
const nonnegative = {
  tvol: 'volume', tval: 'value', mv: 'marketValue',
  Buy_I_Volume: 'buyI', Buy_N_Volume: 'buyN', Sell_I_Volume: 'sellI', Sell_N_Volume: 'sellN',
};
test('equities preserve real zero and signed changes, EPS and PE', async () => {
  for (const zero of [0, '0']) {
    const result = await row(Object.fromEntries(Object.keys({ ...signed, ...nonnegative }).map(key => [key, zero])));
    for (const field of Object.values({ ...signed, ...nonnegative })) assert.equal(result[field], 0, field);
  }
  const result = await row({ plc: -20, plp: '-1.5', pcp: -2, eps: -30, pe: '-4' });
  assert.equal(result.change, -2);
  assert.equal(result.changePercent, -1.5);
  assert.equal(result.closingChangePercent, -2);
  assert.equal(result.eps, -30);
  assert.equal(result.pe, -4);
});
test('missing, empty, malformed and nonfinite equity measurements stay null', async () => {
  for (const value of [undefined, null, '', '  ', 'invalid', NaN, Infinity, -Infinity, 'Infinity', true, false, [], [10], {}]) {
    const result = await row(Object.fromEntries(Object.keys({ ...signed, ...nonnegative }).map(key => [key, value])));
    for (const field of Object.values({ ...signed, ...nonnegative })) assert.equal(result[field], null, field);
  }
});
test('negative volumes, values and market capitalization are unknown', async () => {
  const result = await row(Object.fromEntries(Object.keys(nonnegative).map(key => [key, '-10'])));
  for (const field of Object.values(nonnegative)) assert.equal(result[field], null, field);
});
test('missing or invalid closing price does not borrow the last price', async () => {
  for (const pc of [undefined, null, '', '  ', 'invalid', 0, -10, false, true, [], [900], {}, Infinity]) {
    const result = await row({ pc });
    assert.equal(result.price, 100);
    assert.equal(result.closingPrice, null);
  }
  assert.equal((await row({ pc: '850' })).closingPrice, 85);
});
test('invalid last prices cannot create an equity row', async () => {
  for (const pl of [undefined, null, '', 'invalid', 0, -10, true, [], [1000], {}, Infinity]) {
    const result = await mapped([{ ...base, pl }]);
    assert.equal(result.stocks.length, 0);
  }
});
test('best-effort measurements omit missing values but preserve actual zero quantities', async () => {
  const result = await row({ Buy_CountI: 0, Sell_CountI: '0', qd1: 0, qo1: '0' });
  for (const field of ['buyCountI', 'sellCountI', 'bestBidVolume', 'bestAskVolume']) assert.equal(result[field], 0, field);
  for (const value of [null, '', 'invalid', true, [], [10], {}, Infinity, -10]) {
    const invalid = await row({ Buy_CountI: value, Sell_CountI: value, qd1: value, qo1: value,
      pmax: value, pmin: value, tmin: value, tmax: value, pd1: value, po1: value });
    for (const field of ['buyCountI', 'sellCountI', 'bestBidVolume', 'bestAskVolume',
      'dayHigh', 'dayLow', 'bandHigh', 'bandLow', 'bestBidPrice', 'bestAskPrice']) {
      assert.equal(Object.hasOwn(invalid, field), false, field);
    }
  }
});
test('industry identifiers require positive safe integers', async () => {
  for (const cs_id of [undefined, null, '', 'invalid', 0, -1, 1.5, true, [], [1], {}, Infinity]) {
    assert.equal((await row({ cs_id })).industryId, null);
  }
  assert.equal((await row({ cs_id: '1' })).industryId, 1);
});
test('fund classification, source clocks, quarantine and sort still use the same response', async () => {
  const result = await mapped([
    { ...base, tval: null }, { ...base, l18: 'synthetic-valued', tval: 200 },
    { ...base, l18: 'synthetic-fund', cs_id: 68, plp: 0, tvol: 0, date: '1405-07-20', time: '12:30:00' },
    { ...base, l18: 'synthetic2' },
    { ...base, l18: 'syntheticح', cs_id: 68 },
  ]);
  assert.deepEqual(result.stocks.map(item => item.id), ['synthetic-valued', 'synthetic-stock', 'syntheticح']);
  assert.equal(result.funds.length, 1);
  assert.equal(result.funds[0].changePercent, 0);
  assert.equal(result.funds[0].volume, 0);
  assert.equal(result.funds[0].sourceDate, '1405-07-20');
  assert.equal(result.funds[0].sourceTime, '12:30:00');
  assert.equal(result.familyOk.stocks, true);
  assert.equal(result.familyOk.funds, true);
});
