// Synthetic regressions only; every read is stubbed and no database is contacted.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FundamentalCharts from "../../components/symbol/FundamentalCharts";
import { deriveQuarters, ttmSeries, type QuarterInput } from "../core/quarterly";
import { deriveN10, growthPct, pct } from "./calc";
import { readFundamentalsFromSupabase, type CodalRow } from "./supabase";
import type { CodalN10Data, SymbolFundamentals } from "./types";

Object.assign(globalThis, { React });
const originalFetch = globalThis.fetch;
const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://b2-fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon";
after(() => {
  globalThis.fetch = originalFetch;
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anon;
});

function row(id: number, symbol: string, end: string, months: number, revenue: number, title: string | null = "صورت‌های مالی شرکت"): CodalRow {
  return {
    id, symbol, report_kind: "ن-۱۰", period_end: end, title,
    source_url: `https://codal.ir/synthetic/${id}`, raw: { parser_version: 2 },
    data: {
      symbol, company_name: "نمونهٔ آزمون", report_kind: "ن-۱۰", period_end: end,
      period_months: months, audited: false, restated_prior: false, unit: "میلیون ریال", capital: 100,
      standalone: { revenue, cogs: revenue * .6, gross_profit: revenue * .4, operating_profit: revenue * .3, net_profit: revenue * .2,
        prior: { revenue: revenue / 2, cogs: revenue * .3, gross_profit: revenue * .2, operating_profit: revenue * .15, net_profit: revenue * .1 } },
    },
  };
}
async function read(symbol: string, rows: CodalRow[]) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "b2-fixture.invalid");
    const kind = url.searchParams.get("report_kind")?.slice(3);
    return Response.json(rows.filter(r => r.report_kind === kind && r.symbol === symbol));
  };
  return readFundamentalsFromSupabase(symbol);
}
function input(r: CodalRow, scope = "company", unit: string | null = "میلیون ریال"): QuarterInput {
  const d = r.data as CodalN10Data;
  return { id: r.id, period_end: d.period_end, period_months: d.period_months, audited: d.audited, capital: d.capital,
    ...d.standalone, scope, unit } as QuarterInput;
}
function html(f: SymbolFundamentals) {
  return renderToStaticMarkup(React.createElement(FundamentalCharts, { fundamentals: f }));
}

test("B2: null, undefined, strings and nonfinite inputs never become zero percentages", () => {
  for (const value of [null, undefined, "0", "10", false, NaN, Infinity, -Infinity]) {
    assert.equal(pct(value as never, 10), null, `numerator ${String(value)}`);
    assert.equal(pct(10, value as never), null, `denominator ${String(value)}`);
    assert.equal(growthPct(value as never, 10), null);
    assert.equal(growthPct(10, value as never), null);
  }
  assert.equal(pct(0, 10), 0);
  assert.equal(pct(10, 0), null);
  assert.equal(growthPct(0, 10), -100);
  assert.equal(pct(Number.MAX_VALUE, Number.MIN_VALUE), null);
});

test("B2: Shahrivar fiscal chain cannot produce group minus company = 700", async () => {
  const symbol = "b2-fiscal";
  const rows = [row(1, symbol, "1404-09-30", 3, 100), row(2, symbol, "1404-12-29", 6, 200),
    row(3, symbol, "1405-03-31", 9, 900, "صورت‌های مالی تلفیقی"), row(4, symbol, "1405-06-31", 12, 1200, "صورت‌های مالی تلفیقی")];
  const f = (await read(symbol, rows)).data!;
  const quarters = deriveQuarters((f.n10Periods ?? []).map(p => input({ ...rows[0], id: p.id, data: { ...p.data } }, p.scope)));
  assert.equal(quarters.find(q => q.q === 3)?.revenue ?? null, null);
  assert.deepEqual((f.n10Periods ?? []).map(p => p.id).sort(), [1, 2]);
  assert.equal(f.n10Unavailable?.scopeAmbiguous, 2);
  assert.deepEqual(ttmSeries(quarters), []);
});

test("B2: unknown titles have unknown scope, no verification badge and no quarterly input", async () => {
  for (const [index, title] of [null, "", "   ", "گزارش نامشخص"].entries()) {
    const symbol = `b2-title-${index}`;
    const f = (await read(symbol, [row(10 + index, symbol, "1404-12-29", 12, 100, title)])).data!;
    assert.equal(f.n10?.source.scope, "unknown");
    assert.equal(f.n10?.source.verified, false);
    assert.equal(f.n10Periods?.length ?? 0, 0);
    assert.equal(f.n10Unavailable?.scopeUnknown, 1);
    assert.match(html(f), /دامنه.*مشخص نیست/);
  }
});

