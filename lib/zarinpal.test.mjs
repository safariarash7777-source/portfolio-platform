import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute the production sources, replacing all I/O. No gateway, DB, email or Telegram calls.
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(resolve(process.env.PAYMENT_TEST_SOURCE ?? '.', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: file,
  }).outputText, {
    exports, React, URL, URLSearchParams, console: { error() {} },
    process: { env: {} },
    fetch: () => assert.fail('Unmocked fetch'),
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error('Unexpected dependency: ' + name);
    },
    ...globals,
  });
  return exports;
}

const authority = 'A000000000000000000000000000000000001';
const success = code => Response.json({ data: { code, ref_id: 201 }, errors: [] });
const rejection = () => Response.json({ data: [], errors: { code: -51, message: 'Payment unsuccessful', validations: [] } });
const cases = [
  ['network rejection', async () => { throw new Error('network'); }],
  ['body rejection', async () => ({ ok: true, json: async () => { throw new TypeError('body stream'); } })],
  ['HTTP error with success body', async () => Response.json({ data: { code: 100, ref_id: 201 }, errors: [] }, { status: 503 })],
  ['HTTP error with negative body', async () => Response.json({ data: [], errors: { code: -51, message: 'Payment unsuccessful' } }, { status: 500 })],
  ['malformed JSON', async () => new Response('{invalid')],
  ['null JSON', async () => Response.json(null)],
  ['missing merchant', async () => assert.fail('Missing configuration must not fetch'), {}],
  ...[100, 101].flatMap(code => [undefined, null, '', 0, -1, 1.5, '201', {}, Number.MAX_SAFE_INTEGER + 1].map(ref =>
    [`${code} invalid ref ${JSON.stringify(ref)}`, async () => Response.json({ data: { code, ref_id: ref }, errors: [] })])),
  ...[-9, -10, -11, -12, -50, -52, -53, -54, -55, -999].map(code =>
    [`non-final gateway code ${code}`, async () => Response.json({ data: [], errors: { code, message: 'Gateway error' } })]),
  ['negative code in malformed envelope', async () => Response.json({ data: { code: -51 }, errors: [] })],
  ['contradictory success and error', async () => Response.json({ data: { code: 100, ref_id: 201 }, errors: { code: -51, message: 'Payment unsuccessful' } })],
  ['string negative code', async () => Response.json({ data: [], errors: { code: '-51', message: 'Payment unsuccessful' } })],
  ['missing negative message', async () => Response.json({ data: [], errors: { code: -51 } })],
];

function fixture(fetchResult, env = { ZARINPAL_MERCHANT_ID: 'dummy-merchant' }, kind = 'general') {
  if (kind === 'webinar') return webinarFixture(fetchResult, env);
  const calls = { provider: [], rpc: [], writes: [], notifications: [] };
  let paymentStatus = 'pending', settlementError = null;
  const verifier = load('lib/zarinpal.ts', {}, {
    process: { env }, fetch: async (url, options) => {
      calls.provider.push({ url, body: JSON.parse(options.body) });
      assert.match(url, /\/payment\/verify\.json$/);
      return fetchResult();
    },
  });
  const admin = {
    from(table) {
      const query = {
        select() { return this; }, eq() { return this; },
        update(value) { calls.writes.push({ table, value }); return this; },
        insert(value) { calls.writes.push({ table, value }); return this; },
        async maybeSingle() {
          return { data: table === 'payments' ? { user_id: 'member', amount: 100, status: paymentStatus }
            : table === 'webinar_registrations' ? { id: 'reg', webinar_id: 'webinar', user_id: 'member', webinars: { price_toman: 100 } }
              : null, error: null };
        },
        then(done) { return Promise.resolve({ error: null }).then(done); },
      };
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === 'verify_payment' && !settlementError) paymentStatus = 'paid';
      return { data: null, error: settlementError };
    },
  };
  const route = load(kind === 'general' ? 'app/api/payment/callback/route.ts' : 'app/api/webinars/payment/callback/route.ts', {
    'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }) } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/zarinpal': verifier,
    '@/lib/telegram': {
      createSingleUseInvite: async () => { calls.notifications.push('invite'); return null; },
      sendMessage: async () => { calls.notifications.push('telegram'); return true; },
    },
    '@/lib/resend': { sendAnnouncementEmail: async () => calls.notifications.push('email') },
  });
  return { verifier, calls,
    settlementError(value) { settlementError = value; },
    async callback(status = 'OK', providedAuthority = authority) {
      const url = new URL('https://site.example.test/api/payment/callback');
      url.searchParams.set('Authority', providedAuthority); url.searchParams.set('Status', status);
      url.searchParams.set('registration_id', 'reg'); url.searchParams.set('payment_id', 'pay');
      const response = await route.GET({ url: url.href, nextUrl: url });
      return new URL(response.headers.get('location'));
    },
  };
}

