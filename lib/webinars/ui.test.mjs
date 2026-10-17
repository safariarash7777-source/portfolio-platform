import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourceRoot = process.env.WEBINAR_UI_TEST_SOURCE ?? '.';

const test = (name, run) => nodeTest(name, { timeout: 5000 }, run);
async function bounded(value) {
  let done = false, result, failure;
  Promise.resolve(value).then(answer => { result = answer; done = true; }, error => { failure = error; done = true; });
  for (let i = 0; i < 100 && !done; i++) await Promise.resolve();
  assert.ok(done, 'Synthetic UI action did not settle within 100 microtask turns');
  if (failure) throw failure;
  return result;
}

// Production components run in a deterministic hook host. All I/O is synthetic;
// a missing mock fails instead of contacting a browser, service, gateway or DB.
function load(file, dependencies, globals = {}) {
  const exports = {};
  const source = readFileSync(resolve(sourceRoot, file), 'utf8');
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: file,
  }).outputText, {
    exports, URL, Date, URLSearchParams,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unmocked UI dependency: ${name}`);
    },
    fetch: () => assert.fail('Unmocked UI fetch'),
    console: { error: () => assert.fail('Unexpected UI console error') },
    ...globals,
  });
  return exports;
}

const format = load('lib/format.ts', {});
const returnPath = load('components/account/returnPath.ts', {});
const webinarId = '11111111-1111-4111-8111-111111111111';
const registrationId = '22222222-2222-4222-8222-222222222222';
const authority = 'synthetic-preserved-authority';
const sessionUrl = 'https://session.example.test/one-webinar';
const gatewayUrl = `https://payment.zarinpal.com/pg/StartPay/${authority}`;
const webinar = {
  id: webinarId, title: 'Synthetic webinar', description: null,
  starts_at: '2026-10-20T18:15:24.123+03:30', ends_at: '2026-10-20T19:15:24.123+03:30',
  registration_open: true, max_capacity: null, price_toman: 100, platform: 'link',
  status: 'published', registered_count: 0, invites_sent: false,
  access_enabled: true, access_starts_at: '2026-10-19T17:11:21.321+03:30',
  access_ends_at: '2026-10-22T17:11:21.321+03:30', webinar_registrations: [{ count: 0 }],
};
const registration = (overrides = {}) => ({ registration_id: registrationId,
  webinar_id: webinarId, payment_status: 'pending', needs_payment: true,
  already_registered: false, ...overrides });
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300,
  status, json: async () => body });

function nodes(tree, predicate, found = []) {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, predicate, found));
  else if (tree && typeof tree === 'object') {
    if (predicate(tree)) found.push(tree);
    nodes(tree.props?.children, predicate, found);
  }
  return found;
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree && typeof tree === 'object') return text(tree.props?.children);
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}

