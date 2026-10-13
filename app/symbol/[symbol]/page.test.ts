import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { IrMarket, IrStockRow } from "../../../lib/market-ir";
import { withValidNav, marketQualityLabel } from "../../../lib/market-quality";
import { formatRialAsToman, formatJalali, formatTehranClock, toPersianDigits } from "../../../lib/format";
import { deriveQuarters, ttmSeries, peOf, type QuarterInput, type DerivedQuarter, type TtmPoint } from "../../../lib/core/quarterly";
import type { SymbolFundamentals, ReportScope } from "../../../lib/fundamental/types";

Object.assign(globalThis, { React });

const require = createRequire(import.meta.url);
const now = Date.parse("2026-09-30T10:00:00Z");
const stock: IrStockRow = { id: "fixture", faName: "نمونهٔ آزمون", unit: "toman", price: 110, closingPrice: 110, value: 50_000_000_000, marketValue: 700_000_000_000, sourceDate: "1405-07-08", sourceTime: "13:25:00" };
const fund: IrStockRow = { ...stock, type: "سهامی", nav: 100, navIssue: 101, navStatus: "ready", navDate: "1405-07-08", navTime: "13:25:00", bubblePercent: 999 };
const market = (row: IrStockRow, isFund = false): IrMarket => ({ ok: true, fetchedAt: now, gold: [], currency: [], crypto: [], options: [], indices: null, stocks: isFund ? [] : [row], funds: isFund ? [row] : [] });

async function actualPage(ir: IrMarket, symbol = stock.id, fundamentals: SymbolFundamentals | null = null) {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const pageModule = { exports: {} as { default: (props: object) => Promise<React.ReactElement> } };
  const traces = { inputs: [] as QuarterInput[], quarters: [] as DerivedQuarter[], ttm: [] as TtmPoint[] };
  const stubs: Record<string, unknown> = {
    "@/lib/market-ir": { getStoredIrMarket: async () => ir },
    "@/lib/fundamental/registry": { readFundamentals: async () => ({ state: fundamentals ? "ready" : "empty", data: fundamentals }) },
    "@/lib/core/quarterly": {
      peOf,
      deriveQuarters: (inputs: QuarterInput[]) => { traces.inputs = inputs; traces.quarters = deriveQuarters(inputs); return traces.quarters; },
      ttmSeries: (quarters: DerivedQuarter[]) => { traces.ttm = ttmSeries(quarters); return traces.ttm; },
    },
    "@/lib/core/history": { getSymbolHistory: async () => [] },
    "@/lib/core/navHistory": { getNavHistory: async () => [] },
    "@/lib/core/fx": { getFxRates: async () => [], latestRate: () => null },
    "@/lib/access": { getAccess: async () => ({ tier: "guest" }) },
  };
  const fakeRequire = (specifier: string) => {
    if (specifier in stubs) return stubs[specifier];
    if (specifier === "@/components/symbol/FundamentalCharts" || specifier === "@/components/symbol/SymbolTabs") return require(`../../../${specifier.slice(2)}`);
    if (specifier.startsWith("@/components/")) {
      const Stub = (props: { children?: React.ReactNode; overview?: React.ReactNode }) => React.createElement(React.Fragment, null, props.children, props.overview);
      Object.defineProperty(Stub, "name", { value: specifier });
      return { __esModule: true, default: Stub };
    }
    return require(specifier.startsWith("@/") ? `../../../${specifier.slice(2)}` : specifier);
  };
  // Only the VM's clock is fixed; no global clock or real source is touched.
  class FixedDate extends Date { constructor(value: string | number = now) { super(value); } static now() { return now; } }
  vm.runInNewContext(js, { module: pageModule, exports: pageModule.exports, require: fakeRequire, Date: FixedDate });
  const tree = await pageModule.exports.default({ params: Promise.resolve({ symbol }) });
  const nodes: React.ReactElement<Record<string, unknown>>[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!React.isValidElement(node)) return;
    const element = node as React.ReactElement<Record<string, unknown>>;
    nodes.push(element);
    walk(element.props.children); walk(element.props.overview); walk(element.props.fundamental);
  };
  walk(tree);
  const stat = (label: string) => {
    const node = nodes.find(n => n.props.label === label);
    assert.ok(node, `missing actual stat: ${label}`);
    return node.props;
  };
  const panel = nodes.find(n => typeof n.type === "function" && n.type.name === "@/components/fund/FundAnalysisPanel");
  const quarterly = nodes.find(n => typeof n.type === "function" && n.type.name === "@/components/symbol/QuarterlyCharts");
  return { stat, traces, quarterly: quarterly?.props as { quarters: DerivedQuarter[]; ttm: TtmPoint[]; sourceTitle: string } | undefined, panel: panel?.props as { live: { bubblePercent: number | null; state: string; reason: string | null; priceAgeHours: number | null }; peer: { of: number; median: number } | null } | undefined, html: renderToStaticMarkup(tree) };
}