const webinarIds = { payment: '11111111-1111-4111-8111-111111111111', registration: '22222222-2222-4222-8222-222222222222', user: '33333333-3333-4333-8333-333333333333', webinar: '44444444-4444-4444-8444-444444444444' };
// Execute the real route against bounded, canonical row snapshots. All I/O is in-memory.
function webinarFixture(fetchResult, env = { ZARINPAL_MERCHANT_ID: 'dummy-merchant' }) {
  const calls = { provider: [], rpc: [], writes: [], reads: [], notifications: [] };
  const rows = {
    payment: { id: webinarIds.payment, user_id: webinarIds.user, authority, amount: 100, status: 'pending', ref_id: null, verified_at: null },
    registration: { id: webinarIds.registration, webinar_id: webinarIds.webinar, user_id: webinarIds.user, payment_id: webinarIds.payment, payment_status: 'pending' },
    webinar: { price_toman: 100, title: 'Synthetic webinar' },
  };
  const faults = { rpc: null, registrationWrite: null, paymentReadAt: 0, registrationReadAt: 0, paidRef: null, beforeRegistrationWrite: null, registrationAckOnly: false };
  let paymentReads = 0, registrationReads = 0;
  const verifier = load('lib/zarinpal.ts', {}, { process: { env }, fetch: async (url, options) => {
    calls.provider.push({ url, body: JSON.parse(options.body) });
    assert.match(url, /\/payment\/verify\.json$/); return fetchResult();
  } });
  const admin = {
    from(table) {
      assert.ok(['payments', 'webinar_registrations', 'audit_log'].includes(table), `unexpected table ${table}`);
      const filters = []; let columns = '', update = null, insert = null;
      const run = async () => {
        const row = table === 'payments' ? rows.payment : rows.registration;
        if (insert) return { data: null, error: null };
        if (!update) {
          calls.reads.push({ table, columns, filters: [...filters] });
          if (table === 'payments' && ++paymentReads === faults.paymentReadAt || table === 'webinar_registrations' && ++registrationReads === faults.registrationReadAt) return { data: null, error: { code: 'fixture_read' } };
        }
        if (update && table === 'webinar_registrations') faults.beforeRegistrationWrite?.(rows);
        if (!row || !filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
        if (update) {
          // Match the checked-in payment schema: `verified` is not a payment status.
          if (table === 'payments' && (!['paid', 'failed'].includes(update.status) || row.status !== 'pending')) return { data: null, error: { code: '23514' } };
          if (table === 'webinar_registrations' && faults.registrationWrite === 'before') return { data: null, error: { code: 'fixture_write' } };
          if (!faults.registrationAckOnly) Object.assign(row, update);
          if (table === 'webinar_registrations' && faults.registrationWrite === 'after') return { data: null, error: { code: 'fixture_lost_ack' } };
          return { data: { id: row.id }, error: null };
        }
        return { data: { ...row, ...(columns.includes('webinars(') ? { webinars: { ...rows.webinar } } : {}) }, error: null };
      };
      const query = {
        select(value = '') { columns = value; return this; }, eq(key, value) { filters.push([key, value]); return this; },
        update(value) { update = value; calls.writes.push({ table, value, filters }); return this; },
        insert(value) { insert = value; calls.writes.push({ table, value }); return this; },
        maybeSingle: run, then(done, rejected) { return run().then(done, rejected); },
      };
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      assert.ok(['verify_payment', 'fail_payment'].includes(name), 'no grant or other RPC');
      assert.equal(args.p_authority, rows.payment.authority);
      if (faults.rpc === 'before') return { data: null, error: { code: 'fixture_rpc' } };
      if (name === 'verify_payment') {
        assert.equal(args.p_amount, rows.payment.amount);
        if (rows.payment.status === 'pending') Object.assign(rows.payment, { status: 'paid', ref_id: faults.paidRef ?? args.p_ref_id, verified_at: '2026-10-30T00:00:00.000Z' });
      } else if (rows.payment.status === 'pending') rows.payment.status = 'failed';
      if (faults.rpc === 'throw_after') throw new Error('synthetic lost acknowledgement');
      return { data: name === 'verify_payment' ? rows.payment.user_id : null, error: faults.rpc === 'after' ? { code: 'fixture_lost_ack' } : null };
    },
  };
  const route = load('app/api/webinars/payment/callback/route.ts', {
    'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }) } },
    '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/zarinpal': verifier,
  });
  return { calls, rows, faults, verifier, settlementError() { faults.rpc = 'before'; },
    async callback(status = 'OK', providedAuthority = authority, patch = {}) {
      const url = new URL('https://site.example.test/api/webinars/payment/callback');
      for (const [key, value] of Object.entries({ Authority: providedAuthority, Status: status, registration_id: webinarIds.registration, payment_id: webinarIds.payment, ...patch })) {
        if (Array.isArray(value)) { for (const entry of value) url.searchParams.append(key, entry); }
        else url.searchParams.set(key, value);
      }
      const response = await route.GET({ url: url.href, nextUrl: url });
      return new URL(response.headers.get('location'));
    },
  };
}

test('webinar binding rejects a different payment, authority or registration owner before verification or writes', async () => {
  for (const mutate of [f => { f.rows.payment.id = 'other-payment'; }, f => { f.rows.payment.authority = 'other-authority'; }, f => { f.rows.registration.payment_id = 'other-payment'; }, f => { f.rows.registration.user_id = 'other-member'; }]) {
    const f = webinarFixture(() => success(100)); mutate(f);
    assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.writes, []);
  }
});

