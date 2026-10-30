import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
const require = createRequire(import.meta.url), ts = require('typescript'), React = require('react');
const source = path => readFileSync(resolve(path), 'utf8');
function load(path, replacements = {}, hooks = React) {
  const filename = resolve(path), exports = {};
  const compiled = ts.transpileModule(source(filename), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText;
  const dependencies = name => {
    if (Object.hasOwn(replacements, name)) return replacements[name];
    if (name === 'react') return hooks;
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => String(key) });
    if (name === 'next/link' || name === 'next/image') return { __esModule: true, default: () => null };
    if (name.endsWith('/MediaAppearanceSettings')) return { __esModule: true, default: () => null };
    if (name.endsWith('/SiteLayoutPreview') || name.endsWith('/SiteAppearanceWarning')) return { __esModule: true, default: () => null };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', replacements, hooks);
    if (name.startsWith('.')) return load(resolve(dirname(filename), name) + '.ts', replacements, hooks);
    return require(name);
  };
  new Function('require', 'exports', 'React', compiled)(dependencies, exports, hooks);
  return exports;
}
const contracts = load('lib/media/layout-setting.ts');

test('actual MediaHub combines legacy date with q/network/kind and preserves hash, detail return, reload and clear', async () => {
  const prior = { window: globalThis.window, location: globalThis.location, history: globalThis.history, fetch: globalThis.fetch };
  let href = 'https://site.example.test/insights#network=telegram&kind=post&q=پادکست&from=2026-10-30&to=2026-10-30&layout=3';
  let requests = 0; const handlers = {};
  globalThis.location = { get hash() { return new URL(href).hash; }, get search() { return new URL(href).search; }, get pathname() { return new URL(href).pathname; } };
  globalThis.window = { location: { get href() { return href; } }, addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {} };
  globalThis.history = { replaceState: (state, _title, value) => { assert.equal(state, null); href = new URL(value, href).href; } };
  globalThis.fetch = async () => { requests++; throw new Error('display filter must not fetch'); };
  const item = { platform: 'telegram', kind: 'post', title: 'پادکست نمونه آزمون', description: null, published_at: '2026-10-29T20:30:00Z' };
  const rows = [
    { ...item, id: 'inside', content_url: 'https://t.me/public_fixture/1' },
    { ...item, id: 'before', content_url: 'https://t.me/public_fixture/2', published_at: '2026-10-29T20:29:59Z' },
    { ...item, id: 'video', content_url: 'https://t.me/public_fixture/3', kind: 'video' },
    { ...item, id: 'instagram', content_url: 'https://www.instagram.com/p/PublicFixture/', platform: 'instagram' },
    { ...item, id: 'missing', content_url: 'https://t.me/public_fixture/4', published_at: null, dateLabel: '۸ آبان ۱۴۰۵' },
    { ...item, id: 'invalid', content_url: 'https://t.me/public_fixture/5', published_at: '2026-02-30T00:00:00Z' },
    { ...item, id: 'other-query', content_url: 'https://t.me/public_fixture/6', title: 'متن دیگری برای آزمون' },
  ];
  try {
    const ui = mount('components/insights/MediaHub.tsx', { items: rows, globalLayout: 2 }); await ui.settle();
    const control = label => ui.find(n => n.type === 'input' && n.props['aria-label'] === label);
    assert.ok(control('از تاریخ (میلادی)'), 'actual date control must exist');
    assert.equal(control('از تاریخ (میلادی)').props.value, '2026-10-30');
    const cards = host => host.nodes().filter(n => n.props.item && typeof n.props.onOpen === 'function');
    const ids = host => cards(host).map(n => n.props.item.id);
    assert.deepEqual(ids(ui), ['inside']);
    assert.match(ui.text(), /۲ مورد تاریخ ثبت‌شدهٔ معتبر ندارد/);
    assert.match(ui.text(), /تاریخ ثبت‌شدهٔ قبلی/);
    assert.match(ui.text(), /تهران/);
    assert.equal(ui.tree.props['data-media-layout'], 2);
    cards(ui)[0].props.onOpen(rows[0]); await ui.settle();
    assert.match(ui.text(), /انتشار در منبع/); assert.match(ui.text(), /تأیید نشده/);
    ui.find(n => n.props.detail === true).props.onClose(); await ui.settle();
    assert.deepEqual(ids(ui), ['inside']);
    ui.find(n => n.type === 'select' && n.props['aria-label'] === 'نوع محتوا').props.onChange({ target: { value: 'video' } }); await ui.settle();
    assert.deepEqual(ids(ui), ['video']);
    assert.equal(new URLSearchParams(new URL(href).hash.slice(1)).get('from'), '2026-10-30');
    href = 'https://site.example.test/insights#network=telegram&kind=post&q=پادکست&from=2026-10-30&to=2026-10-30&layout=3';
    handlers.hashchange(); await ui.settle(); // Restoring the prior URL, as on back/hash navigation.
    assert.deepEqual(ids(ui), ['inside']);
    const reload = mount('components/insights/MediaHub.tsx', { items: rows, globalLayout: 2 }); await reload.settle();
    assert.deepEqual(ids(reload), ['inside']);
    assert.equal(reload.find(n => n.props['aria-label'] === 'تا تاریخ (میلادی)').props.value, '2026-10-30');
    control('از تاریخ (میلادی)').props.onChange({ target: { value: '2026-02-30' } }); await ui.settle();
    assert.match(ui.text(), /تاریخ «از» معتبر نیست/);
    assert.doesNotMatch(ui.text(), /محتوایی برای این انتخاب نیست/);
    control('از تاریخ (میلادی)').props.onChange({ target: { value: '2026-10-31' } }); await ui.settle();
    assert.match(ui.text(), /نباید بعد از تاریخ «تا» باشد/);
    ui.find(n => n.type === 'button' && n.props.children === 'پاک‌کردن فیلترها').props.onClick(); await ui.settle();
    assert.deepEqual(ids(ui), rows.map(row => row.id));
    const hash = new URLSearchParams(new URL(href).hash.slice(1));
    for (const key of ['q', 'network', 'kind', 'from', 'to']) assert.equal(hash.has(key), false, key);
    assert.equal(hash.get('layout'), '3'); assert.equal(ui.tree.props['data-media-layout'], 2);
    href = 'https://site.example.test/insights#from=bad-date';
    const failed = mount('components/insights/MediaHub.tsx', { items: [], initialMode: 'error' }); await failed.settle();
    failed.find(n => n.type === 'button' && n.props.children === 'پاک‌کردن فیلترها').props.onClick(); await failed.settle();
    assert.match(failed.text(), /خواندن محتوا ممکن نشد/);
    assert.doesNotMatch(failed.text(), /محتوایی برای این انتخاب نیست/);
    assert.equal(requests, 0);
  } finally { globalThis.window = prior.window; globalThis.location = prior.location; globalThis.history = prior.history; globalThis.fetch = prior.fetch; }
});
const user = '11111111-1111-4111-8111-111111111111';
function route({ role = 'admin', signedIn = true, rpcData = 2, rpcError = null, roleError = null } = {}) {
  const calls = [], invalidations = [];
  const session = { auth: { getUser: async () => ({ data: { user: signedIn ? { id: user, user_metadata: { role: 'admin' } } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: roleError }) }) }) }),
    rpc: async (name, args) => { calls.push({ name, args }); return { data: rpcData, error: rpcError }; } };
  return { calls, invalidations, ...load('app/api/admin/content/appearance/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase/server': { createClient: async () => session }, '@/lib/media/layout-setting': contracts,
    'next/cache': { revalidatePath: (...args) => invalidations.push(args) },
  }) };
}
const request = body => ({ json: async () => body });