test("symbol renders relay rial transaction and market values through the board's toman formatter", async () => {
  const shown = await actualPage(market(stock));
  assert.equal(shown.stat("ارزش معاملات").value, formatRialAsToman(stock.value));
  assert.equal(shown.stat("ارزش بازار").value, formatRialAsToman(stock.marketValue));
  const missing = await actualPage(market({ ...stock, value: undefined, marketValue: null }));
  assert.equal(missing.stat("ارزش معاملات").value, "—");
  const zero = await actualPage(market({ ...stock, value: 0 }));
  assert.equal(zero.stat("ارزش معاملات").value, formatRialAsToman(0));
});

test("symbol exposes source and family receipt clocks with the market quality label", async () => {
  const ir = market(stock);
  ir.snapshotQuality = { version: 1, state: "partial", attemptedAt: now, families: { stocks: { state: "received", receivedAt: now - 60_000, retained: false } } };
  const shown = await actualPage(ir);
  assert.ok(shown.html.includes(marketQualityLabel("ready")));
  assert.ok(shown.html.includes(`زمان قیمت: ${formatJalali(now - 300_000)} · ${formatTehranClock(now - 300_000)}`));
  assert.ok(shown.html.includes(`دریافت اسنپ‌شات: ${formatJalali(now - 60_000)} · ${formatTehranClock(now - 60_000)}`));
});

test("fresh receipt cannot hide absent/old source time, retained rows or invalid receipt", async () => {
  for (const [row, state] of [[{ ...stock, sourceTime: null }, "unknown-time"], [{ ...stock, sourceDate: "1405-07-06" }, "stale"]] as const) {
    const shown = await actualPage(market(row));
    assert.ok(shown.html.includes(marketQualityLabel(state)));
    assert.ok(!shown.html.includes(marketQualityLabel("ready")));
  }
  const ir = market(stock);
  ir.snapshotQuality = { version: 1, state: "partial", attemptedAt: now, families: { stocks: { state: "stale", receivedAt: now, retained: true } } };
  assert.ok((await actualPage(ir)).html.includes(marketQualityLabel("stale")));
  assert.ok((await actualPage({ ...market(stock), fetchedAt: null })).html.includes(marketQualityLabel("unknown-time")));
});

test("symbol NAV, bubble and panel use the same validation as the funds table", async () => {
  for (const changes of [{}, { navStatus: "stale" }, { navStatus: "invalid-time" }, { navStatus: "invalid-unit" }, { navStatus: "unavailable" }, { sourceTime: null }, { sourceDate: "1405-07-06" }, { navDate: "1405-07-06" }, { nav: null }]) {
    const row = { ...fund, ...changes };
    const valid = withValidNav(row, null, now);
    const shown = await actualPage(market(row, true));
    assert.ok(shown.panel);
    assert.equal(shown.panel.live.bubblePercent, valid.bubblePercent);
    assert.equal(shown.panel.live.state, valid.navState === "unknown-time" ? "unavailable" : valid.navState);
    assert.equal(shown.panel.live.reason, valid.navReason);
    if (valid.navState !== "ready") {
      assert.equal(shown.stat("حباب").value, "—");
      assert.ok(String(shown.stat("NAV ابطال").note).includes(toPersianDigits(valid.navReason ?? "")));
      assert.ok(String(shown.stat("NAV صدور").note).includes(toPersianDigits(valid.navReason ?? "")));
    }
    assert.equal(row.bubblePercent, 999, "source snapshot must stay untouched");
  }
});

