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
function html(f: SymbolFundamentals, quarterlyPeChartReady = false) {
  return renderToStaticMarkup(React.createElement(FundamentalCharts, { fundamentals: f, quarterlyPeChartReady }));
}

test("freshness: latest interim drives the card and margins instead of the previous annual", async () => {
  const symbol = "freshness-interim";
  const annual = row(90, symbol, "1404-12-29", 12, 1000);
  const interim = row(2, symbol, "1405-06-31", 6, 700);
  const result = await read(symbol, [annual, interim]);
  assert.equal(result.data?.n10?.data.period_end, "1405-06-31");
  assert.equal(result.data?.n10?.data.period_months, 6);
  assert.match(result.data?.n10?.source.title ?? "", /۶ماهه/);
  assert.equal(deriveN10(result.data!.n10!.data).margins.net, 20);
  assert.equal(result.data?.n10Periods?.length, 2);
});

test("selected financial report shows its own period and Codal publication time, without inventing a missing time", async () => {
  const symbol = "publication-provenance";
  const older = row(90, symbol, "1404-12-29", 12, 1000);
  older.raw = { ...older.raw, date_publish: "1405/02/01", time_publish: "09:00:00" };
  const current = row(2, symbol, "1405-06-31", 6, 700);
  current.raw = { ...current.raw, date_publish: "1405/07/10", time_publish: "11:42:03" };
  const selected = (await read(symbol, [older, current])).data;
  assert.equal(selected?.n10?.source.publishedAt, "1405/07/10 11:42:03");
  const rendered = html(selected!);
  assert.match(rendered, /پایان دورهٔ مالی: ۱۴۰۵\/۰۶\/۳۱/);
  assert.match(rendered, /انتشار در کدال: ۱۴۰۵\/۰۷\/۱۰ ۱۱:۴۲:۰۳/);
  assert.doesNotMatch(rendered, /انتشار در کدال: ۱۴۰۵\/۰۲\/۰۱/);

  const missing = row(3, "publication-missing", "1405-06-31", 6, 700);
  const unknown = (await read("publication-missing", [missing])).data;
  assert.equal(unknown?.n10?.source.publishedAt, null);
  assert.match(html(unknown!), /انتشار در کدال: زمان نامشخص/);
});

test("fundamental chart states agree with the available quarterly chart and stored monthly reports", async () => {
  const symbol = "chart-state";
  const result = (await read(symbol, [row(1, symbol, "1405-06-31", 6, 700)])).data!;
  const rendered = html({ ...result, n30Unavailable: { unitUnknown: 1, latestPeriod: "1405-06-31" } }, true);
  assert.match(rendered, /مشاهدهٔ نمودار P\/E/);
  assert.doesNotMatch(rendered, /نیازمند EPS فصلی/);
  assert.match(rendered, /گزارش‌های ماهانهٔ ن-۳۰ ذخیره شده‌اند، اما واحد مبلغ آن‌ها مشخص نیست/);
  assert.doesNotMatch(rendered, /هنوز گزارش ن-۳۰ پردازش نشده است/);
});

test("freshness: a newer invalid report stays disclosed alongside the dated usable report", async () => {
  const symbol = "freshness-invalid-latest";
  const latest = row(2, symbol, "1405-06-31", 6, 700);
  latest.data.unit = null;
  const result = await read(symbol, [row(90, symbol, "1404-12-29", 12, 1000), latest]);
  assert.equal(result.data?.n10?.data.period_end, "1404-12-29");
  assert.equal(result.data?.n10Unavailable?.latestPeriod, "1405-06-31");
});