test('layout contract admits only an exact numeric global layout field', () => {
  for (const n of [1, 2, 3]) assert.equal(contracts.mediaLayoutInput({ media_layout: n }), n);
  for (const value of [null, [], {}, { media_layout: '2' }, { media_layout: 0 }, { media_layout: 4 },
    { media_layout: 1.5 }, { media_layout: 1, actor_id: user }, { media_layout: 1, role: 'admin' }]) {
    assert.equal(contracts.mediaLayoutInput(value), null);
  }
});
test('actual admin route rejects anonymous/member/role spoof before writes and preserves safe errors', async () => {
  for (const options of [{ signedIn: false }, { role: 'user' }, { role: null }, { roleError: { code: '42501' } }]) {
    const r = route(options), response = await r.PATCH(request({ media_layout: 2 }));
    assert.equal(response.status, options.signedIn === false ? 401 : options.roleError ? 503 : 403);
    assert.equal(r.calls.length, 0);
  }
  for (const body of [{ media_layout: 5 }, { media_layout: 2, role: 'admin' }, null]) {
    const r = route(); assert.equal((await r.PATCH(request(body))).status, 400); assert.equal(r.calls.length, 0);
  }
  const failed = route({ rpcError: { message: 'sensitive database detail' } });
  const response = await failed.PATCH(request({ media_layout: 2 }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sensitive/);
});
test('actual read/save route returns canonical layout only, with no-store and exact RPC arguments', async () => {
  const r = route(), read = await r.GET(), saved = await r.PATCH(request({ media_layout: 2 }));
  assert.deepEqual(await read.json(), { media_layout: 2 }); assert.deepEqual(await saved.json(), { media_layout: 2 });
  assert.equal(saved.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(r.calls, [{ name: 'get_media_layout', args: undefined }, { name: 'set_media_layout', args: { p_media_layout: 2 } }]);
  assert.deepEqual(r.invalidations, [['/', 'page'], ['/market', 'page'], ['/insights', 'page']]);
  assert.equal((await route({ rpcData: 3 }).PATCH(request({ media_layout: 2 }))).status, 503);
});

function mount(path, props = {}, replacements = {}) {
  const state = [], refs = [], deps = new Map(), effects = [], cleanups = []; let index = 0, tree;
  const hooks = { ...React,
    useState: initial => { const n = index++; if (!(n in state)) state[n] = typeof initial === 'function' ? initial() : initial;
      return [state[n], next => { state[n] = typeof next === 'function' ? next(state[n]) : next; }]; },
    useRef: initial => { const n = index++; return refs[n] ??= { current: initial }; },
    useMemo: fn => { index++; return fn(); },
    useCallback: (fn, values) => { const n = index++, prior = deps.get(n); if (!prior || values.some((v, i) => v !== prior[i])) state[n] = fn; deps.set(n, values); return state[n]; },
    useEffect: (fn, values) => { const n = index++, prior = deps.get(n); if (!prior || values.some((v, i) => v !== prior[i])) effects.push(() => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); }); deps.set(n, values); },
  };
  const component = load(path, replacements, hooks).default;
  const render = () => { index = 0; tree = component(props); };
  const all = node => Array.isArray(node) ? node.flatMap(all) : React.isValidElement(node) ? [node, ...all(node.props.children)] : [];
  const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  return { render, get tree() { return tree; }, text: () => text(tree), nodes: () => all(tree),
    find: predicate => all(tree).find(predicate),
    restartEffects: () => { for (const cleanup of cleanups.splice(0)) cleanup(); deps.clear(); },
    async settle() { for (let i = 0; i < 5; i++) { render(); for (const fn of effects.splice(0)) fn(); await new Promise(done => setImmediate(done)); } render(); },
  };
}
test('actual public MediaHub ignores localStorage/hash layout, keeps artwork and no pretend admin/pin controls', async () => {
  const oldWindow = globalThis.window, oldLocation = globalThis.location;
  let storageReads = 0, reloads = 0; const handlers = {};
  globalThis.location = { hash: '#layout=3', pathname: '/insights', search: '' };
  globalThis.window = { localStorage: { getItem: () => { storageReads++; return '{"layout":3}'; } },
    location: { reload: () => { reloads++; } }, addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {} };
  try {
    const item = { id: 'public', title: 'متن واقعی fixture', description: 'بدون عنوان ساختگی', content_url: 'https://t.me/public_channel/1', platform: 'telegram', kind: 'post', published_at: null };
    const ui = mount('components/insights/MediaHub.tsx', { items: [item], globalLayout: 2 }); await ui.settle();
    assert.equal(ui.tree.props['data-media-layout'], 2); assert.equal(storageReads, 0); assert.equal(handlers.storage, undefined);
    assert.ok(ui.nodes().some(n => n.type === 'section' && n.props['aria-label'] === 'تازه‌ترین محتوای ثبت‌شده'));
    assert.equal(ui.nodes().some(n => n.props['aria-label'] === 'منتخب آرش'), false);
    handlers.hashchange(); await ui.settle(); assert.equal(ui.tree.props['data-media-layout'], 2);
    assert.doesNotMatch(ui.text(), /مدیریت ظاهر|منتخب آرش|انتخاب نمونه|پیشنمایش طراحی|تلاش مجدد نمایشی/);
    assert.equal(ui.nodes().some(n => n.props['aria-label'] === 'چیدمان رسانه'), false);
    const error = mount('components/insights/MediaHub.tsx', { items: [], globalLayout: 3, initialMode: 'error' }); await error.settle();
    error.find(n => n.type === 'button' && n.props.children === 'تلاش مجدد').props.onClick(); assert.equal(reloads, 1);
    const fallback = mount('components/insights/MediaHub.tsx', { items: [item], globalLayout: 1, appearanceReadFailed: true }); await fallback.settle();
    assert.equal(fallback.tree.props['data-media-layout'], 'fallback');
    assert.ok(fallback.nodes().some(n => n.props.item?.id === item.id), 'appearance failure retains public content cards');
  } finally { globalThis.window = oldWindow; globalThis.location = oldLocation; }
});

