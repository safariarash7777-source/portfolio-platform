import test from 'node:test';
import './payments/webinar-binding.test.mjs';
import './payments/legacy-callback.test.mjs';
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
    exports, React, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console: { error() {} },
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


const ids = { payment: '11111111-1111-4111-8111-111111111111', registration: '22222222-2222-4222-8222-222222222222',
  user: '33333333-3333-4333-8333-333333333333', webinar: '44444444-4444-4444-8444-444444444444', intent: '55555555-5555-4555-8555-555555555555' };
function fixture(fetchResult = () => success(100), env = { ZARINPAL_MERCHANT_ID: 'dummy-merchant', WEBINAR_PAYMENT_BINDING_WRITES: '1', NEXT_PUBLIC_SITE_URL: 'https://site.example.test' }) {
  const calls = { provider: [], rpc: [], writes: [], notifications: [] };
  const row = { contractVersion: 'webinar-payment-binding.v1', state: 'bound', purpose: 'webinar.v1', registrationProvenance: 'register-webinar.v1',
    paymentId: ids.payment, userId: ids.user, registrationId: ids.registration, webinarId: ids.webinar, intentKey: ids.intent,
    amountToman: 100, createdAt: '2026-10-30T00:00:00Z', authority, providerState: 'attached', status: 'pending',
    refId: null, verifiedAt: null, registrationState: 'pending', issuanceEnabled: true, settlementEnabled: true };
  const faults = { legacy: false, readAt: 0, settle: null, claim: null, attach: null, registration: null, request: null, auth: false,
    registrationExists: true, paymentExists: true, trustedRegistration: true, capabilityMissing: false, registerAck: null, guest: false, registrationReadError: false };
  const registrationState = () => ({ contractVersion: 'webinar-registration.v1', webinarId: row.webinarId,
    state: faults.registrationExists ? 'registered' : 'absent', registrationId: faults.registrationExists ? row.registrationId : null,
    paymentStatus: faults.registrationExists ? row.registrationState : null,
    mode: row.issuanceEnabled && row.amountToman > 0 ? 'bound' : 'legacy',
    provenance: faults.registrationExists ? faults.trustedRegistration ? 'register-webinar.v1' : 'unproven' : 'none',
    paymentEnabled: faults.registrationExists && faults.trustedRegistration && row.issuanceEnabled && row.registrationState === 'pending',
    payment: faults.registrationExists && faults.paymentExists ? { intentKey: row.intentKey, stage: row.providerState, status: row.status,
      authority: row.authority, amountToman: row.amountToman, unit: 'toman', createdAt: row.createdAt, refId: row.refId, verifiedAt: row.verifiedAt } : null });
  let reads = 0;
  const admin = {
    from(table) {
      assert.ok(faults.capabilityMissing && ['webinars', 'webinar_registrations'].includes(table), 'only old-schema session reads are authorized here');
      const filters = [];
      return { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; }, async maybeSingle() {
        if (table === 'webinars') return { data: { id: row.webinarId, status: 'published' }, error: null };
        assert.ok(filters.some(([k, v]) => k === 'user_id' && v === ids.user), 'legacy read must be owner-scoped');
        return { data: faults.registrationExists ? { id: row.registrationId, payment_status: row.registrationState } : null, error: null };
      } };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === 'read_webinar_registration_state') {
        if (faults.capabilityMissing) return { data: null, error: { code: 'PGRST202' } };
        if (faults.registrationReadError) return { data: null, error: { code: 'synthetic_transport' } };
        return { data: registrationState(), error: null };
      }
      if (['register_for_webinar', 'register_for_webinar_bound_v1'].includes(name)) {
        if (faults.registerAck === 'before') return { data: null, error: {} };
        faults.registrationExists = true; faults.paymentExists = false; faults.trustedRegistration = name.endsWith('bound_v1');
        row.registrationState = row.amountToman === 0 ? 'free' : 'pending';
        calls.writes.push('register');
        if (faults.registerAck === 'after') throw Error('lost registration ACK');
        return { data: { registration_id: row.registrationId, already_registered: false }, error: null };
      }
      if (name === 'read_webinar_payment_binding') {
        if (faults.legacy || ++reads === faults.readAt) return { data: null, error: { code: 'synthetic_missing' } };
        if (args.p_authority !== null && args.p_authority !== row.authority || args.p_payment_id !== null && args.p_payment_id !== row.paymentId) return { data: null, error: null };
        return { data: { ...row }, error: null };
      }
      if (name === 'prepare_webinar_payment') {
        if (args.p_registration_id !== row.registrationId || args.p_intent_key !== row.intentKey) return { data: null, error: {} };
        if (!faults.paymentExists) { faults.paymentExists = true; row.providerState = 'prepared'; row.authority = null; }
        return { data: { ...row }, error: null };
      }
      if (name === 'claim_webinar_payment_request') {
        if (faults.claim === 'before') return { data: null, error: {} };
        const claimedNow = row.providerState === 'prepared';
        if (claimedNow) { row.providerState = 'claimed'; calls.writes.push('claim'); }
        if (faults.claim === 'after') throw Error('lost claim ACK');
        return { data: { contractVersion: 'webinar-payment-claim.v1', paymentId: row.paymentId, claimedNow }, error: null };
      }
      if (name === 'attach_webinar_authority') {
        if (faults.attach !== 'before') { row.authority = args.p_authority; row.providerState = 'attached'; calls.writes.push('attach'); }
        if (faults.attach === 'after') throw Error('lost attach ACK');
        return { data: null, error: faults.attach === 'before' ? {} : null };
      }
      assert.equal(name, 'settle_webinar_payment', 'only the versioned settlement RPC may write');
      if (faults.settle === 'before') return { data: null, error: {} };
      assert.equal(args.p_payment_id, row.paymentId); assert.equal(args.p_authority, row.authority); assert.equal(args.p_amount, row.amountToman);
      if (row.status === 'pending') {
        calls.writes.push('money');
        row.status = args.p_outcome === 'verified' ? 'paid' : 'failed';
        if (row.status === 'paid') { row.refId = args.p_ref_id; row.verifiedAt = '2026-10-30T01:00:00Z'; }
      }
      if (row.status === 'paid' && row.registrationState === 'pending' && !faults.registration) {
        row.registrationState = 'paid'; calls.writes.push('registration');
      }
      if (faults.settle === 'after') throw Error('lost settlement ACK');
      return { data: { ...row }, error: null };
    },
  };
  const verifier = load('lib/zarinpal.ts', {}, { process: { env }, fetch: async (url, options) => {
    calls.provider.push({ url, body: JSON.parse(options.body) });
    if (url.includes('/request.json')) {
      if (faults.request) throw Error('request transport unknown');
      return Response.json({ data: { code: 100, authority }, errors: [] });
    }
    assert.match(url, /\/payment\/verify\.json$/);
    return fetchResult();
  } });
  const binding = load('lib/payments/webinar-binding.ts', { 'server-only': {}, '@/lib/deadline': load('lib/deadline.ts') }, { process: { env } });
  const dependencies = { 'next/server': { NextResponse: {
    redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }),
    json: (body, init) => Response.json(body, init),
  } }, '@/lib/supabase/admin': { createAdminClient: () => admin, tryCreateAdminClient: () => admin },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: faults.guest ? null : { id: ids.user } }, error: faults.auth ? {} : null }) }, rpc: admin.rpc, from: admin.from }) },
    '@/lib/payments/webinar-binding': binding, '@/lib/zarinpal': verifier };
  const routes = Object.fromEntries(['general', 'webinar', 'start', 'register'].map(kind => [kind, load(kind === 'general' ? 'app/api/payment/callback/route.ts'
    : kind === 'webinar' ? 'app/api/webinars/payment/callback/route.ts' : kind === 'register' ? 'app/api/webinars/register/route.ts' : 'app/api/webinars/payment/route.ts', dependencies, { process: { env } })]));
  return { row, calls, faults, verifier, env, routes,
    async callback(kind = 'webinar', status = 'OK', patch = {}) {
      const params = { Authority: authority, Status: status, ...(kind === 'webinar' ? { registration_id: ids.registration, payment_id: ids.payment } : {}), ...patch };
      const url = new URL('https://site.example.test/api/payment/callback');
      for (const [key, value] of Object.entries(params)) for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, v);
      const response = await routes[kind].GET({ url: url.href, nextUrl: url });
      return new URL(response.headers.get('location'));
    },
    async start(patch = {}) {
      return routes.start.POST({ headers: new Headers({ 'Idempotency-Key': ids.intent }),
        json: async () => ({ registration_id: ids.registration, ...patch }) });
    },
  };
}
const writes = f => f.calls.rpc.filter(c => c.name !== 'read_webinar_payment_binding');