function fixture(kind, { list = [webinar], query = '', onFetch } = {}) {
  const states = [], refs = [], effects = [], pendingEffects = [], cleanups = [], stateWrites = [];
  let mounted = true;
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const calls = [], navigations = [];
  const jsx = (type, props) => ({ type, props });
  const searchParams = new URLSearchParams(query);
  const exports = load(kind === 'admin' ? 'app/(protected)/admin/webinars/page.tsx' : 'app/webinars/page.tsx', {
    react: {
      Suspense: 'suspense',
      useState(value) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof value === 'function' ? value() : value;
        return [states[index], next => {
          stateWrites.push({ index, mounted });
          states[index] = typeof next === 'function' ? next(states[index]) : next;
        }];
      },
      useRef(value) { const index = refIndex++; return refs[index] ??= { current: value }; },
      useCallback: callback => callback,
      useEffect(callback, dependencies) {
        const index = effectIndex++, previous = effects[index];
        effects[index] = { dependencies, callback };
        if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
          pendingEffects.push({ index, callback });
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'lucide-react': Object.fromEntries(['Plus', 'Video', 'Users', 'Calendar', 'Send', 'Edit2', 'Trash2',
      'Eye', 'EyeOff', 'CheckCircle', 'XCircle', 'Loader2', 'ExternalLink', 'Info'].map(name => [name, `icon-${name}`])),
    'next/navigation': { useSearchParams: () => searchParams },
    'next/link': { default: 'link' },
    '@/components/layout/Navbar': { default: 'navbar' },
    '@/lib/format': format,
    '@/components/account/returnPath': returnPath,
  }, {
    window: { location: { set href(value) { navigations.push(value); } } },
    confirm: () => assert.fail('No destructive or notification operation belongs in these tests'),
    fetch: async (url, options = {}) => {
      const call = { url: String(url), method: options.method ?? 'GET',
        body: options.body ? JSON.parse(options.body) : undefined, cache: options.cache };
      calls.push(call);
      if (call.method === 'GET' && (call.url === '/api/admin/webinars' || call.url === '/api/webinars/list')) return response({ webinars: list });
      if (onFetch) return onFetch(call);
      assert.fail(`Unmocked UI fetch: ${call.method} ${call.url}`);
    },
  });
  const render = () => {
    stateIndex = refIndex = effectIndex = 0;
    const tree = exports.default();
    return kind === 'public' ? tree.props.children.type() : tree;
  };
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const flushEffects = async () => {
    for (const { index, callback } of pendingEffects.splice(0)) {
      cleanups[index]?.();
      cleanups[index] = callback();
    }
    await settle();
  };
  const unmount = () => { cleanups.forEach(cleanup => cleanup?.()); cleanups.fill(undefined); mounted = false; };
  const replayEffects = async () => {
    unmount(); mounted = true;
    effects.forEach((effect, index) => { cleanups[index] = effect.callback(); });
    await settle();
  };
  const find = predicate => nodes(render(), predicate)[0];
  const button = label => find(node => node.type === 'button' && text(node).includes(label));
  const change = (predicate, value, checkbox = false) => {
    const field = find(predicate); assert.ok(field, 'Expected production form field');
    field.props.onChange({ target: checkbox ? { checked: value } : { value } });
  };
  return { calls, navigations, render, settle, flushEffects, find, button, unmount, replayEffects,
    writesAfterUnmount: () => stateWrites.filter(write => !write.mounted).length,
    stateWriteCount: () => stateWrites.length,
    async start() { render(); await flushEffects(); return render(); },
    click(label) { const found = button(label); assert.ok(found, `Expected button: ${label}`); return bounded(found.props.onClick()); },
    set(id, value) { change(node => node.props?.id === id, value); },
    setTitle(value) { change(node => node.type === 'input' && node.props.type === 'text' && node.props.required && !node.props.id, value); },
    setCapacity(value) { change(node => node.type === 'input' && node.props.placeholder === 'خالی = بدون محدودیت', value); },
    setSession(value) { change(node => node.type === 'input' && node.props.type === 'url', value); },
    enable(value) { change(node => node.type === 'input' && node.props.type === 'checkbox' && !node.props.id, value, true); },
    openRegistration(value) { change(node => node.props?.id === 'reg_open', value, true); },
    submit() { const form = find(node => node.type === 'form'); assert.ok(form); return bounded(form.props.onSubmit({ preventDefault() {} })); },
  };
}

async function adminFixture(overrides = {}) {
  const f = fixture('admin', { onFetch: call => {
    assert.equal(call.url, '/api/admin/webinars'); assert.equal(call.method, 'POST');
    return response({ webinar: { id: webinarId } });
  }, ...overrides });
  await f.start(); f.click('وبینار جدید');
  return f;
}
function configure(f, { price = '۱۰۰', capacity = '', enabled = true, open = true,
  accessStart = '2026-10-19T12:10:15.123', accessEnd = '2026-10-22T12:10:15.123' } = {}) {
  f.setTitle('Synthetic explicit webinar');
  f.set('webinar_starts_at', '2026-10-20T15:10:15.123');
  f.set('webinar_ends_at', '2026-10-20T16:10:15.123');
  f.set('webinar_price', price); f.setCapacity(capacity); f.setSession(sessionUrl);
  f.set('access_starts_at', accessStart); f.set('access_ends_at', accessEnd);
  f.enable(enabled); f.openRegistration(open);
}
const writes = f => f.calls.filter(call => call.method !== 'GET');

test('admin create has no inferred price, access window or open registration', async () => {
  const f = await adminFixture();
  assert.equal(f.find(node => node.props?.id === 'webinar_price').props.value, '');
  assert.equal(f.find(node => node.props?.id === 'access_starts_at').props.value, '');
  assert.equal(f.find(node => node.props?.id === 'access_ends_at').props.value, '');
  assert.equal(f.find(node => node.type === 'input' && node.props.type === 'checkbox' && !node.props.id).props.checked, false);
  assert.equal(f.find(node => node.props?.id === 'reg_open').props.disabled, true);
  assert.equal(f.find(node => node.props?.id === 'reg_open').props.checked, false);
  assert.deepEqual(writes(f), []);
});

test('admin saves capped paid registration under the selected v1 reservation policy', async () => {
  const f = await adminFixture(); configure(f, { capacity: '۲' }); await f.submit();
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f)[0].body.max_capacity, 2);
  assert.equal(writes(f)[0].body.registration_open, true);
});