test('server-authorized media preview changes layout without local preferences or losing content filters', async () => {
  const prior = { window: globalThis.window, location: globalThis.location, history: globalThis.history };
  let href = 'https://site.example.test/insights?appearance_preview=1&design=2#network=telegram&q=fixture';
  let storageReads = 0;
  const handlers = {};
  globalThis.location = { get hash() { return new URL(href).hash; }, get search() { return new URL(href).search; }, get pathname() { return new URL(href).pathname; } };
  globalThis.window = { location: { get href() { return href; } }, localStorage: { getItem: () => { storageReads++; throw new Error('unexpected browser preference'); } }, addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {} };
  globalThis.history = { replaceState: (state, _title, value) => { assert.equal(state, null); href = new URL(value, href).href; } };
  try {
    const item = { id: 'fixture', title: 'fixture', platform: 'telegram', kind: 'post', content_url: 'https://t.me/public_fixture/1', published_at: null, description: null };
    const ui = mount('components/insights/MediaHub.tsx', { items: [item], globalLayout: 2, appearancePreview: true }); await ui.settle();
    ui.find(n => typeof n.props.onChoose === 'function').props.onChoose(3); await ui.settle();
    assert.equal(ui.tree.props['data-media-layout'], 3); assert.equal(new URL(href).searchParams.get('design'), '3');
    assert.equal(new URL(href).hash, '#network=telegram&q=fixture'); assert.equal(storageReads, 0);
    assert.equal(ui.find(n => n.type === 'input' && n.props['aria-label'] === 'جست‌وجوی رسانه').props.value, 'fixture');
    href = 'https://site.example.test/insights?appearance_preview=1&design=1#network=telegram&q=fixture';
    handlers.popstate(); await ui.settle(); assert.equal(ui.tree.props['data-media-layout'], 1);
    assert.doesNotMatch(ui.text(), /انتخاب برای منتخب نمونه|مدیریت ظاهر رسانه/);
  } finally { globalThis.window = prior.window; globalThis.location = prior.location; globalThis.history = prior.history; }
});
test('actual admin control reads persistent layout and reports save failure without browser-only success', async () => {
  const previousFetch = globalThis.fetch; const calls = []; let fail = false, stored = 2, refreshes = 0;
  globalThis.fetch = async (url, options = {}) => { calls.push({ url, options }); if (options.method && !fail) stored = JSON.parse(options.body).media_layout; return Response.json(fail ? {} : { media_layout: stored }, { status: fail ? 503 : 200 }); };
  try {
    const ui = mount('components/insights/MediaAppearanceSettings.tsx', {}, { 'next/navigation': { useRouter: () => ({ refresh: () => refreshes++ }) } }); await ui.settle();
    const choice = ui.find(n => n.type === 'button' && n.props['aria-pressed'] && n.props.children?.[0]?.props?.children?.includes?.('۲'));
    assert.ok(choice, 'stored layout 2 is selected');
    const third = ui.nodes().filter(n => n.type === 'button' && typeof n.props['aria-pressed'] === 'boolean')[2];
    third.props.onClick(); await ui.settle();
    ui.find(n => n.type === 'button' && n.props.children === 'ذخیره طرح برای همه').props.onClick(); await ui.settle();
    assert.match(ui.text(), /برای همهٔ بازدیدکنندگان ذخیره شد/);
    assert.deepEqual(JSON.parse(calls.find(call => call.options.method)?.options.body), { media_layout: 3 });
    assert.equal(calls.at(-1).options.method, undefined, 'success requires canonical GET after PATCH');
    assert.equal(refreshes, 1);
    fail = true;
    ui.find(n => n.type === 'button' && n.props.children === 'ذخیره طرح برای همه').props.onClick(); await ui.settle();
    assert.match(ui.text(), /ذخیره تأیید نشد/); assert.doesNotMatch(ui.text(), /برای همهٔ بازدیدکنندگان ذخیره شد/);
  } finally { globalThis.fetch = previousFetch; }
});