for (const [name, response, env] of cases) {
  test('real verifier: ' + name + ' stays unknown', async () => {
    const f = fixture(response, env);
    assert.equal((await f.verifier.verifyPayment(authority, 100)).outcome, 'unknown');
  });
  for (const kind of ['general', 'webinar']) test(kind + ' callback: ' + name + ' has no settlement effect', async () => {
    const f = fixture(response, env);
    assert.equal((await f.callback(kind)).searchParams.get('status'), 'unknown');
    assert.deepEqual(writes(f), []); assert.deepEqual(f.calls.writes, []); assert.deepEqual(f.calls.notifications, []);
  });
}
for (const kind of ['general', 'webinar']) {
  test(kind + ': missing schema/legacy purpose cannot authorize a service, even for stored paid money', async () => {
    const f = fixture(() => assert.fail('unproven intent must not verify'));
    f.faults.legacy = true; f.row.status = 'paid'; f.row.refId = '201'; f.row.verifiedAt = '2026-10-30T01:00:00Z';
    assert.equal((await f.callback(kind)).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.writes, []); assert.equal(f.row.registrationState, 'pending');
  });
  test(kind + ': writes are disabled by default in both app and database capability', async () => {
    for (const app of [false, true]) {
      const f = fixture(() => assert.fail('default-off must not call provider'));
      if (app) delete f.env.WEBINAR_PAYMENT_BINDING_WRITES; else f.row.settlementEnabled = false;
      assert.equal((await f.callback(kind)).searchParams.get('status'), 'unknown');
      assert.deepEqual(writes(f), []);
    }
  });
  test(kind + ': wrong or duplicate query hints never select purpose or owner', async () => {
    for (const patch of [{ Authority: [authority, authority] }, { Status: ['OK', 'OK'] }, { registration_id: 'other' }, { payment_id: 'other' },
      { registration_id: [ids.registration, ids.registration] }]) {
      const f = fixture(() => assert.fail('invalid hint must not verify'));
      assert.equal((await f.callback(kind, 'OK', patch)).searchParams.get('status'), 'unknown');
      assert.deepEqual(writes(f), []); assert.deepEqual(f.calls.provider, []);
    }
  });
  for (const code of [100, 101]) test(kind + ': verified ' + code + ' settles the stored snapshot; replay only reads', async () => {
    const f = fixture(() => success(code));
    const result = await f.callback(kind);
    assert.equal(result.searchParams.get('status'), 'success');
    assert.equal(result.pathname, '/webinars');
    assert.equal(f.calls.provider[0].body.amount, 1000);
    assert.equal(writes(f)[0].name, 'settle_webinar_payment');
    assert.equal(writes(f)[0].args.p_ref_id, '201');
    const before = JSON.stringify({ provider: f.calls.provider, writes: f.calls.writes, rpc: writes(f) });
    assert.equal((await f.callback(kind)).searchParams.get('status'), 'success');
    assert.equal(JSON.stringify({ provider: f.calls.provider, writes: f.calls.writes, rpc: writes(f) }), before);
  });
  test(kind + ': definitive rejection needs independent failure readback', async () => {
    for (const fault of [null, 'before', 'after']) {
      const f = fixture(rejection); f.faults.settle = fault;
      assert.equal((await f.callback(kind)).searchParams.get('status'), fault === 'before' ? 'unknown' : 'failed');
      assert.equal(writes(f).length, 1);
    }
  });
  test(kind + ': NOK does not prove failure or trigger verification', async () => {
    const f = fixture(() => assert.fail('NOK cannot verify'));
    assert.equal((await f.callback(kind, 'NOK')).searchParams.get('status'), 'unknown');
    assert.deepEqual(writes(f), []); assert.deepEqual(f.calls.provider, []);
  });
  test(kind + ': unknown settlement ACK is read once rather than replayed', async () => {
    const f = fixture(() => success(100)); f.faults.settle = 'after';
    assert.equal((await f.callback(kind)).searchParams.get('status'), 'success');
    assert.equal(writes(f).length, 1);
  });
  test(kind + ': failed settlement readback never becomes success from its ACK', async () => {
    const f = fixture(() => success(100)); f.faults.readAt = 2;
    assert.equal((await f.callback(kind)).searchParams.get('status'), 'unknown');
    assert.equal(writes(f).length, 1);
  });
  test(kind + ': paid money and unresolved/refunded service are separate', async () => {
    for (const state of ['unresolved', 'refunded']) {
      const f = fixture(() => success(100)); f.row.registrationState = state;
      assert.equal((await f.callback(kind)).searchParams.get('status'), 'unknown');
      assert.equal(f.row.status, 'paid'); assert.equal(f.row.registrationState, state);
      const count = f.calls.provider.length;
      assert.equal((await f.callback(kind)).searchParams.get('status'), 'unknown');
      assert.equal(f.calls.provider.length, count);
    }
  });
}
test('general dispatch does not invoke notifications or direct tables', async () => {
  const f = fixture(() => success(100)); await f.callback('general');
  assert.deepEqual(f.calls.notifications, []);
});
test('an existing trusted paid receipt recovers only its pending service without another provider call', async () => {
  const f = fixture(() => assert.fail('stored paid money must not be verified twice'));
  f.row.status = 'paid'; f.row.refId = '201'; f.row.verifiedAt = '2026-10-30T01:00:00Z';
  assert.equal((await f.callback()).searchParams.get('status'), 'success');
  assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.writes, ['registration']);
});
test('start default-off performs no authentication, RPC or provider call', async () => {
  const f = fixture(); delete f.env.WEBINAR_PAYMENT_BINDING_WRITES;
  assert.equal((await f.start()).status, 503); assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.provider, []);
});
test('unknown authentication is unavailable rather than treated as a guest or allowed to prepare payment', async () => {
  const f = fixture(); f.faults.auth = true;
  assert.equal((await f.start()).status, 503);
  assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.provider, []);
});
function prepared(f) { f.row.authority = null; f.row.providerState = 'prepared'; }
test('start issues one provider request only after claim and returns URL after independent attachment read', async () => {
  const f = fixture(); prepared(f);
  const response = await f.start();
  assert.equal(response.status, 200);
  assert.match((await response.json()).payment_url, /https:\/\/payment\.zarinpal\.com\/pg\/StartPay\/A/);
  assert.equal(f.calls.provider.length, 1); assert.equal(f.calls.provider[0].body.amount, 1000);
  const repeated = await f.start();
  assert.equal(repeated.status, 200); assert.equal((await repeated.json()).payment_url, `https://payment.zarinpal.com/pg/StartPay/${authority}`);
  assert.equal(f.calls.provider.length, 1);
});
test('lost claim ACK and unknown provider request never repeat the provider request or create another intent', async () => {
  for (const mode of ['claim', 'request']) {
    const f = fixture(); prepared(f);
    if (mode === 'claim') f.faults.claim = 'after'; else f.faults.request = true;
    assert.equal((await f.start()).status, 409);
    assert.equal(f.row.providerState, 'claimed');
    assert.equal((await f.start()).status, 409);
    assert.equal(f.calls.provider.length, mode === 'claim' ? 0 : 1);
    assert.equal(f.calls.writes.filter(x => x === 'claim').length, 1);
  }
});
test('uncommitted authority is never returned as payment URL; lost attach ACK uses readback', async () => {
  for (const mode of ['before', 'after']) {
    const f = fixture(); prepared(f); f.faults.attach = mode;
    assert.equal((await f.start()).status, mode === 'before' ? 409 : 200);
    assert.equal(f.calls.provider.length, 1);
  }
});
test('different owner or intent cannot start a provider request', async () => {
  for (const key of ['userId', 'intentKey']) {
    const f = fixture(); prepared(f); f.row[key] = ids.webinar;
    assert.equal((await f.start()).status, 409);
    assert.deepEqual(f.calls.provider, []);
  }
});
test('overlapping starts claim only once; overlapping callbacks do not duplicate money or service writes', async () => {
  const f = fixture(); prepared(f);
  const results = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
  assert.equal(f.calls.provider.length, 1);
  await Promise.all([f.callback(), f.callback()]);
  assert.equal(f.calls.writes.filter(x => x === 'money').length, 1);
  assert.equal(f.calls.writes.filter(x => x === 'registration').length, 1);
});
for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN]) {
  test('invalid amount ' + amount + ' stays unknown without provider call', async () => {
    const f = fixture(() => assert.fail('invalid amount'));
    assert.equal((await f.verifier.verifyPayment(authority, amount)).outcome, 'unknown');
    f.row.amountToman = amount;
    assert.equal((await f.callback()).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, []);
  });
}