test('admin chosen unlimited paid policy sends canonical explicit fields, independent event dates', async () => {
  const f = await adminFixture(); configure(f); await f.submit();
  assert.equal(writes(f).length, 1);
  assert.deepEqual(writes(f)[0].body, {
    title: 'Synthetic explicit webinar', description: null,
    starts_at: new Date('2026-10-20T15:10:15.123').toISOString(),
    ends_at: new Date('2026-10-20T16:10:15.123').toISOString(),
    registration_open: true, max_capacity: null, price_toman: 100, platform: 'link',
    platform_url: sessionUrl, access_enabled: true,
    access_starts_at: new Date('2026-10-19T12:10:15.123').toISOString(),
    access_ends_at: new Date('2026-10-22T12:10:15.123').toISOString(), status: 'draft',
  });
});

test('admin can open a configured capped paid webinar through the existing list toggle', async () => {
  const f = fixture('admin', { list: [{ ...webinar, max_capacity: 2, registration_open: false }],
    onFetch: () => response({ webinar: { id: webinarId } }) });
  await f.start();
  const toggle = f.find(node => node.type === 'button' && node.props.title === 'باز کردن ثبت‌نام');
  assert.ok(toggle); await toggle.props.onClick();
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f)[0].body.registration_open, true);
});

test('ended webinar admin exposes no channel invitation action until its separate policy is chosen', async () => {
  for (const sentBefore of [false, true]) {
    const f = fixture('admin', { list: [{ ...webinar, status: 'ended', invites_sent: sentBefore }],
      onFetch: () => assert.fail('An invitation must not make a network request') });
    await f.start();
    assert.equal(nodes(f.render(), node => node.type === 'button' &&
      /دعوت|کانال/.test(`${node.props.title ?? ''}${text(node)}`)).length, 0);
    assert.match(text(f.render()), /دعوت کانال تا تعیین سیاست جداگانه غیرفعال است/);
    assert.deepEqual(writes(f), []);
    assert.equal(f.calls.length, 1);
  }
});

test('admin preserves source free capacity and saves capped paid drafts with registration closed', async () => {
  for (const options of [{ price: '۰', capacity: '۲' }, { capacity: '۲', open: false }, { capacity: '۲', enabled: false }]) {
    const f = await adminFixture(); configure(f, options); await f.submit();
    assert.equal(writes(f).length, 1);
    assert.equal(writes(f)[0].body.max_capacity, 2);
    assert.equal(writes(f)[0].body.registration_open, options.price === '۰');
  }
});

for (const price of ['', '-1', '1.5', '100x', '9007199254740992']) {
  test(`admin rejects invalid price ${JSON.stringify(price)} before any save`, async () => {
    const f = await adminFixture(); configure(f, { price }); await f.submit();
    assert.deepEqual(writes(f), []); assert.match(text(f.render()), /قیمت/);
  });
}
test('admin empty access inputs use the documented default only with an explicit event end', async () => {
  const f = await adminFixture(); configure(f, { accessStart: '', accessEnd: '' }); await f.submit();
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f)[0].body.access_starts_at, null);
  assert.equal(writes(f)[0].body.access_ends_at, null);
  assert.ok(writes(f)[0].body.ends_at);
});
for (const [accessStart, accessEnd] of [['', '2026-10-22T12:00'], ['bad-date', '2026-10-22T12:00'],
  ['2026-10-22T12:00', '2026-10-22T12:00'], ['2026-10-23T12:00', '2026-10-22T12:00']]) {
  test(`admin rejects invalid enabled access window ${accessStart} / ${accessEnd}`, async () => {
    const f = await adminFixture(); configure(f, { accessStart, accessEnd }); await f.submit();
    assert.deepEqual(writes(f), []); assert.match(text(f.render()), /دسترسی/);
  });
}