test('actual admin control ignores late pre-save GET after StrictMode cleanup and canonical receipt', async () => {
  const previousFetch = globalThis.fetch; let reads = 0, stored = 2, refreshes = 0, resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method) { stored = JSON.parse(options.body).media_layout; return Response.json({ media_layout: stored }); }
    if (++reads === 1) return old; // Deliberately ignores AbortSignal: sequence must still protect state.
    return Response.json({ media_layout: stored });
  };
  try {
    const ui = mount('components/insights/MediaAppearanceSettings.tsx', {}, { 'next/navigation': { useRouter: () => ({ refresh: () => refreshes++ }) } });
    await ui.settle(); ui.restartEffects(); await ui.settle();
    ui.nodes().filter(n => n.type === 'button' && typeof n.props['aria-pressed'] === 'boolean')[2].props.onClick(); await ui.settle();
    ui.find(n => n.type === 'button' && n.props.children === 'ذخیره طرح برای همه').props.onClick(); await ui.settle();
    assert.match(ui.text(), /با خواندن دوباره تأیید شد/);
    resolveOld(Response.json({ media_layout: 1 })); await ui.settle();
    assert.equal(ui.nodes().filter(n => n.type === 'button' && typeof n.props['aria-pressed'] === 'boolean')[2].props['aria-pressed'], true);
    assert.match(ui.text(), /با خواندن دوباره تأیید شد/); assert.equal(refreshes, 1);
  } finally { resolveOld(Response.json({ media_layout: 1 })); globalThis.fetch = previousFetch; }
});

