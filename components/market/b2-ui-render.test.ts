import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext, PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import OptionsBoard from "./OptionsBoard";
import StocksBoard from "./StocksBoard";
import FundsFullBoard from "./FundsFullBoard";
import { withValidNav } from "../../lib/market-quality";
import { formatRialAsToman, formatSignedPercent, toPersianDigits } from "../../lib/format";
import type { IrOptionRow } from "../../lib/market-ir";
Object.assign(globalThis, { React });
const now = Date.parse("2026-09-30T10:00:00Z");
const fund = { id: "fund-fixture", faName: "نمونهٔ آزمون", unit: "toman" as const, type: "سهامی", price: 110, closingPrice: 110, nav: 100, navStatus: "ready", navDate: "1405-07-08", navTime: "13:25:00", sourceDate: "1405-07-08", sourceTime: "13:25:00", bubblePercent: 999 };

function withRouter(child: React.ReactNode) {
  const router = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, hmrRefresh() {}, async prefetch() {} };
  return React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(PathnameContext.Provider, { value: "/market/funds" }, React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, child)));
}

test("stock board preserves the same rial-to-toman transaction and market values used on symbol", () => {
  const row = { ...fund, value: 50_000_000_000, marketValue: 700_000_000_000 };
  const html = renderToStaticMarkup(withRouter(React.createElement(StocksBoard, { stocks: [row], indices: null, fetchedAt: now })));
  assert.ok(html.includes(formatRialAsToman(row.value)));
  assert.ok(html.includes(formatRialAsToman(row.marketValue)));
});

test("stock transaction zero remains visible on desktop and mobile instead of absent", () => {
  const html = renderToStaticMarkup(withRouter(React.createElement(StocksBoard, { stocks: [{ ...fund, value: 0 }], indices: null, fetchedAt: now })));
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  const cells = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
  assert.equal(cells[3]?.[1], formatRialAsToman(0));
  assert.ok(html.slice(html.indexOf('class="md:hidden')).includes(`ارزش: ${formatRialAsToman(0)}`));
});

test("option volume zero is valid and distinct from absent/invalid volume in actual cells", () => {
  const option: IrOptionRow = { id: "option-fixture", faName: "نمونه", baseId: "پایه", type: "call", strike: 100, dateEnd: null, dayRemain: null, openInterest: null, price: 5, closingPrice: 5, priceUnit: "toman", valueUnit: "rial", value: 0, volume: 0, trades: 0 };
  for (const [volume, expected] of [[0, "۰"], [null, "—"], [NaN, "—"], [-1, "—"], [1200, "۱,۲۰۰"]] as const) {
    const html = renderToStaticMarkup(React.createElement(OptionsBoard, { options: [{ ...option, volume }], fetchedAt: now }));
    const row = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    assert.equal(cells[8]?.[1], expected, `volume ${volume}`);
  }
});

test("fund desktop NAV/bubble cells and mobile cards expose validation state and reason", () => {
  for (const changes of [{ navStatus: "stale" }, { navStatus: "invalid-unit" }, { navStatus: "invalid-time" }, { navStatus: "unavailable" }, { sourceTime: null }, { navDate: "1405-07-06" }]) {
    const row = withValidNav({ ...fund, ...changes }, null, now);
    const html = renderToStaticMarkup(withRouter(React.createElement(FundsFullBoard, { funds: [row], fetchedAt: now })));
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const cells = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    assert.ok(cells[3]?.[1].includes(toPersianDigits(row.navReason ?? "")), "desktop NAV reason");
    assert.ok(cells[4]?.[1].includes(toPersianDigits(row.navReason ?? "")), "desktop bubble reason");
    assert.ok(html.slice(html.indexOf('class="md:hidden')).includes(toPersianDigits(row.navReason ?? "")), "mobile reason");
    assert.ok(!html.includes("۹۹۹"), "raw bubble is never revived");
  }
});

test("funds without a numeric NAV still expose unavailable reasons on desktop and mobile", () => {
  const row = withValidNav({ ...fund, nav: null, navStatus: "unavailable" }, null, now);
  const html = renderToStaticMarkup(withRouter(React.createElement(FundsFullBoard, { funds: [row], fetchedAt: now })));
  assert.ok(html.includes("NAV معتبر در منبع در دسترس نیست"));
  assert.ok(html.slice(html.indexOf('class="md:hidden')).includes("NAV معتبر در منبع در دسترس نیست"));
});

test("fresh validated zero bubble stays numeric with no stale/unavailable label", () => {
  const row = withValidNav({ ...fund, price: 100, closingPrice: 100 }, null, now);
  const html = renderToStaticMarkup(withRouter(React.createElement(FundsFullBoard, { funds: [row], fetchedAt: now })));
  assert.ok(html.includes(formatSignedPercent(0)));
  assert.ok(!html.includes("NAV کهنه"));
});
