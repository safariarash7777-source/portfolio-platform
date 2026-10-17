import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = resolve(process.env.PAYMENT_TEST_SOURCE ?? '.');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = { admin: uuid(1), member: uuid(2), other: uuid(3), webinar: uuid(11), otherWebinar: uuid(12), registration: uuid(21), payment: uuid(31) };
const authority = 'A000000000000000000000000000000000001';
const paymentUrl = `https://payment.zarinpal.com/pg/StartPay/${authority}`;
const window = { access_enabled: true, access_starts_at: '2020-01-01T00:00:00.000Z', access_ends_at: '2099-01-01T00:00:00.000Z' };
const now = '2026-10-13T23:00:00.000Z';
const copied = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const verified = code => Response.json({ data: { code, ref_id: 201 }, errors: [] });
const rejected = () => Response.json({ data: [], errors: { code: -51, message: 'Payment unsuccessful', validations: [] } });

function deferred() {
  let resolvePromise;
  const promise = new Promise(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

// Production TypeScript routes and verifier execute in a VM with every I/O replaced.
// This in-memory persistence is an explicitly SYNTHETIC CONTRACT MODEL. It is not
// a PostgreSQL/RLS/trigger test and cannot prove atomicity or production migrations.
function fixture() {
  const state = { user: ids.admin, clock: Date.parse(now), webinars: new Map(), registrations: new Map(), payments: new Map(), attempts: new Map() };
  const calls = { provider: [], rpc: [], reads: [], writes: [], settlements: [], rejected: [], globalGrants: [] };
  const faults = { rpc: {}, prepared: null, context: null, receipt: null, rejectReceipt: undefined, access: null, attach: false, attachLostResponse: false, settlement: false };
  const responses = { request: [], verify: [] };
  const env = { ZARINPAL_MERCHANT_ID: 'synthetic-merchant', NEXT_PUBLIC_SITE_URL: 'https://site.example.test', NEXT_PUBLIC_BASE_URL: 'https://site.example.test' };
  let webinarSequence = 11, registrationSequence = 21, paymentSequence = 31;

  function context(registration) {
    const webinar = state.webinars.get(registration.webinar_id);
    const payment = state.payments.get(registration.payment_id);
    return {
      registration_id: registration.id, webinar_id: registration.webinar_id, user_id: registration.user_id,
      payment_id: payment?.id ?? null, amount: payment?.amount ?? state.attempts.get(registration.id)?.amount ?? webinar.price_toman,
      authority: payment?.authority ?? null, payment_status: payment?.status ?? 'pending',
      registration_payment_status: registration.payment_status, ref_id: payment?.ref_id ?? null,
      verified_at: payment?.verified_at ?? null, access_qualified: registration.access_qualified,
      access_enabled: webinar.access_enabled, access_starts_at: webinar.access_starts_at,
      access_ends_at: webinar.access_ends_at,
    };
  }

  function configuredWindow(webinar) {
    const start = Date.parse(webinar.access_starts_at), end = Date.parse(webinar.access_ends_at);
    return webinar.access_enabled === true && Number.isFinite(start) && Number.isFinite(end) &&
      start < end;
  }
  function allowedWindow(webinar) {
    return configuredWindow(webinar) && Date.parse(webinar.access_starts_at) <= state.clock &&
      state.clock < Date.parse(webinar.access_ends_at);
  }
  function requestPolicyOpen(webinar) {
    return configuredWindow(webinar) && state.clock < Date.parse(webinar.access_ends_at) &&
      webinar.registration_open === true && ['published', 'live'].includes(webinar.status);
  }
  // Synthetic representation of the stored attempt RPC result, separate from
  // registration/payment settlement. A ready attempt remains ready after payment.
  function attemptResult(registration, releaseAllowed = true) {
    const attempt = state.attempts.get(registration.id);
    const webinar = state.webinars.get(registration.webinar_id);
    assert.ok(attempt);
    return { ...context(registration), state: attempt.state, started: false,
      registration_id: registration.id, webinar_id: attempt.webinar_id, user_id: attempt.user_id,
      amount: attempt.amount, title: webinar.title, payment_id: attempt.payment_id,
      authority: attempt.authority, payment_url: releaseAllowed ? attempt.payment_url : null,
      release_allowed: releaseAllowed };
  }
  // Synthetic contract eligibility only: PostgreSQL must independently enforce
  // these bindings. Orphan/changed/unready attempts are not payment provenance.
  function boundPayment(registration) {
    if (!registration) return null;
    const webinar = state.webinars.get(registration.webinar_id);
    const payment = state.payments.get(registration.payment_id);
    const attempt = state.attempts.get(registration.id);
    if (!webinar || !payment || !attempt || attempt.state !== 'ready' ||
        attempt.registration_id !== registration.id || attempt.webinar_id !== webinar.id ||
        attempt.user_id !== registration.user_id || attempt.payment_id !== payment.id ||
        payment.user_id !== registration.user_id || attempt.authority !== payment.authority ||
        typeof payment.authority !== 'string' || !payment.authority || attempt.amount !== payment.amount ||
        payment.amount !== webinar.price_toman || !Number.isSafeInteger(payment.amount) || payment.amount <= 0 ||
        !['pending', 'paid', 'failed'].includes(payment.status) ||
        registration.payment_status !== (payment.status === 'failed' ? 'pending' : payment.status)) return null;
    if (payment.status !== 'paid' && (registration.access_qualified !== false || payment.ref_id != null || payment.verified_at != null)) return null;
    if (payment.status === 'paid' && (registration.access_qualified !== true ||
        typeof payment.ref_id !== 'string' || !/^[1-9]\d*$/.test(payment.ref_id) ||
        !Number.isSafeInteger(Number(payment.ref_id)) || !Number.isFinite(Date.parse(payment.verified_at)))) return null;
    return { webinar, payment, attempt };
  }
  class SyntheticDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.clock])); }
    static now() { return state.clock; }
  }

  async function rpc(actor, service, name, args) {
    calls.rpc.push({ actor, service, name, args: copied(args) });
    if (faults.rpc[name]) return { data: null, error: { message: 'synthetic RPC unavailable' } };
    const sessionOnly = ['register_for_webinar', 'prepare_webinar_payment', 'webinar_access', 'list_public_webinars'];
    const serviceOnly = ['attach_webinar_payment', 'mark_webinar_payment_unknown', 'read_webinar_payment_context', 'settle_webinar_payment', 'reject_webinar_payment'];
    if (sessionOnly.includes(name)) assert.equal(service, false, `${name} must use the member session`);
    if (serviceOnly.includes(name)) assert.equal(service, true, `${name} must use the server service client`);
    const registrationId = args.p_registration_id;
    const registration = state.registrations.get(registrationId);
    if (name === 'register_for_webinar') {
      const webinar = state.webinars.get(args.p_webinar_id);
      if (!actor || !webinar?.registration_open || !configuredWindow(webinar)) return { data: null, error: { message: 'registration closed or policy incomplete' } };
      const existing = [...state.registrations.values()].find(r => r.user_id === actor && r.webinar_id === webinar.id);
      if (webinar.price_toman > 0 && webinar.max_capacity != null) return { data: null, error: { message: 'paid capacity reservation policy unselected' } };
      const counted = [...state.registrations.values()].filter(r => r.webinar_id === webinar.id && ['paid', 'free'].includes(r.payment_status)).length;
      if (!existing && webinar.max_capacity != null && counted >= webinar.max_capacity) return { data: null, error: { message: 'capacity full' } };
      const reg = existing ?? { id: uuid(registrationSequence++), user_id: actor, webinar_id: webinar.id,
        payment_status: webinar.price_toman === 0 ? 'free' : 'pending', payment_id: null,
        access_qualified: webinar.price_toman === 0 };
      state.registrations.set(reg.id, reg);
      return { data: { registration_id: reg.id, webinar_id: webinar.id, payment_status: reg.payment_status,
        needs_payment: reg.payment_status === 'pending', already_registered: !!existing }, error: null };
    }
    if (name === 'prepare_webinar_payment') {
      if (faults.prepared) return { data: copied(faults.prepared), error: null };
      const webinar = registration && state.webinars.get(registration.webinar_id);
      if (!registration || registration.user_id !== actor || !requestPolicyOpen(webinar ?? {}) || webinar.price_toman <= 0 ||
          webinar.max_capacity != null || registration.payment_status !== 'pending' || registration.access_qualified) {
        return { data: null, error: { message: 'registration unavailable' } };
      }
      const prior = state.attempts.get(registration.id);
      if (prior && (prior.user_id !== actor || prior.webinar_id !== webinar.id || prior.amount !== webinar.price_toman ||
          prior.payment_id !== registration.payment_id)) return { data: null, error: { message: 'attempt binding mismatch' } };
      if (prior?.state === 'ready' && (!boundPayment(registration) || state.payments.get(prior.payment_id)?.status !== 'pending')) {
        return { data: null, error: { message: 'ready payment ledger is not pending and bound' } };
      }
      if (!prior) state.attempts.set(registration.id, { registration_id: registration.id, webinar_id: webinar.id,
        user_id: actor, amount: webinar.price_toman, state: 'requesting', payment_id: null, authority: null, payment_url: null });
      return { data: { ...attemptResult(registration), started: !prior }, error: null };
    }
    if (name === 'attach_webinar_payment') {
      if (faults.attach) return { data: null, error: { message: 'synthetic attach error' } };
      const attempt = registration && state.attempts.get(registration.id);
      assert.ok(attempt && ['requesting', 'unknown', 'ready'].includes(attempt.state));
      assert.equal(args.p_amount, attempt.amount);
      if (attempt.state !== 'ready') {
        const payment = { id: uuid(paymentSequence++), user_id: registration.user_id, amount: args.p_amount,
          authority: args.p_authority, status: 'pending', ref_id: null, verified_at: null };
        state.payments.set(payment.id, payment); registration.payment_id = payment.id;
        Object.assign(attempt, { state: 'ready', payment_id: payment.id, authority: args.p_authority, payment_url: args.p_payment_url });
      }
      if (faults.attachLostResponse) return { data: null, error: { message: 'synthetic HTTP observer lost response AFTER committed attachment' } };
      return { data: attemptResult(registration, requestPolicyOpen(state.webinars.get(registration.webinar_id))), error: null };
    }
    if (name === 'mark_webinar_payment_unknown') {
      const attempt = registration && state.attempts.get(registration.id);
      if (attempt?.state === 'requesting') attempt.state = 'unknown';
      return { data: registration && attempt ? attemptResult(registration) : null, error: null };
    }
    if (name === 'read_webinar_payment_context') {
      if (faults.context) return { data: copied(faults.context), error: null };
      if (!boundPayment(registration)) return { data: null, error: null };
      const data = context(registration);
      if (args.p_authority && data.authority !== args.p_authority) return { data: null, error: null };
      return { data, error: null };
    }
    if (name === 'settle_webinar_payment') {
      assert.ok(registration);
      assert.equal(state.attempts.get(registration.id)?.state, 'ready');
      const payment = state.payments.get(registration.payment_id);
      assert.equal(args.p_payment_id, payment.id); assert.equal(args.p_amount, payment.amount);
      assert.equal(args.p_authority, payment.authority);
      if (faults.settlement) return { data: null, error: { message: 'synthetic transaction rollback' } };
      if (faults.receipt) return { data: copied(faults.receipt), error: null };
      if (payment.status === 'pending') {
        payment.status = 'paid'; payment.ref_id = args.p_ref_id; payment.verified_at = now;
        registration.payment_status = 'paid'; registration.access_qualified = true;
        calls.settlements.push(payment.id);
      }
      return { data: { ...context(registration), settled: true }, error: null };
    }
    if (name === 'reject_webinar_payment') {
      assert.ok(registration);
      const payment = state.payments.get(registration.payment_id);
      assert.equal(args.p_payment_id, payment.id); assert.equal(args.p_amount, payment.amount);
      assert.equal(args.p_authority, payment.authority);
      if (faults.rejectReceipt !== undefined) return { data: copied(faults.rejectReceipt), error: null };
      payment.status = 'failed'; registration.payment_status = 'pending';
      calls.rejected.push(payment.id);
      return { data: { ...context(registration), rejected: true, settled: false }, error: null };
    }
    if (name === 'webinar_access') {
      if (faults.access) return { data: copied(faults.access), error: null };
      const webinar = state.webinars.get(args.p_webinar_id);
      const reg = [...state.registrations.values()].find(r => r.webinar_id === args.p_webinar_id && r.user_id === actor);
      const payment = reg && state.payments.get(reg.payment_id);
      const free = !!reg && webinar?.price_toman === 0 && reg.payment_status === 'free';
      const paid = !!reg && !!boundPayment(reg) && payment?.status === 'paid' && payment.user_id === actor;
      const allowed = !!reg?.access_qualified && ['published', 'live', 'ended'].includes(webinar?.status) &&
        allowedWindow(webinar ?? {}) && (free || paid);
      return { data: { allowed, reason: allowed ? 'qualified' : 'not_qualified', webinar_id: args.p_webinar_id,
        user_id: actor, registration_id: reg?.id ?? null, price_toman: webinar?.price_toman ?? null,
        payment_status: reg?.payment_status ?? null, platform: webinar?.platform ?? null,
        platform_url: allowed ? webinar.platform_url : null,
        ...(reg ? context(reg) : {}) }, error: null };
    }
    if (name === 'list_public_webinars') {
      return { data: [...state.webinars.values()].filter(w => ['published', 'live', 'ended'].includes(w.status)).map(w => {
        const { platform_url: hidden, ...metadata } = w;
        assert.ok(hidden);
        return { ...metadata, registered_count: [...state.registrations.values()].filter(r => r.webinar_id === w.id && ['paid', 'free'].includes(r.payment_status)).length };
      }), error: null };
    }
    if (['grant_entitlement', 'verify_payment', 'create_payment', 'fail_payment'].includes(name)) {
      calls.globalGrants.push(name); assert.fail(`Webinar routes must not invoke global ${name}`);
    }
    assert.fail(`Unexpected RPC ${name}`);
  }

  function client(actor, service = false) {
    return {
      auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null }, error: null }) },
      rpc: (name, args = {}) => rpc(actor, service, name, args),
      from(table) {
        const filters = [];
        let operation = 'select', values;
        const query = {
          select() { return this; }, order() { return this; },
          eq(key, value) { filters.push(row => row[key] === value); return this; },
          in(key, values) { filters.push(row => values.includes(row[key])); return this; },
          insert(value) { operation = 'insert'; values = value; return this; },
          update(value) { operation = 'update'; values = value; return this; },
          delete() { operation = 'delete'; return this; },
          async execute(single) {
            if (operation === 'select') calls.reads.push({ table, actor, service });
            if (table === 'profiles') return { data: actor ? { id: actor, role: actor === ids.admin ? 'admin' : 'member' } : null, error: null };
            const map = table === 'webinars' ? state.webinars : table === 'webinar_registrations' ? state.registrations : table === 'payments' ? state.payments : null;
            if (!map) assert.fail(`Unexpected table ${table}; no global entitlement writes permitted`);
            let rows = [...map.values()].filter(row => filters.every(filter => filter(row)));
            if (operation !== 'select') {
              assert.equal(table, 'webinars', 'Financial and registration writes must use the qualified RPC contract');
              calls.writes.push({ table, operation, values: copied(values), actor, service });
              if (operation === 'insert') {
                const id = table === 'webinars' ? uuid(webinarSequence++) : table === 'payments' ? uuid(paymentSequence++) : uuid(registrationSequence++);
                const row = { id, ...copied(values), created_at: now };
                map.set(id, row); rows = [row];
              } else if (operation === 'update') rows.forEach(row => Object.assign(row, copied(values)));
              else rows.forEach(row => map.delete(row.id));
            }
            const data = rows.map(row => table === 'webinar_registrations' ? { ...row, webinars: copied(state.webinars.get(row.webinar_id)) } : copied(row));
            return { data: single ? data[0] ?? null : data, count: rows.length, error: null };
          },
          maybeSingle() { return this.execute(true); }, single() { return this.execute(true); },
          then(done, reject) { return this.execute(false).then(done, reject); },
        };
        return query;
      },
    };
  }

  const dependencies = {
    'next/server': { NextResponse: {
      json: (body, options) => Response.json(body, options),
      redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }),
    } },
    '@/lib/supabase/server': { createClient: async () => client(state.user) },
    '@/lib/supabase/admin': { createAdminClient: () => client(null, true), tryCreateAdminClient: () => client(null, true) },
    '@/lib/supabase/service-role': { SERVICE_ROLE_GAP_STATUS: 503, serviceRoleGap: () => ({ error: 'synthetic service missing' }) },
    '@/lib/telegram': { createSingleUseInvite: async () => assert.fail('No Telegram invite permitted'), sendMessage: async () => assert.fail('No Telegram message permitted') },
    '@/lib/resend': { sendAnnouncementEmail: async () => assert.fail('No email permitted') },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const path = resolve(source, file);
    if (!existsSync(path)) throw new Error(`Production source missing: ${file}`);
    const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    }, fileName: file }).outputText;
    runInNewContext(output, {
      exports, URL, URLSearchParams, Response, Request, Date: SyntheticDate, Number, setTimeout, clearTimeout,
      console: { error() {}, warn() {} },
      process: { env },
      fetch: async (url, options) => {
        const body = JSON.parse(options.body); calls.provider.push({ url, body });
        assert.equal(new URL(url).origin, 'https://payment.zarinpal.com');
        assert.equal(body.merchant_id, 'synthetic-merchant');
        if (url.endsWith('/payment/request.json')) {
          const next = responses.request.shift();
          return next ? await next() : Response.json({ data: { code: 100, authority }, errors: [] });
        }
        assert.match(url, /\/payment\/verify\.json$/);
        const next = responses.verify.shift(); return next ? await next() : verified(100);
      },
      require(name) {
        if (name in dependencies) return dependencies[name];
        if (name === '@/lib/zarinpal') return load('lib/zarinpal.ts');
        if (name === '@/lib/webinars/contracts') return load('lib/webinars/contracts.ts');
        throw new Error(`Unexpected production dependency ${name}`);
      },
    });
    return exports;
  }
  function request(body) {
    return { url: 'https://site.example.test/api/synthetic', nextUrl: new URL('https://site.example.test/api/synthetic'), json: async () => copied(body) };
  }
  async function call(file, method, body) {
    const response = await load(file)[method](request(body));
    return { status: response.status, body: await response.json() };
  }
  return {
    state, calls, faults, responses, context, client, env,
    async create(overrides = {}) {
      state.user = ids.admin;
      return call('app/api/admin/webinars/route.ts', 'POST', { title: 'Synthetic exact-webinar access', starts_at: '2026-10-13T22:00:00.000Z', ends_at: '2026-10-14T00:00:00.000Z', registration_open: true, price_toman: 1739,
        platform: 'link', platform_url: 'https://class.example.test/exact-webinar', status: 'published', ...window, ...overrides });
    },
    post: (file, body) => call(file, 'POST', body),
    patch: body => call('app/api/admin/webinars/route.ts', 'PATCH', body),
    register: webinarId => call('app/api/webinars/register/route.ts', 'POST', { webinar_id: webinarId }),
    pay: registrationId => call('app/api/webinars/payment/route.ts', 'POST', { registration_id: registrationId }),
    async callback(registrationId, parameters = {}) {
      const url = new URL('https://site.example.test/api/webinars/payment/callback');
      Object.entries({ Authority: authority, Status: 'OK', registration_id: registrationId, ...parameters }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      const response = await load('app/api/webinars/payment/callback/route.ts').GET({ url: url.href, nextUrl: url });
      return new URL(response.headers.get('location'));
    },
    async genericCallback(parameters = {}) {
      const url = new URL('https://site.example.test/api/payment/callback');
      Object.entries({ Authority: authority, Status: 'OK', ...parameters }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      const response = await load('app/api/payment/callback/route.ts').GET({ url: url.href, nextUrl: url });
      return new URL(response.headers.get('location'));
    },
    async access(webinarId) {
      const url = new URL('https://site.example.test/api/webinars/access'); url.searchParams.set('webinar_id', webinarId);
      const response = await load('app/api/webinars/access/route.ts').GET({ url: url.href, nextUrl: url });
      return { status: response.status, body: await response.json() };
    },
    async list() {
      const response = await load('app/api/webinars/list/route.ts').GET();
      return { status: response.status, body: await response.json() };
    },
    newSession(user) { state.user = user; },
  };
}

async function pendingFixture() {
  const f = fixture();
  const created = await f.create(); assert.equal(created.status, 201);
  f.newSession(ids.member);
  const registered = await f.register(created.body.webinar.id); assert.equal(registered.status, 200);
  const registrationId = registered.body.registration.registration_id;
  assert.ok(registrationId);
  const requested = await f.pay(registrationId); assert.equal(requested.status, 200);
  assert.equal(requested.body.payment_url, paymentUrl);
  return { f, webinarId: created.body.webinar.id, registrationId };
}

test('actual admin create → register → request → real verifier → exact webinar access survives relogin', async () => {
  const { f, webinarId, registrationId } = await pendingFixture();
  assert.equal((await f.access(webinarId)).body.access.allowed, false);
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
  assert.deepEqual(f.calls.settlements, [ids.payment]);
  const access = await f.access(webinarId);
  assert.equal(access.status, 200); assert.equal(access.body.access.allowed, true);
  assert.equal(access.body.access.platform_url, 'https://class.example.test/exact-webinar');
  const callbackUrl = new URL(f.calls.provider.find(call => call.url.endsWith('/request.json')).body.callback_url);
  assert.equal(callbackUrl.pathname, '/api/webinars/payment/callback');
  assert.equal(callbackUrl.searchParams.get('registration_id'), registrationId);
  assert.equal(callbackUrl.searchParams.has('payment_id'), false);
  assert.equal(f.calls.provider.find(call => call.url.endsWith('/verify.json')).body.amount, 17390);
  f.newSession(null); assert.equal((await f.access(webinarId)).status, 401);
  f.newSession(ids.member); assert.equal((await f.access(webinarId)).body.access.allowed, true);
  f.newSession(ids.other); const denied = await f.access(webinarId);
  assert.equal(denied.body.access.allowed, false); assert.equal(Object.hasOwn(denied.body.access, 'platform_url'), false);
  f.newSession(ids.member); const different = await f.access(ids.otherWebinar);
  assert.equal(different.body.access.allowed, false); assert.equal(Object.hasOwn(different.body.access, 'platform_url'), false);
  assert.deepEqual(f.calls.globalGrants, []);
  assert.equal(f.calls.writes.filter(call => call.table !== 'webinars').length, 0);
});

test('free price exactly zero qualifies only the configured webinar without gateway or full entitlement', async () => {
  const f = fixture(); const created = await f.create({ price_toman: 0 });
  f.newSession(ids.member); const result = await f.register(created.body.webinar.id);
  assert.equal(result.status, 200); assert.equal(result.body.registration.payment_status, 'free');
  assert.equal(result.body.registration.needs_payment, false);
  assert.equal((await f.access(created.body.webinar.id)).body.access.allowed, true);
  assert.equal((await f.access(ids.otherWebinar)).body.access.allowed, false);
  assert.deepEqual(f.calls.provider, []); assert.deepEqual(f.calls.globalGrants, []);
});

test('omitted access policy stays disabled until an explicit valid admin selection', async () => {
  const f = fixture(); const created = await f.create({ registration_open: false, access_enabled: undefined, access_starts_at: undefined, access_ends_at: undefined });
  assert.equal(created.status, 201); assert.equal(created.body.webinar.access_enabled, false);
  assert.equal(created.body.webinar.access_starts_at, null); assert.equal(created.body.webinar.access_ends_at, null);
  f.newSession(ids.member); assert.equal((await f.access(created.body.webinar.id)).body.access.allowed, false);
  f.newSession(ids.admin);
  const selected = await f.patch({ id: created.body.webinar.id, registration_open: true, ...window }); assert.equal(selected.status, 200);
  f.newSession(ids.member); assert.equal((await f.register(created.body.webinar.id)).status, 200);
});

for (const invalid of [
  { access_enabled: true, access_ends_at: null },
  { access_enabled: true, access_starts_at: '2026-02-30T00:00:00.000Z' },
  { access_enabled: true, access_starts_at: '2099-01-01T00:00:00.000Z', access_ends_at: '2020-01-01T00:00:00.000Z' },
  { price_toman: -1 }, { price_toman: 1.5 },
  { price_toman: undefined },
]) {
  test(`admin cannot enable an invalid policy/price ${JSON.stringify(invalid)}`, async () => {
    const f = fixture(); const result = await f.create(invalid);
    assert.equal(result.status, 400); assert.equal(f.state.webinars.size, 0);
    assert.deepEqual(f.calls.provider, []);
  });
}

test('unregistered members cannot receive platform URLs from public list or exact access', async () => {
  const f = fixture(); const created = await f.create(); f.newSession(ids.other);
  const list = await f.list(); assert.equal(list.status, 200);
  assert.equal(list.body.webinars.length, 1);
  assert.equal(JSON.stringify(list.body).includes('class.example.test'), false);
  assert.equal(Object.hasOwn((await f.access(created.body.webinar.id)).body.access, 'platform_url'), false);
});

test('only admin can create or change webinar policy', async () => {
  const f = fixture(); const created = await f.create(); const before = copied(created.body.webinar);
  f.newSession(ids.member); const result = await f.patch({ id: created.body.webinar.id, access_enabled: false });
  assert.equal(result.status, 403); assert.deepEqual(f.state.webinars.get(created.body.webinar.id), before);
  const deniedCreate = await f.post('app/api/admin/webinars/route.ts', { title: 'forbidden creation', ...window });
  assert.equal(deniedCreate.status, 403); assert.equal(f.state.webinars.size, 1);
});

for (const policy of [
  { access_starts_at: '2090-01-01T00:00:00.000Z', access_ends_at: '2099-01-01T00:00:00.000Z' },
  { access_starts_at: '2000-01-01T00:00:00.000Z', access_ends_at: '2001-01-01T00:00:00.000Z' },
]) {
  test(`registration does not bypass the chosen access window ${policy.access_starts_at}`, async () => {
    const f = fixture(); const created = await f.create({ price_toman: 0, ...policy });
    assert.equal(created.status, 201); f.newSession(ids.member);
    assert.equal((await f.register(created.body.webinar.id)).status, 200);
    const access = await f.access(created.body.webinar.id);
    assert.equal(access.body.access.allowed, false); assert.equal(Object.hasOwn(access.body.access, 'platform_url'), false);
    assert.deepEqual(f.calls.provider, []);
  });
}

test('registration replay returns the same canonical registration without a new charge', async () => {
  const { f, webinarId, registrationId } = await pendingFixture();
  const repeated = await f.register(webinarId);
  assert.equal(repeated.status, 200); assert.equal(repeated.body.registration.registration_id, registrationId);
  assert.equal(repeated.body.registration.already_registered, true); assert.equal(f.state.registrations.size, 1);
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
});

test('another member cannot prepare a payment for the original registration', async () => {
  const { f, registrationId } = await pendingFixture(); f.newSession(ids.other);
  const before = f.calls.provider.length; const result = await f.pay(registrationId);
  assert.equal(result.status, 503); assert.equal(result.body.payment_url, undefined);
  assert.equal(f.calls.provider.length, before);
});

test('unauthenticated registration/payment and malformed UUID inputs do not call RPC or gateway', async () => {
  const f = fixture(); f.newSession(null);
  assert.equal((await f.register(ids.webinar)).status, 401); assert.equal((await f.pay(ids.registration)).status, 401);
  f.newSession(ids.member);
  assert.equal((await f.register('not-a-uuid')).status, 400); assert.equal((await f.pay('not-a-uuid')).status, 400);
  assert.deepEqual(f.calls.rpc, []); assert.deepEqual(f.calls.provider, []);
});

test('admin can configure paid capacity under the selected v1 reservation policy; closed drafts remain closed', async () => {
  const f = fixture();
  assert.equal((await f.create({ max_capacity: 1 })).status, 201);
  assert.equal(f.state.webinars.size, 1);
  const draft = await f.create({ max_capacity: 1, registration_open: false, access_enabled: false,
    access_starts_at: null, access_ends_at: null, status: 'draft' });
  assert.equal(draft.status, 201); assert.equal(draft.body.webinar.max_capacity, 1);
  f.newSession(ids.member); assert.equal((await f.register(draft.body.webinar.id)).status, 400);
  assert.deepEqual(f.calls.provider, []);
});

test('synthetic free capacity serialization admits one concurrent member and never reserves invented expiry', async () => {
  const f = fixture(); const created = await f.create({ price_toman: 0, max_capacity: 1 });
  assert.equal(created.status, 201);
  f.newSession(ids.member); const first = f.register(created.body.webinar.id);
  f.newSession(ids.other); const second = f.register(created.body.webinar.id);
  const outcomes = await Promise.all([first, second]);
  assert.deepEqual(outcomes.map(result => result.status), [200, 400]);
  assert.equal(f.state.registrations.size, 1);
  f.newSession(ids.member); assert.equal((await f.access(created.body.webinar.id)).body.access.allowed, true);
  f.newSession(ids.other); assert.equal((await f.access(created.body.webinar.id)).body.access.allowed, false);
  assert.deepEqual(f.calls.provider, []);
  assert.ok([...f.state.registrations.values()].every(reg => !Object.hasOwn(reg, 'reservation_expires_at')));
});

const unknownResponses = [
  ['network', async () => { throw new Error('synthetic network error'); }],
  ['body', async () => ({ ok: true, json: async () => { throw new Error('synthetic body error'); } })],
  ['HTTP', async () => Response.json({ data: { code: 100, ref_id: 201 }, errors: [] }, { status: 503 })],
  ['JSON', async () => new Response('{invalid')],
  ['null JSON', async () => Response.json(null)],
  ['missing ref100', async () => Response.json({ data: { code: 100 }, errors: [] })],
  ['missing ref101', async () => Response.json({ data: { code: 101 }, errors: [] })],
  ['string ref', async () => Response.json({ data: { code: 100, ref_id: '201' }, errors: [] })],
  ['undocumented negative', async () => Response.json({ data: [], errors: { code: -999, message: 'unknown' } })],
];
for (const [label, response] of unknownResponses) {
  test(`actual callback ${label} remains unknown without payment/registration mutation`, async () => {
    const { f, webinarId, registrationId } = await pendingFixture();
    const before = copied(f.context(f.state.registrations.get(registrationId)));
    f.responses.verify.push(response);
    const result = await f.callback(registrationId);
    assert.equal(result.searchParams.get('status'), 'unknown');
    assert.equal(result.searchParams.get('authority'), authority);
    assert.equal(result.searchParams.get('registration_id'), registrationId);
    assert.deepEqual(f.context(f.state.registrations.get(registrationId)), before);
    assert.deepEqual(f.calls.settlements, []); assert.deepEqual(f.calls.rejected, []);
    assert.equal(f.calls.rpc.some(call => ['settle_webinar_payment', 'reject_webinar_payment', 'fail_payment'].includes(call.name)), false);
    assert.equal((await f.access(webinarId)).body.access.allowed, false);
    assert.equal((await f.pay(registrationId)).body.payment_url, paymentUrl);
    assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
  });
}

test('missing merchant configuration in the actual verifier is unknown before any verification call', async () => {
  const { f, webinarId, registrationId } = await pendingFixture();
  delete f.env.ZARINPAL_MERCHANT_ID;
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/verify.json')).length, 0);
  assert.deepEqual(f.calls.settlements, []); assert.deepEqual(f.calls.rejected, []);
  assert.equal((await f.access(webinarId)).body.access.allowed, false);
});

test('query NOK never establishes rejection or grants access', async () => {
  const { f, webinarId, registrationId } = await pendingFixture();
  const result = await f.callback(registrationId, { Status: 'NOK' });
  assert.equal(result.searchParams.get('status'), 'unknown');
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/verify.json')).length, 0);
  assert.deepEqual(f.calls.rejected, []); assert.equal((await f.access(webinarId)).body.access.allowed, false);
});

test('documented verified rejection alone calls webinar rejection without access', async () => {
  const { f, webinarId, registrationId } = await pendingFixture(); f.responses.verify.push(rejected);
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'failed');
  assert.deepEqual(f.calls.rejected, [ids.payment]); assert.deepEqual(f.calls.settlements, []);
  assert.equal((await f.access(webinarId)).body.access.allowed, false);
  assert.deepEqual(f.calls.globalGrants, []);
});

