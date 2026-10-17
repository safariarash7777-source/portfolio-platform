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
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', replacements, hooks);
    if (name.startsWith('.')) return load(resolve(dirname(filename), name) + '.ts', replacements, hooks);
    return require(name);
  };
  new Function('require', 'exports', 'React', compiled)(dependencies, exports, hooks);
  return exports;
}
const contracts = load('lib/media/layout-setting.ts');
const user = '11111111-1111-4111-8111-111111111111';
function route({ role = 'admin', signedIn = true, rpcData = 2, rpcError = null, roleError = null } = {}) {
  const calls = [];
  const session = { auth: { getUser: async () => ({ data: { user: signedIn ? { id: user, user_metadata: { role: 'admin' } } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: roleError }) }) }) }),
    rpc: async (name, args) => { calls.push({ name, args }); return { data: rpcData, error: rpcError }; } };
  return { calls, ...load('app/api/admin/content/appearance/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase/server': { createClient: async () => session }, '@/lib/media/layout-setting': contracts,
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
  assert.equal((await route({ rpcData: 3 }).PATCH(request({ media_layout: 2 }))).status, 503);
});

function mount(path, props = {}, replacements = {}) {
  const state = [], refs = [], deps = new Map(), effects = []; let index = 0, tree;
  const hooks = { ...React,
    useState: initial => { const n = index++; if (!(n in state)) state[n] = typeof initial === 'function' ? initial() : initial;
      return [state[n], next => { state[n] = typeof next === 'function' ? next(state[n]) : next; }]; },
    useRef: initial => { const n = index++; return refs[n] ??= { current: initial }; },
    useMemo: fn => { index++; return fn(); },
    useCallback: (fn, values) => { const n = index++, prior = deps.get(n); if (!prior || values.some((v, i) => v !== prior[i])) state[n] = fn; deps.set(n, values); return state[n]; },
    useEffect: (fn, values) => { const n = index++, prior = deps.get(n); if (!prior || values.some((v, i) => v !== prior[i])) effects.push(fn); deps.set(n, values); },
  };
  const component = load(path, replacements, hooks).default;
  const render = () => { index = 0; tree = component(props); };
  const all = node => Array.isArray(node) ? node.flatMap(all) : React.isValidElement(node) ? [node, ...all(node.props.children)] : [];
  const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  return { render, get tree() { return tree; }, text: () => text(tree), nodes: () => all(tree),
    find: predicate => all(tree).find(predicate),
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
    handlers.hashchange(); await ui.settle(); assert.equal(ui.tree.props['data-media-layout'], 2);
    assert.doesNotMatch(ui.text(), /مدیریت ظاهر|منتخب آرش|انتخاب نمونه|پیشنمایش طراحی|تلاش مجدد نمایشی/);
    assert.equal(ui.nodes().some(n => n.props['aria-label'] === 'چیدمان رسانه'), false);
    const error = mount('components/insights/MediaHub.tsx', { items: [], globalLayout: 3, initialMode: 'error' }); await error.settle();
    error.find(n => n.type === 'button' && n.props.children === 'تلاش مجدد').props.onClick(); assert.equal(reloads, 1);
  } finally { globalThis.window = oldWindow; globalThis.location = oldLocation; }
});
test('actual admin control reads persistent layout and reports save failure without browser-only success', async () => {
  const previousFetch = globalThis.fetch; const calls = []; let fail = false;
  globalThis.fetch = async (url, options = {}) => { calls.push({ url, options }); return Response.json(fail ? {} : { media_layout: options.method ? 3 : 2 }, { status: fail ? 503 : 200 }); };
  try {
    const ui = mount('components/insights/MediaAppearanceSettings.tsx'); await ui.settle();
    const choice = ui.find(n => n.type === 'button' && n.props['aria-pressed'] && n.props.children?.[0]?.props?.children?.includes?.('۲'));
    assert.ok(choice, 'stored layout 2 is selected');
    const third = ui.nodes().filter(n => n.type === 'button' && typeof n.props['aria-pressed'] === 'boolean')[2];
    third.props.onClick(); await ui.settle();
    ui.find(n => n.type === 'button' && n.props.children === 'ذخیره طرح برای همه').props.onClick(); await ui.settle();
    assert.match(ui.text(), /برای همهٔ بازدیدکنندگان ذخیره شد/);
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { media_layout: 3 });
    fail = true;
    ui.find(n => n.type === 'button' && n.props.children === 'ذخیره طرح برای همه').props.onClick(); await ui.settle();
    assert.match(ui.text(), /ذخیره تأیید نشد/); assert.doesNotMatch(ui.text(), /برای همهٔ بازدیدکنندگان ذخیره شد/);
  } finally { globalThis.fetch = previousFetch; }
});

test('actual insights server page reads existing public content and global setting on every request', async () => {
  const Media = () => null, Navbar = () => null, Footer = () => null;
  let layout = 1, broken = false, contentBroken = false;
  const calls = [];
  const content = { id: 'stored-public-id', platform: 'telegram', kind: 'post', content_url: 'https://t.me/public_channel/9', title: 'متن عمومی ذخیره‌شده', description: null, published_at: null };
  const chain = { select: fields => { calls.push(['select', fields]); return chain; },
    is: (...args) => { calls.push(['is', ...args]); return chain; }, not: (...args) => { calls.push(['not', ...args]); return chain; },
    order: () => chain, limit: async () => ({ data: [content], error: contentBroken ? { code: 'network' } : null }) };
  const page = load('app/insights/page.tsx', {
    '@/lib/supabase/server': { createClient: async () => ({ from: name => { assert.equal(name, 'content_hub'); return chain; },
      rpc: async name => { assert.equal(name, 'get_media_layout'); return { data: layout, error: broken ? {} : null }; } }) },
    '@/components/insights/MediaHub': { __esModule: true, default: Media },
    '@/components/layout/Navbar': { __esModule: true, default: Navbar }, '@/components/layout/Footer': { __esModule: true, default: Footer },
    '@/lib/metadata': { pageMetadata: value => value },
  }).default;
  for (const n of [1, 2, 3]) {
    layout = n; const tree = await page(), children = tree.props.children;
    assert.equal(children[0].type, Navbar); assert.equal(children[1].type, Media);
    assert.equal(children[1].props.globalLayout, n); assert.deepEqual(children[1].props.items, [content]);
    assert.equal(children[2].type, Footer);
  }
  assert.ok(calls.some(call => call.join('|') === 'is|deleted_at|'));
  assert.ok(calls.some(call => call.join('|') === 'not|published_at|is|'));
  contentBroken = true; assert.equal((await page()).props.children[1].props.initialMode, 'error');
  broken = true; const unavailable = (await page()).props.children[1];
  assert.equal(unavailable.type, 'main'); assert.equal(unavailable.props.role, 'alert');
});