test('webinar verification uses the stored payment amount and canonical settlement RPC, not the current webinar price', async () => {
  const f = webinarFixture(() => success(100)); f.rows.webinar.price_toman = 999;
  assert.equal((await f.callback()).searchParams.get('status'), 'success');
  assert.equal(f.calls.provider[0].body.amount, 1000);
  assert.equal(f.calls.rpc[0].name, 'verify_payment');
  assert.equal(f.calls.rpc[0].args.p_amount, 100);
  assert.equal(f.rows.payment.status, 'paid'); assert.equal(f.rows.registration.payment_status, 'paid');
  assert.ok(f.calls.writes.every(write => write.table !== 'payments'));
});

test('webinar provider success without a committed local settlement stays unknown and never marks registration paid', async () => {
  const f = webinarFixture(() => success(100)); f.faults.rpc = 'before';
  assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
  assert.equal(f.rows.payment.status, 'pending'); assert.equal(f.rows.registration.payment_status, 'pending');
  assert.deepEqual(f.calls.writes, []);
});

test('webinar duplicate callback fields are unknown without even reading or contacting a gateway', async () => {
  for (const key of ['Authority', 'Status', 'registration_id', 'payment_id']) {
    const f = webinarFixture(() => assert.fail('ambiguous callback must not verify'));
    assert.equal((await f.callback('OK', authority, { [key]: ['one', 'two'] })).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.reads, []); assert.deepEqual(f.calls.writes, []); assert.deepEqual(f.calls.rpc, []);
  }
});

test('webinar missing, failed or malformed canonical reads never verify or write', async () => {
  for (const mutate of [f => { f.rows.payment = null; }, f => { f.faults.paymentReadAt = 1; }, f => { f.faults.registrationReadAt = 1; }, f => { f.rows.payment.amount = 0; }, f => { f.rows.payment.amount = Number.MAX_SAFE_INTEGER; }, f => { f.rows.payment.status = ['pending']; }]) {
    const f = webinarFixture(() => assert.fail('invalid canonical evidence must not verify')); mutate(f);
    assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.writes, []);
  }
});

test('webinar settlement lost acknowledgement is read back once, then replay has no provider or write effects', async () => {
  for (const mode of ['after', 'throw_after']) {
    const f = webinarFixture(() => success(101)); f.faults.rpc = mode;
    assert.equal((await f.callback()).searchParams.get('status'), 'success');
    assert.equal(f.calls.rpc.length, 1); assert.equal(f.calls.provider.length, 1);
    const effects = () => JSON.stringify({ provider: f.calls.provider, rpc: f.calls.rpc, writes: f.calls.writes });
    const before = effects();
    assert.equal((await f.callback()).searchParams.get('status'), 'success');
    assert.equal(effects(), before);
    assert.ok(f.calls.reads.filter(read => read.table === 'payments').length >= 3, 'independent canonical reads, including replay');
  }
});