test('synthetic recorded rejection replay stays failed without another provider call or financial write', async () => {
  const { f, registrationId } = await pendingFixture(); f.responses.verify.push(rejected);
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'failed');
  const before = copied(f.calls);
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'failed');
  assert.deepEqual(f.calls.provider, before.provider); assert.deepEqual(f.calls.writes, before.writes);
  assert.deepEqual(f.calls.rejected, before.rejected); assert.deepEqual(f.calls.settlements, []);
  assert.equal(f.calls.rpc.filter(call => call.name === 'reject_webinar_payment').length, 1);
  assert.deepEqual(f.calls.rpc.slice(before.rpc.length).map(call => call.name), ['read_webinar_payment_context']);
});

test('synthetic rejection RPC error remains unknown rather than advertising a recorded failure', async () => {
  const { f, webinarId, registrationId } = await pendingFixture();
  f.responses.verify.push(rejected); f.faults.rpc.reject_webinar_payment = true;
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
  assert.equal(f.state.payments.get(ids.payment).status, 'pending');
  assert.deepEqual(f.calls.rejected, []); assert.deepEqual(f.calls.settlements, []);
  assert.equal((await f.access(webinarId)).body.access.allowed, false);
});

for (const change of [
  { registration_id: ids.otherWebinar }, { webinar_id: ids.otherWebinar }, { user_id: ids.other },
  { payment_id: ids.otherWebinar }, { authority: 'different' }, { amount: 1740 }, { amount: 0 },
  { ref_id: '201' }, { verified_at: now }, { payment_status: 'pending' }, { payment_status: 'paid' },
  { registration_payment_status: 'paid' }, { access_qualified: true }, { access_qualified: undefined },
  { rejected: false }, { rejected: undefined }, { settled: true }, { settled: undefined },
  { access_starts_at: '2021-01-01T00:00:00.000Z' }, { access_ends_at: '2098-01-01T00:00:00.000Z' },
]) {
  test(`synthetic inconsistent rejection receipt ${JSON.stringify(change)} never advertises failed or successful settlement`, async () => {
    const { f, registrationId } = await pendingFixture(); f.responses.verify.push(rejected);
    f.faults.rejectReceipt = { ...f.context(f.state.registrations.get(registrationId)), rejected: true, settled: false,
      payment_status: 'failed', registration_payment_status: 'pending', access_qualified: false,
      ref_id: null, verified_at: null, ...change };
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.settlements, []);
    assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
    assert.equal(f.calls.rpc.filter(call => call.name === 'reject_webinar_payment').length, 1);
  });
}

