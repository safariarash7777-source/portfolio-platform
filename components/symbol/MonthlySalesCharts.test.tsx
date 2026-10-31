import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildMonthlySales, narrativeRate } from "../../lib/core/monthlyReport";
import type { CodalN30Data, N30ProductRow } from "../../lib/fundamental/types";

type Trace = { component: string; props: Record<string, unknown> };
const require = createRequire(import.meta.url);
function renderChart(reports: CodalN30Data[], capture = true) {
  const traces: Trace[] = [];
  const source = readFileSync(new URL("./MonthlySalesCharts.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const components = ["Bar", "BarChart", "CartesianGrid", "Cell", "ComposedChart", "Legend", "Line", "LineChart", "ReferenceLine", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"];
  // Only the chart-library rendering is replaced. Actual component, core and formatting run unchanged.
  const recharts = Object.fromEntries(components.map(component => [component, (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    traces.push({ component, props });
    return React.createElement("div", { "data-test-chart": component }, props.children);
  }]));
  const chartModule = { exports: {} as { default: React.ComponentType<{ reports: CodalN30Data[]; sourceTitle: string; sourceUrl: string | null }> } };
  const isolatedRequire = (id: string) => {
    if (id === "recharts" && capture) return recharts;
    return require(id.startsWith("@/") ? `../../${id.slice(2)}` : id);
  };
  vm.runInNewContext(javascript, { module: chartModule, exports: chartModule.exports, require: isolatedRequire, React }, { filename: "actual-MonthlySalesCharts.tsx" });
  const before = structuredClone(reports);
  const html = renderToStaticMarkup(React.createElement(chartModule.exports.default, {
    reports, sourceTitle: "گزارش همان شرکت", sourceUrl: "https://codal.ir/Reports/fixture",
  }));
  assert.deepEqual(reports, before, "Rendering must not mutate reports or backfill units");
  return { html, traces };
}
function product(overrides: Partial<N30ProductRow> = {}): N30ProductRow {
  return { product_name: "محصول آزمون", market: "داخلی", market_basis: "section_header", qty_unit: "تن",
    production_qty: 20, sales_qty: 10, sales_rate: 100, sales_amount: 1, ...overrides };
}
function report(date: string, products = [product()], overrides: Partial<CodalN30Data> = {}): CodalN30Data {
  return { symbol: "نمونه آزمون", report_kind: "ن-۳۰", period_end: date, fiscal_year: 1405,
    unit: "میلیون ریال", products, period_total_amount: products.reduce((sum, row) => sum + (row.sales_amount ?? 0), 0),
    fy_cumulative_amount: 100, ...overrides };
}
const chartData = (trace: Trace) => trace.props.data as Array<Record<string, string | number | null>>;
const values = (trace: Trace, key: string) => Array.from(chartData(trace), row => row[key]);
const formatter = (trace: Trace) => trace.props.formatter as (value: unknown, name: unknown) => [string, string];

test("monthly charts render declared units, actual values, calendar gaps and unit-bearing tooltips", () => {
  const reports = [report("1405-01-31"), report("1405-03-31", [product({ sales_rate: 200 })])];
  const { html, traces } = renderChart(reports);
  assert.ok(html.includes("واحد نرخ: ریال به ازای تن"));
  assert.ok(html.includes("واحد مقدار: تن"));
  assert.ok(html.includes("https://codal.ir/Reports/fixture"));
  const lines = traces.filter(trace => trace.component === "LineChart");
  assert.equal(lines.length, 2, "Cumulative chart and one same-unit rate chart");
  assert.deepEqual(values(lines[1], "s0"), [100, null, 200]);
  assert.deepEqual(values(traces.find(trace => trace.component === "BarChart")!, "production"), [20, null, 20]);
  assert.ok(traces.filter(trace => trace.component === "Line").every(trace => trace.props.connectNulls === false));
  const tooltips = traces.filter(trace => trace.component === "Tooltip");
  assert.deepEqual(Array.from(formatter(tooltips[2])(100, "نرخ")), ["۱۰۰ ریال به ازای تن", "نرخ"]);
  assert.deepEqual(Array.from(formatter(tooltips[3])(20, "تولید")), ["۲۰ تن", "تولید"]);
  assert.equal(formatter(tooltips[2])(null, "نرخ")[0], "—");
  assert.equal(buildMonthlySales(reports)!.rateSeries[0].points[1].rate, null);
});

test("different valid rate denominators get separate axes and an unknown series cannot erase valid peers", () => {
  const reports = [report("1405-01-31", [
    product({ product_name: "تن معتبر", sales_amount: 3, sales_rate: 100 }),
    product({ product_name: "عدد معتبر", qty_unit: "عدد", sales_amount: 2, sales_rate: 200 }),
    product({ product_name: "بازار نامعلوم", market_basis: undefined, sales_amount: 1, sales_rate: 300 }),
  ])];
  const { html, traces } = renderChart(reports);
  assert.ok(html.includes("ریال به ازای تن")); assert.ok(html.includes("ریال به ازای عدد"));
  assert.ok(html.includes("نرخ‌های با واحد نامعلوم رسم نشده‌اند"));
  const rateCharts = traces.filter(trace => trace.component === "LineChart").slice(1);
  assert.equal(rateCharts.length, 2);
  assert.deepEqual(Object.keys(chartData(rateCharts[0])[0]), ["label", "monthKey", "s0"]);
  assert.deepEqual(Object.keys(chartData(rateCharts[1])[0]), ["label", "monthKey", "s1"]);
  assert.equal(chartData(rateCharts[0])[0].s0, 100); assert.equal(chartData(rateCharts[1])[0].s1, 200);
  assert.equal(buildMonthlySales(reports)!.rateSeries[2].points[0].rate, 300, "Unknown numeric source value remains in core");
  const quantities = traces.filter(trace => trace.component === "BarChart");
  assert.equal(quantities.length, 1, "Other products cannot invalidate the selected main product's own valid unit");
  assert.deepEqual(values(quantities[0], "sales"), [10]);
});

test("mixed units within the main product keep valid market rates but cannot certify a quantity sum", () => {
  const reports = [report("1405-01-31", [
    product({ sales_amount: 2 }),
    product({ market: "صادراتی", qty_unit: "عدد", sales_amount: 1, sales_rate: 200 }),
  ])];
  const model = buildMonthlySales(reports)!;
  assert.equal(model.prodVsSales[0].sales, 20, "The existing numeric core sum is unchanged");
  assert.equal(model.prodVsSales[0].quantityUnit, null);
  const { html, traces } = renderChart(reports);
  assert.equal(traces.filter(trace => trace.component === "LineChart").length, 3);
  assert.equal(traces.filter(trace => trace.component === "BarChart").length, 0);
  assert.ok(html.includes("مقدار قابل‌مقایسهٔ تولید و فروش موجود نیست"));
  assert.ok(!html.includes("افزایش موجودی"));
  assert.ok(traces.filter(trace => trace.component === "Line").some(trace => trace.props.strokeDasharray === "6 4"));
});

test("unit changes split the existing calendar into separate plots and suppress cross-unit rate narrative", () => {
  const reports = [report("1405-01-31"), report("1405-03-31", [product({ qty_unit: "عدد", sales_rate: 400 })])];
  const model = buildMonthlySales(reports)!;
  assert.equal(model.rateSeries[0].rateUnit, null);
  assert.ok(narrativeRate(model), "The old numeric narrative exists and must not certify mixed units in UI");
  const { html, traces } = renderChart(reports);
  const rates = traces.filter(trace => trace.component === "LineChart").slice(1);
  assert.equal(rates.length, 2);
  assert.deepEqual(values(rates[0], "s0"), [100, null, null]);
  assert.deepEqual(values(rates[1], "s0"), [null, null, 400]);
  const quantities = traces.filter(trace => trace.component === "BarChart");
  assert.equal(quantities.length, 2);
  assert.deepEqual(values(quantities[0], "sales"), [10, null, null]);
  assert.deepEqual(values(quantities[1], "sales"), [null, null, 10]);
  assert.ok(!html.includes("بالاتر از میانگین بازهٔ گزارش‌شده"));
  assert.ok(!html.includes("پایین‌تر از میانگین بازهٔ گزارش‌شده"));
});

test("unknown numerator leaves valid quantity visible but cannot label a rate as rial", () => {
  const { html, traces } = renderChart([report("1405-01-31", [product()], { unit: undefined })]);
  assert.ok(html.includes("نرخ فروش با واحد معتبر موجود نیست"));
  assert.ok(!html.includes("واحد نرخ: ریال"));
  assert.ok(html.includes("واحد مقدار: تن"));
  assert.equal(traces.filter(trace => trace.component === "LineChart").length, 1);
  assert.deepEqual(values(traces.find(trace => trace.component === "BarChart")!, "sales"), [10]);
});

test("reported quantity zero stays zero, while missing quantities stay gaps", () => {
  const { html, traces } = renderChart([
    report("1405-01-31", [product({ production_qty: 0, sales_qty: 0 })]),
    report("1405-03-31", [product({ production_qty: null })]),
  ]);
  assert.ok(html.includes("واحد مقدار: تن"));
  const quantities = traces.find(trace => trace.component === "BarChart")!;
  assert.deepEqual(values(quantities, "production"), [0, null, null]);
  assert.deepEqual(values(quantities, "sales"), [0, null, null]);
  const tooltips = traces.filter(trace => trace.component === "Tooltip");
  assert.equal(formatter(tooltips[tooltips.length - 1])(0, "فروش")[0], "۰ تن");
});

test("legacy, services, explicit null and out-of-catalog units remain honest unavailable states", () => {
  for (const row of [
    product({ market_basis: undefined }), product({ market: "خدمات" }),
    product({ qty_unit: null }), product({ qty_unit: "هزار تن" }),
  ]) {
    const reports = [report("1405-01-31", [row], { qty_unit: "تن" })];
    const { html, traces } = renderChart(reports);
    assert.ok(html.includes("نرخ فروش با واحد معتبر موجود نیست"));
    assert.ok(html.includes("مقدار قابل‌مقایسهٔ تولید و فروش موجود نیست"));
    assert.equal(traces.filter(trace => trace.component === "BarChart").length, 0);
    assert.equal(traces.filter(trace => trace.component === "LineChart").length, 1);
    assert.equal(buildMonthlySales(reports)!.rateSeries[0].points[0].rate, 100);
    assert.ok(!html.includes("افزایش موجودی"), "Unknown quantity units must not certify inventory narrative");
  }
});

test("real Recharts SSR retains unit labels, source and explicit unavailable state without chart mocks", () => {
  const ready = renderChart([report("1405-01-31")], false).html;
  assert.ok(ready.includes("واحد نرخ: ریال به ازای تن"));
  assert.ok(ready.includes("واحد مقدار: تن"));
  assert.ok(ready.includes('id="q-monthly-sales"')); assert.ok(ready.includes('id="q-cumulative"'));
  assert.ok(ready.includes('id="q-sales-mix"')); assert.ok(ready.includes('id="q-prod-vs-sales"'));
  assert.ok(ready.includes("گزارش همان شرکت"));
  const unknown = renderChart([report("1405-01-31", [product({ qty_unit: null })])], false).html;
  assert.ok(unknown.includes('role="status"')); assert.ok(unknown.includes("واحد نامعلوم"));
});