test('admin edit roundtrips saved local dates with seconds and milliseconds', async () => {
  const f = fixture('admin', { list: [{ ...webinar, platform_url: sessionUrl }], onFetch: call => {
    assert.equal(call.method, 'PATCH'); return response({ webinar: { id: webinarId } });
  } });
  await f.start(); f.find(node => node.type === 'button' && node.props.title === 'ویرایش').props.onClick(); await f.submit();
  const body = writes(f)[0].body;
  for (const name of ['starts_at', 'ends_at', 'access_starts_at', 'access_ends_at']) {
    assert.equal(body[name], new Date(webinar[name]).toISOString());
  }
});

test('public free branch uses server canonical result despite paid displayed price', async () => {
  const f = fixture('public', { onFetch: call => {
    assert.equal(call.url, '/api/webinars/register');
    return response({ registration: registration({ needs_payment: false, payment_status: 'free' }) });
  } });
  await f.start(); await f.click('ثبت‌نام و پرداخت');
  assert.deepEqual(writes(f).map(call => call.url), ['/api/webinars/register']);
  assert.match(text(f.render()), /ثبت‌نام شما تأیید شد/);
  assert.deepEqual(f.navigations, []);
});

test('public replay of a paid unresolved registration neither claims confirmation nor starts another payment', async () => {
  const f = fixture('public', { onFetch: call => {
    assert.equal(call.url, '/api/webinars/register');
    return response({ registration: registration({ needs_payment: false, payment_status: 'paid', already_registered: true,
      fulfillment_state: 'paid_pending_resolution', resolution_kind: 'refund_due' }) });
  } });
  await f.start(); await f.click('ثبت‌نام و پرداخت');
  assert.deepEqual(writes(f).map(call => call.url), ['/api/webinars/register']);
  assert.match(text(f.render()), /پرداخت محفوظ است/);
  assert.doesNotMatch(text(f.render()), /ثبت‌نام شما قبلاً تأیید شده/);
  assert.deepEqual(f.navigations, []);
});

test('public permits registration for live webinars consistently with the source RPC', async () => {
  const f = fixture('public', { list: [{ ...webinar, status: 'live', price_toman: 0 }], onFetch: call => {
    assert.equal(call.url, '/api/webinars/register');
    return response({ registration: registration({ needs_payment: false, payment_status: 'free' }) });
  } });
  await f.start(); await f.click('ثبت‌نام رایگان');
  assert.deepEqual(writes(f).map(call => call.url), ['/api/webinars/register']);
  assert.match(text(f.render()), /ثبت‌نام شما تأیید شد/);
  assert.deepEqual(f.navigations, []);
});

test('public paid branch uses registration_id and needs_payment despite zero displayed price', async () => {
  const f = fixture('public', { list: [{ ...webinar, price_toman: 0 }], onFetch: call => {
    if (call.url === '/api/webinars/register') return response({ registration: registration() });
    assert.equal(call.url, '/api/webinars/payment');
    assert.deepEqual(call.body, { registration_id: registrationId });
    return response({ payment_url: gatewayUrl });
  } });
  await f.start(); await f.click('ثبت‌نام رایگان');
  assert.deepEqual(writes(f).map(call => call.url), ['/api/webinars/register', '/api/webinars/payment']);
  assert.deepEqual(f.navigations, [gatewayUrl]);
});

test('public twice-captured submit sends one request and retains the lock after gateway navigation', async () => {
  let resolveRegistration;
  const f = fixture('public', { onFetch: call => call.url === '/api/webinars/register'
    ? new Promise(resolve => { resolveRegistration = resolve; }) : response({ payment_url: gatewayUrl }) });
  await f.start(); const submit = f.button('ثبت‌نام و پرداخت').props.onClick;
  const first = submit(); await bounded(submit());
  assert.equal(writes(f).length, 1);
  resolveRegistration(response({ registration: registration() })); await bounded(first);
  await bounded(submit());
  assert.equal(writes(f).length, 2); assert.deepEqual(f.navigations, [gatewayUrl]);
});

