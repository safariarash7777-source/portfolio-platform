import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveQuarters, ttmSeries, type QuarterInput, type DerivedQuarter, type TtmPoint } from "../../lib/core/quarterly";

const require = createRequire(import.meta.url);
function view(name: string, reactOverride?: unknown, elementType?: unknown): Record<string, React.ComponentType<Record<string, unknown>>> {
  const source = readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8"), compiled = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, React, Element: elementType, require: (id: string) =>
    id === "react" && reactOverride ? reactOverride : id === "./CodalSourceLink" ? view("CodalSourceLink") : require(id.startsWith("@/") ? `../../${id.slice(2)}` : id) });
  return compiled.exports;
}
const sources = view("QuarterlyPointSources");
function reports(years = 1): QuarterInput[] {
  return Array.from({ length: years * 4 }, (_, i) => {
    const q = i % 4 + 1, year = 1403 + Math.floor(i / 4), end = `${year}-${["03-31", "06-31", "09-30", "12-29"][q - 1]}`;
    return { id: 700 + i, period_end: end, period_months: q * 3, audited: false, unit: "میلیون ریال", scope: "company",
      capital: 100000, revenue: q * 100000, gross_profit: q * 40000, operating_profit: q * 30000, net_profit: q * 20000,
      record: { id: 700 + i, financialPeriodEnd: end, storedPeriodEnd: null, sourceUrl: `https://codal.ir/Reports/Decision.aspx?LetterSerial=source-${700 + i}`,
        publishedAt: "1405/01/01 10:00:00", publishedDateRaw: null, publishedTimeRaw: null, publishedAtUtc: null, publicationUtcConfidence: "unknown",
        capturedAtRaw: "2026-10-25T13:45:56.894105+03:30", capturedAt: "2026-10-25T10:15:56.894Z", parserVersion: null, parserVersionSource: null, amendment: false } };
  });
}
const quarterLabel = (quarter: DerivedQuarter, margins = false, value: number | null = 1) => renderToStaticMarkup(React.createElement(sources.QuarterSourceLabel, {
  label: "فصل آزمون", margins, payload: [{ dataKey: margins ? "خالص" : "سود خالص", value, payload: { sourceQuarter: quarter } }],
}));
const ttmLabel = (point: TtmPoint) => renderToStaticMarkup(React.createElement(sources.TtmPointSources, { point }));
const links = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

type Trace = { component: string; props: Record<string, unknown> };
function charts(quarters: DerivedQuarter[], previewControls: boolean, range = 12, peSeries: Array<{ label: string; pe: number | null }> = []) {
  const traces: Trace[] = [], source = readFileSync(new URL("./QuarterlyCharts.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const components = ["Bar", "BarChart", "CartesianGrid", "Line", "LineChart", "Legend", "ReferenceLine", "Tooltip", "XAxis", "YAxis"];
  const recharts = Object.fromEntries(components.map(component => [component, (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    traces.push({ component, props });return React.createElement("div", { "data-chart": component }, props.children);
  }]));
  const compiled = { exports: {} as { default: React.ComponentType<Record<string, unknown>> } };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, React, require: (id: string) => {
    if (id === "react") return { ...React, useState: () => [range, () => {}], useEffect() {} };
    if (id === "recharts") return recharts;
    if (id === "./MeasuredResponsiveContainer") return { default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) };
    if (id === "./MonthlySourceChartFrame") return view("MonthlySourceChartFrame");
    if (id === "./QuarterlyPointSources") return sources;
    return require(id.startsWith("@/") ? `../../${id.slice(2)}` : id);
  } });
  const snapshot = structuredClone(quarters), ttm = ttmSeries(quarters);
  const html = renderToStaticMarkup(React.createElement(compiled.exports.default, { quarters, ttm, peSeries, currentPe: null, sourceTitle: "مرجع بسته", previewControls }));
  assert.deepEqual(quarters, snapshot, "source rendering must not mutate financial or provenance inputs");
  return { html, traces };
}

