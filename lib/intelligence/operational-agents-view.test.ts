import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { OperationalAgentsView, OperationalRole, OperationalState } from './operational-agents-view';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const PRIVATE_ERROR = 'synthetic-private-database-diagnostic';
const compiled = ts.transpileModule(readFileSync(new URL('./operational-agents-view.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Execute the real reader with strict synthetic dependencies; no SDK or network is loaded. */
function harness(options: {
  user?: boolean; role?: string | null; authError?: boolean; profileError?: boolean;
  queryError?: boolean; createThrows?: boolean; rows?: unknown[];
} = {}) {
  const calls: { table: string; operation: string; arguments: unknown[] }[] = [];
  let clients = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: 'synthetic-admin' } }, error: options.authError ? { message: PRIVATE_ERROR } : null }) },
    from(table: string) {
      calls.push({ table, operation: 'from', arguments: [] });
      const query = {
        select(columns: string) { calls.push({ table, operation: 'select', arguments: [columns] }); return query; },
        eq(column: string, value: string) { calls.push({ table, operation: 'eq', arguments: [column, value] }); return query; },
        maybeSingle: async () => ({ data: { role: options.role === undefined ? 'admin' : options.role }, error: options.profileError ? { message: PRIVATE_ERROR } : null }),
        order(column: string, order: { ascending: boolean }) { calls.push({ table, operation: 'order', arguments: [column, order.ascending] }); return query; },
        limit: async (limit: number) => {
          calls.push({ table, operation: 'limit', arguments: [limit] });
          return { data: options.rows ?? [], error: options.queryError ? { message: PRIVATE_ERROR } : null };
        },
      };
      return query;
    },
  };
  const mod = { exports: {} as { loadOperationalAgentsView: (now?: number) => Promise<OperationalAgentsView> } };
  runInNewContext(compiled, {
    exports: mod.exports,
    require(name: string) {
      if (name === 'server-only') return {};
      if (name === '@/lib/supabase/server') return { createClient: async () => {
        clients++;
        if (options.createThrows) throw new Error(PRIVATE_ERROR);
        return client;
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { read: (now = NOW) => mod.exports.loadOperationalAgentsView(now), calls, clients: () => clients };
}

function record(role: OperationalRole, status: OperationalState = 'ok', offsetMs = 0) {
  return {
    id: 'synthetic-run', run_key: 'synthetic-key', role, status,
    created_at: new Date(NOW + offsetMs).toISOString(),
    report: { summary: 'بررسی انجام شد', checks: [{ key: 'source', label: 'منبع', state: status, detail: 'جزئیات بررسی' }], actions: [] },
  };
}

test('anonymous, non-admin, missing role and auth/profile errors cannot read operational records', async () => {
  for (const options of [{ user: false }, { role: 'member' }, { role: null }, { authError: true }, { profileError: true }]) {
    const h = harness(options);
    const view = await h.read();
    assert.ok(view.unavailableReason);
    assert.ok(view.agents.every(agent => agent.state === 'unknown' && agent.report === null));
    assert.equal(h.calls.some(call => call.table === 'site_agent_runs'), false);
    assert.equal(JSON.stringify(view).includes(PRIVATE_ERROR), false);
  }
});

test('admin reads newest bounded records and selects only the latest per role', async () => {
  const h = harness({ rows: [record('data_quality', 'failed'), record('data_quality', 'ok', -1000), record('site_monitor')] });
  const view = await h.read();
  assert.equal(view.unavailableReason, null);
  assert.equal(view.agents.find(agent => agent.role === 'data_quality')?.state, 'failed');
  assert.equal(view.agents.find(agent => agent.role === 'coordinator')?.state, 'unknown');
  assert.deepEqual(h.calls.filter(call => call.table === 'site_agent_runs' && call.operation === 'limit').map(call => call.arguments), [[60]]);
  assert.deepEqual(h.calls.filter(call => call.table === 'site_agent_runs' && call.operation === 'order').map(call => call.arguments), [['created_at', false], ['id', false]]);
  assert.ok(h.calls.some(call => call.table === 'profiles' && call.operation === 'eq' && call.arguments[0] === 'id' && call.arguments[1] === 'synthetic-admin'));
});

test('future clock skew up to two minutes is tolerated; larger skew is unknown', async () => {
  for (const offset of [1, 119_999, 120_000, 120_001]) {
    const view = await harness({ rows: [record('data_quality', 'ok', offset)] }).read();
    const agent = view.agents[0];
    assert.equal(agent.state, offset <= 120_000 ? 'ok' : 'unknown');
    assert.equal(agent.heartbeatStale, false);
    assert.equal(agent.report === null, offset > 120_000);
  }
});
test('source evidence clocks remain distinct from report creation and invalid clocks are rejected', async () => {
  const lastAt = new Date(NOW - 86_400_000).toISOString();
  const row = { ...record('data_quality', 'stale'), report: { summary: 'گزارش', checks: [{ key: 'source', label: 'زمان منبع', state: 'stale', detail: 'زمان قیمت قدیمی است', lastAt }], actions: [] } };
  const view = await harness({ rows: [row] }).read();
  assert.equal(view.agents[0].report?.checks[0].lastAt, lastAt);
  assert.notEqual(view.agents[0].createdAt, lastAt);
  row.report.checks[0].lastAt = 'invalid';
  assert.equal((await harness({ rows: [row] }).read()).agents[0].report, null);
});

test('heartbeat becomes stale only after thirty minutes and preserves failed or unknown results', async () => {
  const edge = await harness({ rows: [record('data_quality', 'ok', -30 * 60_000)] }).read();
  assert.equal(edge.agents[0].state, 'ok');
  assert.equal(edge.agents[0].heartbeatStale, false);
  const stale = await harness({ rows: [record('data_quality', 'ok', -30 * 60_000 - 1), record('site_monitor', 'failed', -31 * 60_000), record('coordinator', 'unknown', -31 * 60_000)] }).read();
  assert.equal(stale.agents[0].state, 'stale');
  assert.equal(stale.agents[0].recordedState, 'ok');
  assert.equal(stale.agents[1].state, 'failed');
  assert.equal(stale.agents[2].state, 'unknown');
  assert.ok(stale.agents.every(agent => agent.heartbeatStale));
});

test('malformed newest report never falls back to an older healthy run', async () => {
  const invalid = [
    { ...record('data_quality'), report: null },
    { ...record('data_quality'), created_at: 'not-a-date' },
    { ...record('data_quality'), status: 'active' },
    { ...record('data_quality'), report: { ...record('data_quality').report, checks: [record('data_quality').report.checks[0], record('data_quality').report.checks[0]] } },
  ];
  for (const row of invalid) {
    const view = await harness({ rows: [row, record('data_quality', 'ok', -1000)] }).read();
    assert.equal(view.agents[0].state, 'unknown');
    assert.equal(view.agents[0].report, null);
    assert.ok(view.agents[0].unavailableReason);
  }
});

test('query errors and thrown setup errors expose only safe unavailable messages', async () => {
  for (const options of [{ queryError: true }, { createThrows: true }]) {
    const view = await harness(options).read();
    assert.ok(view.unavailableReason);
    assert.ok(view.agents.every(agent => agent.state === 'unknown' && agent.report === null));
    assert.equal(JSON.stringify(view).includes(PRIVATE_ERROR), false);
  }
});

test('invalid evaluation clock does not initialize a database client', async () => {
  const h = harness();
  const view = await h.read(Number.NaN);
  assert.ok(view.unavailableReason);
  assert.equal(h.clients(), 0);
});
