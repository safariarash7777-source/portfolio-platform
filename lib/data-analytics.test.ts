import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

test("on-demand volume reads all capped IDs under anon scope; failures retain only complete cache and original date", async () => {
  const originalFetch = fetch, originalNow = Date.now;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let now = originalNow(), fail = false, calls = 0;
  Date.now = () => now;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public";
  const ids: number[] = [];
  const rows = Array.from({ length: 29610 }, (_, i) => ({ id: i + 1, symbol: `synthetic${Math.floor(i / 30)}`, trade_date: new Date(now - i % 30 * 86400000).toISOString().slice(0, 10), volume: i % 30 ? 100 : 200 }));
  globalThis.fetch = (async (input, init) => {
    calls++;
    const u = new URL(String(input));
    assert.equal(u.pathname, "/rest/v1/symbol_history");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-public");
    assert.equal(new Headers(init?.headers).get("Cookie"), null);
    assert.equal(init?.cache, "no-store");
    assert.equal(u.searchParams.get("volume"), "not.is.null");
    if (u.searchParams.get("order") === "id.desc") return Response.json([{ id: 29610 }]);
    const cursor = Number(u.searchParams.get("and")!.match(/id.gt.(\d+)/)![1]);
    if (fail && cursor >= 317) return new Response(null, { status: 503 });
    const batch = rows.filter(row => row.id > cursor).slice(0, 317);
    ids.push(...batch.map(row => row.id));
    return Response.json(batch);
  }) as typeof fetch;
  try {
    const { readAnalytics } = await import("./data-analytics");
    const good = await readAnalytics("volume");
    assert.equal(good.coverage.state, "complete"); assert.equal(good.coverage.rows, 29610);
    assert.equal(Object.keys(good.data).length, 987);
    assert.equal(good.data.synthetic0, 3100 / 30);
    const digest = (a: number[]) => createHash("sha256").update(a.join(",")).digest("hex");
    assert.equal(digest(ids), digest(rows.map(row => row.id)));
    assert.equal(good.provenance.scope, "public-anon-rls");
    const before = calls; await readAnalytics("volume"); assert.equal(calls, before);
    now += 600001; fail = true;
    const stale = await readAnalytics("volume");
    assert.equal(stale.coverage.state, "stale"); assert.equal(stale.coverage.completedAt, good.coverage.completedAt);
    assert.deepEqual(stale.data, good.data); assert.equal(stale.coverage.rows, 29610);
    assert.equal(stale.coverage.failure?.status, 503);
    const after = calls; await readAnalytics("volume"); assert.equal(calls, after);
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});
