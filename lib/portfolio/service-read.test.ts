import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";

// Use Next's server-only alias in this isolated module test, without a live backend.
const require = createRequire(import.meta.url);
const resolver = Module as unknown as { _resolveFilename: (specifier: string, ...args: unknown[]) => string };
const original = resolver._resolveFilename;
resolver._resolveFilename = function (specifier, ...args) {
  return specifier === "server-only" ? require.resolve("next/dist/compiled/server-only/empty.js") : original.call(this, specifier, ...args);
};

test("portfolio reader never turns a lost session or Auth outage into an empty recorded portfolio", async () => {
  const { loadPortfolioSnapshot } = await import("./service");
  type Client = Awaited<ReturnType<typeof import("../supabase/server").createClient>>;
  for (const response of [
    { data: { user: null }, error: null },
    { data: { user: null }, error: { status: 503 } },
    { data: { user: { id: "synthetic-owner" } }, error: { status: 429 } },
  ]) {
    let queries = 0;
    const client = { auth: { getUser: async () => response }, from: () => { queries++; throw new Error("unexpected query"); } } as unknown as Client;
    const snapshot = await loadPortfolioSnapshot(undefined, async () => client);
    assert.equal(snapshot.ready, false);
    assert.equal(snapshot.holdingsState, "error");
    assert.equal(snapshot.targetState, "error");
    assert.equal(snapshot.holdings, null);
    assert.equal(queries, 0);
  }
  const transport = await loadPortfolioSnapshot(undefined, async () => { throw new Error("synthetic transport outage"); });
  assert.equal(transport.ready, false);
  assert.equal(transport.holdingsState, "error");
});

type Client = Awaited<ReturnType<typeof import("../supabase/server").createClient>>;
type Reply = { data: Record<string, unknown>[] | Record<string, unknown> | null; error: unknown };
const version = "11111111-1111-4111-8111-111111111111";
const otherVersion = "22222222-2222-4222-8222-222222222222";
const storedPosition = { version_id: version, position_key: "owned", symbol: null, manual_label: "synthetic", asset_class: "gold",
  qty: null, unit: "قلم", cost_basis: null, as_of: "2026-10-19", title: null, ownership_pct: 50, valuation_mode: "declared",
  declared_value: 2000000, valuation_source: "synthetic", valuation_as_of: "2026-10-19", valuation_status: "valid" };
const immediate = () => new Promise<void>(resolve => setImmediate(resolve));

