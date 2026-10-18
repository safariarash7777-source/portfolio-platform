import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { withDeadline } from '../../lib/deadline';

const require = createRequire(import.meta.url);
async function actualFeed(error: unknown = null, filter: { cat?: string; q?: string } = {}) {
  let reads = 0;
  const reply = { data: [], error };
  const query = {
    select: () => query, order: () => query, limit: (n: number) => { assert.equal(n, 80); return query; },
    eq: () => query, ilike: () => query,
    abortSignal: (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); return query; },
    then: (resolve: (value: typeof reply) => unknown) => Promise.resolve(resolve(reply)),
  };
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const page = { exports: {} as { default: (props: object) => Promise<React.ReactElement> } };
  const load = (name: string) => {
    if (name === '@/lib/supabase/server') return { createClient: async () => ({ from: (table: string) => { reads++; assert.equal(table, 'codal_feed'); return query; } }) };
    if (name === '@/lib/metadata') return { pageMetadata: () => ({}) };
    if (name.startsWith('@/components/')) return { __esModule: true, default: () => null };
    if (name === 'next/link') return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement('a', { href: props.href }, props.children) };
    return require(name.startsWith('@/') ? `../../${name.slice(2)}` : name);
  };
  vm.runInNewContext(code, { module: page, exports: page.exports, require: load, URLSearchParams });
  const result = await page.exports.default({ searchParams: Promise.resolve(filter) });
  assert.equal(reads, 1, 'text correction must not add a query');
  return renderToStaticMarkup(result);
}
test('actual public Codal empty state describes stored/filter absence and unknown receipt without cadence promises', async () => {
  for (const filter of [{}, { cat: 'ماهانه', q: 'fixture' }]) {
    const html = await actualFeed(null, filter);
    assert.ok(html.includes('ذخیره‌شده'));
    assert.ok(html.includes('آخرین دریافت این مسیر از پاسخ فعلی معلوم نیست'));
    assert.ok(!/هر چند دقیقه|به‌زودی/.test(html));
    assert.ok(!html.includes('دریافت فید کدال فعلاً ممکن نشد'));
  }
});
test('actual public Codal lookup failures remain unavailable/missing rather than an empty success', async () => {
  for (const error of [{ status: 503 }, { code: '42P01' }]) {
    const html = await actualFeed(error);
    assert.ok(html.includes(error.code === '42P01' ? 'مسیر خواندن فید کدال در پایگاه داده در دسترس نیست' : 'دریافت فید کدال فعلاً ممکن نشد'));
    assert.ok(!html.includes('در این پاسخ، اطلاعیهٔ ذخیره‌شده‌ای دیده نمی‌شود'));
    assert.ok(!html.includes('آخرین دریافت این مسیر از پاسخ فعلی معلوم نیست'));
  }
});