test("missing source price time is never replaced by fetchedAt in NAV diagnostics", async () => {
  const shown = await actualPage(market({ ...fund, sourceTime: null }, true));
  assert.ok(shown.panel);
  assert.equal(shown.panel.live.priceAgeHours, null);
  assert.equal(shown.panel.live.bubblePercent, null);
});

test("peer ranks recompute valid rows and exclude raw rejected/missing-clock bubbles", async () => {
  const ir = market(fund, true);
  ir.funds = [fund, { ...fund, id: "peer2", price: 120, closingPrice: 120 }, { ...fund, id: "peer3", price: 130, closingPrice: 130 }, { ...fund, id: "rejected", navStatus: "invalid-unit", bubblePercent: -999 }, { ...fund, id: "no-clock", sourceTime: null, bubblePercent: -999 }];
  const shown = await actualPage(ir);
  assert.ok(shown.panel?.peer);
  assert.equal(shown.panel.peer.of, 3);
  assert.ok(Math.abs(shown.panel.peer.median - 20) < 1e-9);
  assert.equal((await actualPage(ir, "rejected")).panel?.peer, null);
});

type Period = NonNullable<SymbolFundamentals["n10Periods"]>[number];
function reportPeriod(id: number, end: string, months: number, total: number, scope: ReportScope | undefined = "company", unit: unknown = "میلیون ریال"): Period {
  return { id, scope, data: { symbol: stock.id, company_name: "Synthetic company", report_kind: "ن-۱۰", period_end: end, period_months: months,
    audited: false, restated_prior: false, unit: unit as string, capital: 100,
    standalone: { revenue: total, cogs: 0, gross_profit: total, operating_profit: total, net_profit: total, eps_rial: 1434 } } };
}
function reportSet(periods: Period[], scope: ReportScope | undefined = "company", eps: unknown = 1434): SymbolFundamentals {
  const last = periods.at(-1) ?? reportPeriod(1, "1404-03-31", 3, 100);
  return { symbol: stock.id, n30: null, n10Periods: periods, n10PeriodsScope: "company",
    n10: { data: { ...last.data, standalone: { ...last.data.standalone, eps_rial: eps as number } },
      source: { title: "Synthetic primary annual report", source_url: null, verified: false, scope } } };
}
const companyPeriods = () => ["1404-03-31", "1404-06-31", "1404-09-30", "1404-12-29"].map((end, i) => reportPeriod(i + 1, end, (i + 1) * 3, (i + 1) * 100));

test("actual symbol caller forwards per-row company/unit evidence and preserves known quarterly/TTM values", async () => {
  const shown = await actualPage(market(stock), stock.id, reportSet(companyPeriods()));
  assert.ok(shown.quarterly);
  assert.ok(shown.traces.inputs.every(p => p.scope === "company" && p.unit === "میلیون ریال"));
  assert.deepEqual(Array.from(shown.quarterly.quarters, q => q.revenue), [100, 100, 100, 100]);
  assert.deepEqual(Array.from(shown.quarterly.quarters, q => q.netProfit), [100, 100, 100, 100]);
  assert.deepEqual(Array.from(shown.quarterly.ttm, t => ({ ...t })), [{ label: "Q4 1404", periodEnd: "1404-12-29", netProfitTtm: 400, epsTtm: 4000 }]);
});

