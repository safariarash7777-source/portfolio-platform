import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarketDesk from "./MarketDesk";
import type { IrMarket, IrStockRow } from "../../lib/market-ir";
Object.assign(globalThis, { React });

test("market desk validates price/NAV clocks like the fund board instead of ranking raw bubbles", () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-30T10:00:00Z");
  const funds = [100, 100, 100, 130].map((price, i) => ({
    id: `TEST${i}`, faName: "synthetic", unit: "toman", type: "سهامی", price, closingPrice: price,
    nav: 100, navStatus: "ready", navDate: "1405-07-08", navTime: "13:25:00",
    sourceDate: "1405-07-08", sourceTime: "13:25:00", bubblePercent: i === 3 ? 30 : 0,
  })) as IrStockRow[];
  const render = (rows: IrStockRow[]) => renderToStaticMarkup(React.createElement(MarketDesk, {
    ir: { ok: true, fetchedAt: Date.now(), stocks: [], funds: rows, gold: [], currency: [], crypto: [], options: [], indices: null } as IrMarket,
  }));
  try {
    assert.match(render(funds), /حباب نسبت به میانه/);
    assert.doesNotMatch(render(funds.map(f => ({ ...f, sourceTime: null }))), /حباب نسبت به میانه/);
    assert.doesNotMatch(render(funds.map(f => ({ ...f, navStatus: "unavailable" }))), /حباب نسبت به میانه/);
    const stale = render(funds.map(f => ({ ...f, navDate: "1405-07-01" })));
    assert.doesNotMatch(stale, /حباب نسبت به میانه/);
    assert.match(stale, /کهنگیِ NAV/, "quality diagnostics must remain visible");
  } finally { Date.now = originalNow; }
});