test("Preview uses the existing frame and exact selected quarters for both amount and margin source tooltips", () => {
  const quarters = deriveQuarters(reports(4)), shown = charts(quarters, true, 4);
  const plots = shown.traces.filter(t => ["BarChart", "LineChart"].includes(t.component));
  assert.equal(plots.length, 2);
  for (const plot of plots) {
    const data = plot.props.data as Array<{ sourceQuarter: DerivedQuarter }>;
    assert.equal(data.length, 4);data.forEach((point, i) => assert.equal(point.sourceQuarter, quarters[12 + i]));
  }
  const tips = shown.traces.filter(t => t.component === "Tooltip");
  for (const tip of tips) { assert.equal(tip.props.trigger, "click");assert.equal(tip.props.portal, null);assert.equal(typeof tip.props.labelFormatter, "function"); }
  assert.equal((shown.html.match(/data-monthly-source-portal/g) ?? []).length, 2);
  assert.equal((shown.html.match(/style="width:100%;height:250px"/g) ?? []).length, 2);
});

test("direct report source uses its own record and exact raw clock with safe native links", () => {
  const html = quarterLabel(deriveQuarters(reports())[0]);
  assert.ok(html.includes("گزارش همین دوره"));assert.deepEqual(links(html), ["https://codal.ir/Reports/Decision.aspx?LetterSerial=source-700"]);
  assert.ok(html.includes("2026-10-25T13:45:56.894105+03:30"));assert.ok(html.includes("2026-10-25T10:15:56.894Z"));
  assert.ok(html.includes('dir="ltr" style="display:block;white-space:normal;overflow-wrap:anywhere;word-break:break-all;text-align:left"'));
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(!/matched|binding|source-703|مرجع بسته/.test(html));
});

test("difference and margin sources show both actual reports, without replacing them with the latest report", () => {
  const q = deriveQuarters(reports())[1];
  for (const margins of [false, true]) {
    const html = quarterLabel(q, margins);
    assert.ok(html.includes("تفاضل دو گزارش"));assert.ok(html.includes("گزارش تجمیعی دورهٔ قبل"));
    assert.deepEqual(links(html), [701, 700].map(id => `https://codal.ir/Reports/Decision.aspx?LetterSerial=source-${id}`));
    assert.ok(!html.includes("source-703"));
    if (margins) assert.ok(html.includes("نسبت سود به درآمد همان فصل"));
  }
});

test("reported zero keeps source; absent/nonfinite tooltip values and contradictory payloads have no borrowed links", () => {
  const quarters = deriveQuarters(reports());
  assert.equal(links(quarterLabel(quarters[0], false, 0)).length, 1);
  for (const value of [null, NaN, Infinity]) assert.equal(links(quarterLabel(quarters[0], false, value)).length, 0);
  const html = renderToStaticMarkup(React.createElement(sources.QuarterSourceLabel, { label: "فصل", payload: [
    { dataKey: "درآمد", value: 1, payload: { sourceQuarter: quarters[0] } },
    { dataKey: "سود خالص", value: 1, payload: { sourceQuarter: quarters[1] } },
  ] }));
  assert.ok(html.includes("منبع این دوره نامعلوم"));assert.equal(links(html).length, 0);
});

test("mismatched/unknown identities and periods suppress only unverifiable report details", () => {
  const original = deriveQuarters(reports())[1];
  for (const change of ["id", "date", "binding", "missing"] as const) {
    const q = structuredClone(original), source = q.provenance!.amounts.contributors[0].report;
    if (change === "id") source.record!.id = 9999;
    if (change === "date") source.record!.financialPeriodEnd = "1405-12-29";
    if (change === "binding") source.binding = "ambiguous_identity";
    if (change === "missing") source.record = null;
    const html = quarterLabel(q);
    assert.ok(html.includes("منبع این گزارش نامعلوم"));assert.deepEqual(links(html), ["https://codal.ir/Reports/Decision.aspx?LetterSerial=source-700"]);
  }
  const q = structuredClone(original);q.provenance!.amounts.contributors.pop();
  assert.equal(links(quarterLabel(q)).length, 0);
  const wrongPeriod = structuredClone(original);wrongPeriod.periodEnd = "1405-06-31";
  assert.equal(links(quarterLabel(wrongPeriod)).length, 0);
});