for (const payload of [null, [], {}]) {
  test(`synthetic malformed rejection receipt ${JSON.stringify(payload)} stays unknown`, async () => {
    const { f, registrationId } = await pendingFixture(); f.responses.verify.push(rejected);
    f.faults.rejectReceipt = payload;
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.settlements, []); assert.deepEqual(f.calls.globalGrants, []);
  });
}

test('synthetic valid rejection cannot release a failed ledger URL or request a fresh authority', async () => {
  const { f, registrationId } = await pendingFixture(); f.responses.verify.push(rejected);
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'failed');
  assert.equal(f.state.attempts.get(registrationId).state, 'ready');
  assert.equal(f.state.payments.get(ids.payment).status, 'failed');
  assert.equal(f.state.registrations.get(registrationId).payment_status, 'pending');
  const before = copied(f.calls.provider); const replay = await f.pay(registrationId);
  assert.equal(replay.status, 503); assert.equal(replay.body.paymentOutcome, 'unknown');
  assert.equal(Object.hasOwn(replay.body, 'payment_url'), false);
  assert.deepEqual(f.calls.provider, before); assert.equal(f.state.payments.size, 1);
});

for (const code of [100, 101]) {
  test(`real verifier code ${code} settles exact amount once and paid callback replay has no effects`, async () => {
    const { f, webinarId, registrationId } = await pendingFixture(); f.responses.verify.push(() => verified(code));
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
    const before = copied(f.calls);
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
    assert.deepEqual(f.calls.provider, before.provider); assert.deepEqual(f.calls.settlements, before.settlements);
    assert.equal(f.calls.rpc.filter(call => call.name === 'settle_webinar_payment').length, 1);
    assert.equal((await f.access(webinarId)).body.access.allowed, true);
  });
}

