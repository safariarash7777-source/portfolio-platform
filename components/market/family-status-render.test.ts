import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext, PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import OptionsBoard from "./OptionsBoard";
import MarketShell from "./MarketShell";
import { toMarket } from "../../lib/market-ir";
import { iranReadQuality } from "../../lib/market-quality";
Object.assign(globalThis, { React });
const now = Date.parse("2026-10-06T08:30:00Z");
const raw = { stocks: [{ id: "stock", faName: "نمونه سهام", unit: "toman", price: 100 }], options: [{ id: "option", faName: "اختیار مستقل", baseId: "نمونه", type: "call", price: 250, priceUnit: "toman", value: 1000, valueUnit: "rial", sourceDate: "1405-07-14", sourceTime: "12:00:00" }], fetchedAt: now - 3600000,
  snapshotQuality: { version: 1, state: "partial", families: { options: { state: "received", receivedAt: now }, stocks: { state: "stale", receivedAt: now - 3600000 } } } };

test("actual options consumer renders successful option clock/row despite retained stocks and old global receipt", () => {
  const m = toMarket(raw), f = iranReadQuality(m, now).families.options;
  const html = renderToStaticMarkup(React.createElement(OptionsBoard, { options: m.options, fetchedAt: f.receivedAt, availability: f }));
  assert.match(html, /اختیار مستقل/); assert.match(html, /زمان منبع و دریافت معتبر است/);
  assert.doesNotMatch(html, /دادهٔ کهنه/); assert.equal(f.receivedAt, now);
});

test("retained recent-clock option is labeled stale; authoritative empty and unavailable stay distinct", () => {
  for (const [state, label] of [["stale", /دادهٔ کهنه/], ["empty", /پاسخ معتبر بدون داده/], ["unavailable", /در دسترس نیست/]] as const) {
    const m = toMarket({ ...raw, options: state === "stale" ? raw.options : [], snapshotQuality: { version: 1, state: "partial", families: { options: { state, receivedAt: state === "unavailable" ? null : now } } } });
    const f = iranReadQuality(m, now).families.options;
    const html = renderToStaticMarkup(React.createElement(OptionsBoard, { options: m.options, fetchedAt: f.receivedAt, availability: f }));
    assert.match(html, label); assert.doesNotMatch(html, /زمان منبع و دریافت معتبر است/);
  }
});

test("shared market shell cannot label partial/recent-retained data fresh", () => {
  const router = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, hmrRefresh() {}, async prefetch() {} };
  for (const state of ["partial", "stale", "unknown-time", "error"] as const) {
    const props: React.ComponentProps<typeof MarketShell> = { active: "stocks", title: "نمونه", fetchedAt: now, qualityState: state, searchIndex: [], path: "/market/stocks", children: null };
    const shell = React.createElement(MarketShell, props, null);
    const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(PathnameContext.Provider, { value: "/market/stocks" }, React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, shell))));
    assert.doesNotMatch(html, /هم‌اکنون|زمان منبع و دریافت معتبر است/);
  }
});