type ReadReply = { data: unknown; error: unknown };
const publicReaders = ['app/codal/page.tsx', 'app/notes/page.tsx', 'app/insights/page.tsx', 'lib/public-design/home-media.ts'] as const;
function pendingReadFixture(path: typeof publicReaders[number], pending: boolean, returned: ReadReply = { data: [], error: null }) {
  const budgets: number[] = [], signals: AbortSignal[] = [], filters: unknown[][] = [];
  let reads = 0, rejectLate!: (error: Error) => void;
  const reply = pending ? new Promise<ReadReply>((_resolve, reject) => { rejectLate = reject; }) : Promise.resolve(returned);
  const query = {
    select: () => query, order: () => query,
    limit: (value: number) => { assert.equal(value, path.includes('/codal/') ? 80 : 60); return query; },
    is: (...values: unknown[]) => { filters.push(['is', ...values]); return query; },
    not: (...values: unknown[]) => { filters.push(['not', ...values]); return query; },
    eq: (...values: unknown[]) => { filters.push(['eq', ...values]); return query; },
    ilike: (...values: unknown[]) => { filters.push(['ilike', ...values]); return query; },
    abortSignal: (signal: AbortSignal) => { signals.push(signal); return query; },
    // Deliberately ignores abort: a connect/SDK hang must still settle the page.
    then: (resolve: (value: ReadReply) => unknown, reject: (error: unknown) => unknown) => reply.then(resolve, reject),
  };
  const client = { from(table: string) {
    reads++;
    assert.equal(table, path.includes('/codal/') ? 'codal_feed' : path.includes('/notes/') ? 'market_notes' : 'content_hub');
    return query;
  } };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams, require(name: string) {
    if (name === 'server-only') return {};
    if (name === '@/lib/supabase/server') return { createClient: async () => client };
    if (name === '@/lib/deadline') return { withDeadline: (load: (signal: AbortSignal) => Promise<unknown>, ms: number) => {
      budgets.push(ms); assert.equal(ms, 4000, 'production budget is unchanged; only test clock is shortened');
      return withDeadline(load, 20);
    } };
    if (name === '@/lib/appearance/site-layout-server') return { readSiteAppearance: async () => ({ state: 'ready', globalLayout: 2, previewLayout: null }) };
    if (name === '@/lib/metadata') return { pageMetadata: () => ({}) };
    if (name === '@/components/insights/MediaHub') return { __esModule: true, default: (props: { initialMode: string; items: unknown[] }) => React.createElement('output', { 'data-mode': props.initialMode, 'data-count': props.items.length }) };
    if (name === '@/components/notes/NotesFeed') return { __esModule: true, default: (props: { notes: unknown[] }) => React.createElement('output', { 'data-notes': props.notes.length }, props.notes.length ? 'stored notes' : 'successful empty notes') };
    if (name.startsWith('@/components/')) return { __esModule: true, default: () => null };
    if (name === 'next/link') return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement('a', { href: props.href }, props.children) };
    return require(name.startsWith('@/') ? `../../${name.slice(2)}` : name);
  } });
  return {
    budgets, signals, filters, get reads() { return reads; }, rejectLate: (error: Error) => rejectLate(error),
    run: async () => path.endsWith('home-media.ts') ? exports.readHomeMedia(client)
      : renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve({ cat: 'ماهانه', q: 'fixture' }) }) as React.ReactElement),
  };
}

for (const path of publicReaders) {
  test(`${path} bounds an abort-ignoring connect hang and handles its late rejection without false empty`, async () => {
    const f = pendingReadFixture(path, true);
    const result = await f.run();
    assert.deepEqual(f.budgets, [4000]); assert.equal(f.reads, 1);
    assert.equal(f.signals.length, 1); assert.equal(f.signals[0].aborted, true);
    if (path.endsWith('home-media.ts')) assert.deepEqual(JSON.parse(JSON.stringify(result)), { state: 'unavailable', items: [], readAt: (result as { readAt: string }).readAt });
    else if (path.includes('/codal/')) {
      assert.match(result as string, /دریافت فید کدال فعلاً ممکن نشد/);
      assert.doesNotMatch(result as string, /در این پاسخ، اطلاعیهٔ ذخیره‌شده‌ای دیده نمی‌شود/);
      assert.deepEqual(f.filters, [['eq', 'category', 'ماهانه'], ['ilike', 'symbol', '%fixture%']]);
    } else if (path.includes('/notes/')) {
      assert.match(result as string, /role="alert"/); assert.match(result as string, /این خطا به معنی نبودن یادداشت‌ها نیست/);
      assert.doesNotMatch(result as string, /successful empty notes/);
    } else assert.match(result as string, /data-mode="error" data-count="0"/);
    // Promise.race must observe the loser, even when the transport rejects later.
    f.rejectLate(new Error('synthetic late transport rejection'));
    await new Promise(resolve => setImmediate(resolve));
  });

  test(`${path} preserves a successful empty read instead of manufacturing a timeout/error`, async () => {
    const f = pendingReadFixture(path, false), result = await f.run();
    assert.deepEqual(f.budgets, [4000]); assert.equal(f.signals[0].aborted, false);
    if (path.endsWith('home-media.ts')) assert.equal((result as { state: string }).state, 'empty');
    else if (path.includes('/codal/')) assert.match(result as string, /اطلاعیهٔ ذخیره‌شده‌ای با این فیلتر یافت نشد/);
    else if (path.includes('/notes/')) assert.match(result as string, /successful empty notes/);
    else assert.match(result as string, /data-mode="ready" data-count="0"/);
  });
}

test('notes SDK error with residual data is unavailable, never a successful empty feed or unconfirmed note', async () => {
  const f = pendingReadFixture('app/notes/page.tsx', false, { data: [{ id: 'residual', title: 'unconfirmed', body_md: 'synthetic', tags: [], published_at: null }], error: { code: '42501' } });
  const html = await f.run() as string;
  assert.match(html, /role="alert"/); assert.match(html, /این خطا به معنی نبودن یادداشت‌ها نیست/);
  assert.doesNotMatch(html, /successful empty notes|stored notes|unconfirmed/);
});
