import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import type { ReactElement } from "react";
import { withValidNav } from "../../../lib/market-quality";

const require = createRequire(import.meta.url);
const now = Date.parse("2026-09-30T10:00:00Z");
const valid = { id: "synthetic-fund", faName: "صندوق ساختگی", unit: "toman" as const, price: 110, closingPrice: 110, nav: 100, navStatus: "ready", navDate: "1405-07-08", navTime: "13:25:00", sourceDate: "1405-07-08", sourceTime: "13:25:00", bubblePercent: 999 };

async function actualPage(rows: Record<string, unknown>[], state = "unknown-time", readAt = now) {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const pageModule = { exports: {} as { default: (props: object) => Promise<ReactElement> } };
  let searchRows: Record<string, unknown>[] = [];
  const stubs: Record<string, unknown> = {
    "@/lib/market-bounded": { readIranMarket: async () => ({ data: { funds: rows, stocks: [] }, availability: { readAt, families: { funds: { state, receivedAt: now }, indices: { state: "stale" } } } }) },
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
  const board = find(tree) as ReactElement<{ funds: Record<string, unknown>[] }> | null;
  assert.ok(board, "actual server page must feed the funds board");
  assert.equal(board.props.funds, searchRows, "table/stats and search must receive the same validated rows");
  return board.props.funds;
}

test("actual funds page rejects raw bubbles with absent price clocks or rejected NAV before board/search/stats", async () => {
  for (const changes of [{ sourceTime: null }, { navStatus: "unavailable" }, { navDate: "1405-07-06" }, { nav: null }]) {
    const row = { ...valid, ...changes };
    const [shown] = await actualPage([row]);
    assert.equal(shown.bubblePercent, null);
    assert.notEqual(shown.navState, "ready");
    assert.equal(shown.price, row.price);
    assert.equal(shown.ret1w, 1);
    assert.equal(row.bubblePercent, 999, "the retained source snapshot is never mutated");
  }
});

test("actual funds page recomputes a synchronized fresh bubble and later removes it when NAV ages", async () => {
  const [fresh] = await actualPage([valid], "ready");
  assert.equal(fresh.navState, "ready");
  assert.ok(Math.abs(Number(fresh.bubblePercent) - 10) < 1e-9);
  assert.equal(fresh.ret3m, 3);
  const [aged] = await actualPage([valid], "stale", now + 2 * 86400000);
  assert.equal(aged.bubblePercent, null);
});