for (const status of [409, 503]) {
  test(`public unknown request ${status} preserves authority and blocks a new charge`, async () => {
    const f = fixture('public', { onFetch: call => call.url === '/api/webinars/register'
      ? response({ registration: registration() })
      : response({ paymentOutcome: 'unknown', authority }, status) });
    await f.start(); const submit = f.button('ثبت‌نام و پرداخت').props.onClick;
    await submit(); await submit();
    assert.equal(writes(f).length, 2); assert.deepEqual(f.navigations, []);
    assert.match(text(f.render()), /نامعلوم|نیاز به بررسی/); assert.match(text(f.render()), new RegExp(authority));
    assert.equal(f.button('ثبت‌نام و پرداخت'), undefined);
  });
}

test('public unknown callback preserves its authority and never starts payment on mount or access check', async () => {
  const f = fixture('public', { query: `status=unknown&authority=${authority}&webinar_id=${webinarId}`, onFetch: call => {
    assert.equal(call.method, 'GET'); assert.match(call.url, /^\/api\/webinars\/access\?/);
    return response({ access: { allowed: false, reason: 'payment_pending' } });
  } });
  await f.start(); assert.match(text(f.render()), new RegExp(authority));
  assert.equal(f.button('ثبت‌نام و پرداخت'), undefined);
  await f.click('دسترسی به همین وبینار');
  assert.deepEqual(writes(f), []); assert.deepEqual(f.navigations, []);
  assert.match(text(f.render()), new RegExp(authority));
});

test('public rejected callback preserves the same attempt for review without inviting another charge', async () => {
  const f = fixture('public', { query: `status=failed&authority=${authority}&webinar_id=${webinarId}` });
  await f.start();
  assert.equal(f.button('ثبت‌نام و پرداخت'), undefined);
  assert.doesNotMatch(text(f.render()), /دوباره تلاش|بازگشت وجه/);
  assert.match(text(f.render()), /همان پرداخت|همان درخواست/);
  assert.match(text(f.render()), new RegExp(authority));
  assert.deepEqual(writes(f), []);
});

for (const status of ['unknown', 'failed']) {
  test(`public ${status} callback locks only A while captured free B registration remains available`, async () => {
    const otherWebinarId = '00000000-0000-4000-8000-000000000012';
    const f = fixture('public', { list: [webinar, { ...webinar, id: otherWebinarId, price_toman: 0 }],
      query: `status=${status}&authority=${authority}&webinar_id=${webinarId}`, onFetch: call => {
        assert.equal(call.url, '/api/webinars/register'); assert.deepEqual(call.body, { webinar_id: otherWebinarId });
        return response({ registration: registration({ webinar_id: otherWebinarId, needs_payment: false, payment_status: 'free' }) });
      } });
    await f.start();
    assert.equal(f.button('ثبت‌نام و پرداخت'), undefined);
    const submitB = f.button('ثبت‌نام رایگان')?.props.onClick;
    assert.ok(submitB, 'Callback A must not hide free registration for B');
    await bounded(submitB());
    assert.equal(writes(f).length, 1); assert.deepEqual(f.navigations, []);
    assert.match(text(f.render()), /ثبت‌نام شما تأیید شد/);
  });
}

test('public unscoped callback warning cannot assign a global registration lock', async () => {
  const f = fixture('public', { query: `status=unknown&authority=${authority}` });
  await f.start(); assert.ok(f.button('ثبت‌نام و پرداخت'));
  assert.match(text(f.render()), new RegExp(authority)); assert.deepEqual(writes(f), []);
});