test("freshness: a newly stored report replaces the cached card after one minute without a second Next cache", async () => {
  const symbol = "freshness-cache";
  const now = Date.now;
  let clock = now();
  Date.now = () => clock;
  try {
    await read(symbol, [row(1, symbol, "1404-12-29", 12, 1000)]);
    let requests = 0;
    globalThis.fetch = async (input, options) => {
      assert.equal(new URL(String(input)).hostname, "b2-fixture.invalid");
      assert.equal(options?.cache, "no-store");
      assert.equal((options as { next?: unknown })?.next, undefined);
      requests++;
      return Response.json(String(input).includes(encodeURIComponent("ن-۱۰")) ? [row(2, symbol, "1405-06-31", 6, 700)] : []);
    };
    clock += 59_999;
    assert.equal((await readFundamentalsFromSupabase(symbol)).data?.n10?.data.period_months, 12);
    assert.equal(requests, 0);
    clock += 2;
    assert.equal((await readFundamentalsFromSupabase(symbol)).data?.n10?.data.period_months, 6);
    assert.equal(requests, 2);
  } finally { Date.now = now; }
});

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


test('selected immutable financial row preserves storage clock without refreshing old publication', async () => {
  const r=row(501,'capture-provenance','1405-03-31',3,700,'صورت‌های مالی شرکت (اصلاحیه)');
  r.captured_at='2026-10-29T12:12:00+00:00';
  r.raw={...r.raw,date_publish:'1405/05/03',time_publish:'16:54:53'};
  const result=(await read(r.symbol,[r])).data;
  assert.deepEqual(result?.n10?.source.records,[{id:501,storedPeriodEnd:'1405-03-31',financialPeriodEnd:'1405-03-31',publishedAt:'1405/05/03 16:54:53',capturedAt:'2026-10-29T12:12:00.000Z',parserVersion:2,amendment:true}]);
  assert.equal(result?.n10?.source.publishedAt,'1405/05/03 16:54:53');
  for (const [index, stamp] of ['not-a-clock', undefined, '2026-02-30T12:00:00Z', '2026-10-29T24:00:00Z'].entries()) {
    const missing=row(502+index,`capture-invalid-${index}`,'1405-03-31',3,700);
    missing.captured_at=stamp;
    assert.equal((await read(missing.symbol,[missing])).data?.n10?.source.records?.[0].capturedAt,null);
  }
});

test('monthly source preserves each selected row clock instead of assigning one capture to all periods', async () => {
  const symbol='monthly-capture-provenance';
  const rows: CodalRow[]=[1,2].map((i): CodalRow=>({
    id:600+i,symbol,report_kind:'ن-۳۰',period_end:`2026-0${i+1}-20`,title:'گزارش فعالیت ماهانه',
    source_url:`https://codal.ir/synthetic/month-${i}`,captured_at:`2026-10-2${i}T12:00:00Z`,raw:{parser_version:2},
    data:{symbol,report_kind:'ن-۳۰',period_end:`1405-0${i}-31`,fiscal_year:1405,unit:'میلیون ریال',unit_basis:'header+arithmetic',
      products:[{product_name:'نمونه آزمون',market:'داخلی',production_qty:1,sales_qty:1,sales_rate:1000000,sales_amount:1}],period_total_amount:1,fy_cumulative_amount:i}
  }));
  const records=(await read(symbol,rows)).data?.n30?.source.records;
  assert.deepEqual(records?.map(r=>[r.id,r.storedPeriodEnd,r.financialPeriodEnd,r.capturedAt]),[
    [602,'2026-03-20','1405-02-31','2026-10-22T12:00:00.000Z'],
    [601,'2026-02-20','1405-01-31','2026-10-21T12:00:00.000Z']
  ]);
});


test('provenance version agrees with reader selection when parser version exists only in immutable URL', async () => {
  const symbol='provenance-parser-url';
  const old=row(700,symbol,'1405-03-31',3,700);
  old.source_url='https://codal.ir/synthetic/parser-source#pv2';
  const corrected=row(1,symbol,'1405-03-31',3,700);
  corrected.source_url='https://codal.ir/synthetic/parser-source#pv3';
  corrected.raw={};
  const record=(await read(symbol,[old,corrected])).data?.n10?.source.records?.[0];
  assert.equal(record?.id,1);
  assert.equal(record?.parserVersion,3);
  assert.equal(record?.amendment,false);
});