for (const qualification of [false, undefined]) {
  test(`paid replay without qualified provenance ${qualification} cannot use the success shortcut`, async () => {
    const { f, webinarId, registrationId } = await pendingFixture();
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
    f.state.registrations.get(registrationId).access_qualified = qualification;
    const before = copied(f.calls);
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, before.provider);
    assert.equal(f.calls.rpc.filter(call => call.name === 'settle_webinar_payment').length, 1);
    assert.deepEqual(f.calls.rejected, []);
    assert.equal((await f.access(webinarId)).body.access.allowed, false);
  });
}

for (const paid of [false, true]) {
  for (const status of ['OK', 'NOK']) {
    test(`generic callback dispatches webinar-bound ${paid ? 'paid' : 'pending'} ${status} before provider or global effects`, async () => {
      const { f, registrationId } = await pendingFixture();
      if (paid) assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
      const before = copied(f.calls);
      const redirect = await f.genericCallback({ Status: status, registration_id: ids.otherWebinar, amount: 1 });
      assert.equal(redirect.origin, 'https://site.example.test');
      assert.equal(redirect.pathname, '/api/webinars/payment/callback');
      assert.equal(redirect.searchParams.get('registration_id'), registrationId);
      assert.equal(redirect.searchParams.get('Authority'), authority);
      assert.equal(redirect.searchParams.get('Status'), status);
      assert.equal(redirect.searchParams.has('payment_id'), false);
      assert.equal(redirect.searchParams.has('amount'), false);
      assert.deepEqual(f.calls.provider, before.provider);
      assert.deepEqual(f.calls.rpc, before.rpc); assert.deepEqual(f.calls.writes, before.writes);
      assert.deepEqual(f.calls.reads.slice(before.reads.length).map(read => read.table), ['payments', 'webinar_registrations']);
      assert.deepEqual(f.calls.globalGrants, []);
    });
  }
}

