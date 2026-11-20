import { test } from "node:test";
import assert from "node:assert/strict";
import { getBulkReturns } from "./bulkReturns";

test("fund returns traverse capped pages, prefer latest amendments, and reject partial or expired reads", async () => {
  const previous = { fetch: globalThis.fetch, now: Date.now, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  let now = Date.parse("2026-10-13T12:00:00Z");
  Date.now = () => now;
  const rows = [
    { id: 4, symbol: "TEST", trade_date: "2026-10-13", close: 120, last_price: null },
    { id: 3, symbol: "TEST", trade_date: "2026-10-13", close: 900, last_price: null },
    { id: 2, symbol: "TEST", trade_date: "2026-10-06", close: 100, last_price: null },
    { id: 1, symbol: "TEST", trade_date: "2026-09-13", close: 80, last_price: null },
  ];
  let fail = false;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("order"), "id.desc");
    assert.equal(init?.cache, "no-store");
    const before = Number(url.searchParams.get("id")?.slice(3) ?? Infinity);
    if (fail && before < Infinity) return new Response(null, { status: 503 });
    return Response.json(rows.filter(r => r.id < before).slice(0, 2));
  };
  try {
    const result = await getBulkReturns();
    assert.equal(calls, 3);
    assert.equal(result.get("TEST")?.w1, 20);
    assert.equal(result.get("TEST")?.m1, 50);
    assert.equal(result.get("TEST")?.daysAvailable, 3);
    now += 60_001;
    fail = true;
    assert.equal((await getBulkReturns()).size, 0, "a partial response cannot masquerade as a complete fresh return");
    globalThis.fetch = async () => { throw new Error("synthetic timeout"); };
    assert.equal((await getBulkReturns()).size, 0, "expired cache cannot conceal a failed refresh");
  } finally {
    globalThis.fetch = previous.fetch; Date.now = previous.now;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});