test('webinar settlement read failure or ref mismatch remains unknown before registration writes', async () => {
  for (const mutate of [f => { f.faults.paymentReadAt = 2; }, f => { f.faults.paidRef = '202'; }]) {
    const f = webinarFixture(() => success(100)); mutate(f);
    assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
    assert.equal(f.calls.rpc.length, 1); assert.equal(f.rows.registration.payment_status, 'pending');
    assert.deepEqual(f.calls.writes, []);
  }
});

test('webinar partial local registration failure recovers the SAME paid row without another verification', async () => {
  const f = webinarFixture(() => success(100)); f.faults.registrationWrite = 'before';
  assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
  assert.equal(f.rows.payment.status, 'paid'); assert.equal(f.rows.registration.payment_status, 'pending');
  f.faults.registrationWrite = null;
  assert.equal((await f.callback()).searchParams.get('status'), 'success');
  assert.equal(f.calls.provider.length, 1); assert.equal(f.calls.rpc.length, 1);
  const registrationWrites = f.calls.writes.filter(write => write.table === 'webinar_registrations');
  assert.equal(registrationWrites.length, 2, 'one failed attempt and one explicit recovery, no internal replay');
});

test('webinar registration requires readback even after a successful-looking or lost write acknowledgement', async () => {
  const lost = webinarFixture(() => success(100)); lost.faults.registrationWrite = 'after';
  assert.equal((await lost.callback()).searchParams.get('status'), 'success');
  assert.equal(lost.calls.writes.filter(write => write.table === 'webinar_registrations').length, 1);
  const ackOnly = webinarFixture(() => success(100)); ackOnly.faults.registrationAckOnly = true;
  assert.equal((await ackOnly.callback()).searchParams.get('status'), 'unknown');
  assert.equal(ackOnly.rows.registration.payment_status, 'pending');
  assert.equal(ackOnly.calls.writes.some(write => write.table === 'audit_log'), false);
});

test('webinar terminal free/refunded registrations are not revived by a callback', async () => {
  for (const state of ['free', 'refunded', 'paid']) {
    const f = webinarFixture(() => assert.fail('inconsistent or terminal registration must not verify'));
    f.rows.registration.payment_status = state;
    assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.writes, []);
  }
});

test('webinar registration rebinding or refund during settlement cannot attach payment to another webinar', async () => {
  for (const mutate of [rows => { rows.registration.webinar_id = 'different-webinar'; }, rows => { rows.registration.payment_id = 'different-payment'; }, rows => { rows.registration.user_id = 'different-user'; }, rows => { rows.registration.payment_status = 'refunded'; }]) {
    const f = webinarFixture(() => success(100)); f.faults.beforeRegistrationWrite = mutate;
    assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
    assert.notEqual(f.rows.registration.payment_status, 'paid');
    assert.equal(f.calls.writes.some(write => write.table === 'audit_log'), false);
  }
});

test('webinar definitive rejection is failed only after the failure row is independently confirmed', async () => {
  const lost = webinarFixture(rejection); lost.faults.rpc = 'after';
  assert.equal((await lost.callback()).searchParams.get('status'), 'failed');
  assert.equal(lost.calls.rpc.length, 1); assert.deepEqual(lost.calls.writes, []);
  const absent = webinarFixture(rejection); absent.faults.rpc = 'before';
  assert.equal((await absent.callback()).searchParams.get('status'), 'unknown');
  assert.equal(absent.rows.payment.status, 'pending'); assert.equal(absent.rows.registration.payment_status, 'pending');
  const settled = webinarFixture(() => assert.fail('stored failed payment must not verify again'));
  settled.rows.payment.status = 'failed';
  assert.equal((await settled.callback()).searchParams.get('status'), 'failed');
  assert.deepEqual(settled.calls.provider, []); assert.deepEqual(settled.calls.rpc, []); assert.deepEqual(settled.calls.writes, []);
});

test('webinar committed registration with failed readback stays unknown, then explicit replay reads the same paid state', async () => {
  const f = webinarFixture(() => success(100)); f.faults.registrationReadAt = 3;
  assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
  assert.equal(f.rows.registration.payment_status, 'paid');
  assert.equal(f.calls.writes.some(write => write.table === 'audit_log'), false);
  assert.equal((await f.callback()).searchParams.get('status'), 'success');
  assert.equal(f.calls.provider.length, 1); assert.equal(f.calls.rpc.length, 1);
  assert.equal(f.calls.writes.filter(write => write.table === 'webinar_registrations').length, 1);
});

