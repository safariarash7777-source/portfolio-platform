// Real route + real AES-GCM + installed Supabase RPC transport, synthetic fixtures.
// No server start, live key/account/session, database mutation or provider call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createClient, AuthSessionMissingError, AuthRetryableFetchError } from '@supabase/supabase-js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
function loader(env, overrides = {}) {
  const cache = new Map();
  function load(file) {
    const full = resolve(root, file);
    if (cache.has(full)) return cache.get(full);
    const module = { exports: {} };
    cache.set(full, module.exports);
    const source = ts.transpileModule(readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    runInNewContext(source, {
      exports: module.exports, Buffer, AbortSignal, Request, Response, URL, process: { env }, console,
      require: name => {
        if (name in overrides) return overrides[name];
        if (name === 'server-only') return {};
        if (name.startsWith('@/') || name.startsWith('.')) {
          const candidate = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(full), name);
          return load(existsSync(candidate + '.ts') ? candidate + '.ts' : candidate + '.tsx');
        }
        return require(name);
      },
    });
    return module.exports;
  }
  return load;
}
function harness(options = {}) {
  const env = {
    AUTH_PROFILE_READ_ENABLED: 'true', AUTH_MOBILE_ENABLED: 'false',
    AUTH_IDENTITY_KEY_VERSION: 'synthetic-v1',
    AUTH_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    AUTH_IDENTITY_HMAC_KEY: randomBytes(32).toString('base64'),
    ...options.env,
  };
  const user = Object.hasOwn(options, 'user') ? options.user : { id: 'synthetic-owner-a', phone_confirmed_at: null };
  const calls = { auth: 0, privileged: 0, rpc: [] };
  let row = options.row ?? null;
  const sdk = createClient('https://synthetic.supabase.test', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      calls.rpc.push({ pathname: new URL(request.url).pathname, method: request.method, body: await request.text() });
      if (options.rpcThrows) throw Error('PRIVATE transport detail');
      return new Response(JSON.stringify(options.rpcStatus ? { code: 'PGRST202', message: 'PRIVATE schema detail' } : row), {
        status: options.rpcStatus ?? 200, headers: { 'content-type': 'application/json' },
      });
    } },
  });
  sdk.auth.getUser = async () => {
    calls.auth++;
    if (options.authThrows) throw Error('PRIVATE auth configuration');
    return { data: { user }, error: options.authError ?? null };
  };
  const load = loader(env, {
    '@/lib/supabase/server': { createClient: async () => sdk },
    '@/lib/supabase/admin': { createAdminClient: () => { calls.privileged++; throw Error('private writer forbidden'); } },
    // OTP ingress and framework cookie handling are outside this read-only test.
    '@/lib/auth/mobile-server': { mobileEnabled: () => env.AUTH_MOBILE_ENABLED === 'true', sameOrigin: () => true },
  });
  const crypto = load('lib/auth/identity-crypto.ts');
  function existing(owner = 'synthetic-owner-a', values = { firstName: 'SYNTHETIC', lastName: 'PROFILE', nationalId: 'SYNTHETIC-NOT-A-PERSON' }) {
    const encrypted = crypto.encryptIdentity(owner, values);
    row = { version: 2, ciphertext: encrypted.ciphertext, keyVersion: encrypted.keyVersion, identityMatch: 'pending', phoneNationalIdMatch: 'pending' };
    return row;
  }
  return { env, calls, existing, load, route: load('app/api/auth/identity/route.ts') };
}
async function read(h, status) {
  const response = await h.route.GET();
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const body = await response.json();
  if (status !== 200) {
    assert.equal(Object.hasOwn(body, 'profile'), false);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE|ciphertext|SYNTHETIC-NOT/);
  }
  assert.equal(h.calls.privileged, 0);
  return body;
}
test('actual identity GET reads null with SMS/mobile off, using only own zero-argument RPC', async () => {
  const h = harness();
  const body = await read(h, 200);
  assert.deepEqual(body, { profile: null, phoneVerified: false, identityMatch: 'pending', phoneNationalIdMatch: 'pending', profileWriteEnabled: false });
  assert.deepEqual(h.calls.rpc, [{ pathname: '/rest/v1/rpc/auth_read_private_identity', method: 'POST', body: '{}' }]);
  const projected = await h.load('lib/member/profile.ts').readMemberProfile(async () => Response.json(body));
  assert.deepEqual(JSON.parse(JSON.stringify(projected)), { state: 'incomplete', phoneVerified: false, version: null, writeEnabled: false });
});
test('actual identity GET decrypts own existing synthetic profile while SMS remains off', async () => {
  const h = harness(); h.existing();
  const body = await read(h, 200);
  assert.equal(body.version, 2); assert.equal(body.profile.firstName, 'SYNTHETIC');
  assert.equal(body.profileWriteEnabled, false); assert.equal(body.identityMatch, 'pending');
  const projected = await h.load('lib/member/profile.ts').readMemberProfile(async () => Response.json(body));
  assert.equal(projected.state, 'recorded');
  assert.equal(JSON.stringify(projected).includes('nationalId'), false);
  assert.equal(JSON.stringify(projected).includes('SYNTHETIC'), false);
});
test('a supplied foreign account selector cannot change the zero-argument own-profile read', async () => {
  const h = harness(); h.existing();
  const response = await h.route.GET(new Request('https://site.test/api/auth/identity?userId=synthetic-owner-b'));
  assert.equal(response.status, 200);
  assert.equal(h.calls.rpc[0].pathname, '/rest/v1/rpc/auth_read_private_identity');
  assert.equal(h.calls.rpc[0].body, '{}'); assert.equal(h.calls.privileged, 0);
});
for (const enabled of [undefined, 'false', 'TRUE', '1']) {
  test(`explicit profile-disabled is independent of mobile=true: ${enabled ?? 'unset'}`, async () => {
    const h = harness({ env: { AUTH_PROFILE_READ_ENABLED: enabled, AUTH_MOBILE_ENABLED: 'true' } });
    const body = await read(h, 503);
    assert.equal(body.code, 'profile_disabled'); assert.equal(h.calls.rpc.length, 0);
    assert.equal((await h.load('lib/member/profile.ts').readMemberProfile(async () => Response.json(body, { status: 503 }))).state, 'disabled');
  });
}
for (const [label, env] of [
  ['missing material', { AUTH_IDENTITY_ENCRYPTION_KEY: undefined, AUTH_IDENTITY_HMAC_KEY: undefined, AUTH_IDENTITY_KEY_VERSION: undefined }],
  ['short encryption', { AUTH_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(5).toString('base64') }],
  ['short HMAC', { AUTH_IDENTITY_HMAC_KEY: Buffer.alloc(5).toString('base64') }],
  ['invalid version', { AUTH_IDENTITY_KEY_VERSION: 'not/a/version' }],
]) {
  test(`missing/invalid keys cannot produce incomplete or recorded: ${label}`, async () => {
    const h = harness({ env });
    const body = await read(h, 503);
    assert.equal(body.code, undefined); assert.equal(h.calls.rpc.length, 0);
    assert.equal((await h.load('lib/member/profile.ts').readMemberProfile(async () => Response.json(body, { status: 503 }))).state, 'unavailable');
  });
}
test('a foreign encrypted record cannot be decrypted for the authenticated owner', async () => {
  const h = harness(); h.existing('synthetic-owner-b');
  await read(h, 503);
  assert.equal(h.calls.rpc.length, 1);
});
test('an existing encrypted profile with key material removed stays unavailable', async () => {
  const h = harness(); h.existing(); delete h.env.AUTH_IDENTITY_ENCRYPTION_KEY;
  const body = await read(h, 503);
  assert.equal(body.code, undefined); assert.equal(h.calls.rpc.length, 0);
});
test('different synthetic account with no own record stays null, never receives another identity', async () => {
  const h = harness({ user: { id: 'synthetic-owner-b', phone_confirmed_at: null } });
  const body = await read(h, 200); assert.equal(body.profile, null);
  assert.equal(h.calls.rpc[0].body, '{}');
});
for (const authError of [null, new AuthSessionMissingError()]) {
  test(`unauthenticated GET remains401, before capability/key/RPC reads: ${authError?.name ?? 'no user'}`, async () => {
    const h = harness({ user: null, authError, env: { AUTH_PROFILE_READ_ENABLED: 'false' } });
    await read(h, 401); assert.equal(h.calls.rpc.length, 0);
  });
}
for (const options of [{ authError: new AuthRetryableFetchError('PRIVATE outage', 503) }, { authThrows: true }]) {
  test('Auth outage/configuration cannot appear as disabled or absent profile', async () => {
    const h = harness(options); const body = await read(h, 503);
    assert.equal(body.code, undefined); assert.equal(h.calls.rpc.length, 0);
  });
}
for (const rpcStatus of [403, 404, 503]) {
  test(`RPC permission/schema/service error remains unavailable: ${rpcStatus}`, async () => {
    const h = harness({ rpcStatus }); const body = await read(h, 503);
    assert.equal(body.code, undefined); assert.equal(h.calls.rpc.length, 1);
  });
}
test('RPC transport failure remains503 and never becomes an incomplete identity', async () => {
  const h = harness({ rpcThrows: true }); await read(h, 503);
});
test('old key unavailable and malformed profile/version both fail closed', async () => {
  const h = harness(); const row = h.existing(); row.keyVersion = 'retired-synthetic-version';
  await read(h, 503);
  row.keyVersion = 'synthetic-v1'; row.version = 0;
  await read(h, 503);
  row.version = 2; h.existing('synthetic-owner-a', { firstName: '', lastName: 'SYNTHETIC', nationalId: 'SYNTHETIC' });
  await read(h, 503);
});
test('GET read-enabled cannot activate existing mobile/identity POST while mobile is disabled', async () => {
  const h = harness(); await read(h, 200);
  const before = { auth: h.calls.auth, rpc: h.calls.rpc.length };
  const response = await h.route.POST(new Request('https://site.test/api/auth/identity', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
  assert.equal(h.calls.auth, before.auth); assert.equal(h.calls.rpc.length, before.rpc); assert.equal(h.calls.privileged, 0);
});
function renderCard(result) {
  let stateCall = 0;
  const load = loader({}, {
    react: { ...React, useEffect: () => {}, useState: initial => [stateCall++ === 0 ? result : initial, () => {}] },
    'next/link': { __esModule: true, default: props => React.createElement('a', props) },
  });
  return renderToStaticMarkup(React.createElement(load('components/member/ProfileStatus.tsx').default));
}
test('actual card renders explicit disabled state without retry or a false completion action', () => {
  const html = renderCard({ state: 'disabled' });
  assert.match(html, /پروفایل خصوصی در این محیط فعال نیست/);
  assert.doesNotMatch(html, /role="alert"|<button|href=|پروفایل هنوز ثبت نشده/);
});
test('actual card hides unavailable edit path when independent profile reads are enabled', () => {
  const html = renderCard({ state: 'recorded', version: 2, phoneVerified: false, writeEnabled: false });
  assert.match(html, /پروفایل ذخیره شده است/); assert.match(html, /مسیر تکمیل و تغییر اطلاعات در این محیط فعال نیست/);
  assert.doesNotMatch(html, /href=|<button/);
  assert.match(renderCard({ state: 'incomplete', version: null, phoneVerified: false, writeEnabled: true }), /href="\/account\/mobile\?next=/);
});
