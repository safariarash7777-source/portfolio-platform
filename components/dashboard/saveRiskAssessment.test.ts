import test from "node:test";
import assert from "node:assert/strict";
import { saveRiskAssessment } from "./saveRiskAssessment";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as format from "../../lib/format";

const row = { id: "synthetic-row", total_score: 40, risk_category: "test", created_at: "2026-10-11T00:00:00Z" };

test("only a persisted risk row confirms saving; existing result is returned intact", async () => {
  assert.equal(await saveRiskAssessment(async () => ({ data: row, error: null })), row);
});

test("RLS/service errors and an empty returning response do not confirm success", async () => {
  for (const response of [{ data: row, error: { code: "42501" } }, { data: null, error: null }]) {
    assert.equal(await saveRiskAssessment(async () => response), null);
  }
});

test("a transport failure is surfaced as unconfirmed without automatic resubmission", async () => {
  let attempts = 0;
  const result = await saveRiskAssessment(async () => { attempts++; throw new Error("transport"); });
  assert.equal(result, null);
  assert.equal(attempts, 1);
});

// Execute the routed dashboard component's real handler, with SDK/React seams only.
function dashboard(response: Promise<{ data: typeof row | null; error: unknown }>, clientUnavailable = false) {
  const states: unknown[] = [null, true, false, false];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0, refIndex = 0, inserts = 0, refreshes = 0;
  let payload: unknown;
  const loaded = { exports: {} as { default: (props: unknown) => unknown } };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  runInNewContext(ts.transpileModule(readFileSync(new URL("../../app/(protected)/dashboard/DashboardClient.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports: loaded.exports, require: (name: string) => {
    if (name === "react") return {
      useState: (initial: unknown) => { const index = stateIndex++; if (states[index] === undefined) states[index] = initial; return [states[index], (value: unknown) => { states[index] = value; }]; },
      useRef: (initial: unknown) => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
      useCallback: (fn: unknown) => fn,
    };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "next/navigation") return { useRouter: () => ({ refresh: () => refreshes++ }) };
    if (name === "@/components/dashboard/saveRiskAssessment") return { saveRiskAssessment };
    if (name === "@/lib/supabase/client") return { createClient: () => { if (clientUnavailable) throw new Error("SDK initialization unavailable"); return ({ from: (table: string) => {
      assert.equal(table, "risk_assessments");
      return { insert: (value: unknown) => { inserts++; payload = value; return { select: () => ({ maybeSingle: () => response }) }; } };
    } }); } };
    if (name === "@/components/quiz/RiskProfileQuiz") return { default: "ExistingQuiz", __esModule: true };
    return { default: () => null, __esModule: true };
  } });
  const tree = loaded.exports.default({ userId: "synthetic-member", assessment: null }) as { props: { children: { type: unknown; props: { onComplete?: (s: number, c: string, a: Record<number, number>) => Promise<void> } }[] } };
  const complete = tree.props.children.find(child => child?.type === "ExistingQuiz")!.props.onComplete!;
  return { complete, states, refs, get inserts() { return inserts; }, get payload() { return payload; }, get refreshes() { return refreshes; } };
}

test("dashboard preserves failed answers and existing state, without logging or refreshing a false success", async () => {
  const ui = dashboard(Promise.resolve({ data: null, error: { code: "42501" } }));
  const answers = { 1: 3, 2: 4 };
  await ui.complete(7, "test", answers);
  assert.equal(ui.states[0], null);
  assert.equal(ui.states[1], true);
  assert.equal(ui.states[3], true);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.refs[1].current)), { score: 7, category: "test", answers });
  assert.equal(ui.refreshes, 0);
});

test("dashboard appends using its authenticated member and blocks simultaneous duplicate submissions", async () => {
  let finish!: (value: { data: typeof row; error: null }) => void;
  const ui = dashboard(new Promise(resolve => { finish = resolve; }));
  const first = ui.complete(40, "test", { 1: 4 });
  await ui.complete(40, "test", { 1: 4 });
  assert.equal(ui.inserts, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.payload)), { user_id: "synthetic-member", total_score: 40, risk_category: "test", answers_json: { 1: 4 } });
  finish({ data: row, error: null });
  await first;
  assert.equal(ui.states[0], row);
  assert.equal(ui.states[1], false);
  assert.equal(ui.refs[1].current, null);
  assert.equal(ui.refreshes, 1);
});

test("dashboard displays SDK initialization failure and preserves answers without a request", async () => {
  const ui = dashboard(Promise.resolve({ data: null, error: null }), true);
  const answers = { 1: 2 };
  await ui.complete(2, "test", answers);
  assert.equal(ui.states[3], true);
  assert.equal(ui.states[1], true);
  assert.equal(ui.inserts, 0);
  assert.equal(ui.refreshes, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.refs[1].current)), { score: 2, category: "test", answers });
});