test('unknown then explicit callback replay uses SAME authority and never creates a second charge', async () => {
  const { f, registrationId } = await pendingFixture(); f.responses.verify.push(async () => new Response('{invalid'), () => verified(101));
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/verify.json')).length, 2);
  assert.ok(f.calls.provider.filter(call => call.url.endsWith('/verify.json')).every(call => call.body.authority === authority && call.body.amount === 17390));
});

for (const parameters of [{ Authority: 'A000000000000000000000000000000000002' }, { registration_id: ids.otherWebinar }]) {
  test(`tampered callback binding ${JSON.stringify(parameters)} cannot verify or settle`, async () => {
    const { f, registrationId } = await pendingFixture();
    assert.equal((await f.callback(registrationId, parameters)).searchParams.get('status'), 'unknown');
    assert.equal(f.calls.provider.filter(call => call.url.endsWith('/verify.json')).length, 0);
    assert.deepEqual(f.calls.settlements, []);
  });
}

test('callback ignores query payment_id and amount and uses bound server payment', async () => {
  const { f, registrationId } = await pendingFixture();
  assert.equal((await f.callback(registrationId, { amount: 1, payment_id: ids.otherWebinar })).searchParams.get('status'), 'success');
  const settlement = f.calls.rpc.find(call => call.name === 'settle_webinar_payment');
  assert.equal(settlement.args.p_payment_id, ids.payment); assert.equal(settlement.args.p_amount, 1739);
});