test("B2: company scope alone is not evidence of arithmetic verification", async () => {
  const r = row(20, "b2-evidence", "1404-12-29", 12, 100);
  (r.data as CodalN10Data).standalone.gross_profit = 99;
  const f = (await read(r.symbol, [r])).data!;
  assert.equal(f.n10?.source.scope, "company");
  assert.equal(f.n10?.source.verified, false);
  assert.match(f.n10?.source.verification_note ?? "", /تأیید نشده/);
});

test("B2: unknown/incompatible N10 units remain observable but never reach money calculations or charts", async () => {
  for (const [index, unit] of [null, undefined, "ریال", "تومان"].entries()) {
    const symbol = `b2-unit-${index}`;
    const r = row(30 + index, symbol, "1404-12-29", 12, 100);
    r.data.unit = unit as never;
    const f = (await read(symbol, [r])).data!;
    assert.equal(f.n10, null);
    assert.equal(f.n10Periods?.length ?? 0, 0);
    assert.equal(f.n10Unavailable?.unitUnknown, 1);
    assert.match(html(f), /واحد.*نامشخص|واحد.*ناسازگار/);
    const raw = r.data as CodalN10Data;
    assert.equal(deriveN10(raw).margins.gross, null);
    assert.deepEqual(deriveN10(raw).trend, []);
    assert.doesNotMatch(html({ symbol, n10: { data: raw, source: { title: "ساختگی", source_url: null, verified: false, scope: "company" } }, n30: null }), /id="chart-margins"/);
  }
});

test("B2: newest parser with unknown unit cannot revive an older known-unit row", async () => {
  const old = row(40, "b2-parser", "1404-12-29", 12, 100);
  const newer = { ...old, id: 41, raw: { parser_version: 3 }, data: { ...old.data, unit: null } } as unknown as CodalRow;
  const f = (await read(old.symbol, [old, newer])).data!;
  assert.equal(f.n10, null);
  assert.equal(f.n10Unavailable?.unitUnknown, 1);
});

test("B2: omitted reports remain visible alongside a usable older report", async () => {
  const valid = row(45, "b2-partial", "1403-12-29", 12, 100);
  const omitted = row(46, valid.symbol, "1404-12-29", 12, 200);
  omitted.data.unit = "ریال";
  const f = (await read(valid.symbol, [valid, omitted])).data!;
  assert.equal(f.n10?.data.period_end, "1403-12-29");
  assert.equal(f.n10Unavailable?.unitUnknown, 1);
  assert.match(html(f), /کنار گذاشته.*واحد.*نامشخص|واحد.*ناسازگار.*کنار گذاشته/);
});

test("B2: quarterly calculation rejects absent/unknown unit or scope and incomplete numeric fields", () => {
  const a = input(row(50, "core", "1404-03-31", 3, 100));
  for (const patch of [{ scope: undefined }, { scope: "unknown" }, { scope: "consolidated_ambiguous" }, { unit: undefined }, { unit: "ریال" }]) {
    assert.equal(deriveQuarters([{ ...a, ...patch } as QuarterInput])[0]?.revenue ?? null, null);
  }
  const missingProfit = deriveQuarters([{ ...a, net_profit: null } as unknown as QuarterInput]);
  assert.equal(missingProfit[0]?.netProfit ?? null, null);
  const b = input(row(51, "core", "1404-06-31", 6, 200));
  assert.equal(deriveQuarters([a, { ...b, revenue: "200" } as unknown as QuarterInput])[1]?.revenue ?? null, null);
});

test("B2: different fiscal start months in the same start year cannot form one chain", () => {
  const a = input(row(60, "core", "1404-03-31", 3, 100)); // Farvardin start
  const b = input(row(61, "core", "1404-09-30", 6, 600)); // Tir start
  assert.equal(deriveQuarters([a, b]).find(q => q.q === 2)?.revenue ?? null, null);
});

test("B2: charts and narratives describe the actual 3/6/9/12-month period and restatement flag", async () => {
  for (const months of [3, 6, 9, 12]) {
    const symbol = `b2-period-${months}`;
    const r = row(70 + months, symbol, "1404-12-29", months, 100);
    const f = (await read(symbol, [r])).data!;
    const rendered = html(f);
    assert.doesNotMatch(rendered, /تجدید ارائه/);
    if (months !== 12) {
      assert.doesNotMatch(rendered, /فروش سال|سود خالص سال|مقایسهٔ سال/);
      assert.match(rendered, /دورهٔ [۳۶۹]ماهه/);
    }
    (f.n10!.data).restated_prior = true;
    assert.match(html(f), /تجدید ارائه/);
  }
});
