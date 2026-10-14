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
  const calls = { provider: [], rpc: [], writes: [], notifications: [] };
  let paymentStatus = 'pending', settlementError = null;
  const regId = '00000000-0000-4000-8000-000000000001';
  const context = () => ({ registration_id: regId, webinar_id: '00000000-0000-4000-8000-000000000002',
    user_id: '00000000-0000-4000-8000-000000000003', payment_id: '00000000-0000-4000-8000-000000000004',
    amount: 100, authority, payment_status: paymentStatus, registration_payment_status: paymentStatus === 'failed' ? 'pending' : paymentStatus,
    ref_id: paymentStatus === 'paid' ? '201' : null, verified_at: paymentStatus === 'paid' ? '2026-10-13T00:00:00.000Z' : null,
    access_qualified: paymentStatus === 'paid',
    access_enabled: true, access_starts_at: '2020-01-01T00:00:00.000Z', access_ends_at: '2099-01-01T00:00:00.000Z' });
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
          return { data: table === 'payments' ? { id: 'pay', user_id: 'member', amount: 100, status: paymentStatus }
            : table === 'webinar_registrations' && kind === 'webinar' ? { id: 'reg', webinar_id: 'webinar', user_id: 'member', webinars: { price_toman: 100 } }
              : null, error: null };
        },
        then(done) { return Promise.resolve({ error: null }).then(done); },
      };
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === 'read_webinar_payment_context') return { data: context(), error: null };
      if (name === 'reject_webinar_payment') {
        paymentStatus = 'failed'; return { data: { ...context(), rejected: true, settled: false }, error: null };
      }
      if (name === 'settle_webinar_payment' && !settlementError) {
        paymentStatus = 'paid'; return { data: { ...context(), settled: true }, error: null };
      }
      if (name === 'verify_payment' && !settlementError) paymentStatus = 'paid';
      return { data: null, error: settlementError };
    },
  };
  const route = load(kind === 'general' ? 'app/api/payment/callback/route.ts' : 'app/api/webinars/payment/callback/route.ts', {
    'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }) } },
    '@/lib/supabase/admin': { createAdminClient: () => admin, tryCreateAdminClient: () => admin },
    '@/lib/webinars/contracts': load('lib/webinars/contracts.ts'),
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
      url.searchParams.set('registration_id', regId); url.searchParams.set('payment_id', 'pay');
      const response = await route.GET({ url: url.href, nextUrl: url });
      return new URL(response.headers.get('location'));
    },
  };
}

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
    assert.deepEqual(f.calls.writes, []);
    assert.ok(f.calls.rpc.every(call => call.name === 'read_webinar_payment_context'));
  });
}

test('existing webinar consumer still recognizes valid rejection and valid success', async () => {
  const rejected = fixture(rejection, undefined, 'webinar');
  assert.equal((await rejected.callback()).searchParams.get('status'), 'failed');
  assert.equal(rejected.calls.rpc.at(-1).name, 'reject_webinar_payment');
  const verified = fixture(() => success(101), undefined, 'webinar');
  assert.equal((await verified.callback()).searchParams.get('status'), 'success');
  assert.equal(verified.calls.rpc.at(-1).name, 'settle_webinar_payment');
  assert.equal(verified.calls.rpc.at(-1).args.p_ref_id, '201');
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
      useRef(initial) { const key = index++; if (!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
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