test("actual symbol caller never substitutes summary scope in a noncalendar mixed-scope chain or annual source title", async () => {
  const periods = ["1404-09-30", "1404-12-29", "1405-03-31", "1405-06-31"].map((end, i) => reportPeriod(i + 1, end, (i + 1) * 3, [100, 200, 900, 1200][i], i === 2 ? "consolidated_ambiguous" : "company"));
  const reports = reportSet(periods, "consolidated_ambiguous");
  reports.n10!.source.title = "Synthetic consolidated annual source";
  const shown = await actualPage(market(stock), stock.id, reports);
  assert.ok(shown.quarterly);
  assert.equal(shown.traces.inputs[2].scope, "consolidated_ambiguous");
  assert.deepEqual(Array.from(shown.quarterly.quarters, q => q.revenue), [100, 100, null, null]);
  assert.equal(shown.traces.ttm.length, 0);
  assert.ok(!shown.quarterly.sourceTitle.includes(reports.n10!.source.title));
  assert.ok(shown.quarterly.sourceTitle.includes("شرکت"));
  assert.ok(shown.quarterly.sourceTitle.includes(toPersianDigits("1405-06-31")));
  assert.ok(!shown.quarterly.sourceTitle.includes(toPersianDigits("1405-03-31")));
});

test("actual symbol unknown unit/scope hides quarantined quarters with an honest report reason and empty TTM", async () => {
  for (const kind of ["unit", "scope", "both"] as const) {
    const periods = companyPeriods();
    for (const p of periods) { if (kind !== "scope") delete (p.data as Partial<typeof p.data>).unit; if (kind !== "unit") delete p.scope; }
    const reports = reportSet(periods, kind === "unit" ? "company" : undefined);
    if (kind !== "unit") delete reports.n10!.source.scope;
    const shown = await actualPage(market(stock), stock.id, reports);
    assert.equal(shown.quarterly, undefined); assert.equal(shown.traces.ttm.length, 0);
    assert.ok(shown.traces.inputs.every(p => kind === "scope" ? p.scope === undefined : p.unit === undefined));
    if (kind !== "scope") assert.ok(shown.html.includes("واحد مبالغ نامشخص"));
    else assert.ok(shown.html.includes("دامنهٔ ارقام مشخص نیست"));
    assert.ok(!shown.html.includes("صورت مالی قابل نمایش برای این نماد در دسترس نیست"));
  }
});

test("actual symbol hides all-null quarters but keeps null gaps between valid observed quarters", async () => {
  const allNull = companyPeriods();
  for (const p of allNull) for (const field of ["revenue", "gross_profit", "operating_profit", "net_profit"] as const) p.data.standalone[field] = null as unknown as number;
  const hidden = await actualPage(market(stock), stock.id, reportSet(allNull));
  assert.equal(hidden.quarterly, undefined); assert.equal(hidden.traces.ttm.length, 0);
  const gap = companyPeriods(); delete gap[1].scope;
  const shown = await actualPage(market(stock), stock.id, reportSet(gap));
  assert.ok(shown.quarterly);
  assert.deepEqual(Array.from(shown.quarterly.quarters, q => q.revenue), [100, null, null, 100]);
  assert.equal(shown.quarterly.quarters.length, 4); assert.equal(shown.traces.ttm.length, 0);
});

test("actual symbol EPS keeps quote priority and raw rial-per-share, while report fallback requires company/known unit/finite number", async () => {
  for (const eps of [1434, 0, null, NaN, "1434"] as const) {
    const shown = await actualPage(market(stock), stock.id, reportSet(companyPeriods(), "company", eps));
    assert.equal(shown.stat("EPS (ریال)").value, typeof eps === "number" && Number.isFinite(eps) ? toPersianDigits(eps.toLocaleString("en-US")).replace(/,/g, "٬") : "—");
  }
  for (const scope of ["unknown", "consolidated_ambiguous", undefined] as const) {
    const reports = reportSet(companyPeriods(), scope); if (scope === undefined) delete reports.n10!.source.scope;
    assert.equal((await actualPage(market(stock), stock.id, reports)).stat("EPS (ریال)").value, "—");
    for (const eps of [321, 0]) assert.equal((await actualPage(market({ ...stock, eps }), stock.id, reports)).stat("EPS (ریال)").value, toPersianDigits(String(eps)));
  }
  const unknownUnit = reportSet(companyPeriods()); delete (unknownUnit.n10!.data as Partial<Period["data"]>).unit;
  assert.equal((await actualPage(market(stock), stock.id, unknownUnit)).stat("EPS (ریال)").value, "—");
});