test("unsafe source URL is rejected and null clocks stay unknown", () => {
  const q = deriveQuarters(reports())[0], record = q.provenance!.amounts.contributors[0].report.record!;
  record.sourceUrl = "javascript:alert(1)";record.capturedAtRaw = null;record.capturedAt = null;record.publishedAt = null;
  const html = quarterLabel(q);
  assert.equal(links(html).length, 0);assert.ok(!html.includes("javascript:"));assert.ok(html.includes("پیوند گزارش در کدال نامعلوم"));
  assert.ok(html.includes("انتشار گزارش (زمان محلی): نامعلوم"));
});

test("gaps and rejected differences keep their existing financial holes and do not present a valid report chain", () => {
  const inputs = reports();inputs[1].revenue = 1;
  const q = deriveQuarters(inputs)[1];assert.equal(q.revenue, null);assert.equal(q.adjusted, true);
  assert.equal(links(quarterLabel(q)).length, 0);
  const gap = deriveQuarters(reports().filter(r => r.period_months !== 6))[2];
  assert.equal(gap.netProfit, null);assert.equal(links(quarterLabel(gap)).length, 0);
  const shown = charts([gap], true), data = shown.traces.find(t => t.component === "BarChart")!.props.data as Array<Record<string, unknown>>;
  assert.equal(data[0]["درآمد"], null);assert.equal(data[0]["سود خالص"], null);
});

test("a genuine quarterly loss retains its two-report source and negative margin without becoming an unavailable gap", () => {
  // Synthetic loss: unlike rejected revenue adjustments, a negative profit is valid.
  const inputs = reports();inputs[2].net_profit = inputs[1].net_profit - 50000;
  const quarters = deriveQuarters(inputs), loss = quarters[2];
  assert.equal(loss.netProfit, -50000);assert.equal(loss.netMargin, -50);assert.equal(loss.adjusted, false);
  for (const [margins, value] of [[false, -50000], [true, -50]] as const)
    assert.deepEqual(links(quarterLabel(loss, margins, value)), [702, 701].map(id => `https://codal.ir/Reports/Decision.aspx?LetterSerial=source-${id}`));
  const shown = charts(quarters, true), data = shown.traces.find(t => t.component === "BarChart")!.props.data as Array<Record<string, unknown>>;
  assert.equal(data[2]["سود خالص"], -5);
});

test("TTM sources show all four quarter chains and final capital, independently of historical P/E availability", () => {
  const quarters = deriveQuarters(reports()), point = ttmSeries(quarters)[0], html = ttmLabel(point);
  assert.ok(html.includes("چهار فصل سازندهٔ دوازده‌ماهه"));assert.ok(html.includes("سرمایهٔ مبنای سود هر سهم"));
  assert.deepEqual(links(html).map(url => Number(url.split("source-")[1])), [700, 701, 700, 702, 701, 703, 702, 703]);
  assert.ok(html.includes("منبع مستقل قیمت P/E در این بخش نامعلوم"));
  const shown = charts(quarters, true);
  assert.ok(shown.html.includes("منابع سود هر سهم دوازده‌ماهه"));assert.ok(shown.html.includes("دوازده‌ماهه منتهی به ۱۴۰۳-۱۲-۲۹"));
  assert.ok(shown.html.includes("قیمت تاریخی پایان فصل"));
  assert.equal(shown.traces.filter(t => t.component === "LineChart").length, 1, "no new EPS/P-E plot is fabricated");
});

