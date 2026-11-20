import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import type { ReactElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext, PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { failedIranReadQuality, iranReadQuality, withValidNav } from "../../../lib/market-quality";
import type { SourceAvailability } from "../../../lib/market-bounded";
import { toMarket, type IrMarket } from "../../../lib/market-ir";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const componentModules = new Map<string, { default: unknown }>();
// Compile actual local JSX into a private realm instead of installing React on host globalThis.
function component(file: string): { default: unknown } {
  const filename = resolve(root, file), cached = componentModules.get(filename); if (cached) return cached;
  const taskModule = { exports: {} as { default: unknown } }, local = createRequire(filename); componentModules.set(filename, taskModule.exports);
  const dependency = (name: string): unknown => {
    const path = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    return path && existsSync(path + ".tsx") ? component(path + ".tsx") : local(path ?? name);
  };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: taskModule, exports: taskModule.exports, require: dependency, React }, { filename }); return taskModule.exports;
}
const FundsFullBoard = component("components/market/FundsFullBoard.tsx").default as typeof import("../../../components/market/FundsFullBoard").default;
const now = Date.parse("2026-09-30T10:00:00Z");
const valid = { id: "synthetic-fund", faName: "صندوق ساختگی", unit: "toman" as const, price: 110, closingPrice: 110, nav: 100, navStatus: "ready", navDate: "1405-07-08", navTime: "13:25:00", sourceDate: "1405-07-08", sourceTime: "13:25:00", bubblePercent: 999 };

async function actualPage(rows: Record<string, unknown>[], state = "unknown-time", readAt = now, availabilityOverride?: SourceAvailability, dataPresent = true, readMarket?: () => Promise<{ data: IrMarket | null; availability: SourceAvailability }>) {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const pageModule = { exports: {} as { default: (props: object) => Promise<ReactElement> } };
  let searchRows: Record<string, unknown>[] = [];
  const availability = availabilityOverride ?? { readAt, families: { funds: { state, receivedAt: now }, indices: { state: "stale" } } };
  const stubs: Record<string, unknown> = {
    "@/lib/market-funds-read.server": { readFundsMarket: readMarket ?? (async () => ({ data: dataPresent ? { funds: rows, stocks: [] } : null, availability })) },
    "@/lib/market-quality": { withValidNav },
    "@/lib/core/bulkReturns": { getBulkReturns: async () => new Map([[valid.id, { w1: 1, m1: 2, m3: 3 }]]) },
    "@/lib/access": { getAccess: async () => ({ tier: "guest" }) },
    "@/lib/metadata": { pageMetadata: () => ({}) },
    "@/lib/market-nav": { buildSearchIndex: (_stocks: unknown, funds: Record<string, unknown>[]) => { searchRows = funds; return []; }, resolveBackTarget: (href: string) => ({ href }) },
  };
  const fakeRequire = (specifier: string) => specifier in stubs ? stubs[specifier] : specifier.startsWith("@/components/") ? { __esModule: true, default: specifier } : require(specifier);
  vm.runInNewContext(js, { module: pageModule, exports: pageModule.exports, require: fakeRequire, URLSearchParams });
  const tree = await pageModule.exports.default({});
  const find = (node: unknown): ReactElement | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const child of node) { const match = find(child); if (match) return match; } return null; }
    const element = node as ReactElement<{ children?: unknown }>;
    return element.type === "@/components/market/FundsFullBoard" ? element : find(element.props?.children);
  };
  const board = find(tree) as ReactElement<{ funds: Record<string, unknown>[]; availability?: SourceAvailability }> | null;
  assert.ok(board, "actual server page must feed the funds board");
  assert.equal(board.props.funds, searchRows, "table/stats and search must receive the same validated rows");
  return board.props;
}

test("actual funds page rejects raw bubbles with absent price clocks or rejected NAV before board/search/stats", async () => {
  for (const changes of [{ sourceTime: null }, { navStatus: "unavailable" }, { navDate: "1405-07-06" }, { nav: null }]) {
    const row = { ...valid, ...changes };
    const { funds: [shown] } = await actualPage([row]);
    assert.equal(shown.bubblePercent, null);
    assert.notEqual(shown.navState, "ready");
    assert.equal(shown.price, row.price);
    assert.equal(shown.ret1w, 1);
    assert.equal(row.bubblePercent, 999, "the retained source snapshot is never mutated");
  }
});

test("actual funds page recomputes a synchronized fresh bubble and later removes it when NAV ages", async () => {
  const { funds: [fresh] } = await actualPage([valid], "ready");
  assert.equal(fresh.navState, "ready");
  assert.ok(Math.abs(Number(fresh.bubblePercent) - 10) < 1e-9);
  assert.equal(fresh.ret3m, 3);
  const { funds: [aged] } = await actualPage([valid], "stale", now + 2 * 86400000);
  assert.equal(aged.bubblePercent, null);
});