// Routed dashboard financial read-state regressions; included by the existing core test entry.
type Props = Record<string, unknown>;
type Result = { data: unknown; error: { code: string } | null };
const holding = { id: 'h', symbol: 'SYN', name: 'دارایی سالم', asset_class: 'equity', qty: 2, avg_price: 900, current_price: 1000, day_change_pct: 2 };
const portfolio = { id: 'p', allocations: [{ asset: 'هدف سالم', pct: 100 }], created_at: '2026-10-13T10:00:00Z' };
const snapshots = [{ as_of: '2026-10-12', value: 1000 }, { as_of: '2026-10-13', value: 2000 }];
const transaction = { id: 't', type: 'ثبت سالم', instrument: 'تراکنش سالم', amount: 10, occurred_at: '2026-10-13', status: 'done' };
const assessment = { id: 'a', total_score: 40, risk_category: 'synthetic', created_at: '2026-10-13T10:00:00Z' };
const ok = (data: unknown): Result => ({ data, error: null });
function fixture(): Record<string, Result> {
  return { profiles: ok({ full_name: 'عضو نمونه', role: 'user' }), risk_assessments: ok(assessment), risk_history: ok([]),
    portfolios: ok(portfolio), portfolio_versions: ok([portfolio, { ...portfolio, id: 'older' }]), holdings: ok([holding]),
    portfolio_snapshots: ok(snapshots), transactions: ok([transaction]), telegram_links: ok({ user_id: 'member' }),
    payments: ok({ status: 'paid', invite_link: 'https://example.invalid/channel', ref_id: 'synthetic' }), risk_revalidations: ok(null), announcements: ok([]), announcement_deliveries: ok([]) };
}
async function render(results = fixture()) {
  const loaded = new Map<string, { exports: { default?: unknown } }>();
  const leaf = (name: string) => function FinancialLeaf(props: Props) { return React.createElement('output', { 'data-component': name },
    name === 'KpiCard' ? `${props.label}: ${props.value}` : ['PerformanceChart', 'AllocationDonut'].includes(name) ? JSON.stringify(props.data) : name === 'HoldingsTable' ? 'دارایی سالم' : name); };
  function load(file: string): unknown {
    const cached = loaded.get(file); if (cached) return cached.exports.default;
    const compiledModule = { exports: {} as { default?: unknown } }; loaded.set(file, compiledModule);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { exports: compiledModule.exports, process: { env: {} }, require(name: string) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') { const jsx = (type: React.ElementType, props: Props, key?: string) => React.createElement(type, { ...props, key }); return { jsx, jsxs: jsx, Fragment: React.Fragment }; }
      if (name === 'next/navigation') return { useRouter: () => ({ refresh() {} }), redirect() { throw Error('Unexpected redirect'); } };
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => React.createElement('i') });
      if (name === '@/lib/format') return format;
      if (name === '@/components/quiz/quizData') return { RISK_PROFILES: {} };
      if (name === '@/lib/access') return { getAccess: async () => ({ level: 'full', standing: 'active' }) };
      if (name === '@/lib/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'member', email: 'synthetic@example.invalid' } } }) }, from(table: string) {
        let selected = ''; const query = { select(columns: string) { selected = columns; return query; }, eq() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return query; }, not() { return query; },
          then(resolve: (r: Result) => unknown) { const key = table === 'risk_assessments' && selected !== '*' ? 'risk_history' : table === 'portfolios' && selected !== '*' ? 'portfolio_versions' : table; assert.ok(results[key], key); return Promise.resolve(resolve(results[key])); } }; return query;
      } }) };
      if (name === '@/lib/supabase/client') return { createClient() { throw Error('No client writes in render test'); } };
      const actual: Record<string, string> = { './DashboardClient': 'app/(protected)/dashboard/DashboardClient.tsx', '@/components/dashboard/LivePortfolio': 'components/dashboard/LivePortfolio.tsx', '@/components/dashboard/AccessCards': 'components/dashboard/AccessCards.tsx', '@/components/dashboard/ReadError': 'components/dashboard/ReadError.tsx', './ReadError': 'components/dashboard/ReadError.tsx' };
      if (actual[name]) return { __esModule: true, default: load(actual[name]) };
      return { __esModule: true, default: leaf(name.split('/').at(-1)!) };
    } });
    return compiledModule.exports.default;
  }
  const page = load('app/(protected)/dashboard/page.tsx') as () => Promise<ReactNode>;
  return renderToStaticMarkup(await page());
}