for (const change of [{ registration_id: ids.otherWebinar }, { authority: 'different' }, { amount: 0 }, { user_id: '' }, { payment_id: '' },
  { access_qualified: true }, { access_qualified: undefined }, { ref_id: '201' }, { verified_at: now }]) {
  test(`forged context ${JSON.stringify(change)} cannot trigger verifier or settlement`, async () => {
    const { f, registrationId } = await pendingFixture();
    f.faults.context = { ...f.context(f.state.registrations.get(registrationId)), ...change };
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
    assert.equal(f.calls.provider.filter(call => call.url.endsWith('/verify.json')).length, 0);
    assert.deepEqual(f.calls.settlements, []);
  });
}

for (const change of [{ registration_id: ids.otherWebinar }, { webinar_id: ids.otherWebinar }, { user_id: ids.other }, { payment_id: ids.otherWebinar }, { authority: 'different' }, { amount: 1740 }, { ref_id: '202' }, { verified_at: null }, { payment_status: 'pending' }, { registration_payment_status: 'pending' }, { access_qualified: false }, { access_qualified: undefined }, { settled: false }]) {
  test(`inconsistent settlement receipt ${JSON.stringify(change)} is never advertised as success`, async () => {
    const { f, registrationId } = await pendingFixture();
    f.faults.receipt = { ...f.context(f.state.registrations.get(registrationId)), settled: true,
      payment_status: 'paid', registration_payment_status: 'paid', ref_id: '201', verified_at: now,
      access_qualified: true, ...change };
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.settlements, []);
  });
}