test('accepted PATCH without canonical reload is not reported as confirmed global success', async () => {
  const previousFetch = globalThis.fetch; let reads = 0, refreshes = 0;
  globalThis.fetch = async (_url, options = {}) => options.method ? Response.json({ media_layout: 3 }) : ++reads === 1 ? Response.json({ media_layout: 2 }) : Response.json({}, { status: 503 });
  try {
    const ui = mount('components/insights/MediaAppearanceSettings.tsx', {}, { 'next/navigation': { useRouter: () => ({ refresh: () => refreshes++ }) } }); await ui.settle();
    ui.nodes().filter(n => n.type === 'button' && typeof n.props['aria-pressed'] === 'boolean')[2].props.onClick(); await ui.settle();
    ui.find(n => n.type === 'button' && n.props.children === 'ذخیره طرح برای همه').props.onClick(); await ui.settle();
    assert.match(ui.text(), /خواندن دوبارهٔ تنظیم تأیید نشد/); assert.doesNotMatch(ui.text(), /برای همهٔ بازدیدکنندگان ذخیره شد/);
    assert.equal(refreshes, 0); assert.equal(ui.find(n => n.type === 'button' && n.props.children === 'ذخیره طرح برای همه').props.disabled, true);
  } finally { globalThis.fetch = previousFetch; }
});