test('healthy financial data renders current holdings, history, target and channel without alerts', async () => {
  const html = await render(); assert.doesNotMatch(html, /role="alert"/); assert.match(html, /دارایی سالم/); assert.match(html, /ارزش کل دارایی/); assert.match(html, /هدف سالم/); assert.match(html, /PerformanceChart/); assert.match(html, /example.invalid\/channel/);
});
test('genuinely empty successful reads retain empty and waiting states without errors', async () => {
  const f = fixture(); for (const key of ['holdings', 'portfolio_snapshots', 'transactions', 'portfolio_versions']) f[key] = ok([]); f.portfolios = ok(null); f.payments = ok(null);
  const html = await render(f); assert.doesNotMatch(html, /role="alert"/); assert.match(html, /پرتفوی زنده‌ی شما هنوز خالی است/); assert.match(html, /در انتظار/);
});
for (const [key, label, missing] of [
  ['holdings', 'دارایی‌ها', 'ارزش کل دارایی'], ['portfolio_snapshots', 'روند ارزش سبد', 'data-component="PerformanceChart"'],
  ['portfolios', 'سبد تخصیص‌یافته', 'در انتظار تخصیص'], ['portfolio_versions', 'سابقهٔ نسخه‌های سبد', 'data-component="PortfolioVersionHistory"'],
  ['transactions', 'تراکنش‌های اخیر', 'تراکنش سالم'], ['payments', 'وضعیت پرداخت', 'example.invalid/channel'],
] as const) test(`${key} failure is an alert, never a successful empty financial section`, async () => {
  const f = fixture(); f[key] = { data: null, error: { code: '42501' } }; const html = await render(f);
  assert.match(html, new RegExp(`دریافت ${label} انجام نشد`)); assert.doesNotMatch(html, new RegExp(missing)); assert.doesNotMatch(html, /پرتفوی زنده‌ی شما هنوز خالی است/);
  if (key !== 'holdings') assert.match(html, /دارایی سالم/);
  if (key !== 'portfolio_snapshots') assert.match(html, /data-component="PerformanceChart"/);
  if (key !== 'payments') assert.match(html, /example.invalid\/channel/);
});
test('holdings failure preserves a healthy snapshot chart and transactions, without zero-value holdings KPIs', async () => {
  const f = fixture(); f.holdings = { data: [], error: { code: '503' } }; const html = await render(f);
  assert.match(html, /PerformanceChart/); assert.match(html, /تراکنش سالم/); assert.doesNotMatch(html, /ارزش کل دارایی|تعداد دارایی|تخصیص دارایی/);
});
test('snapshot failure preserves holdings while suppressing period-return fallback and chart', async () => {
  const f = fixture(); f.portfolio_snapshots = { data: [], error: { code: '503' } }; const html = await render(f);
  assert.match(html, /ارزش کل دارایی/); assert.match(html, /دارایی سالم/); assert.doesNotMatch(html, /بازده دوره|PerformanceChart/);
});
test('simultaneous holdings and snapshot failures retain healthy transactions and risk assessment', async () => {
  const f = fixture(); f.holdings = { data: null, error: { code: '503' } }; f.portfolio_snapshots = { data: null, error: { code: '503' } }; const html = await render(f);
  assert.match(html, /تراکنش سالم/); assert.match(html, /دریافت دارایی‌ها انجام نشد/); assert.match(html, /دریافت روند ارزش سبد انجام نشد/); assert.doesNotMatch(html, /هنوز خالی|ارزش کل دارایی/);
});
test('failed reads with residual rows cannot render those rows as confirmed financial data', async () => {
  const f = fixture(); f.holdings.error = { code: '503' }; f.payments.error = { code: '503' }; const html = await render(f);
  assert.doesNotMatch(html, /دارایی سالم|ارزش کل دارایی|example.invalid\/channel/); assert.match(html, /دریافت دارایی‌ها انجام نشد/);
});
test('empty successful snapshot history cannot use a failed holdings read as a period-value fallback', async () => {
  const f = fixture(); f.holdings.error = { code: '503' }; f.portfolio_snapshots = ok([]); const html = await render(f);
  assert.match(html, /دریافت دارایی‌ها انجام نشد/); assert.doesNotMatch(html, /بازده دوره|ارزش کل دارایی|تعداد دارایی/);
});
test('portfolio read error remains visible when a genuine risk assessment is not yet present', async () => {
  const f = fixture(); f.risk_assessments = ok(null); f.portfolios = { data: null, error: { code: '503' } }; const html = await render(f);
  assert.match(html, /دریافت سبد تخصیص‌یافته انجام نشد/); assert.match(html, /دارایی سالم/); assert.doesNotMatch(html, /در انتظار تخصیص/);
});
test('genuinely empty holdings/history remain empty when transactions fail, with a separate error instead of zero KPIs', async () => {
  const f = fixture(); f.holdings = ok([]); f.portfolio_snapshots = ok([]); f.transactions = { data: null, error: { code: '503' } }; const html = await render(f);
  assert.match(html, /پرتفوی زنده‌ی شما هنوز خالی است/); assert.match(html, /دریافت تراکنش‌های اخیر انجام نشد/); assert.doesNotMatch(html, /ارزش کل دارایی|تعداد دارایی/);
});
test('healthy transactions remain visible alongside genuinely empty holdings and history', async () => {
  const f = fixture(); f.holdings = ok([]); f.portfolio_snapshots = ok([]); const html = await render(f);
  assert.match(html, /پرتفوی زنده‌ی شما هنوز خالی است/); assert.match(html, /تراکنش سالم/); assert.doesNotMatch(html, /ارزش کل دارایی|تعداد دارایی/);
});
