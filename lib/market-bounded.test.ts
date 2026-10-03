import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";

// Match Next's server-only build alias, without adding a dependency to the app.
const require = createRequire(import.meta.url);
const resolver = (Module as unknown as { _resolveFilename: (specifier: string, ...args: unknown[]) => string });
const resolve = resolver._resolveFilename;
resolver._resolveFilename = function(specifier, ...args) { return specifier === "server-only" ? require.resolve("next/dist/compiled/server-only/empty.js") : resolve.call(this, specifier, ...args); };

test("actual bounded readers preserve Iran rows/units/null/source clock through world failure and stale DB cache", async () => {
  const originalFetch = fetch, originalNow = Date.now;
  const saved = { ...process.env };
  let now = Date.parse("2026-09-30T10:00:00Z"), mode = "ready", requests = 0;
  Date.now = () => now;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public";
  delete process.env.IR_MARKET_RELAY_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sourceAt = now - 300000;
  const board = { fetchedAt: sourceAt, stocks: Array.from({ length: 760 }, (_, id) => ({ id: `synthetic${id}`, faName: "نمونه", price: 100, unit: "toman", sourceDate: "1405-07-09", sourceTime: "15:00:00", changePercent: null })), funds: Array.from({ length: 333 }, (_, id) => ({ id: `fund${id}`, faName: "نمونه", price: 100, unit: "toman", nav: null })), gold: [], currency: [], options: [], crypto: [] };
  globalThis.fetch = (async (input, init) => {
    requests++;
    const url = new URL(String(input));
    if (mode === "failed") return new Response(null, { status: 503 });
    if (url.hostname === "api.coingecko.com") return Response.json([{ id: "bitcoin", symbol: "btc", current_price: 100, price_change_percentage_24h: null, image: null }]);
    assert.equal(url.pathname, "/rest/v1/ir_market_snapshots");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-public");
    assert.equal(new Headers(init?.headers).get("Cookie"), null);
    return Response.json([{ payload: board }]);
  }) as typeof fetch;
  try {
    const { readGlobalMarket, readIranMarket } = await import("./market-bounded");
    const [global, iran] = await Promise.all([readGlobalMarket(), readIranMarket()]);
    assert.equal(iran.data?.stocks.length, 760); assert.equal(iran.data?.funds.length, 333);
    assert.equal(iran.data?.stocks[0].unit, "toman"); assert.equal(iran.data?.stocks[0].changePercent, null);
    assert.equal(iran.data?.funds[0].nav, null); assert.equal(iran.data?.stocks[0].sourceDate, "1405-07-09");
    assert.equal(iran.availability.sourceAt, sourceAt); assert.equal(global.availability.state, "ready");
    now += 600001; mode = "failed";
    const [staleGlobal, staleIran] = await Promise.all([readGlobalMarket(), readIranMarket()]);
    assert.equal(staleGlobal.availability.state, "stale"); assert.equal(staleIran.availability.state, "stale");
    assert.equal(staleGlobal.availability.sourceAt, global.availability.sourceAt);
    assert.equal(staleIran.availability.sourceAt, sourceAt);
    assert.equal(staleIran.data?.stocks.length, 760); assert.equal(staleGlobal.data.crypto.length, 1);
    const atFailure = requests; await Promise.all([readGlobalMarket(), readIranMarket()]);
    assert.equal(requests, atFailure, "failed sources cool down rather than spin");
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow; resolver._resolveFilename = resolve;
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "IR_MARKET_RELAY_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});

test("HTTP 200 cannot freshen old, missing, future or mixed price clocks", async t => {
  const originalFetch = fetch, originalNow = Date.now;
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "IR_MARKET_RELAY_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let now = Date.parse("2026-09-30T12:00:00Z");
  Date.now = () => now;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public";
  delete process.env.IR_MARKET_RELAY_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const row = { id: "synthetic", faName: "نمونه", price: 100, unit: "toman", changePercent: null, sourceDate: "1405-07-08", sourceTime: "15:30:00" };
  let board: Record<string, unknown> = {};
  let requests = 0;
  globalThis.fetch = (async input => {
    requests++;
    assert.equal(new URL(String(input)).pathname, "/rest/v1/ir_market_snapshots");
    return Response.json([{ payload: board }]);
  }) as typeof fetch;
  try {
    const { readIranMarket } = await import("./market-bounded");
    await t.test("old successful snapshot retains prices and reports stale", async () => {
      board = { stocks: [row], fetchedAt: now - 48 * 60 * 60_000 };
      const result = await readIranMarket();
      assert.equal(result.availability.state, "stale");
      assert.equal(result.availability.receivedAt, board.fetchedAt);
      assert.equal(result.availability.sourceAt, board.fetchedAt);
      assert.equal(result.data?.stocks[0].price, 100);
    });
    now += 61_000;
    await t.test("fresh receipt and index do not supply a missing price clock", async () => {
      board = { stocks: [{ ...row, sourceDate: null, sourceTime: null }], fetchedAt: now, indices: { total: 100, date: row.sourceDate, time: row.sourceTime } };
      const result = await readIranMarket();
      assert.equal(result.availability.state, "unknown-time");
      assert.equal(result.availability.validAt, null);
      assert.equal(result.availability.families?.stocks.unknownTimeRows, 1);
      assert.equal(result.data?.stocks[0].changePercent, null);
    });
    now += 61_000;
    await t.test("future receipt is unknown even with valid price time", async () => {
      board = { stocks: [row], fetchedAt: now + 24 * 60 * 60_000 };
      const result = await readIranMarket();
      assert.equal(result.availability.state, "unknown-time");
      assert.equal(result.availability.reason, "invalid-receipt-time");
    });
    now += 61_000;
    await t.test("rejected units are visible as partial without relabeling prices", async () => {
      board = { stocks: [row, { ...row, id: "unsupported", unit: "rial" }], fetchedAt: now };
      const result = await readIranMarket();
      assert.equal(result.availability.state, "partial");
      assert.equal(result.data?.stocks.length, 1);
      assert.equal(result.availability.families?.stocks.rejectedRows, 1);
    });
    now += 61_000;
    await t.test("one old row prevents mixed clocks being ready", async () => {
      board = { stocks: [row, { ...row, id: "old", sourceDate: "1405-07-06" }], fetchedAt: now };
      const result = await readIranMarket();
      assert.equal(result.availability.state, "stale");
      assert.equal(result.availability.families?.stocks.staleRows, 1);
    });
    now += 61_000;
    await t.test("crypto-only DB data is retained without upstream fallback", async () => {
      board = { crypto: [{ ...row, id: "BTC", unit: "usd" }], fetchedAt: now };
      const before = requests;
      const result = await readIranMarket();
      assert.equal(result.data?.crypto.length, 1);
      assert.equal(result.availability.state, "ready");
      assert.equal(requests - before, 1);
    });
    now += 61_000;
    await t.test("future price clock is unknown despite a current receipt", async () => {
      board = { stocks: [{ ...row, sourceDate: "1405-07-09" }], fetchedAt: now };
      const result = await readIranMarket();
      assert.equal(result.availability.state, "unknown-time");
      assert.equal(result.availability.validAt, null);
      assert.equal(result.availability.families?.stocks.unknownTimeRows, 1);
    });
    now += 61_000;
    await t.test("options-only data remains visible with unknown source time", async () => {
      board = { options: [{ id: "synthetic-option", type: "call", price: 100 }], fetchedAt: now };
      const result = await readIranMarket();
      assert.equal(result.data?.options.length, 1);
      assert.equal(result.availability.state, "unknown-time");
      assert.equal(result.availability.families?.options.unknownTimeRows, 1);
    });
    now += 61_000;
    await t.test("index-only data remains visible with its own source time", async () => {
      board = { indices: { total: 100, date: row.sourceDate, time: row.sourceTime }, fetchedAt: now };
      const result = await readIranMarket();
      assert.equal(result.data?.indices?.total, 100);
      assert.equal(result.availability.state, "ready");
      assert.equal(result.availability.families?.stocks.state, "unavailable");
    });
    await t.test("missing or conflicting stock and crypto units stay rejected", async () => {
      const { toMarket } = await import("./market-ir");
      for (const unit of [undefined, "rial", "UNKNOWN"]) {
        assert.equal(toMarket({ stocks: [{ ...row, unit }] }).stocks.length, 0);
        assert.equal(toMarket({ crypto: [{ ...row, unit }] }).crypto.length, 0);
      }
    });
    await t.test("option metadata crosses the reader without guessing missing units or size", async () => {
      const { toMarket } = await import("./market-ir");
      const option = toMarket({ options: [{ id: "synthetic", type: "call", contractSize: 5000, sourceTime: "12:30:01", value: 1000, valueUnit: null, valueSourceField: "tval", priceUnit: "toman" }] }).options[0];
      assert.equal(option.contractSize, 5000); assert.equal(option.sourceTime, "12:30:01"); assert.equal(option.sourceDate, null);
      assert.equal(option.valueUnit, null); assert.equal(option.priceUnit, "toman"); assert.equal(option.value, 1000);
      const legacy = toMarket({ options: [{ id: "legacy", type: "put" }] }).options[0];
      assert.equal(legacy.contractSize, null); assert.equal(legacy.valueUnit, null); assert.equal(legacy.priceUnit, null);
    });
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});