const passthrough = ({ children, ...props }) => React.createElement('a', props, children);
const uiDependencies = {
  'next/link': { __esModule: true, default: passthrough },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/layout/Navbar': { __esModule: true, default: () => null },
  '@/components/layout/Footer': { __esModule: true, default: () => null },
  '@/lib/format': { toPersianDigits: value => value, formatToman: value => String(value) + ' تومان', formatJalali: value => value },
};

const reqRegister = (method = 'GET') => ({ nextUrl: new URL(`https://site.example.test/api/webinars/register?webinar_id=${ids.webinar}`), json: async () => ({ webinar_id: ids.webinar }), method });
test('registration chooses the new contract before one write and returns the real registration_id after canonical GET', async () => {
  const f = fixture(); f.faults.registrationExists = false; f.faults.paymentExists = false;
  const response = await f.routes.register.POST(reqRegister('POST'));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.registration.registration_id, ids.registration);
  assert.equal(result.state.provenance, 'register-webinar.v1');
  assert.equal(f.calls.rpc.filter(c => c.name === 'register_for_webinar_bound_v1').length, 1);
  assert.equal(f.calls.rpc.filter(c => c.name === 'register_for_webinar').length, 0);
  const recovered = await f.routes.register.GET(reqRegister());
  assert.equal((await recovered.json()).state.registrationId, ids.registration);
  assert.deepEqual(f.calls.writes, ['register']);
  assert.match(recovered.headers.get('cache-control'), /private.*no-store/);
});
test('unknown registration ACK never falls back to the old writer; owner GET recovers the genuine existing row', async () => {
  const f = fixture(); f.faults.registrationExists = false; f.faults.paymentExists = false; f.faults.registerAck = 'after';
  assert.equal((await f.routes.register.POST(reqRegister('POST'))).status, 409);
  const recovered = await f.routes.register.GET(reqRegister());
  const result = await recovered.json();
  assert.equal(result.state.registrationId, ids.registration);
  assert.equal(result.state.provenance, 'register-webinar.v1');
  assert.equal('userId' in result.state, false);
  assert.equal(f.calls.rpc.filter(c => c.name.startsWith('register_for_webinar')).length, 1);
  assert.deepEqual(f.calls.provider, []);
});
test('read/identity uncertainty cannot choose a writer; a definitely missing capability and flag-off use the old contract once', async () => {
  for (const mode of ['read-error', 'auth-error', 'missing', 'flag-off']) {
    const f = fixture(); f.faults.registrationExists = false; f.faults.paymentExists = false;
    if (mode === 'read-error') f.faults.registrationReadError = true;
    if (mode === 'auth-error') f.faults.auth = true;
    if (mode === 'missing') f.faults.capabilityMissing = true;
    if (mode === 'flag-off') delete f.env.WEBINAR_PAYMENT_BINDING_WRITES;
    const response = await f.routes.register.POST(reqRegister('POST'));
    assert.equal(response.status, mode.endsWith('error') ? 503 : 200);
    assert.equal(f.calls.rpc.filter(c => c.name === 'register_for_webinar').length, mode.endsWith('error') ? 0 : 1);
    assert.equal(f.calls.rpc.filter(c => c.name === 'register_for_webinar_bound_v1').length, 0);
    assert.deepEqual(f.calls.provider, []);
  }
});

