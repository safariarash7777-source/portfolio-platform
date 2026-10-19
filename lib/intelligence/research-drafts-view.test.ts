import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { withDeadline } from '../deadline';
import { validateResearchDraft } from './research-agent';
import type { ResearchDraftsView } from './research-drafts-view';

const compiled = ts.transpileModule(readFileSync(new URL('./research-drafts-view.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(stage = '', role = 'admin', rows: unknown[] | null = []) {
  let release!: (value?: unknown) => void;
  const blocked = new Promise(resolve => { release = resolve; });
  const calls: string[] = [];
  const wait = async (name: string) => { if (stage === name) await blocked; };
  const client = {
    auth: { getUser: async () => { await wait('auth'); return { data: { user: { id: 'synthetic-admin' } }, error: null }; } },
    from(table: string) {
      calls.push(table);
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query, abortSignal: () => query,
        maybeSingle: async () => { await wait('profile'); return { data: { role }, error: null }; },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return wait('drafts').then(() => resolve({ data: rows, error: stage === 'error' ? { message: 'private diagnostic' } : null }), reject);
        },
      };
      return query;
    },
  };
  const exports = {} as { loadResearchDraftsView(): Promise<ResearchDraftsView> };
  runInNewContext(compiled, { exports, URL, require(name: string) {
    if (name === 'server-only') return {};
    if (name === '@/lib/supabase/server') return { createClient: async () => { await wait('client'); return client; } };
    if (name === '@/lib/intelligence/research-agent') return { validateResearchDraft };
    if (name === '@/lib/deadline') return { withDeadline: (fn: (signal: AbortSignal) => Promise<unknown>, ms: number) => { assert.equal(ms, 4000); return withDeadline(fn, 15); } };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { read: exports.loadResearchDraftsView, calls, release: () => release() };
}
for (const stage of ['client', 'auth', 'profile', 'drafts']) test(`hung ${stage} returns unavailable; late response cannot resume protected reads`, async () => {
  const h = harness(stage);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([h.read(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 100); })]);
  clearTimeout(timer);
  assert.ok(result, 'reader must settle before watchdog');
  assert.ok(result.unavailableReason);
  assert.equal(result.drafts.length, 0);
  const calls = h.calls.length;
  h.release();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.calls.length, calls);
  assert.ok(result.unavailableReason);
});
test('non-admin cannot query drafts; empty success is distinct from transport error or null data', async () => {
  const denied = harness('', 'member');
  assert.ok((await denied.read()).unavailableReason);
  assert.deepEqual(denied.calls, ['profiles']);
  assert.equal((await harness().read()).unavailableReason, null);
  for (const h of [harness('error'), harness('', 'admin', null)]) {
    const result = await h.read();
    assert.ok(result.unavailableReason);
    assert.ok(!result.unavailableReason.includes('private diagnostic'));
  }
});
test('valid stored draft and invalid row stay distinguishable', async () => {
  const body = { summary: 'بررسی کیفی', claims: [{ kind: 'FACT', text: 'مشاهده نیازمند بازبینی', evidence: ['E1'] }], scenarios: ['base', 'upside', 'downside'].map(label => ({ label, text: 'سناریوی مشروط', invalidation: 'تغییر شرایط', evidence: ['E1'] })), limitations: ['نیازمند بازبینی انسانی'] };
  const row = { id: 'synthetic-draft', created_at: '2026-10-19T12:00:00Z', provider: 'openai-codex', model: 'gpt-6.1-sol', status: 'draft', body, provenance: [{ evidence: 'E1', symbol: 'نمونه', reportId: 'synthetic-report', sourceUrl: 'https://codal.ir/report', periodEnd: '1405-03-31', periodMonths: 3, publishedAt: null, fetchedAt: null, capturedAt: null, unit: 'ریال', scope: 'company' }] };
  const result = await harness('', 'admin', [row, { ...row, status: 'published' }]).read();
  assert.equal(result.unavailableReason, null);
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].id, row.id);
  assert.equal(result.invalidCount, 1);
});
