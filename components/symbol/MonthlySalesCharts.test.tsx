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
import { withKnownMonthlyQuantities, type QuantityWitnessedReport } from "../../lib/core/monthly-quantity";
import { foladQuantityFixture } from "../../relay/fixtures/codal-offline.mjs";

type Trace = { component: string; props: Record<string, unknown> };
const require = createRequire(import.meta.url);
function renderChart(reports: CodalN30Data[], capture = true, previewSelection?: [string, string]) {
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
  const chartModule = { exports: {} as { default: React.ComponentType<{ reports: CodalN30Data[]; sourceTitle: string; sourceUrl: string | null; previewControls?: boolean }> } };
  let stateIndex = 0;
  const isolatedRequire = (id: string) => {
    if (id === 'react' && previewSelection) return { ...React, useEffect() {}, useState: () => [previewSelection[stateIndex++], () => {}] };
    if (id === "recharts" && capture) return recharts;
    return require(id.startsWith("@/") ? `../../${id.slice(2)}` : id);
  };
  vm.runInNewContext(javascript, { module: chartModule, exports: chartModule.exports, require: isolatedRequire, React }, { filename: "actual-MonthlySalesCharts.tsx" });
  const before = structuredClone(reports);
  const html = renderToStaticMarkup(React.createElement(chartModule.exports.default, {
    reports, sourceTitle: "گزارش همان شرکت", sourceUrl: "https://codal.ir/Reports/fixture",
    previewControls: previewSelection !== undefined,
  }));
  assert.deepEqual(reports, before, "Rendering must not mutate reports or backfill units");
  return { html, traces };
}

test('Preview period/rate selection uses existing models without changing totals, gaps or unknown units', () => {
  const reports = [report('1405-01-31'), report('1404-03-31'), report('1404-01-31'), report('1403-01-31')];
  const chosen = renderChart(reports, true, ['1404', JSON.stringify(['محصول آزمون', 'داخلی'])]);
  assert.match(chosen.html, /سال تقویمی گزارش‌های ماهانه/);
  assert.match(chosen.html, /سال ۱۴۰۴ در کنار سال ۱۴۰۳/);
  const bars = chosen.traces.find(trace => trace.component === 'ComposedChart')!;
  assert.deepEqual(values(bars, 'current').slice(0, 4), [1, null, 1, null]);
  assert.deepEqual(values(bars, 'prior').slice(0, 4), [1, null, null, null]);
  const unknown = renderChart([report('1404-01-31', [product({qty_unit:null})])], true, ['9999', 'invalid']);
  assert.match(unknown.html, /سال ۱۴۰۴/);
  assert.doesNotMatch(unknown.html, /ریال به ازای تن/);
  assert.match(unknown.html, /واحد نامعلوم|واحد معتبر|واحد نرخ/);
  assert.doesNotMatch(renderChart(reports).html, /سال تقویمی گزارش‌های ماهانه/);
});

test('Preview rate selection cannot identify ambiguous market series as one verified product', () => {
  const rows = [product({market:'داخلی', market_basis:undefined}), product({market:'صادراتی', market_basis:undefined})];
  const shown = renderChart([report('1404-01-31', rows)], true, ['1404', JSON.stringify(['محصول آزمون','نامشخص'])]);
  assert.doesNotMatch(shown.html, /<option[^>]*>محصول آزمون — تفکیک نامعلوم<\/option>/);
  assert.match(shown.html, /همهٔ سری‌های نرخ موجود/);
});
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

test("actual archived HTML through parser, quantity gate, core and UI renders goods markets separately while rates stay unknown", () => {
  const fixture = foladQuantityFixture();
  const reports = [withKnownMonthlyQuantities(fixture.report)];
  const { html, traces } = renderChart(reports);
  assert.ok(html.includes('محصولات گرم — کالای داخلی'));assert.ok(html.includes('محصولات گرم — کالای صادراتی'));
  assert.ok(html.includes('خدمات در این نمودار نیست'));assert.ok(html.includes('هر نمودار فقط کالای همان بازار است'));
  assert.ok(html.includes('واحد مقدار: هزار تن'));assert.ok(html.includes('نرخ فروش با واحد معتبر موجود نیست'));
  assert.ok(!html.includes('واحد نرخ: ریال'));assert.ok(!html.includes('افزایش موجودی'));
  const charts = traces.filter(t => t.component === 'BarChart');
  assert.equal(charts.length, 2);
  assert.deepEqual(values(charts[0], 'production'), [279]);assert.deepEqual(values(charts[0], 'sales'), [238]);
  assert.deepEqual(values(charts[1], 'production'), [0]);assert.deepEqual(values(charts[1], 'sales'), [66]);
  assert.equal(traces.filter(t => t.component === 'LineChart').length, 1, 'Only cumulative money, no new-unit rate lines');
  const tooltips = traces.filter(t => t.component === 'Tooltip');
  assert.equal(formatter(tooltips.at(-1)!)(0, 'تولید')[0], '۰ هزار تن');
  assert.equal(formatter(tooltips.at(-2)!)(279, 'تولید')[0], '۲۷۹ هزار تن');
  assert.equal(fixture.counts.network, 0);
  const real = renderChart(reports, false).html;
  assert.ok(real.includes('محصولات گرم — کالای داخلی'));assert.ok(real.includes('واحد مقدار: هزار تن'));
});

test("a failed scoped witness cannot turn into a goods-and-service aggregate or erase a healthy market", () => {
  const raw = foladQuantityFixture().report as QuantityWitnessedReport;
  const domestic = raw.products.find(p => p.product_name === 'محصولات گرم' && p.market === 'داخلی')!;
  domestic.quantity_witness!.htmlSha256 = '0'.repeat(64);
  const { html, traces } = renderChart([withKnownMonthlyQuantities(raw)]);
  assert.ok(html.includes('محصولات گرم — کالای داخلی: مقدار قابل‌مقایسهٔ تولید و فروش موجود نیست'));
  assert.ok(html.includes('محصولات گرم — کالای صادراتی'));
  const charts = traces.filter(t => t.component === 'BarChart');
  assert.equal(charts.length, 1);assert.deepEqual(values(charts[0], 'production'), [0]);
  assert.deepEqual(values(charts[0], 'sales'), [66]);
  assert.ok(!html.includes('افزایش موجودی'));assert.ok(!html.includes('واحد نرخ: ریال'));
});

test("scoped UI preserves the existing calendar gaps and never borrows a witness from an older amendment", () => {
  const raw = foladQuantityFixture().report as QuantityWitnessedReport;
  const earlier = structuredClone(raw);earlier.period_end = '1405-04-31';earlier.quantity_source!.periodEnd = earlier.period_end;
  for (const p of earlier.products) p.quantity_witness!.periodEnd = earlier.period_end;
  const amendment = structuredClone(raw);
  delete amendment.products.find(p => p.product_name === 'محصولات گرم' && p.market === 'داخلی')!.quantity_witness;
  const { html, traces } = renderChart([amendment, raw, earlier].map(withKnownMonthlyQuantities));
  assert.ok(html.includes('ماه فاقد مقدار کامل یا واحد معتبر خالی می‌ماند'));
  const charts = traces.filter(t => t.component === 'BarChart');
  assert.deepEqual(values(charts[0], 'production'), [279, null, null]);
  assert.deepEqual(values(charts[0], 'sales'), [238, null, null]);
  assert.deepEqual(values(charts[1], 'production'), [0, null, 0]);
  assert.deepEqual(values(charts[1], 'sales'), [66, null, 66]);
});