test('synthetic settlement rollback leaves payment pending and exact access denied', async () => {
  const { f, webinarId, registrationId } = await pendingFixture(); f.faults.settlement = true;
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
  assert.equal(f.state.payments.get(ids.payment).status, 'pending');
  assert.equal((await f.access(webinarId)).body.access.allowed, false);
  assert.deepEqual(f.calls.settlements, []); assert.deepEqual(f.calls.rejected, []);
});

test('request reservation blocks concurrent submission until attachment then reuses one payment URL', async () => {
  const f = fixture(); const created = await f.create(); f.newSession(ids.member);
  const registered = await f.register(created.body.webinar.id); const registrationId = registered.body.registration.registration_id;
  const gate = deferred(), started = deferred();
  f.responses.request.push(async () => { started.resolve(); return gate.promise; });
  const first = f.pay(registrationId); await started.promise;
  const concurrent = await f.pay(registrationId);
  assert.equal(concurrent.status, 409); assert.equal(concurrent.body.paymentOutcome, 'unknown');
  assert.equal(concurrent.body.recovery, 'reconcile_same_registration');
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
  gate.resolve(Response.json({ data: { code: 100, authority }, errors: [] }));
  assert.equal((await first).body.payment_url, paymentUrl);
  assert.equal((await f.pay(registrationId)).body.payment_url, paymentUrl);
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
});

const closures = [
  ['disabled', async (f, webinarId) => f.patch({ id: webinarId, access_enabled: false, registration_open: false })],
  ['cancelled', async (f, webinarId) => f.patch({ id: webinarId, status: 'cancelled' })],
  ['registration closed', async (f, webinarId) => f.patch({ id: webinarId, registration_open: false })],
  ['expired', async f => { f.state.clock = Date.parse('2100-01-01T00:00:00.000Z'); return { status: 200 }; }],
];
for (const [label, close] of closures) {
  test(`synthetic ready attempt after ${label} withholds its existing URL and makes no new request`, async () => {
    const { f, webinarId, registrationId } = await pendingFixture();
    f.newSession(ids.admin); assert.equal((await close(f, webinarId)).status, 200); f.newSession(ids.member);
    const before = copied(f.calls.provider); const result = await f.pay(registrationId);
    assert.equal(result.status, 503); assert.equal(result.body.paymentOutcome, 'unknown');
    assert.equal(Object.hasOwn(result.body, 'payment_url'), false);
    assert.deepEqual(f.calls.provider, before);
    assert.equal(f.state.attempts.get(registrationId).state, 'ready');
    assert.equal(f.state.attempts.get(registrationId).authority, authority);
    assert.equal(f.state.payments.get(ids.payment).status, 'pending');
  });

  test(`synthetic ${label} during provider request retains known pending authority but withholds attach URL`, async () => {
    const f = fixture(); const created = await f.create(); const webinarId = created.body.webinar.id;
    f.newSession(ids.member); const registered = await f.register(webinarId);
    const registrationId = registered.body.registration.registration_id;
    const gate = deferred(), started = deferred();
    f.responses.request.push(async () => { started.resolve(); return gate.promise; });
    const pending = f.pay(registrationId); await started.promise;
    f.newSession(ids.admin); assert.equal((await close(f, webinarId)).status, 200); f.newSession(ids.member);
    gate.resolve(Response.json({ data: { code: 100, authority }, errors: [] }));
    const result = await pending;
    assert.equal(result.status, 503); assert.equal(result.body.paymentOutcome, 'unknown');
    assert.equal(Object.hasOwn(result.body, 'payment_url'), false);
    const attempt = f.state.attempts.get(registrationId);
    assert.equal(attempt.state, 'ready'); assert.equal(attempt.authority, authority);
    assert.equal(attempt.payment_url, paymentUrl); assert.equal(attempt.payment_id, ids.payment);
    assert.equal(f.state.payments.get(ids.payment).status, 'pending');
    assert.ok(f.calls.rpc.some(call => call.name === 'mark_webinar_payment_unknown'));
    assert.equal((await f.pay(registrationId)).status, 503);
    assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
    assert.deepEqual(f.calls.settlements, []);
  });
}

test('synthetic lost attach response AFTER commit preserves ready and explicit replay reuses the bound authority', async () => {
  const f = fixture(); const created = await f.create(); f.newSession(ids.member);
  const registered = await f.register(created.body.webinar.id); const registrationId = registered.body.registration.registration_id;
  f.faults.attachLostResponse = true;
  const observed = await f.pay(registrationId);
  assert.equal(observed.status, 503); assert.equal(observed.body.paymentOutcome, 'unknown');
  assert.equal(Object.hasOwn(observed.body, 'payment_url'), false);
  assert.equal(f.state.attempts.get(registrationId).state, 'ready');
  assert.equal(f.state.attempts.get(registrationId).authority, authority);
  assert.ok(f.calls.rpc.some(call => call.name === 'mark_webinar_payment_unknown'));
  f.faults.attachLostResponse = false;
  const replay = await f.pay(registrationId);
  assert.equal(replay.status, 200); assert.equal(replay.body.payment_url, paymentUrl);
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
  assert.equal(f.state.payments.size, 1);
});

test('synthetic settlement records paid status without changing the stored ready attempt', async () => {
  const { f, registrationId } = await pendingFixture();
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
  assert.equal(f.state.attempts.get(registrationId).state, 'ready');
  assert.equal(f.state.payments.get(ids.payment).status, 'paid');
  assert.equal(f.state.registrations.get(registrationId).payment_status, 'paid');
  assert.equal((await f.pay(registrationId)).status, 503);
  assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
});

