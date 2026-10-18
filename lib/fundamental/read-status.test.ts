import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFundamentalsFromSupabase, type CodalRow } from "./supabase";
import FundamentalReadNotice from "../../components/symbol/FundamentalReadNotice";

Object.assign(globalThis, { React });
const originalFetch = globalThis.fetch;
const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fundamental-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon";
after(() => {
  globalThis.fetch = originalFetch;
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anon;
});

function monthly(symbol: string, id: number, period: string, unit: string | null = "میلیون ریال"): CodalRow {
  return {
    id, symbol, report_kind: "ن-۳۰", period_end: period, title: "فعالیت ماهانه", source_url: `https://codal.ir/synthetic/${id}`,
    raw: { parser_version: 2, date_publish: "۱۴۰۵/۰۷/۱۹", time_publish: "۱۰:۰۰:۰۰" },
    data: { symbol, report_kind: "ن-۳۰", period_end: period, fiscal_year: 1405, period_total_amount: 2, fy_cumulative_amount: null, unit, unit_basis: unit ? "header+arithmetic" : null, products: [] },
  };
}
function stub(rows: CodalRow[]) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "fundamental-test.invalid");
    const kind = url.searchParams.get("report_kind")?.slice(3);
    return Response.json(rows.filter(row => row.report_kind === kind));
  };
}

test("reader projects only approved official source URLs without changing report data", async () => {
  for (const [index, url] of ["https://evil.test/report#pv2", "https://codal.ir.evil.test/report", "http://codal.ir/report", "javascript:alert(1)", "/Reports/Decision.aspx?id=7#pv2"].entries()) {
    const symbol = `source-url-${index}`;
    const row = monthly(symbol, index + 1, "1405-05-31");
    row.source_url = url;
    stub([row]);
    const result = await readFundamentalsFromSupabase(symbol);
    assert.equal(result.state, "ready");
    assert.equal(result.data?.n30?.data[0].period_total_amount, 2);
    assert.equal(result.data?.n30?.source.source_url, index === 4 ? "https://codal.ir/Reports/Decision.aspx?id=7" : null);
  }
});

test("database failure is separate from successful empty and is retried", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("", { status: 503 }); };
  const failure = await readFundamentalsFromSupabase("read-failure");
  assert.equal(failure.state, "error");
  assert.equal(failure.data, null);
  stub([]);
  assert.equal((await readFundamentalsFromSupabase("read-failure")).state, "empty");
  assert.equal(calls, 2);
  const html = renderToStaticMarkup(React.createElement(FundamentalReadNotice, { readFailed: true }));
  assert.match(html, /نبود نمودار.*به معنی نبود گزارش/);
  assert.equal(renderToStaticMarkup(React.createElement(FundamentalReadNotice, { readFailed: false })), "");
});

test("unknown monthly amount unit stays observable without a converted money report", async () => {
  stub([monthly("unit-unknown", 1, "1405-05-31", null)]);
  const result = await readFundamentalsFromSupabase("unit-unknown");
  assert.equal(result.state, "ready");
  assert.equal(result.data?.n30, null);
  assert.deepEqual(result.data?.n30Unavailable, { unitUnknown: 1, latestPeriod: "1405-05-31" });
  const html = renderToStaticMarkup(React.createElement(FundamentalReadNotice, { readFailed: false, unitUnknown: 1 }));
  assert.match(html, /واحد مبلغ آن‌ها مشخص نیست/);
});

test("recognized million rial remains readable and the newest parser cannot fall back to an older known unit", async () => {
  const old = monthly("parser-unit", 1, "1405-06-31");
  const newer = { ...monthly("parser-unit", 2, "1405-06-31", null), source_url: old.source_url, raw: { parser_version: 3 } };
  stub([old, newer]);
  assert.equal((await readFundamentalsFromSupabase("parser-unit")).data?.n30, null);
  stub([monthly("unit-known", 3, "1405-06-31")]);
  const valid = await readFundamentalsFromSupabase("unit-known");
  assert.equal(valid.data?.n30?.data.length, 1);
  assert.equal(valid.data?.n30?.source.verified, true);
});

test("monthly amendments are selected before the 26-period window is applied", async () => {
  const rows: CodalRow[] = [];
  for (let index = 0; index < 27; index++) {
    const year = 1405 - Math.floor(index / 12);
    const month = 12 - index % 12;
    const period = `${year}-${String(month).padStart(2, "0")}-29`;
    rows.push(monthly("window", index * 2 + 2, period));
    rows.push({ ...monthly("window", index * 2 + 1, period), title: "فعالیت ماهانه (اصلاحیه)" });
  }
  stub(rows);
  const result = await readFundamentalsFromSupabase("window");
  assert.equal(result.data?.n30?.data.length, 26);
  assert.equal(new Set(result.data?.n30?.data.map(row => row.period_end)).size, 26);
});

test("screener propagates database 503 instead of producing a cacheable empty map", async () => {
  const { buildMonthlyYoY } = await import("../core/fundamentalData");
  globalThis.fetch = async () => new Response("", { status: 503 });
  await assert.rejects(buildMonthlyYoY(), /fundamental_read_http_503/);
});

test("screener uses canonical amendment selection and declares truncated database coverage", async () => {
  const { readFundamentalYoY } = await import("../core/fundamentalData");
  const prior = monthly("growth", 1, "1404-06-31");
  const original = monthly("growth", 3, "1405-06-31");
  const amended = { ...monthly("growth", 2, "1405-06-31"), title: "فعالیت ماهانه (اصلاحیه)", data: { ...original.data, period_total_amount: 4 } };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("order"), "period_end.desc,id.desc");
    const rows = url.searchParams.get("report_kind") === "eq.ن-۳۰" ? [original, amended, prior] : [];
    return Response.json(rows, { headers: { "Content-Range": rows.length ? "0-2/30" : "*/0" } });
  };
  const result = await readFundamentalYoY();
  assert.equal(result.monthly.growth, 100);
  assert.deepEqual(result.coverage.monthly, { rowsRead: 3, totalRows: 30, complete: false });
  assert.equal(result.coverage.quarterly.complete, true);
});