test("TTM missing/contradictory provenance and unrelated capital remain unknown", () => {
  const point = ttmSeries(deriveQuarters(reports()))[0];
  const missing = structuredClone(point);delete missing.provenance;
  assert.ok(ttmLabel(missing).includes("منابع چهار فصل این بازه نامعلوم"));assert.equal(links(ttmLabel(missing)).length, 0);
  const partial = structuredClone(point);partial.provenance!.netProfit[1].amounts = null;
  assert.ok(ttmLabel(partial).includes("منبع این دوره نامعلوم"));assert.equal(links(ttmLabel(partial)).length, 6);
  const finalProfitUnknown = structuredClone(point);finalProfitUnknown.provenance!.netProfit[3].amounts = null;
  assert.equal(links(ttmLabel(finalProfitUnknown)).length, 6, "independently bound capital survives missing profit metadata");
  const wrong = structuredClone(point);wrong.provenance!.netProfit[3].periodEnd = "1405-12-29";
  assert.equal(links(ttmLabel(wrong)).length, 0);
  const reordered = structuredClone(point);[reordered.provenance!.netProfit[0], reordered.provenance!.netProfit[1]] = [reordered.provenance!.netProfit[1], reordered.provenance!.netProfit[0]];
  assert.equal(links(ttmLabel(reordered)).length, 0);
  const capital = structuredClone(point);capital.provenance!.capital = capital.provenance!.netProfit[0].amounts!.contributors[0].report;
  assert.equal(links(ttmLabel(capital)).length, 7);
});

test("nonPreview keeps original point shapes and tooltips; P/E source and format are unchanged in either mode", () => {
  const quarters = deriveQuarters(reports()), pe = [{ label: "Q3 1403", pe: 4.5 }, { label: "Q4 1403", pe: 5.5 }];
  for (const preview of [false, true]) {
    const shown = charts(quarters, preview, 12, pe), tips = shown.traces.filter(t => t.component === "Tooltip");
    const last = tips[2].props;
    assert.equal(last.labelFormatter, undefined);assert.equal(last.portal, undefined);assert.equal(last.trigger, undefined);
    assert.deepEqual(Array.from((last.formatter as (v: unknown, n: unknown) => string[])(null, "P/E")), ["—", "P/E"]);
    if (!preview) {
      assert.ok(!shown.html.includes("منابع سود هر سهم دوازده‌ماهه"));assert.ok(!shown.html.includes("data-monthly-source-portal"));
      for (const tip of tips) { assert.equal(tip.props.labelFormatter, undefined);assert.equal(tip.props.trigger, undefined);assert.equal(tip.props.portal, undefined); }
      for (const plot of shown.traces.filter(t => ["BarChart", "LineChart"].includes(t.component)))
        assert.ok((plot.props.data as Array<Record<string, unknown>>).every(p => !Object.hasOwn(p, "sourceQuarter")));
    }
  }
});

test("quarter source label uses the shared frame marker and preserves native link defaults and Escape", () => {
  const component = sources.QuarterSourceLabel as (props: Record<string, unknown>) => React.ReactElement;
  const label = component({ label: "فصل", payload: [] }), props = label.props as Record<string, unknown>;
  assert.equal(props["data-chart-point-source"], "");
  for (const [handler, key, expected] of [["onClick", "", true], ["onFocus", "", true], ["onKeyDown", "Enter", true], ["onKeyDown", "Escape", false]] as const) {
    let stopped = false;
    (props[handler] as (event: unknown) => void)({ key, stopPropagation() { stopped = true; }, preventDefault() { assert.fail("native defaults must remain"); } });
    assert.equal(stopped, expected);
  }
});

test("the existing shared frame recognizes quarterly source links in both focus directions without changing pointer mode", () => {
  class ElementTarget {
    constructor(public source: boolean) {}
    closest(selector: string) { return this.source && selector.includes("[data-chart-point-source]") ? this : null; }
  }
  let calls = 0, mode = "hover";
  const frame = view("MonthlySourceChartFrame", { ...React, useState: () => calls++ === 0 ? [mode, (value: string) => { mode = value; }] : [null, () => {}] }, ElementTarget).default as (props: Record<string, unknown>) => React.ReactElement;
  const outer = frame({ enabled: true, height: 250, width: "100%", children: () => null });
  const element = (outer.props as { children: React.ReactElement[] }).children[1];
  const props = element.props as Record<string, (event: unknown) => void>, source = new ElementTarget(true), svg = new ElementTarget(false);
  props.onPointerDownCapture({ target: source });assert.equal(mode, "hover");
  for (const [target, relatedTarget] of [[svg, source], [source, svg]]) {
    let stopped = false;
    props.onBlurCapture({ target, relatedTarget, currentTarget: { contains: () => true }, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
  }
});
