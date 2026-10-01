/** Synthetic isolated PostgreSQL + PostgREST only; explicitly opt in. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readAllPages } from "./paged-read";

if (process.env.SYNTHETIC_READ_DB !== "1") throw new Error("Set SYNTHETIC_READ_DB=1 only after creating the isolated local fixture; this test never silently skips.");

test("real capped PostgREST under SELECT RLS matches SQL count and ID set for each identical filter", async () => {
  const url = "http://127.0.0.1:15883";
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "fixture_reader", exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const anon = `${unsigned}.${createHmac("sha256", "synthetic-local-signing-key-not-a-production-secret").update(unsigned).digest("base64url")}`;
  const cases: Array<{ table: string; filters: Record<string, string>; where: string; expected: number }> = [
    { table: "symbol_history", filters: { trade_date: "gte.2026-09-01" }, where: "trade_date >= '2026-09-01'", expected: 2407 },
    { table: "codal_reports", filters: { report_kind: "eq.ن-۳۰" }, where: "report_kind='ن-۳۰'", expected: 1208 },
    { table: "codal_reports", filters: { report_kind: "eq.ن-۱۰" }, where: "report_kind='ن-۱۰'", expected: 1208 },
  ];
  for (const c of cases) {
    const result = await readAllPages<{ id: number; symbol: string }>({ url, anon, table: c.table, select: "id,symbol", filters: c.filters,
      fetcher: (input, init) => fetch(String(input).replace("/rest/v1/", "/"), init),
    });
    const sql = `SET ROLE fixture_reader; SELECT count(*)::text || '|' || md5(string_agg(id::text, ',' ORDER BY id)) || '|' || count(DISTINCT symbol)::text FROM ${c.table} WHERE ${c.where};`;
    const expected = execFileSync("docker", ["exec", "followup02-read-db", "psql", "-U", "postgres", "-Atq", "-c", sql], { encoding: "utf8" }).trim().split("|");
    assert.equal(result.data.length, c.expected);
    assert.equal(String(result.data.length), expected[0]);
    assert.equal(createHash("md5").update(result.data.map(r => r.id).join(",")).digest("hex"), expected[1]);
    assert.equal(String(new Set(result.data.map(r => r.symbol)).size), expected[2]);
    assert.equal(result.coverage.pages, Math.ceil(c.expected / 317));
    console.log(JSON.stringify({ environment: "synthetic-pg-postgrest", table: c.table, filter: c.where, count: result.coverage.rows, pages: result.coverage.pages, idDigest: expected[1], distinctSymbols: Number(expected[2]), sqlMatch: true }));
  }
});