let noStoreCalls = 0;
const appearanceReader = load('lib/appearance/site-layout-server.ts', { 'server-only': {}, 'next/cache': { unstable_noStore() { noStoreCalls++; } } });
test('one no-store site reader ignores visitor query and grants explicit preview only to current database admin', async () => {
  const events = [];
  const client = ({ role = 'user', signedIn = true, value = 2, rpcError = null, roleError = null } = {}) => ({
    rpc: name => { assert.equal(name, 'get_media_layout'); return { abortSignal: async signal => { assert.ok(signal instanceof AbortSignal); return { data: value, error: rpcError }; } }; },
    auth: { getUser: async () => { events.push('auth'); return { data: { user: signedIn ? { id: user, user_metadata: { role: 'admin' } } : null }, error: null }; } },
    from: table => { assert.equal(table, 'profiles'); return { select: () => ({ eq: (_key, id) => { assert.equal(id, user); return { abortSignal: signal => { assert.ok(signal instanceof AbortSignal); return { maybeSingle: async () => ({ data: { role }, error: roleError }) }; } }; } }) }; },
  });
  const before = noStoreCalls;
  assert.deepEqual(await appearanceReader.readSiteAppearance(client(), { design: '3' }), { state: 'ready', globalLayout: 2, previewLayout: null });
  assert.equal(noStoreCalls, before + 1);
  assert.equal(events.length, 0);
  for (const options of [{ role: 'user' }, { signedIn: false }, { role: 'admin', roleError: {} }]) {
    assert.equal((await appearanceReader.readSiteAppearance(client(options), { appearance_preview: '1', design: '3' })).previewLayout, null);
  }
  assert.equal((await appearanceReader.readSiteAppearance(client({ role: 'admin' }), { appearance_preview: '1', design: '3' })).previewLayout, 3);
  for (const search of [{ appearance_preview: ['1'], design: '3' }, { appearance_preview: '1', design: ['2','3'] }, { appearance_preview: '1', design: '02' }]) {
    assert.equal((await appearanceReader.readSiteAppearance(client({ role: 'admin' }), search)).previewLayout, null);
  }
  for (const options of [{ value: '2' }, { value: 9 }, { rpcError: {} }]) {
    assert.deepEqual(await appearanceReader.readSiteAppearance(client(options), { appearance_preview: '1', design: '3' }), { state: 'unavailable', globalLayout: null, previewLayout: null });
  }
  assert.equal((await appearanceReader.readSiteAppearance({ rpc() { throw new Error('offline'); } })).state, 'unavailable');
});