test('admin twice-captured submit before render starts exactly one POST', async () => {
  let resolvePending;
  const pending = new Promise(resolve => { resolvePending = resolve; });
  const f = await adminFixture({ onFetch: call => {
    assert.equal(call.method, 'POST'); return pending;
  } });
  configure(f); const submit = f.find(node => node.type === 'form').props.onSubmit;
  const first = submit({ preventDefault() {} }); const second = submit({ preventDefault() {} });
  const writesBeforeRender = writes(f).length;
  resolvePending(response({ webinar: { id: webinarId } }));
  await bounded(Promise.all([first, second]));
  assert.equal(writesBeforeRender, 1); assert.equal(writes(f).length, 1);
});

test('admin lost create response requires list review; the mount guard is not durable idempotency', async () => {
  const f = await adminFixture({ onFetch: call => {
    assert.equal(call.method, 'POST'); throw new Error('synthetic lost response after possible commit');
  } });
  configure(f); const submit = f.find(node => node.type === 'form').props.onSubmit;
  await bounded(submit({ preventDefault() {} })); await bounded(submit({ preventDefault() {} }));
  assert.equal(writes(f).length, 1);
  assert.match(text(f.render()), /ممکن است.*ذخیره|فهرست.*بررسی/);
  assert.equal(f.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled,true);
  assert.doesNotMatch(text(f.render()), /لغو شد|بازگردانده شد|ذخیره نشد/);
});

test('admin validation failure releases the submit guard for corrected input', async () => {
  const f=await adminFixture(); configure(f,{price:''}); await f.submit();
  assert.equal(writes(f).length,0);
  configure(f); await f.submit(); assert.equal(writes(f).length,1);
});

test('public captured handlers start no request after unmount', async () => {
  const f = fixture('public'); await f.start();
  const register = f.button('ثبت‌نام و پرداخت').props.onClick;
  const access = f.button('دسترسی به همین وبینار').props.onClick;
  const before = f.calls.length;
  f.unmount(); await bounded(register()); await bounded(access());
  assert.equal(f.calls.length, before); assert.equal(f.writesAfterUnmount(), 0);
  assert.deepEqual(f.navigations, []);
});

for (const boundary of ['registration response', 'registration body', 'payment response', 'payment body']) {
  test(`public ignores late ${boundary} after unmount without undoing a possible server commit`, async () => {
    let resolvePending, serverCommitted = false;
    const pending = new Promise(resolve => { resolvePending = resolve; });
    const f = fixture('public', { onFetch: call => {
      if (call.url === '/api/webinars/register') {
        if (boundary === 'registration response') return pending;
        if (boundary === 'registration body') return { ok: true, status: 200, json: () => pending };
        return response({ registration: registration() });
      }
      assert.equal(call.url, '/api/webinars/payment'); serverCommitted = true;
      return boundary === 'payment response' ? pending : { ok: true, status: 200, json: () => pending };
    } });
    await f.start(); const submitting = f.button('ثبت‌نام و پرداخت').props.onClick();
    await f.settle(); const before = f.calls.length;
    f.unmount();
    resolvePending(boundary === 'registration response' ? response({ registration: registration() })
      : boundary === 'registration body' ? { registration: registration() }
        : boundary === 'payment response' ? response({ payment_url: gatewayUrl }) : { payment_url: gatewayUrl });
    await bounded(submitting);
    assert.equal(f.calls.length, before); assert.equal(f.writesAfterUnmount(), 0);
    assert.deepEqual(f.navigations, []);
    assert.equal(serverCommitted, boundary.startsWith('payment'));
  });
}

for (const boundary of ['response', 'body']) {
  test(`public ignores late allowed access ${boundary} after unmount`, async () => {
    let resolvePending;
    const pending = new Promise(resolve => { resolvePending = resolve; });
    const f = fixture('public', { onFetch: () => boundary === 'response'
      ? pending : { ok: true, status: 200, json: () => pending } });
    await f.start(); const checking = f.button('دسترسی به همین وبینار').props.onClick();
    await f.settle(); f.unmount();
    const body = { access: { allowed: true, platform_url: sessionUrl } };
    resolvePending(boundary === 'response' ? response(body) : body);
    await bounded(checking);
    assert.equal(f.writesAfterUnmount(), 0); assert.deepEqual(f.navigations, []);
    assert.deepEqual(writes(f), []);
  });
}

