import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function actualFeed(error: unknown = null, filter: { cat?: string; q?: string } = {}) {
  let reads = 0;
  const reply = { data: [], error };
  const query = {
    select: () => query, order: () => query, limit: (n: number) => { assert.equal(n, 80); return query; },
    eq: () => query, ilike: () => query,
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
