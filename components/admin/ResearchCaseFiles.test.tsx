import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import ResearchCaseFiles from './ResearchCaseFiles';
import type { ResearchDraftsView, StoredResearchDraft } from '@/lib/intelligence/research-drafts-view';

const row: StoredResearchDraft = {
  id: 'synthetic-saved-draft', createdAt: '2026-10-19T12:00:00Z', provider: 'openai-codex', model: 'gpt-6.1-sol',
  body: { status: 'draft', summary: 'خلاصهٔ ساختگی برای آزمون', claims: [{ kind: 'FACT', text: 'گزارهٔ ساختگی', evidence: ['E1'] }],
    scenarios: ['base', 'upside', 'downside'].map(label => ({ label: label as 'base' | 'upside' | 'downside', text: 'سناریوی ساختگی', invalidation: 'تغییر مبنا', evidence: ['E1'] })), limitations: ['محدودیت ساختگی'] },
  provenance: [{ evidence: 'E1', symbol: 'نمونه', reportId: 'synthetic-source', sourceUrl: 'https://codal.ir/report',
    periodEnd: '1405-03-31', periodMonths: 3, publishedAt: null, capturedAt: '2026-10-18T12:00:00Z', fetchedAt: '2026-10-19T11:00:00Z', unit: 'میلیون ریال', scope: 'company' }],
};
const view: ResearchDraftsView = { drafts: [row], invalidCount: 0, unavailableReason: null };
const render = (data = view) => renderToStaticMarkup(<ResearchCaseFiles view={data} />);

test('saved research exposes its exact record, model, evidence and limitations without implying current execution or approval', () => {
  const html = render();
  for (const value of [row.id, row.model, row.provider, 'synthetic-source', row.body.summary, row.body.limitations[0], 'E1', 'شرکت اصلی', 'میلیون ریال', 'شرط ابطال', 'پایه', 'مساعد', 'نامساعد']) assert.ok(html.includes(value), value);
  assert.ok(html.includes('وضعیت اجرای فعلی'));
  assert.ok(html.includes('نیازمند تطبیق'));
  assert.ok(html.includes('به معنی صحت مالی، تأیید یا انتشار نیست'));
  assert.doesNotMatch(html, /واقعیت گزارش‌شده|<button|<form/);
  assert.match(html, /href="#research-workbook"/);
  assert.match(html, /href="https:\/\/codal.ir\/report"[^>]*rel="noopener noreferrer"/);
});

test('missing source clocks remain unknown and collection, research read and draft creation have distinct labels', () => {
  const unknown = { ...row, provenance: [{ ...row.provenance[0], publishedAt: null, capturedAt: null, fetchedAt: null }] };
  const html = render({ ...view, drafts: [unknown] });
  for (const label of ['انتشار منبع: نامعلوم', 'دریافت و ثبت منبع: نامعلوم', 'خواندن برای پژوهش: نامعلوم', 'ثبت پیش‌نویس:']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('شمارهٔ نسخهٔ کاربرگ ندارد'));
});

test('unavailable, empty and invalid records remain visibly different outcomes', () => {
  const unavailable = render({ drafts: [], invalidCount: 0, unavailableReason: 'خواندن اکنون ممکن نیست' });
  assert.ok(unavailable.includes('خواندن اکنون ممکن نیست'));
  assert.ok(!unavailable.includes('پیش‌نویس قابل نمایش وجود ندارد'));
  assert.ok(render({ drafts: [], invalidCount: 0, unavailableReason: null }).includes('پیش‌نویس قابل نمایش وجود ندارد'));
  const invalid = render({ ...view, invalidCount: 2 });
  assert.ok(invalid.includes('۲ رکورد به دلیل ساختار نامعتبر'));
  assert.ok(invalid.includes(row.id));
});

test('untrusted stored prose is rendered as text', () => {
  const html = render({ ...view, drafts: [{ ...row, body: { ...row.body, summary: '<script>private()</script>' } }] });
  assert.ok(html.includes('&lt;script&gt;private()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>private()'));
});

function loadModule(path: string, bindings: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, { exports, require(name: string) {
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === 'react') return React;
    if (name in bindings) return bindings[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}

test('the dynamic research page reads through the existing server reader and keeps the independent workbook', async () => {
  let reads = 0;
  const Workbook = () => null;
  const page = loadModule('../../app/(protected)/admin/research/page.tsx', {
    '@/components/admin/ResearchWorkbook': { default: Workbook },
    '@/components/admin/ResearchCaseFiles': { default: ResearchCaseFiles },
    '@/lib/intelligence/research-drafts-view': { loadResearchDraftsView: async () => { reads++; return view; } },
  });
  assert.equal(page.dynamic, 'force-dynamic');
  const tree = (page.default as () => React.ReactElement)();
  const children = (tree.props as { children: React.ReactElement[] }).children;
  const suspense = children[0].props as { children: React.ReactElement };
  const loaded = await (suspense.children.type as () => Promise<React.ReactElement>)();
  assert.equal(reads, 1);
  assert.equal(loaded.type, ResearchCaseFiles);
  assert.equal((loaded.props as { view: ResearchDraftsView }).view, view);
  assert.equal((children[1].props as { id: string }).id, 'research-workbook');
  assert.equal(((children[1].props as { children: React.ReactElement }).children).type, Workbook);
});

for (const role of ['guest', 'member', 'admin']) test(`existing admin layout keeps ${role} access behavior for the connected page`, async () => {
  let profileReads = 0;
  const Shell = () => null;
  const layout = loadModule('../../app/(protected)/admin/layout.tsx', {
    'next/navigation': { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    '@/components/admin/AdminShell': { default: Shell },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: role === 'guest' ? null : { id: 'synthetic-user' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { profileReads++; return { data: { role } }; } }) }) }),
    }) },
  });
  const invoke = layout.default as (props: { children: React.ReactNode }) => Promise<React.ReactElement>;
  if (role === 'admin') {
    const tree = await invoke({ children: 'protected research' });
    assert.equal(tree.type, Shell);
    assert.equal((tree.props as { children: string }).children, 'protected research');
  } else {
    await assert.rejects(invoke({ children: 'protected research' }), new RegExp(role === 'guest' ? 'redirect:/login' : 'redirect:/dashboard'));
  }
  assert.equal(profileReads, role === 'guest' ? 0 : 1);
});