// Synthetic source metadata uses the existing quality engine; no I/O or source repair.
const confirmedEmptyMarket = {
  ok: true, fetchedAt: now, funds: [], stocks: [], gold: [], currency: [], crypto: [], options: [], indices: null,
  snapshotQuality: { version: 1, state: "partial", attemptedAt: now,
    families: { funds: { state: "empty", receivedAt: now, retained: false } } },
} as IrMarket;
const emptyQuality = iranReadQuality(confirmedEmptyMarket, now);
const emptyAvailability: SourceAvailability = { ...emptyQuality, sourceAt: emptyQuality.receivedAt, readAt: now };
const failedQuality = failedIranReadQuality(confirmedEmptyMarket, now);
const failedAvailability: SourceAvailability = { ...failedQuality, sourceAt: failedQuality.receivedAt, readAt: now, state: "stale", reason: "read-error" };

function renderActualBoard(availability?: SourceAvailability, funds: Parameters<typeof FundsFullBoard>[0]["funds"] = []) {
  const router = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, hmrRefresh() {}, async prefetch() {} };
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(PathnameContext.Provider, { value: "/market/funds" },
      React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() },
        React.createElement(FundsFullBoard, { funds, fetchedAt: null, availability })))));
}

test("actual funds page forwards the existing read/quality result without converting failed null data into confirmed empty", async () => {
  const availability: SourceAvailability = { ...failedAvailability, state: "error" };
  const board = await actualPage([], "unavailable", now, availability, false);
  assert.equal(board.availability, availability);
  assert.ok(Array.isArray(board.funds));
  assert.equal(board.funds.length, 0);
  const confirmed = await actualPage([], "empty", now, emptyAvailability);
  assert.equal(confirmed.availability, emptyAvailability);
});

test("fund board describes only a confirmed family-empty response as no source rows, even with unrelated partial families", () => {
  assert.equal(emptyAvailability.state, "partial");
  assert.equal(emptyAvailability.families?.funds.state, "empty");
  const html = renderActualBoard(emptyAvailability);
  assert.match(html, /پاسخ معتبر بدون ردیف/);
  assert.doesNotMatch(html, /خالی‌بودن منبع تأیید نشده/);
  assert.equal((html.match(/<select/g) ?? []).length, 0);
});

test("read-error and timeout override even an empty-family label and never claim an empty snapshot", () => {
  for (const [state, reason, phrase] of [
    ["error", "read-error", "خواندن دادهٔ صندوق‌ها ناموفق بود"],
    ["timeout", "read-timeout", "در زمان مقرر کامل نشد"],
    ["stale", "read-error", "خواندن دادهٔ صندوق‌ها ناموفق بود"],
  ] as const) {
    const html = renderActualBoard({ ...emptyAvailability, state, reason });
    assert.ok(html.includes(phrase));
    assert.match(html, /خالی‌بودن منبع تأیید نشده/);
    assert.doesNotMatch(html, /اسنپ‌شات صندوق‌ها خالی است|پاسخ معتبر بدون ردیف/);
  }
});

test("unavailable, unknown, stale or rejected zero-row inputs never establish source emptiness", () => {
  const unavailable = iranReadQuality({ ...confirmedEmptyMarket, snapshotQuality: undefined }, now);
  const rejected = iranReadQuality({ ...confirmedEmptyMarket, inputRows: { funds: 1 } }, now);
  assert.equal(rejected.families.funds.rejectedRows, 1);
  assert.notEqual(rejected.families.funds.state, "empty");
  const cases: (SourceAvailability | undefined)[] = [undefined,
    { ...unavailable, sourceAt: unavailable.receivedAt, readAt: now }, failedAvailability,
    { ...rejected, sourceAt: rejected.receivedAt, readAt: now },
    { ...emptyAvailability, state: "error" },
    ...(["unknown-time", "unavailable", "stale"] as const).map(state => ({ ...emptyAvailability,
      families: { ...emptyAvailability.families!, funds: { ...emptyAvailability.families!.funds, state } } })),
  ];
  for (const availability of cases) {
    const html = renderActualBoard(availability);
    assert.match(html, /خالی‌بودن منبع تأیید نشده/);
    assert.doesNotMatch(html, /اسنپ‌شات صندوق‌ها خالی است|پاسخ معتبر بدون ردیف/);
  }
});

