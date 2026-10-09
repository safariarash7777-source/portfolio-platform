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
