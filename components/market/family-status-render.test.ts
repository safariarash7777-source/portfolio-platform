import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext, PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import OptionsBoard from "./OptionsBoard";
import MarketShell from "./MarketShell";
import StocksBoard from "./StocksBoard";
import { toMarket } from "../../lib/market-ir";
import { iranReadQuality, stocksPageQuality } from "../../lib/market-quality";
import { formatJalali, formatTehranClock } from "../../lib/format";
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

function withRouter(child: React.ReactNode) {
  const router = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, hmrRefresh() {}, async prefetch() {} };
  return React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(PathnameContext.Provider, { value: "/market/stocks" }, React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, child)));
}

test("actual StocksBoard: successful stocks cannot hide a retained index or borrow their fresh receipt", () => {
  const p={...raw, stocks:[{...raw.stocks[0],sourceDate:'1405-07-14',sourceTime:'12:00:00'}],indices:{total:111,totalChange:0,date:'1405-07-14',time:'11:55:00'},
    snapshotQuality:{version:1,state:'partial',families:{stocks:{state:'received',receivedAt:now},indices:{state:'stale',receivedAt:now-300000,retained:true}}}};
  const m=toMarket(p),q=iranReadQuality(m,now);
  assert.equal(q.families.stocks.state,'ready');assert.equal(q.families.indices.state,'stale');
  const props={stocks:m.stocks,indices:m.indices,fetchedAt:q.families.stocks.receivedAt,indexAvailability:q.families.indices};
  const html=renderToStaticMarkup(withRouter(React.createElement(StocksBoard,props)));
  assert.match(html,/شاخص: دادهٔ کهنه/);
  assert.ok(html.includes(`دریافت شاخص: ${formatJalali(now-300000)} · ${formatTehranClock(now-300000)}`));
  assert.ok(!html.includes(`دریافت شاخص: ${formatJalali(now)} · ${formatTehranClock(now)}`));
  assert.match(html,/۱۱۱/);assert.match(html,/۱۱:۵۵/);
  assert.doesNotMatch(html,/شاخص: زمان منبع و دریافت معتبر است/);
});

test("rendered stock page warns for an old index, recovers independently, and ignores unrendered families", () => {
  for(const state of ['stale','received'] as const) {
    const m=toMarket({...raw,stocks:[{...raw.stocks[0],sourceDate:'1405-07-14',sourceTime:'12:00:00'}],indices:{total:111,date:'1405-07-14',time:'12:00:00'},snapshotQuality:{version:1,state:'partial',families:{stocks:{state:'received',receivedAt:now},indices:{state,receivedAt:now}}}});
    const q=iranReadQuality(m,now);
    const qualityState=stocksPageQuality(q.families.stocks,q.families.indices,true);
    assert.equal(qualityState,state==='stale'?'partial':'ready');
    const board=React.createElement(StocksBoard,{stocks:m.stocks,indices:m.indices,fetchedAt:q.families.stocks.receivedAt,indexAvailability:q.families.indices});
    const props:React.ComponentProps<typeof MarketShell>={active:'stocks',title:'نمونه',fetchedAt:now,qualityState,searchIndex:[],path:'/market/stocks',children:board};
    const html=renderToStaticMarkup(withRouter(React.createElement(MarketShell,props,board)));
    if(state==='stale'){assert.match(html,/دریافت ناقص/);assert.match(html,/شاخص: دادهٔ کهنه/);}
    else {assert.match(html,/شاخص: زمان منبع و دریافت معتبر است/);assert.doesNotMatch(html,/دریافت ناقص/);}
    assert.equal(stocksPageQuality(q.families.stocks,q.families.indices,false),'ready');
  }
});
