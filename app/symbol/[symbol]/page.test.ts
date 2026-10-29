import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { IrMarket, IrStockRow } from "../../../lib/market-ir";
import { withValidNav, marketQualityLabel } from "../../../lib/market-quality";
import { formatRialAsToman, formatJalali, formatTehranClock, toPersianDigits } from "../../../lib/format";
import { deriveQuarters, ttmSeries, peOf, type QuarterInput, type DerivedQuarter, type TtmPoint } from "../../../lib/core/quarterly";
import type { SymbolFundamentals, ReportScope, CodalN30Data } from "../../../lib/fundamental/types";
import type { FundamentalCardData } from "../../../lib/core/fundamentalCard";

Object.assign(globalThis, { React });

const require = createRequire(import.meta.url);
const cssModule = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
// Only the offline Node renderer needs this; Next compiles the actual stylesheet.
require.extensions[".css"] = (loaded, filename) => {
  assert.ok(filename.endsWith(".module.css"));
  loaded.exports = cssModule;
};
const now = Date.parse("2026-09-30T10:00:00Z");
const stock: IrStockRow = { id: "fixture", faName: "نمونهٔ آزمون", unit: "toman", price: 110, closingPrice: 110, value: 50_000_000_000, marketValue: 700_000_000_000, sourceDate: "1405-07-08", sourceTime: "13:25:00" };
const fund: IrStockRow = { ...stock, type: "سهامی", nav: 100, navIssue: 101, navStatus: "ready", navDate: "1405-07-08", navTime: "13:25:00", bubblePercent: 999 };
const market = (row: IrStockRow, isFund = false): IrMarket => ({ ok: true, fetchedAt: now, gold: [], currency: [], crypto: [], options: [], indices: null, stocks: isFund ? [] : [row], funds: isFund ? [row] : [] });

