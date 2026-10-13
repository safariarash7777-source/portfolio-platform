import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

test("retained detail uses its own clock, never the latest batch clock, and bypasses HTTP cache", async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  let entryAt: number | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/rest/v1/ir_market_snapshots");
    assert.equal(init?.cache, "no-store");
    return Response.json([{ payload: { at: Date.now(), details: { TEST: { at: entryAt, data: { marker: "synthetic" } } } } }]);
  };
  try {
    const req = new Request("https://site.example.test/api/symbol-detail?l18=TEST");
    const unknown = await GET(req);
    assert.equal((await unknown.json()).at, null);
    assert.equal(unknown.headers.get("cache-control"), "no-store");
    entryAt = 1_700_000_000_000;
    assert.equal((await (await GET(req)).json()).at, entryAt);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});
