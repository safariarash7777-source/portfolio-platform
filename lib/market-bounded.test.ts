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
  let now = originalNow(), mode = "ready", requests = 0;
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