async function actualPage(ir: IrMarket, symbol = stock.id, fundamentals: SymbolFundamentals | null = null,
  reads: { history?: "empty" | "error"; fundamental?: "empty" | "error" } = {}) {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const pageModule = { exports: {} as { default: (props: object) => Promise<React.ReactElement> } };
  const traces = { inputs: [] as QuarterInput[], quarters: [] as DerivedQuarter[], ttm: [] as TtmPoint[] };
  const stubs: Record<string, unknown> = {
    "@/lib/market-ir": { getStoredIrMarket: async () => ir },
    "@/lib/fundamental/registry": { readFundamentals: async () => ({ state: reads.fundamental ?? (fundamentals ? "ready" : "empty"), data: fundamentals }) },
    "@/lib/core/quarterly": {
      peOf,
      deriveQuarters: (inputs: QuarterInput[]) => { traces.inputs = inputs; traces.quarters = deriveQuarters(inputs); return traces.quarters; },
      ttmSeries: (quarters: DerivedQuarter[]) => { traces.ttm = ttmSeries(quarters); return traces.ttm; },
    },
    "@/lib/core/history": { getSymbolHistory: async () => [], readSymbolHistory: async () => ({ data: [], state: reads.history ?? "empty" }) },
    "@/lib/core/navHistory": { getNavHistory: async () => [] },
    "@/lib/core/fx": { getFxRates: async () => [], latestRate: () => null },
    "@/lib/access": { getAccess: async () => ({ tier: "guest" }) },
  };
  const fakeRequire = (specifier: string) => {
    if (specifier.endsWith(".module.css")) return cssModule;
    if (specifier in stubs) return stubs[specifier];
    if (["@/components/symbol/FundamentalCharts", "@/components/symbol/SymbolTabs", "@/components/symbol/CodalReportsTab"].includes(specifier)) return require(`../../../${specifier.slice(2)}`);
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
  const page = await pageModule.exports.default({ params: Promise.resolve({ symbol }) });
  const router = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, hmrRefresh() {}, async prefetch() {} };
  const tree = React.createElement(AppRouterContext.Provider, { value: router }, page);
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

test("actual routed history/report failures stay unavailable while successful empty reads remain empty", async () => {
  const failure = await actualPage(market(stock), stock.id, null, { history: "error", fundamental: "error" });
  assert.match(failure.html, /خواندن تاریخچهٔ این نماد موفق نشد/);
  assert.match(failure.html, /خواندن گزارش‌های پردازش‌شده موفق نشد/);
  assert.doesNotMatch(failure.html, /تاریخچه‌ای برای این نماد ثبت نشده|هنوز گزارشی برای این نماد پردازش نشده/);
  const empty = await actualPage(market(stock));
  assert.match(empty.html, /تاریخچه‌ای برای این نماد ثبت نشده/);
  assert.match(empty.html, /هنوز گزارشی برای این نماد پردازش نشده/);
});

test("actual financial chart source is a usable Codal link or explicit unknown, never another host", async () => {
  const reports = reportSet(companyPeriods());
  reports.n10!.source.source_url = "https://outside.test/pretend-codal";
  const invalid = await actualPage(market(stock), stock.id, reports);
  assert.doesNotMatch(invalid.html, /outside\.test/);
  assert.match(invalid.html, /پیوند معتبر اطلاعیهٔ کدال در دسترس نیست/);
  for (const sourceUrl of [null, "", "  ", "https://user:pass@codal.ir/report", "javascript:alert(1)"]) {
    reports.n10!.source.source_url = sourceUrl;
    const html = (await actualPage(market(stock), stock.id, reports)).html;
    assert.match(html, /پیوند معتبر اطلاعیهٔ کدال در دسترس نیست/);
    assert.doesNotMatch(html, /user:pass|javascript:|href="#"/);
  }
  reports.n10!.source.source_url = "/Reports/Decision.aspx?id=7";
  const valid = (await actualPage(market(stock), stock.id, reports)).html;
  assert.ok(valid.includes('<a href="https://codal.ir/Reports/Decision.aspx?id=7" target="_blank" rel="noopener noreferrer" class="underline">مشاهدهٔ اطلاعیه در کدال</a>'));
});

function clientComponent(name: string, hooks: unknown, globals: Record<string, unknown> = {}) {
  const exported = {} as { default: (props: Record<string, unknown>) => React.ReactElement };
  const js = ts.transpileModule(readFileSync(new URL(`../../../components/symbol/${name}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { exports: exported, ...globals, require: (id: string) => {
    if (id === "react") return hooks;
    if (id.endsWith(".module.css")) return cssModule;
    if (id === "../market/MarketAutoRefresh") return { __esModule: true, default: () => null };
    return require(id.startsWith("@/") ? `../../../${id.slice(2)}` : id);
  } });
  return exported.default;
}

test("actual live detail preserves null/blank as unknown, observed numeric zero as zero and neutral stale copy", () => {
  for (const value of [null, undefined, "", "  ", false, [], NaN, Infinity, 0, "0"]) {
    const data: Record<string, unknown> = { eps: value, pe: value, g_pe: value, ps: value, pmin_1y: value, pmax_1y: value, pl: value };
    for (let i = 1; i <= 5; i++) for (const field of ["zd", "qd", "pd", "po", "qo", "zo"]) data[`${field}${i}`] = value;
    let index = 0;
    const values = [data, true, "ok", null];
    const Detail = clientComponent("SymbolLiveDetail", { ...React, useEffect() {}, useState: () => [values[index++], () => {}] });
    const html = renderToStaticMarkup(React.createElement(Detail, { symbol: stock.id, sections: "market" }));
    const observed = value === 0 || value === "0";
    assert.match(html, new RegExp(`EPS \\(ریال\\)<\\/p><p[^>]*>${observed ? "۰" : "—"}<\\/p>`));
    assert.equal(html.includes("قیمت تقاضا"), observed, "missing prices cannot manufacture an order book");
    assert.match(html, /تازگی دریافت تأیید نشده/);
    assert.doesNotMatch(html, /خارج از ساعات بازار|دادهٔ زنده|NaN|Infinity/);
  }
});

test("actual symbol tabs open chart/monthly anchors and follow hash/back navigation before scrolling", () => {
  let active = "overview", effectIndex = 0, scrolled = 0;
  const effects: Array<() => unknown> = [], deps = new Map<number, unknown[]>(), events: Record<string, () => void> = {};
  const location = { hash: "#chart-margins" };
  const chart = { closest: () => ({ getAttribute: () => "fundamental" }), scrollIntoView: () => { scrolled++; } };
  const hooks = { ...React, useId: () => "symbol-tabs-test", useState: () => [active, (next: string) => { active = next; }], useEffect: (fn: () => unknown, values: unknown[]) => {
    const n = effectIndex++, previous = deps.get(n);
    if (!previous || values.some((value, i) => value !== previous[i])) effects.push(fn);
    deps.set(n, values);
  } };
  const Tabs = clientComponent("SymbolTabs", hooks, {
    window: { location, addEventListener: (name: string, fn: () => void) => { events[name] = fn; }, removeEventListener() {} },
    document: { getElementById: (id: string) => ["chart-margins", "q-monthly-sales"].includes(id) ? chart : null },
  });
  const settle = () => {
    let tree: React.ReactElement = React.createElement(React.Fragment);
    for (let i = 0; i < 3; i++) { effectIndex = 0; tree = Tabs({ overview: "overview-fixture", fundamental: "fundamental-fixture", reports: "reports-fixture", assembly: null }); effects.splice(0).forEach(fn => fn()); }
    return renderToStaticMarkup(tree);
  };
  assert.match(settle(), /data-symbol-tab="fundamental">fundamental-fixture/);
  assert.ok(scrolled > 0);
  location.hash = "#reports"; events.hashchange();
  assert.match(settle(), /data-symbol-tab="reports">reports-fixture/);
  location.hash = "#q-monthly-sales"; events.popstate();
  assert.match(settle(), /data-symbol-tab="fundamental">fundamental-fixture/);
});

function presentationNodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(presentationNodes);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...presentationNodes(element.props.children as React.ReactNode)];
}

test("symbol tabs preserve click/hash navigation and expose RTL keyboard selection with linked panels", () => {
  let active = "overview", prevented = 0;
  const hashes: string[] = [], focused: string[] = [];
  const Tabs = clientComponent("SymbolTabs", {
    ...React, useId: () => "keyboard-tabs", useEffect() {},
    useState: () => [active, (next: string) => { active = next; }],
  }, {
    history: { replaceState: (_state: unknown, _title: string, hash: string) => { hashes.push(hash); } },
    document: { getElementById: (id: string) => ({ focus: () => { focused.push(id); } }) },
  });
  const render = () => presentationNodes(Tabs({ overview: "overview", fundamental: "fundamental", reports: "reports", assembly: "assembly" }));
  const selected = () => {
    const nodes = render(), tab = nodes.find(n => n.props.role === "tab" && n.props["aria-selected"]);
    assert.ok(tab);
    assert.equal(tab.props.tabIndex, 0);
    assert.equal(nodes.filter(n => n.props.role === "tab" && n.props.tabIndex === 0).length, 1);
    const panel = nodes.find(n => n.props.id === tab.props["aria-controls"]);
    assert.ok(panel);
    assert.equal(panel.props["aria-labelledby"], tab.props.id);
    assert.equal(panel.props.hidden, false);
    assert.equal(nodes.filter(n => n.props.role === "tabpanel" && !n.props.hidden).length, 1);
    return tab;
  };
  for (const [key, expected] of [["ArrowLeft", "fundamental"], ["End", "assembly"], ["ArrowLeft", "overview"], ["ArrowRight", "assembly"], ["Home", "overview"]]) {
    (selected().props.onKeyDown as (event: object) => void)({ key, preventDefault: () => { prevented++; } });
    assert.equal(active, expected);
    assert.equal(hashes.at(-1), `#${expected}`);
    assert.equal(focused.at(-1), `keyboard-tabs-${expected}-tab`);
    selected();
  }
  (selected().props.onKeyDown as (event: object) => void)({ key: "Tab", preventDefault: () => { prevented++; } });
  assert.equal(prevented, 5, "Tab keeps native navigation");
  const reports = render().find(n => n.props.id === "keyboard-tabs-reports-tab");
  (reports!.props.onClick as () => void)();
  assert.equal(active, "reports");
  assert.equal(hashes.at(-1), "#reports");
});

// Synthetic offline fixture only; never served as company data.
const cardFixture: FundamentalCardData = {
  symbol: "fixture", latestMonth: "1405-06", latestSalesBToman: 1, yoyPct: null,
  topProductName: null, exportSharePct: null, narrative: "روایت نمونهٔ آزمون",
  months12: [{ month: "1405-06", totalAmount: 10_000, domesticAmount: 10_000, exportAmount: 0 }],
  monthlyYoY: [{ month: "1405-06", yoyPct: null }], prodSalesGap: null, quantityUnit: null,
  topProductRate: null, latestProducts: [{ name: "محصول آزمون", market: "داخلی", productionQty: null, salesQty: null, salesRate: null, salesAmount: null }],
  sourceUrl: "https://codal.ir/Reports/Decision.aspx?LetterSerial=fixture", sourceTitle: "گزارش رسمی نمونهٔ آزمون",
};

test("fundamental disclosure preserves unknown units/nulls and source while opening and closing linked details", () => {
  const states = [false, false];
  let stateIndex = 0, idIndex = 0;
  const Card = clientComponent("SymbolFundamentalCard", {
    ...React, useId: () => `card-detail-${idIndex++}`,
    useState: () => {
      const index = stateIndex++;
      return [states[index], (next: (value: boolean) => boolean) => { states[index] = next(states[index]); }];
    },
  });
  const original = JSON.stringify(cardFixture);
  const render = (card = cardFixture) => {
    stateIndex = 0; idIndex = 0;
    const tree = Card({ card });
    return { nodes: presentationNodes(tree), html: renderToStaticMarkup(tree) };
  };
  const closed = render();
  assert.match(closed.html, /دورهٔ فعالیت:/);
  assert.match(closed.html, /۱۴۰۵-۰۶/);
  assert.match(closed.html, /گزارش رسمی نمونهٔ آزمون/);
  assert.ok(closed.html.includes(cardFixture.sourceUrl!));
  const buttons = closed.nodes.filter(n => n.type === "button" && n.props["aria-controls"]);
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.equal(button.props["aria-expanded"], false);
    const panel = closed.nodes.find(n => n.props.id === button.props["aria-controls"]);
    assert.equal(panel?.props.hidden, true);
    (button.props.onClick as () => void)();
  }
  const open = render();
  for (const button of open.nodes.filter(n => n.type === "button" && n.props["aria-controls"])) {
    assert.equal(button.props["aria-expanded"], true);
    assert.equal(open.nodes.find(n => n.props.id === button.props["aria-controls"])?.props.hidden, false);
    (button.props.onClick as () => void)();
  }
  assert.match(open.html, /واحد نامعلوم/);
  const cells = open.nodes.filter(n => n.type === "td");
  assert.deepEqual(cells.slice(2).map(n => n.props.children), ["—", "—", "—", "—"]);
  assert.doesNotMatch(open.html, /NaN|Infinity|۰٪/);
  assert.equal(render().nodes.filter(n => n.type === "button" && n.props["aria-expanded"]).length, 0);
  assert.equal(JSON.stringify(cardFixture), original);
  assert.equal(render({ ...cardFixture, narrative: null }).html, "");
  assert.equal(render({ ...cardFixture, latestMonth: null }).html, "");
});

const monthlySourceCases = [
  { symbol: "نمونهٔ فولاد", url: "https://codal.ir.evil.test/report", href: null },
  { symbol: "نمونهٔ مس", url: "https://www.codal.ir/Reports/Decision.aspx?id=17", href: "https://www.codal.ir/Reports/Decision.aspx?id=17" },
  { symbol: "نمونهٔ پالایش", url: "/Reports/Decision.aspx?id=18", href: "https://codal.ir/Reports/Decision.aspx?id=18" },
  { symbol: "نمونهٔ سیمان", url: null, href: null },
  { symbol: "نمونهٔ دارو", url: "https://codal.ir/report?api_key=private", href: null },
  ...["http://codal.ir/report", "javascript:alert(1)", "https://user:pass@codal.ir/report", "https://codal.ir:444/report", "", "  "].map(url => ({ symbol: "نمونهٔ منبع نامعتبر", url, href: null })),
];

function assertMonthlySource(html: string, item: typeof monthlySourceCases[number]) {
  if (item.href) {
    assert.ok(html.includes(`href="${item.href}" target="_blank" rel="noopener noreferrer"`), "official Codal navigation uses the existing normalized contract");
  } else {
    assert.doesNotMatch(html, /<a\b[^>]*target="_blank"/, "an unapproved/missing source must not become an external source link");
    assert.match(html, /پیوند معتبر کدال در دسترس نیست/);
  }
  assert.doesNotMatch(html, /codal\.ir\.evil|api_key=private|javascript:|user:pass|:444|href="#"/);
}

test("monthly fundamental cards keep company/period/nulls while source navigation is restricted to approved Codal URLs", () => {
  const Card = clientComponent("SymbolFundamentalCard", React);
  for (const item of monthlySourceCases) {
    const card = { ...cardFixture, symbol: item.symbol, sourceTitle: `گزارش ساختگی ${item.symbol}`, sourceUrl: item.url };
    const before = JSON.stringify(card);
    const html = renderToStaticMarkup(React.createElement(Card, { card }));
    assertMonthlySource(html, item);
    assert.ok(html.includes(card.sourceTitle));
    assert.match(html, /دورهٔ فعالیت:.*۱۴۰۵-۰۶/);
    assert.equal(JSON.stringify(card), before, "presentation cannot rewrite financial input or missing values");
  }
});

test("monthly sales charts preserve source titles, reporting units and input even when the source link is unavailable", () => {
  const Charts = clientComponent("MonthlySalesCharts", React);
  for (const item of monthlySourceCases) {
    const reports: CodalN30Data[] = [{ symbol: item.symbol, report_kind: "ن-۳۰", period_end: "1405-06-31", fiscal_year: 1405,
      products: [{ product_name: "محصول ساختگی", market: "داخلی", production_qty: null, sales_qty: null, sales_rate: null, sales_amount: null }],
      period_total_amount: 10000, fy_cumulative_amount: null, unit: "میلیون ریال", qty_unit: null }];
    const before = JSON.stringify(reports), sourceTitle = `گزارش ساختگی ${item.symbol}`;
    const html = renderToStaticMarkup(React.createElement(Charts, { reports, sourceTitle, sourceUrl: item.url }));
    assertMonthlySource(html, item);
    assert.ok(html.includes(sourceTitle), "the report title survives a missing or rejected source link");
    assert.match(html, /واحد مبالغ: میلیون ریال/);
    assert.match(html, /۱۴۰۵/);
    assert.equal(JSON.stringify(reports), before);
  }
});