test('webinar paid status without a valid stored reference and settlement timestamp is not success', async () => {
  for (const mutate of [row => { row.ref_id = null; }, row => { row.ref_id = '0'; }, row => { row.verified_at = null; }, row => { row.verified_at = 'invalid'; }]) {
    const f = webinarFixture(() => assert.fail('bad paid receipt must not reverify automatically'));
    Object.assign(f.rows.payment, { status: 'paid', ref_id: '201', verified_at: '2026-10-30T00:00:00.000Z' });
    f.rows.registration.payment_status = 'paid'; mutate(f.rows.payment);
    assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.writes, []);
  }
});

test('overlapping webinar callbacks settle only the same rows and conditionally record one registration audit', async () => {
  const f = webinarFixture(() => success(101));
  const results = await Promise.all([f.callback(), f.callback()]);
  assert.deepEqual(results.map(result => result.searchParams.get('status')), ['success', 'success']);
  assert.equal(f.rows.payment.status, 'paid'); assert.equal(f.rows.registration.payment_status, 'paid');
  assert.ok(f.calls.provider.every(call => call.body.authority === authority && call.url.endsWith('/verify.json')));
  assert.ok(f.calls.rpc.every(call => call.name === 'verify_payment' && call.args.p_authority === authority));
  assert.equal(f.calls.writes.filter(write => write.table === 'audit_log').length, 1);
  assert.ok(f.calls.writes.every(write => write.table !== 'payments'));
});

for (const [name, response, env] of cases) {
  test(`real verifier: ${name} stays unknown`, async () => {
    const f = fixture(response, env);
    assert.equal((await f.verifier.verifyPayment(authority, 100)).outcome, 'unknown');
  });
  test(`real general callback: ${name} stays unknown without failure writes`, async () => {
    const f = fixture(response, env);
    const result = await f.callback();
    assert.equal(result.searchParams.get('status'), 'unknown');
    assert.equal(result.searchParams.get('authority'), authority);
    assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.writes, []);
    assert.deepEqual(f.calls.notifications, []);
    assert.ok(f.calls.provider.every(call => call.body.authority === authority && call.body.amount === 1000));
  });
}

test('documented -51 in a valid HTTP/JSON error envelope is a definitive rejection', async () => {
  const f = fixture(rejection);
  const result = await f.verifier.verifyPayment(authority, 100);
  assert.equal(result.outcome, 'rejected'); assert.equal(result.code, -51);
  assert.equal((await f.callback()).searchParams.get('status'), 'failed');
  assert.equal(f.calls.rpc.length, 1); assert.equal(f.calls.rpc[0].name, 'fail_payment');
  assert.deepEqual(f.calls.notifications, []);
});

for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN]) {
  test(`invalid stored amount ${amount} stays unknown without a provider call`, async () => {
    const f = fixture(() => assert.fail('Invalid amount must not reach gateway'));
    assert.equal((await f.verifier.verifyPayment(authority, amount)).outcome, 'unknown');
    assert.equal(f.calls.provider.length, 0);
  });
}

test('empty authority stays unknown without provider calls or failure writes', async () => {
  const f = fixture(() => assert.fail('Empty authority must not reach gateway'));
  assert.equal((await f.verifier.verifyPayment('', 100)).outcome, 'unknown');
  assert.equal((await f.callback('OK', '')).searchParams.get('status'), 'unknown');
  assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.provider, []);
});

for (const code of [100, 101]) {
  test(`valid ${code} settles once and paid replay has no provider/notification effects`, async () => {
    const f = fixture(() => success(code));
    const result = await f.callback();
    assert.equal(result.searchParams.get('status'), 'success'); assert.equal(result.searchParams.get('ref'), '201');
    assert.equal(f.calls.rpc[0].name, 'verify_payment'); assert.equal(f.calls.rpc[0].args.p_ref_id, '201');
    const before = JSON.stringify(f.calls);
    assert.equal((await f.callback()).searchParams.get('status'), 'success');
    assert.equal(JSON.stringify(f.calls), before);
  });
}

test('unknown then explicit replay verifies the SAME authority without creating another charge', async () => {
  let attempt = 0;
  const f = fixture(async () => ++attempt === 1 ? new Response('{invalid') : success(101));
  assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
  assert.deepEqual(f.calls.rpc, []);
  assert.equal((await f.callback()).searchParams.get('status'), 'success');
  assert.equal(f.calls.provider.length, 2);
  assert.ok(f.calls.provider.every(call => call.body.authority === authority));
  assert.deepEqual(f.calls.rpc.map(call => call.name), ['verify_payment']);
});