test('public effect cleanup/setup replay accepts a new operation but never revives an old response', async () => {
  let resolveFirst, calls = 0;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const f = fixture('public', { onFetch: () => ++calls === 1 ? first
    : response({ access: { allowed: true, platform_url: sessionUrl } }) });
  await f.start(); const checking = f.button('دسترسی به همین وبینار').props.onClick();
  await f.replayEffects();
  const stateWrites = f.stateWriteCount();
  resolveFirst(response({ access: { allowed: true, platform_url: sessionUrl } }));
  await bounded(checking);
  assert.equal(f.stateWriteCount(), stateWrites); assert.deepEqual(f.navigations, []);
  await f.click('دسترسی به همین وبینار');
  assert.deepEqual(f.navigations, [sessionUrl]); assert.deepEqual(writes(f), []);
});

test('admin submitted creation can commit before unmount but late response never updates or refetches', async () => {
  let resolveCreation, committed = false;
  const pending = new Promise(resolve => { resolveCreation = resolve; });
  const f = await adminFixture({ onFetch: call => {
    assert.equal(call.method, 'POST'); committed = true; return pending;
  } });
  configure(f); const submit = f.find(node => node.type === 'form').props.onSubmit;
  const submitting = submit({ preventDefault() {} }); const before = f.calls.length;
  f.unmount(); resolveCreation(response({ webinar: { id: webinarId } })); await bounded(submitting);
  await bounded(submit({ preventDefault() {} }));
  assert.equal(committed, true); assert.equal(f.calls.length, before);
  assert.equal(f.writesAfterUnmount(), 0);
});

test('fresh and relogin public pages use only protected GET access, never register or pay', async () => {
  for (let visit = 0; visit < 2; visit++) {
    const f = fixture('public', { onFetch: call => {
      assert.equal(call.method, 'GET');
      assert.equal(call.url, `/api/webinars/access?webinar_id=${webinarId}`);
      assert.equal(call.cache, 'no-store');
      return response({ access: { allowed: true, platform_url: sessionUrl } });
    } });
    await f.start(); assert.equal(f.calls.length, 1);
    await f.click('دسترسی به همین وبینار');
    assert.deepEqual(writes(f), []); assert.deepEqual(f.navigations, [sessionUrl]);
  }
});

test('public 401 access uses the existing safe login return path', async () => {
  const f = fixture('public', { onFetch: () => response({ error: 'Login required' }, 401) });
  await f.start(); await f.click('دسترسی به همین وبینار');
  assert.deepEqual(writes(f), []); assert.deepEqual(f.navigations, ['/login?next=%2Fwebinars']);
});

for (const access of [{ allowed: false, reason: 'not_registered', platform_url: sessionUrl },
  { allowed: 'true', platform_url: sessionUrl }, { allowed: true, platform_url: 'http://session.example.test' },
  { allowed: true, platform_url: 'https://member:password@session.example.test' },
  { allowed: true, platform_url: 'javascript:alert(1)' }, { allowed: true }]) {
  test(`public denies unapproved or invalid session URL ${JSON.stringify(access)}`, async () => {
    const f = fixture('public', { onFetch: () => response({ access }) });
    await f.start(); await f.click('دسترسی به همین وبینار');
    assert.deepEqual(f.navigations, []); assert.deepEqual(writes(f), []);
    assert.match(text(f.render()), /دسترسی|لینک معتبر/);
  });
}

test('public list cannot render a direct session link even if legacy payload includes it', async () => {
  const f = fixture('public', { list: [{ ...webinar, status: 'live', platform_url: sessionUrl }] });
  await f.start();
  assert.equal(nodes(f.render(), node => node.props?.href === sessionUrl).length, 0);
  assert.equal(text(f.render()).includes(sessionUrl), false);
  assert.ok(f.button('دسترسی به همین وبینار'));
});

test('public refuses incomplete or contradictory registration before requesting payment', async () => {
  for (const result of [{ id: registrationId, needs_payment: true },
    registration({ webinar_id: 'different-webinar' }), registration({ payment_status: 'paid' }),
    registration({ needs_payment: false, payment_status: 'pending' })]) {
    const f = fixture('public', { onFetch: () => response({ registration: result }) });
    await f.start(); await f.click('ثبت‌نام و پرداخت');
    assert.equal(writes(f).length, 1); assert.deepEqual(f.navigations, []);
  }
});
