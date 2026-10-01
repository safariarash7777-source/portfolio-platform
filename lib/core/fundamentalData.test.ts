import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCodal, getFundamentalYoY, monthlyYoYFromRows, quarterlyYoYFromRows, type CodalRow } from "./fundamentalData";

const row = (id: number, symbol: string, data: Record<string, unknown>): CodalRow => ({ id, symbol, data, captured_at: "2026-09-01T00:00:00Z" });
test("monthly pair beyond row 1000 and amendment tie precedence are preserved", async () => {
  const rows = Array.from({ length: 1205 }, (_, i) => row(i + 1, `synthetic-${i}`, { period_end: "1405-06-31", period_total_amount: 100 }));
  rows.push(row(1206, "boundary", { period_end: "1405-06-31", period_total_amount: 200 }));
  rows.push(row(1207, "boundary", { period_end: "1404-06-31", period_total_amount: 100 }));
  rows.push(row(1208, "boundary", { period_end: "1405-06-31", period_total_amount: 300 }));
  const original = fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public";
  globalThis.fetch = (async input => {
    const q = new URL(String(input)).searchParams;
    assert.equal(q.get("report_kind"), "eq.ن-۳۰");
    if (q.get("order") === "id.desc") return Response.json([{ id: 1208 }]);
    const cursor = Number(q.get("and")!.match(/id.gt.(\d+)/)![1]);
    return Response.json(rows.filter(r => r.id > cursor).slice(0, 500));
  }) as typeof fetch;
  try {
    const result = await fetchCodal("ن-۳۰");
    assert.equal(result.coverage.rows, 1208);
    assert.equal(monthlyYoYFromRows(result.data).get("boundary"), 200);
    assert.equal(monthlyYoYFromRows(result.data).has("synthetic-0"), false);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; }
});
test("quarterly chain requires both year's prior cumulative periods", () => {
  const r = (id: number, end: string, months: number, revenue: number) => row(id, "synthetic", { period_end: end, period_months: months, standalone: { revenue } });
  const rows = [r(4, "1405-06-31", 6, 500), r(3, "1405-03-31", 3, 200), r(2, "1404-06-31", 6, 300), r(1, "1404-03-31", 3, 100)];
  assert.equal(quarterlyYoYFromRows(rows).get("synthetic"), 50);
  assert.equal(quarterlyYoYFromRows(rows.slice(0, 3)).has("synthetic"), false);
});
test("missing configuration is reported per kind instead of cached complete empty YoY", async () => {
  const result = await getFundamentalYoY();
  assert.equal(result.coverage.monthly.state, "error");
  assert.equal(result.coverage.quarterly.state, "error");
  assert.deepEqual(result.monthly, {});
});