test('callback query NOK cannot write a definitive payment failure', async () => {
  const f = fixture(() => assert.fail('NOK must not auto verify'));
  assert.equal((await f.callback('NOK')).searchParams.get('status'), 'unknown');
  assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.provider, []);
});

test('gateway success followed by local settlement error is unknown, never failed', async () => {
  const f = fixture(() => success(100)); f.settlementError({ message: 'synthetic DB error' });
  assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
  assert.deepEqual(f.calls.rpc.map(call => call.name), ['verify_payment']);
});

for (const [name, response, env] of cases) {
  test(`existing webinar callback: ${name} cannot mark payment/registration failed or paid`, async () => {
    const f = fixture(response, env, 'webinar');
    const result = await f.callback();
    assert.equal(result.searchParams.get('status'), 'unknown');
    assert.equal(result.searchParams.get('authority'), authority);
    assert.deepEqual(f.calls.writes, []); assert.deepEqual(f.calls.rpc, []);
  });
}

test('existing webinar consumer still recognizes valid rejection and valid success', async () => {
  const rejected = fixture(rejection, undefined, 'webinar');
  assert.equal((await rejected.callback()).searchParams.get('status'), 'failed');
  assert.equal(rejected.calls.rpc[0].name, 'fail_payment');
  assert.equal(rejected.rows.payment.status, 'failed');
  const verified = fixture(() => success(101), undefined, 'webinar');
  assert.equal((await verified.callback()).searchParams.get('status'), 'success');
  assert.equal(verified.calls.rpc[0].args.p_ref_id, '201');
  assert.equal(verified.rows.payment.status, 'paid');
  assert.equal(verified.rows.registration.payment_status, 'paid');
});

test('existing webinar callback NOK is unknown without writes or provider calls', async () => {
  const f = fixture(() => assert.fail('NOK must not auto verify'), undefined, 'webinar');
  assert.equal((await f.callback('NOK')).searchParams.get('status'), 'unknown');
  assert.deepEqual(f.calls.writes, []); assert.deepEqual(f.calls.provider, []);
});

const passthrough = ({ children, ...props }) => React.createElement('a', props, children);
const uiDependencies = {
  'next/link': { __esModule: true, default: passthrough },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/layout/Navbar': { __esModule: true, default: () => null },
  '@/components/layout/Footer': { __esModule: true, default: () => null },
  '@/lib/format': { toPersianDigits: value => value },
};

test('actual result page presents unknown and an explicit same-authority verification link', async () => {
  const page = load('app/payment/result/page.tsx', uiDependencies);
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ status: 'unknown', authority }) }));
  assert.match(html, /نتیجهٔ پرداخت هنوز مشخص نیست/);
  assert.doesNotMatch(html, /پرداخت ناموفق|بازمی‌گردد|دوباره تلاش/);
  assert.match(html, /role="status"/);
  assert.match(html, /\/api\/payment\/callback\?Authority=A0.*Status=OK/);
  assert.doesNotMatch(html, /\/api\/payment\/request/);
});

test('actual webinar page presents unknown without automatic payment creation', () => {
  const slots = [], effects = [];
  let index = 0;
  const search = new URLSearchParams({ status: 'unknown', authority, webinar_id: 'webinar', registration_id: 'reg', payment_id: 'pay' });
  const fetches = [];
  const page = load('app/webinars/page.tsx', { ...uiDependencies,
    react: { ...React,
      useState(initial) { const key = index++; if (!(key in slots)) slots[key] = initial; return [slots[key], value => { slots[key] = value; }]; },
      useEffect(effect) { effects.push(effect); },
    },
    'next/navigation': { useSearchParams: () => search },
    '@/components/account/returnPath': { accountEntryHref: () => '/login' },
  }, { fetch: async url => { fetches.push(url); assert.equal(url, '/api/webinars/list'); return Response.json({ webinars: [] }); } });
  const content = page.default().props.children;
  content.type(); effects.splice(0).forEach(effect => effect()); index = 0;
  const html = renderToStaticMarkup(content.type());
  assert.match(html, /نتیجهٔ پرداخت هنوز مشخص نیست/);
  assert.doesNotMatch(html, /پرداخت ناموفق|دوباره تلاش/);
  assert.match(html, /role="status"/);
  assert.deepEqual(fetches, ['/api/webinars/list']);
});
