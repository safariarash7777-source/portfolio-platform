import test from "node:test";
import assert from "node:assert/strict";
import { readStoredReportCounts } from "./codal-coverage.mjs";

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const ports = read => ({ baseUrl: "https://storage.invalid", headers: {}, fetch: read });

test("counts beyond a server cap and continues after short pages", async () => {
  const rows = Array.from({ length: 1010 }, (_, n) => ({ id: 1010 - n, symbol: n < 1000 ? "الف" : "ب" }));
  const queries = [];
  const result = await readStoredReportCounts(["الف", "ب"], ports(async input => {
    const q = new URL(input).searchParams;
    queries.push(q);
    const before = Number(q.get("id")?.slice(3) ?? Infinity);
    return response(rows.filter(r => r.id < before).slice(0, 500));
  }));
  assert.deepEqual([...result], [["الف", 1000], ["ب", 10]]);
  assert.equal(queries.length, 4);
  assert.equal(queries[1].get("id"), "lt.511");
  assert.equal(queries[0].get("order"), "id.desc");
});

test("later page failure never returns partial coverage", async () => {
  let calls = 0;
  await assert.rejects(readStoredReportCounts(["الف"], ports(async () =>
    ++calls === 1 ? response([{ id: 2, symbol: "الف" }]) : response({}, 503))), /HTTP 503/);
});

test("rejects repeated, unordered, unsafe or unrelated identities", async () => {
  for (const rows of [
    [{ id: 2, symbol: "الف" }, { id: 2, symbol: "الف" }],
    [{ id: 1, symbol: "الف" }, { id: 2, symbol: "الف" }],
    [{ id: Number.MAX_SAFE_INTEGER + 1, symbol: "الف" }],
    [{ id: 2, symbol: "ب" }],
  ]) await assert.rejects(readStoredReportCounts(["الف"], ports(async () => response(rows))), /identity\/order/);
});

test("preserves bigint string cursors and escapes symbol filters", async () => {
  const symbol = 'الف"\\ب';
  let calls = 0;
  const result = await readStoredReportCounts([symbol], ports(async input => {
    const q = new URL(input).searchParams;
    assert.equal(q.get("symbol"), 'in.("الف\\"\\\\ب")');
    if (++calls === 1) return response([{ id: "9007199254740993", symbol }]);
    assert.equal(q.get("id"), "lt.9007199254740993");
    return response([]);
  }));
  assert.equal(result.get(symbol), 1);
});

test("bounded read fails closed if a complete result is not reached", async () => {
  let id = 101;
  await assert.rejects(readStoredReportCounts(["الف"], ports(async () =>
    response([{ id: id--, symbol: "الف" }]))), /page limit/);
});

test("empty universe makes no requests", async () => {
  assert.equal((await readStoredReportCounts([], ports(() => assert.fail("unexpected read")))).size, 0);
});