test("a failed read does not erase retained observations, invent missing values or bypass the five-fund comparison guards", () => {
  const row = withValidNav({ ...valid, faName: "نمونهٔ آزمون", nav: null, navStatus: "unavailable" }, null, now);
  const html = renderActualBoard(failedAvailability, [row]);
  const comparison = html.match(/<section aria-labelledby="fund-comparison-title"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.equal((comparison.match(/<select/g) ?? []).length, 5);
  assert.match(html, /NAV معتبر در منبع در دسترس نیست/);
  assert.match(html, /هنوز صندوقی انتخاب نشده/);
  assert.doesNotMatch(html, /اسنپ‌شات صندوق‌ها خالی است|پاسخ معتبر بدون ردیف/);
  assert.equal(row.bubblePercent, null);
});

function actualAdapter(outcome: import("../../../lib/market-ir").StoredMarketReadResult) {
  const environment = { FUNDAMENTAL_READ_URL: "https://62.60.191.24/liara-preview", FUNDAMENTAL_READ_ANON_KEY: [
    Buffer.from(JSON.stringify({ typ: "JWT", alg: "HS256" })).toString("base64url"),
    Buffer.from(JSON.stringify({ role: "anon", iss: "supabase", exp: 4102444800 })).toString("base64url"),
    Buffer.from("synthetic-signature").toString("base64url"),
  ].join(".") };
  let reads = 0;
  const execute = (file: string, dependencies: Record<string, unknown>) => {
    const filename = resolve(root, file), local = createRequire(filename), taskModule = { exports: {} as Record<string, unknown> };
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, { module: taskModule, exports: taskModule.exports, require: (name: string) => name in dependencies ? dependencies[name] : local(name), Buffer, URL, Date, process: { env: {} } }, { filename });
    return taskModule.exports;
  };
  const selector = execute("lib/fundamental/read-config.server.ts", { "server-only": {} });
  const adapter = execute("lib/market-funds-read.server.ts", {
    "server-only": {}, "./fundamental/read-config.server": selector,
    "./market-ir": { async getStoredIrMarket(options: import("../../../lib/market-ir").StoredMarketReadOverride) {
      reads++; assert.equal(options.pair?.url, environment.FUNDAMENTAL_READ_URL); assert.equal(options.pair?.anon, environment.FUNDAMENTAL_READ_ANON_KEY); return outcome;
    } },
    "./market-bounded": { readIranMarket() { throw Error("legacy read forbidden for explicit pair"); } },
  });
  return { read: () => (adapter as unknown as typeof import("../../../lib/market-funds-read.server")).readFundsMarket({ environment }), reads: () => reads };
}

test("actual adapter to actual funds page keeps stored unknown-price-clock rows, null bubble and five selectors without host globals", async () => {
  const readAt = Date.parse("2026-10-31T08:00:00Z");
  const data = toMarket({ funds: [{ ...valid, id: "pipeline-only-test", sourceDate: null, sourceTime: "11:30:00", navDate: "1405-08-09", navTime: "11:30:00" }], fetchedAt: readAt });
  const adapter = actualAdapter({ data, state: "read", reason: null, status: 200, readAt });
  const board = await actualPage([], "unknown-time", readAt, undefined, true, adapter.read);
  assert.equal(adapter.reads(), 1); assert.equal(board.funds.length, 1);
  assert.equal(board.funds[0].sourceDate, null); assert.equal(board.funds[0].bubblePercent, null);
  assert.equal(board.funds[0].ret1w, undefined); assert.equal(board.availability?.families?.funds.validAt, null);
  assert.equal(board.availability?.families?.funds.state, "unknown-time"); assert.equal(board.availability?.families?.funds.receivedAt, readAt);
  const html = renderActualBoard(board.availability, board.funds as unknown as Parameters<typeof FundsFullBoard>[0]["funds"]);
  const comparison = html.match(/<section aria-labelledby="fund-comparison-title"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.equal((comparison.match(/<select/g) ?? []).length, 5); assert.match(html, /pipeline-only-test/);
  assert.doesNotMatch(html, /پاسخ معتبر بدون ردیف|اسنپ‌شات صندوق‌ها خالی است/);
});

test("actual adapter and actual page separate absent or HTTP error from genuine validated family emptiness", async () => {
  for (const state of ["absent", "error"] as const) {
    const adapter = actualAdapter({ data: null, state, reason: state === "absent" ? "absent" : "http", status: state === "absent" ? 200 : 402, readAt: now });
    const board = await actualPage([], "unknown-time", now, undefined, false, adapter.read);
    const html = renderActualBoard(board.availability); assert.equal(adapter.reads(), 1);
    assert.match(html, /خالی‌بودن منبع تأیید نشده/); assert.doesNotMatch(html, /پاسخ معتبر بدون ردیف/);
  }
  const adapter = actualAdapter({ data: confirmedEmptyMarket, state: "read", reason: null, status: 200, readAt: now });
  const board = await actualPage([], "unknown-time", now, undefined, true, adapter.read);
  assert.equal(board.availability?.families?.funds.state, "empty"); assert.match(renderActualBoard(board.availability), /پاسخ معتبر بدون ردیف/);
});