for (const hangingStage of ['rpc', 'auth', 'profile']) test(`whole site-appearance budget bounds abort-ignoring ${hangingStage}, preserves canonical fallback and observes late work`, async () => {
  const budgets = [], signals = [];
  let finishLate, rejectLate, profileReads = 0;
  const pending = new Promise((resolve, reject) => { finishLate = resolve; rejectLate = reject; });
  const actualDeadline = load('lib/deadline.ts').withDeadline;
  const boundedReader = load('lib/appearance/site-layout-server.ts', {
    'server-only': {}, 'next/cache': { unstable_noStore() {} },
    '@/lib/deadline': { withDeadline: (read, ms) => { budgets.push(ms); assert.equal(ms, 4000); return actualDeadline(read, 20); } },
  });
  const client = {
    rpc: name => { assert.equal(name, 'get_media_layout'); return { abortSignal: signal => { signals.push(signal); return hangingStage === 'rpc' ? pending : Promise.resolve({ data: 2, error: null }); } }; },
    auth: { getUser: () => hangingStage === 'auth' ? pending : Promise.resolve({ data: { user: { id: user, user_metadata: { role: 'admin' } } }, error: null }) },
    from: table => { profileReads++; assert.equal(table, 'profiles'); return { select: fields => {
      assert.equal(fields, 'role'); return { eq: (key, id) => { assert.equal(key, 'id'); assert.equal(id, user); return { abortSignal: signal => { signals.push(signal); return { maybeSingle: () => pending }; } }; } };
    } }; },
  };
  const result = await boundedReader.readSiteAppearance(client, { appearance_preview: '1', design: '3' });
  assert.deepEqual(budgets, [4000], 'setting/auth/profile share one fixed budget');
  assert.ok(signals.every(signal => signal.aborted));
  assert.deepEqual(result, hangingStage === 'rpc' ? { state: 'unavailable', globalLayout: null, previewLayout: null } : { state: 'ready', globalLayout: 2, previewLayout: null });
  if (hangingStage === 'auth') {
    finishLate({ data: { user: { id: user } }, error: null });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(profileReads, 0, 'late authentication cannot start another query after the budget');
  } else {
    if (hangingStage === 'profile') assert.equal(signals[0], signals[1], 'RPC and profile use the same abort signal');
    rejectLate(new Error('synthetic late transport rejection'));
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(result.previewLayout, null, 'late work cannot grant a preview');
});

test('actual insights server page reads existing public content and global setting on every request', async () => {
  const Media = () => null, Navbar = () => null, Footer = () => null;
  let layout = 1, broken = false, contentBroken = false;
  const calls = [];
  const content = { id: 'stored-public-id', platform: 'telegram', kind: 'post', content_url: 'https://t.me/public_channel/9', title: 'متن عمومی ذخیره‌شده', description: null, published_at: null };
  const chain = { select: fields => { calls.push(['select', fields]); return chain; },
    is: (...args) => { calls.push(['is', ...args]); return chain; }, not: (...args) => { calls.push(['not', ...args]); return chain; },
    order: () => chain, limit: () => chain, abortSignal: async signal => { assert.ok(signal instanceof AbortSignal); return { data: [content], error: contentBroken ? { code: 'network' } : null }; } };
  const page = load('app/insights/page.tsx', {
    '@/lib/supabase/server': { createClient: async () => ({ from: name => { assert.equal(name, 'content_hub'); return chain; },
      rpc: name => { assert.equal(name, 'get_media_layout'); return { abortSignal: async () => ({ data: layout, error: broken ? {} : null }) }; } }) },
    '@/lib/appearance/site-layout-server': appearanceReader,
    '@/components/insights/MediaHub': { __esModule: true, default: Media },
    '@/components/layout/Navbar': { __esModule: true, default: Navbar }, '@/components/layout/Footer': { __esModule: true, default: Footer },
    '@/lib/metadata': { pageMetadata: value => value },
  }).default;
  for (const n of [1, 2, 3]) {
    layout = n; const tree = await page({}), children = tree.props.children;
    assert.equal(children[0].type, Navbar); assert.equal(children[1].type, Media);
    assert.equal(children[1].props.globalLayout, n); assert.deepEqual(children[1].props.items, [content]);
    assert.equal(children[2].type, Footer);
  }
  assert.ok(calls.some(call => call.join('|') === 'is|deleted_at|'));
  assert.ok(calls.some(call => call.join('|') === 'not|published_at|is|'));
  contentBroken = true; assert.equal((await page({})).props.children[1].props.initialMode, 'error');
  broken = true; const unavailable = (await page({})).props.children[1];
  assert.equal(unavailable.type, Media); assert.equal(unavailable.props.appearanceReadFailed, true);
  assert.deepEqual(unavailable.props.items, [content], 'appearance read failure must preserve existing content');
});