function pageHarness(f, { storage = new Map(), search = new URLSearchParams() } = {}) {
  const slots = [], effects = [], requests = [];
  let index = 0, generated = 0;
  const window = { location: { href: '' }, sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } };
  const page = load('app/webinars/page.tsx', { ...uiDependencies,
    react: { ...React,
      useCallback: callback => callback,
      useState(initial) { const key = index++; if (!(key in slots)) slots[key] = initial; return [slots[key], value => { slots[key] = value; }]; },
      useRef(initial) { const key = index++; if (!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
      useEffect(effect, deps) { const key = index++; if (!(key in slots)) { slots[key] = deps; effects.push(effect); } },
    },
    'next/navigation': { useSearchParams: () => search },
    '@/components/account/returnPath': { accountEntryHref: () => '/login' },
  }, { window, crypto: { randomUUID: () => { generated++; return ids.intent; } }, fetch: async (url, options = {}) => {
    requests.push({ url, method: options.method ?? 'GET', headers: options.headers, body: options.body });
    if (url === '/api/webinars/list') return Response.json({ webinars: [{ id: ids.webinar, title: 'نمونهٔ نمایشی', description: null,
      starts_at: '2099-01-01T00:00:00Z', ends_at: null, registration_open: true, max_capacity: null, price_toman: f.row.amountToman, platform: 'link', platform_url: null, status: 'published', registered_count: null }] });
    if (url.startsWith('/api/webinars/register')) return options.method === 'POST' ? f.routes.register.POST(reqRegister('POST')) : f.routes.register.GET(reqRegister());
    if (url === '/api/webinars/payment') return f.routes.start.POST({ headers: new Headers(options.headers), json: async () => JSON.parse(options.body) });
    assert.fail('Unexpected client request ' + url);
  } });
  const content = page.default().props.children;
  function render() { index = 0; return content.type(); }
  function nodes(node, predicate, result = []) {
    if (Array.isArray(node)) { node.forEach(n => nodes(n, predicate, result)); return result; }
    if (!node || typeof node !== 'object') return result;
    if (predicate(node)) result.push(node);
    nodes(node.props?.children, predicate, result); return result;
  }
  async function mount() { render(); effects.splice(0).forEach(effect => effect()); for (let i = 0; i < 8; i++) await new Promise(setImmediate); return render(); }
  return { window, requests, storage, generated: () => generated, render, nodes, mount,
    click: async () => { const button = nodes(render(), n => n.type === 'button' && n.props.disabled === false)[0]; assert.ok(button, 'actual webinar register button'); await button.props.onClick(); },
    html: () => renderToStaticMarkup(render()),
  };
}
test('actual client → register route → payment route follows registration_id with one persisted intent and canonical URL', async () => {
  const f = fixture(); f.faults.registrationExists = false; f.faults.paymentExists = false;
  const page = pageHarness(f); await page.mount(); await page.click();
  assert.equal(page.window.location.href, `https://payment.zarinpal.com/pg/StartPay/${authority}`);
  const pay = page.requests.find(r => r.url === '/api/webinars/payment');
  assert.equal(JSON.parse(pay.body).registration_id, ids.registration);
  assert.equal(pay.headers['Idempotency-Key'], ids.intent);
  assert.equal(page.storage.get(`webinar-payment.intent.v1:${ids.registration}`), ids.intent);
  assert.equal(f.calls.provider.length, 1); assert.equal(f.calls.writes.filter(x => x === 'register').length, 1);
});
test('lost provider response survives reload without a second request, registration or intent', async () => {
  const f = fixture(); f.faults.registrationExists = false; f.faults.paymentExists = false; f.faults.request = true;
  const storage = new Map(), first = pageHarness(f, { storage }); await first.mount(); await first.click();
  assert.equal(f.row.providerState, 'claimed'); assert.equal(first.generated(), 1); assert.equal(first.window.location.href, '');
  const reload = pageHarness(f, { storage }); await reload.mount(); await reload.click();
  assert.equal(reload.generated(), 0); assert.equal(reload.requests.filter(r => r.method === 'POST').length, 0);
  assert.equal(f.calls.provider.length, 1); assert.equal(f.calls.writes.filter(x => x === 'register').length, 1);
  assert.equal(storage.get(`webinar-payment.intent.v1:${ids.registration}`), ids.intent);
});
test('unknown registration ACK has only read recovery and generates no payment intent', async () => {
  for (const mode of ['before', 'after']) {
    const f = fixture(); f.faults.registrationExists = false; f.faults.paymentExists = false; f.faults.registerAck = mode;
    const page = pageHarness(f); await page.mount(); await page.click();
    assert.equal(page.generated(), 0); assert.deepEqual(f.calls.provider, []);
    const recovery = page.nodes(page.render(), n => n.type === 'button' && n.props.children === 'بررسی وضعیت همین درخواست')[0];
    assert.ok(recovery); recovery.props.onClick(); for (let i = 0; i < 5; i++) await new Promise(setImmediate);
    assert.equal(page.generated(), 0); assert.equal(f.calls.rpc.filter(c => c.name.startsWith('register_for_webinar')).length, 1);
    if (mode === 'before') { const reload = pageHarness(f, { storage: page.storage }); await reload.mount(); await reload.click(); assert.equal(reload.requests.filter(r => r.method === 'POST').length, 0); }
  }
});
test('free/old-schema flow still registers once and never starts a payment or fabricates an intent', async () => {
  const f = fixture(); f.faults.capabilityMissing = true; f.faults.registrationExists = false; f.faults.paymentExists = false; f.row.amountToman = 0;
  const page = pageHarness(f); await page.mount(); await page.click();
  assert.match(page.html(), /ثبت‌نام رایگان شما در حساب ثبت شده/);
  assert.equal(page.generated(), 0); assert.deepEqual(f.calls.provider, []);
  assert.equal(f.calls.rpc.filter(c => c.name === 'register_for_webinar').length, 1);
});
test('forged success query is only an owner GET and never establishes a payment or registration success', async () => {
  const f = fixture(); f.faults.paymentExists = false; f.faults.trustedRegistration = false;
  const page = pageHarness(f, { search: new URLSearchParams({ status: 'success', webinar_id: ids.webinar, authority }) }); await page.mount();
  assert.doesNotMatch(page.html(), /پرداخت و ثبت‌نام همین وبینار در حساب شما تأیید/);
  assert.equal(page.requests.filter(r => r.method === 'POST').length, 0); assert.deepEqual(f.calls.provider, []);
});
test('a failed authoritative reread clears a previously displayed gateway continuation link', async () => {
  const f = fixture();
  const page = pageHarness(f, { search: new URLSearchParams({ status: 'unknown', webinar_id: ids.webinar }) }); await page.mount();
  assert.match(page.html(), /ادامهٔ همان پرداخت/);
  f.faults.registrationReadError = true;
  const recovery = page.nodes(page.render(), n => n.type === 'button' && n.props.children === 'بررسی وضعیت همین درخواست')[0];
  recovery.props.onClick(); for (let i = 0; i < 5; i++) await new Promise(setImmediate);
  assert.doesNotMatch(page.html(), /ادامهٔ همان پرداخت/); assert.deepEqual(f.calls.provider, []);
});

test('actual financial result ignores query claims and uses only the authenticated owner canonical receipt, without service promises', async () => {
  for (const mode of ['owner', 'other-owner', 'auth-error', 'read-error', 'pending']) {
    const reads = [];
    const payment = { id: ids.payment, user_id: ids.user, authority, amount: 100, status: mode === 'pending' ? 'pending' : 'paid',
      created_at: '2026-10-30T00:00:00Z', ref_id: mode === 'pending' ? null : '201', verified_at: mode === 'pending' ? null : '2026-10-30T01:00:00Z' };
    const client = { auth: { getUser: async () => ({ data: { user: { id: mode === 'other-owner' ? ids.webinar : ids.user } }, error: mode === 'auth-error' ? {} : null }) },
      from(table) { assert.equal(table, 'payments'); const filters = []; reads.push(filters); return { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; },
        maybeSingle: async () => ({ data: payment, error: mode === 'read-error' ? {} : null }) }; } };
    const page = load('app/payment/result/page.tsx', { ...uiDependencies,
      '@/lib/supabase/server': { createClient: async () => client },
      '@/lib/payments/webinar-binding': load('lib/payments/webinar-binding.ts', { 'server-only': {}, '@/lib/deadline': load('lib/deadline.ts') }),
    });
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ status: 'success', authority, ref: '999' }) }));
    if (mode === 'owner') { assert.match(html, /پرداخت موفق بود/); assert.match(html, /201/); assert.match(html, /100 تومان/); assert.doesNotMatch(html, /999/); }
    else assert.match(html, /نتیجهٔ پرداخت هنوز مشخص نیست/);
    assert.doesNotMatch(html, /دسترسی شما.*فعال شد|لینک دعوت.*ارسال شده/);
    if (mode === 'auth-error') assert.deepEqual(reads, []);
    else assert.ok(reads[0].some(([k, v]) => k === 'user_id' && v === (mode === 'other-owner' ? ids.webinar : ids.user)));
  }
});

test('actual result page presents unknown and an explicit same-authority verification link', async () => {
  const page = load('app/payment/result/page.tsx', { ...uiDependencies,
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) },
    '@/lib/payments/webinar-binding': load('lib/payments/webinar-binding.ts', { 'server-only': {}, '@/lib/deadline': load('lib/deadline.ts') }),
  });
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
      useCallback: callback => callback,
      useState(initial) { const key = index++; if (!(key in slots)) slots[key] = initial; return [slots[key], value => { slots[key] = value; }]; },
      useEffect(effect) { effects.push(effect); },
      useRef(initial) { const key = index++; if (!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
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