const attemptMutations = [
  ['orphan', (f, registrationId) => f.state.attempts.delete(registrationId)],
  ['unready', (f, registrationId) => { f.state.attempts.get(registrationId).state = 'unknown'; }],
  ...[
    ['registration_id', ids.otherWebinar], ['webinar_id', ids.otherWebinar], ['user_id', ids.other],
    ['payment_id', ids.otherWebinar], ['amount', 1740], ['authority', 'different'],
  ].map(([key, value]) => [key, (f, registrationId) => { f.state.attempts.get(registrationId)[key] = value; }]),
];
for (const paid of [false, true]) {
  for (const [label, mutate] of attemptMutations) {
    test(`synthetic ${paid ? 'paid' : 'pending'} ${label} attempt cannot authorize access or callback settlement`, async () => {
      const { f, webinarId, registrationId } = await pendingFixture();
      if (paid) assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
      mutate(f, registrationId); const before = copied(f.calls);
      const access = await f.access(webinarId);
      assert.equal(access.body.access.allowed, false); assert.equal(Object.hasOwn(access.body.access, 'platform_url'), false);
      assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
      assert.deepEqual(f.calls.provider, before.provider); assert.deepEqual(f.calls.settlements, before.settlements);
      assert.deepEqual(f.calls.rejected, []);
    });
  }
}

for (const broken of ['registration paid only', 'ledger paid only']) {
  test(`synthetic ${broken} paired-status mismatch cannot expose context for verification`, async () => {
    const { f, webinarId, registrationId } = await pendingFixture();
    if (broken === 'registration paid only') f.state.registrations.get(registrationId).payment_status = 'paid';
    else Object.assign(f.state.payments.get(ids.payment), { status: 'paid', ref_id: '201', verified_at: now });
    const before = copied(f.calls.provider);
    assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'unknown');
    assert.deepEqual(f.calls.provider, before); assert.deepEqual(f.calls.settlements, []);
    assert.equal((await f.access(webinarId)).body.access.allowed, false);
  });
}

test('admin legacy send_invites remains disabled for attended paid/free registrations without global delivery', async () => {
  const { f, webinarId, registrationId } = await pendingFixture();
  assert.equal((await f.callback(registrationId)).searchParams.get('status'), 'success');
  f.state.registrations.get(registrationId).attended = true;
  const free = await f.create({ price_toman: 0 }); f.newSession(ids.member);
  const freeRegistration = await f.register(free.body.webinar.id);
  f.state.registrations.get(freeRegistration.body.registration.registration_id).attended = true;
  f.newSession(ids.admin); const before = copied(f.calls);
  for (const id of [webinarId, free.body.webinar.id]) assert.equal((await f.patch({ id, action: 'send_invites' })).status, 503);
  assert.deepEqual(f.calls.provider, before.provider); assert.deepEqual(f.calls.rpc, before.rpc);
  assert.deepEqual(f.calls.writes, before.writes); assert.deepEqual(f.calls.globalGrants, []);
});

for (const [change, expectedStatus] of [
  [{ user_id: ids.other }, 503], [{ user_id: '' }, 503], [{ registration_id: ids.otherWebinar }, 503],
  [{ webinar_id: 'not-a-uuid' }, 503], [{ amount: 0 }, 503], [{ amount: 1.5 }, 503],
  [{ payment_id: 'not-a-uuid' }, 409], [{ payment_id: null }, 409], [{ authority: 'different' }, 409],
  [{ payment_url: 'https://untrusted.example.test/charge' }, 409],
  [{ payment_url: `${paymentUrl}?redirect=external` }, 409],
]) {
  test(`malformed ready reservation ${JSON.stringify(change)} cannot return a URL or create another charge`, async () => {
    const { f, registrationId } = await pendingFixture();
    f.faults.prepared = { ...f.context(f.state.registrations.get(registrationId)), state: 'ready',
      started: false, title: 'Synthetic webinar', payment_url: paymentUrl, ...change };
    const before = copied(f.calls.provider);
    const result = await f.pay(registrationId);
    assert.equal(result.status, expectedStatus); assert.equal(result.body.paymentOutcome, 'unknown');
    assert.equal(result.body.recovery, 'reconcile_same_registration');
    assert.equal(Object.hasOwn(result.body, 'payment_url'), false);
    assert.deepEqual(f.calls.provider, before);
  });
}

for (const failure of ['request network', 'request malformed', 'attach error']) {
  test(`${failure} marks the request outcome unknown and blocks an automatic new charge`, async () => {
    const f = fixture(); const created = await f.create(); f.newSession(ids.member);
    const registered = await f.register(created.body.webinar.id); const registrationId = registered.body.registration.registration_id;
    if (failure === 'request network') f.responses.request.push(async () => { throw new Error('synthetic request network'); });
    if (failure === 'request malformed') f.responses.request.push(async () => new Response('{invalid'));
    if (failure === 'attach error') f.faults.attach = true;
    const first = await f.pay(registrationId);
    assert.equal(first.status, 503); assert.equal(first.body.paymentOutcome, 'unknown');
    assert.equal(first.body.payment_url, undefined);
    const replay = await f.pay(registrationId); assert.equal(replay.status, 409);
    assert.equal(replay.body.payment_url, undefined);
    assert.equal(f.calls.provider.filter(call => call.url.endsWith('/request.json')).length, 1);
    assert.equal((await f.access(created.body.webinar.id)).body.access.allowed, false);
  });
}

test('missing prepare RPC/schema blocks gateway calls', async () => {
  const f = fixture(); const created = await f.create(); f.newSession(ids.member);
  const registered = await f.register(created.body.webinar.id); f.faults.rpc.prepare_webinar_payment = true;
  assert.equal((await f.pay(registered.body.registration.registration_id)).status, 503);
  assert.deepEqual(f.calls.provider, []);
});

test('old paid/free rows without qualified provenance cannot inherit access after relogin', async () => {
  const f = fixture(); const created = await f.create({ price_toman: 0 });
  f.newSession(ids.member); const registered = await f.register(created.body.webinar.id);
  f.state.registrations.get(registered.body.registration.registration_id).access_qualified = false;
  f.newSession(null); f.newSession(ids.member);
  assert.equal((await f.access(created.body.webinar.id)).body.access.allowed, false);
});

test('synthetic legacy free registration still occupies source capacity/count while exact access remains denied', async () => {
  const f = fixture(); const created = await f.create({ price_toman: 0, max_capacity: 1 });
  f.newSession(ids.member); const registered = await f.register(created.body.webinar.id);
  f.state.registrations.get(registered.body.registration.registration_id).access_qualified = false;
  const list = await f.list(); assert.equal(list.status, 200);
  assert.equal(list.body.webinars[0].registered_count, 1);
  assert.equal((await f.access(created.body.webinar.id)).body.access.allowed, false);
  f.newSession(ids.other); assert.equal((await f.register(created.body.webinar.id)).status, 400);
  assert.equal(f.state.registrations.size, 1); assert.deepEqual(f.calls.provider, []);
});

test('unqualified or cross-member access receipts cannot leak a platform URL', async () => {
  const { f, webinarId, registrationId } = await pendingFixture();
  f.faults.access = { ...f.context(f.state.registrations.get(registrationId)), allowed: true,
    user_id: ids.other, platform_url: 'https://class.example.test/forged', price_toman: 1739 };
  const result = await f.access(webinarId);
  assert.equal(result.status, 503); assert.equal(JSON.stringify(result.body).includes('class.example.test'), false);
});