function readerFixture(hanging?: string) {
  const tables: string[] = [], filters: [string, string, unknown][] = [], signals: AbortSignal[] = [];
  let authCalls = 0, resolveLate!: (value: Reply) => void, rejectLate!: (error: Error) => void;
  const pending = new Promise<Reply>((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
  const replies: Record<string, Reply> = {
    member_holding_versions: { data: [{ id: version, user_id: "owner", version: 2, note: null, created_at: "2026-10-19T10:00:00Z" },
      { id: otherVersion, user_id: "other", version: 99 }], error: null },
    member_holding_positions: { data: [storedPosition, { ...storedPosition, version_id: otherVersion, position_key: "foreign" }], error: null },
    portfolio_versions: { data: [{ id: "target", user_id: "owner", version: 1, allocations: [] }], error: null },
    member_debt_positions: { data: [{ version_id: version, debt_key: "debt", title: "synthetic", kind: "loan", balance_toman: 200000,
      currency: "IRR", balance_as_of: "2026-10-19", next_installment_toman: 10000, next_due_on: "2026-10-20", note: null }], error: null },
    symbol_history: { data: [{ symbol: "فملی", trade_date: "2026-10-19", close: 1000, last_price: null, source: "synthetic" }], error: null },
    member_investment_scope_reviews: { data: null, error: null },
  };
  const client = {
    auth: { async getUser() { authCalls++; if (hanging === "auth") await pending; return { data: { user: { id: "owner" } }, error: null }; } },
    from(table: string) {
      tables.push(table);
      const equals: [string, unknown][] = []; let single = false;
      const query = {
        select: () => query, order: () => query, limit: () => query,
        eq: (field: string, value: unknown) => { filters.push([table, field, value]); equals.push([field, value]); return query; },
        in: () => query, maybeSingle: () => { single = true; return query; },
        abortSignal: (signal: AbortSignal) => { signals.push(signal); return query; },
        then(resolve: (value: Reply) => unknown, reject?: (reason: unknown) => unknown) {
          if (table === hanging) return pending.then(resolve, reject);
          const result = replies[table]; assert.ok(result, table);
          const data = Array.isArray(result.data) ? result.data.filter(row => equals.every(([key, value]) => row[key] === value)) : result.data;
          return Promise.resolve({ ...result, data: single && Array.isArray(data) ? data[0] ?? null : data }).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as Client;
  return { client, tables, filters, signals, replies, resolveLate, rejectLate, authCalls: () => authCalls,
    connect: async () => { if (hanging === "connect") await pending; return client; } };
}

for (const stage of ["connect", "auth", "member_holding_versions", "member_holding_positions", "portfolio_versions"]) test(`actual snapshot reader bounds ${stage} without late query chains or lost known holdings`, async t => {
  const { loadPortfolioSnapshot } = await import("./service");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const f = readerFixture(stage);
    let settled = false;
    const pending = loadPortfolioSnapshot(undefined, f.connect).then(value => { settled = true; return value; });
    await immediate(); t.mock.timers.tick(9999); await immediate(); assert.equal(settled, false);
    t.mock.timers.tick(1); await immediate(); assert.equal(settled, true);
    const result = await pending, frozen = JSON.stringify(result), tablesBefore = [...f.tables];
    if (stage === "portfolio_versions") {
      assert.equal(result.ready, true); assert.equal(result.targetState, "error");
      assert.equal(result.holdings?.positions[0].declaredValue, 2000000);
      assert.equal(result.holdings?.positions[0].ownershipPct, 50); assert.equal(result.history.length, 1);
    } else {
      assert.equal(result.ready, false); assert.equal(result.holdingsState, "error"); assert.equal(result.holdings, null);
      assert.equal(result.history.length, stage === "member_holding_positions" ? 1 : 0);
    }
    if (f.signals.length) assert.ok(f.signals.every(signal => signal.aborted));
    if (stage === "portfolio_versions") f.resolveLate({ data: { id: "late-target", version: 3, allocations: [] }, error: null });
    else f.resolveLate({ data: [storedPosition], error: null });
    await immediate();
    assert.equal(JSON.stringify(result), frozen, "late completion must never mutate the returned fallback");
    assert.deepEqual(f.tables, tablesBefore, "no later read starts after the budget expires");
    if (stage === "connect") assert.equal(f.authCalls(), 0);
  } finally { t.mock.timers.reset(); }
});

for (const stage of ["member_debt_positions", "symbol_history", "member_investment_scope_reviews"]) test(`actual ${stage} reader ignores late transport and retains its explicit error contract`, async t => {
  const { loadVersionDebts, loadPriceRows } = await import("./service");
  const { loadInvestmentScope } = await import("./scopeService");
  const { buildBalanceSheet, positionFromStored } = await import("./balanceSheet");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const f = readerFixture(stage), holding = { id: version, version: 2, positions: [positionFromStored(storedPosition)] };
    const pending = stage === "member_debt_positions" ? loadVersionDebts(version, f.connect)
      : stage === "symbol_history" ? loadPriceRows([{ ...holding.positions[0], symbol: "فملی", manualLabel: null, qty: 1, unit: "سهم", valuationMode: "market" }], f.connect)
      : loadInvestmentScope(holding, f.connect);
    await immediate(); t.mock.timers.tick(10000); const result = await pending;
    const frozen = JSON.stringify(result);
    assert.ok(f.signals[0].aborted);
    if ("debts" in result) {
      assert.equal(result.ready, false);
      const sheet = buildBalanceSheet({ positions: holding.positions, debts: result.debts, priceRows: [], now: new Date("2026-10-19"), recorded: true, assetsReady: true, debtsReady: result.ready });
      assert.equal(sheet.assetValue, 1000000); assert.equal(sheet.debtValue, null); assert.equal(sheet.netWorth, null);
    } else { assert.equal(result.status, "error"); }
    f.rejectLate(new Error("synthetic late reader rejection")); await immediate();
    assert.equal(JSON.stringify(result), frozen);
    if (stage === "member_investment_scope_reviews") {
      assert.ok(f.filters.some(([, key, value]) => key === "user_id" && value === "owner"));
      assert.ok(f.filters.some(([, key, value]) => key === "holding_version_id" && value === version));
    }
  } finally { t.mock.timers.reset(); }
});

test("actual member readers retain owned canonical success, empty debt and foreign-version contracts", async () => {
  const { loadPortfolioSnapshot, loadVersionDebts } = await import("./service");
  const f = readerFixture(), result = await loadPortfolioSnapshot(undefined, f.connect);
  assert.equal(result.ready, true); assert.equal(result.holdings?.version, 2);
  assert.deepEqual(result.holdings?.positions.map(p => p.positionKey), ["owned"]);
  assert.equal(result.targetState, "ready"); assert.equal(result.history.length, 1);
  assert.ok(f.filters.some(([table, key, value]) => table === "member_holding_versions" && key === "user_id" && value === "owner"));
  assert.ok(f.filters.some(([table, key, value]) => table === "portfolio_versions" && key === "user_id" && value === "owner"));
  const foreign = await loadPortfolioSnapshot(otherVersion, f.connect);
  assert.equal(foreign.ready, false); assert.equal(foreign.holdingsState, "not_found");
  const debt = await loadVersionDebts(version, f.connect);
  assert.equal(debt.debts[0].balance_toman, 200000); assert.equal(debt.debts[0].next_installment_toman, 10000);
  f.replies.member_debt_positions = { data: [], error: null };
  assert.deepEqual(await loadVersionDebts(version, f.connect), { ready: true, debts: [] });
});
