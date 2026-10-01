import { test } from "node:test";
import assert from "node:assert/strict";
import { withDeadline, DeadlineError } from "./deadline";
import { readAllPages, PagedReadError, createCompleteReader } from "./supabase/paged-read";

test("deadline bounds a non-cooperating provider, aborts it, and observes late rejection", async () => {
  let signal: AbortSignal | undefined;
  const started = Date.now();
  await assert.rejects(withDeadline(s => { signal = s; return new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 35)); }, 10), DeadlineError);
  assert.equal(signal?.aborted, true);
  assert.ok(Date.now() - started < 1000);
  await new Promise(resolve => setTimeout(resolve, 45));
});
test("independent source budgets retain the healthy full board when the other hangs", async () => {
  const [iran, world] = await Promise.all([
    withDeadline(async () => ({ stocks: Array.from({ length: 760 }, (_, id) => id), sourceAt: 123 }), 50),
    withDeadline(() => new Promise<never>(() => {}), 10).catch(() => null),
  ]);
  assert.equal(iran.stocks.length, 760); assert.equal(iran.sourceAt, 123); assert.equal(world, null);
});
test("parent cancellation bounds body parsing; no partial page is published or retried", async () => {
  let calls = 0;
  await assert.rejects(withDeadline(signal => readAllPages({ url: "http://synthetic.invalid", anon: "public", table: "history", select: "id", signal,
    fetcher: (async () => { calls++; return { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response; }) as typeof fetch,
  }), 15), DeadlineError);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(calls, 1);
});
test("already cancelled scan performs zero requests and reports coverage deadline", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readAllPages({ url: "http://synthetic.invalid", anon: "public", table: "history", select: "id", signal: controller.signal,
    fetcher: (async () => { assert.fail("must not fetch"); }) as typeof fetch,
  }), (e: unknown) => e instanceof PagedReadError && e.code === "deadline");
});

test("cold whole-scan deadline exposes safe coverage failure and never publishes an empty success", async () => {
  const reader = createCompleteReader(() => withDeadline(() => new Promise<never>(() => {}), 10), () => [] as number[], 600000);
  const result = await reader();
  assert.equal(result.coverage.state, "error"); assert.equal(result.coverage.failure?.code, "deadline");
  assert.equal(result.coverage.completedAt, null); assert.deepEqual(result.data, []);
});
