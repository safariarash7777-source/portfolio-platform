import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompleteReader, PagedReadError, readAllPages } from "./paged-read";

const fixture = Array.from({ length: 2407 }, (_, i) => ({ id: i + 1, symbol: `synthetic-${i}` }));
function fixtureFetch(rows = fixture, cap = 317, fault?: (cursor: number) => number | null): typeof fetch {
  return (async (input: string | URL | Request) => {
    const query = new URL(String(input)).searchParams;
    if (query.get("order") === "id.desc") return Response.json(rows.length ? [{ id: rows.at(-1)!.id }] : []);
    const bounds = query.get("and")!.match(/id.gt.(\d+),id.lte.(\d+)/)!;
    const cursor = Number(bounds[1]), fence = Number(bounds[2]);
    const status = fault?.(cursor);
    if (status) return new Response(null, { status });
    return Response.json(rows.filter(row => row.id > cursor && row.id <= fence).slice(0, Math.min(cap, Number(query.get("limit")))));
  }) as typeof fetch;
}
const options = { url: "https://synthetic.invalid", anon: "synthetic-public", table: "symbol_history", select: "id,symbol" };

test("reads 2407 rows despite short capped pages; includes boundary symbols", async () => {
  const result = await readAllPages<typeof fixture[number]>({ ...options, fetcher: fixtureFetch() });
  assert.deepEqual(result.data, fixture);
  assert.equal(result.coverage.pages, 8);
  assert.equal(result.coverage.rows, 2407);
  assert.equal(result.data[1000].symbol, "synthetic-1000");
});
test("retries the same failed middle page without skipping/duplicating", async () => {
  let failures = 0;
  const result = await readAllPages({ ...options, fetcher: fixtureFetch(fixture, 500, cursor => cursor === 1000 && failures++ === 0 ? 503 : null) });
  assert.deepEqual(result.data, fixture);
  assert.equal(failures, 2);
});
test("persistent middle failure exposes safe page/status and never returns partial rows", async () => {
  await assert.rejects(readAllPages({ ...options, fetcher: fixtureFetch(fixture, 500, cursor => cursor === 1000 ? 503 : null) }),
    (e: unknown) => e instanceof PagedReadError && e.page === 3 && e.status === 503);
});
test("4xx is not retried", async () => {
  let attempts = 0;
  await assert.rejects(readAllPages({ ...options, fetcher: fixtureFetch(fixture, 500, () => { attempts++; return 403; }) }));
  assert.equal(attempts, 1);
});
test("appends after the fence are excluded; same filters reach fence and pages", async () => {
  let calls = 0;
  const mock = fixtureFetch([...fixture, { id: 2408, symbol: "append" }], 600);
  const fetcher = (async (input, init) => {
    assert.equal(new URL(String(input)).searchParams.get("trade_date"), "gte.2026-09-01");
    if (calls++ === 0) return Response.json([{ id: 2407 }]);
    return mock(input, init);
  }) as typeof fetch;
  const result = await readAllPages({ ...options, filters: { trade_date: "gte.2026-09-01" }, fetcher });
  assert.deepEqual(result.data, fixture);
});
test("empty filtered table is complete, but an empty page before the fence is an error", async () => {
  const empty = await readAllPages({ ...options, fetcher: fixtureFetch([]) });
  assert.equal(empty.coverage.state, "complete");
  assert.equal(empty.coverage.upperId, null);
  let n = 0;
  await assert.rejects(readAllPages({ ...options, fetcher: (async () => Response.json(n++ ? [] : [{ id: 2 }])) as typeof fetch }), /missing_page/);
});
test("duplicate or out-of-order IDs, malformed rows and exhausted budget fail visibly", async () => {
  for (const batch of [[{ id: 2 }, { id: 1 }], [{ id: 1 }, { id: 1 }], [{ id: "2" }]]) {
    let n = 0;
    await assert.rejects(readAllPages({ ...options, fetcher: (async () => Response.json(n++ ? batch : [{ id: 2 }])) as typeof fetch }));
  }
  await assert.rejects(readAllPages({ ...options, maxPages: 1, fetcher: fixtureFetch() }), /page_budget/);
});
test("complete-only cache coalesces callers, preserves valid data, exposes stale and retries", async () => {
  let clock = 100, loads = 0, fail = false;
  const read = createCompleteReader(async () => {
    loads++;
    if (fail) throw new PagedReadError("http", 3, 503);
    return { data: [loads], coverage: { state: "complete" as const, completedAt: clock, rows: 1, pages: 1, upperId: loads } };
  }, () => [], 1000, () => clock);
  const [a, b] = await Promise.all([read(), read()]);
  assert.equal(loads, 1);
  assert.deepEqual(a, b);
  fail = true; clock += 1001;
  const stale = await read();
  assert.deepEqual(stale.data, [1]);
  assert.equal(stale.coverage.state, "stale");
  assert.equal(stale.coverage.failure?.page, 3);
  await read(); assert.equal(loads, 2);
  fail = false; clock += 30001;
  assert.deepEqual((await read()).data, [3]);
});
test("cold failure differs from genuine emptiness; synchronous loader failure can retry", async () => {
  let clock = 100, loads = 0;
  const read = createCompleteReader<number[]>(() => { loads++; throw new Error("private response never surfaced"); }, () => [], 1000, () => clock);
  assert.equal((await read()).coverage.state, "error");
  clock += 30001;
  assert.equal((await read()).coverage.failure?.code, "read_failed");
  assert.equal(loads, 2);
});
