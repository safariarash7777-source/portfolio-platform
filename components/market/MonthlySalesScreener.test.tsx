import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { alignMonths } from "./MonthlySalesComparison";
import { GrowthEvidence, SalesScreenResults } from "./MonthlySalesScreener";
import { resolveBackTarget } from "../../lib/market-nav";
import type { MonthlySalesScreen, SalesPoint, ScreenRow } from "../../lib/fundamental/monthly-sales-screen";

Object.assign(globalThis, { React });
const point: SalesPoint = {period:"1405-01",amount:0,unit:"میلیون ریال",sourceUrl:"https://codal.ir/Reports/Decision.aspx?LetterSerial=test",publishedAt:"1405/02/08 09:00:00",capturedAt:"2026-04-29T12:00:00Z",amendment:true,reportId:42};

test("rolling comparison shows 12 aligned Jalali months and distinguishes zero, gaps and incompatible units", () => {
  const rows = alignMonths("1405-01",[
    {symbol:"الف",points:[point]},
    {symbol:"ب",points:[{...point,unit:"ریال",amount:10},{...point,period:"1404-12",amount:15}]},
  ]);
  assert.equal(rows.length,12);
  assert.equal(rows[0].label,"1404-02");
  assert.deepEqual([rows[10].first,rows[10].second],[null,15]);
  assert.deepEqual([rows[11].first,rows[11].second],[0,null]);
});

test("source disclosure retains the official Persian publication date, period amount, gap and amendment status", () => {
  const row:ScreenRow={symbol:"نمونه",industry:null,eligible:true,growth:null,passed:null,reason:"فروش دوره پایه موجود نیست",current:point,previous:null};
  const result:MonthlySalesScreen={period:"1405-01",previousPeriod:"1404-01",minGrowth:0,checkedAt:"2026-05-01T00:00:00Z",rows:[row],coverage:{universe:1,eligible:1,passed:0,calculable:0,excluded:{},universeSource:"تابلو",rosterUpdatedAt:null,outsideRoster:3}};
  const html=renderToStaticMarkup(React.createElement(GrowthEvidence,{row,result}));
  for (const text of ["۱۴۰۵/۰۲/۰۸", "۰ میلیون ریال", "۱۴۰۴-۰۱", "اصلاحیه", point.sourceUrl, "فروش دوره پایه موجود نیست"]) assert.ok(html.includes(text),text);
});

test("return from issuer retains screener period and threshold", () => {
  const back = resolveBackTarget("/market/screener?period=1405-07&minGrowth=-5.5&other=x",{href:"/market",label:"بازار"});
  assert.equal(back.href,"/market/screener?minGrowth=-5.5&period=1405-07");
});
test("an incomplete issuer deep link expands its source disclosure outside the default passing list", () => {
  const row:ScreenRow={symbol:"نمونه",industry:null,eligible:true,growth:null,passed:null,reason:"گزارش ماه موجود نیست",current:point,previous:null};
  const result:MonthlySalesScreen={period:"1405-01",previousPeriod:"1404-01",minGrowth:5,checkedAt:"2026-05-01T00:00:00Z",rows:[row],coverage:{universe:1,eligible:1,passed:0,calculable:0,excluded:{},universeSource:"تابلو",rosterUpdatedAt:null,outsideRoster:3}};
  const html=renderToStaticMarkup(React.createElement(SalesScreenResults,{result,symbol:"نمونه"}));
  assert.ok(html.includes('aria-expanded="true"'));
  const headers = [...html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(headers.slice(0,3), ["مقایسه","نماد","رشد و مستندات"]);
  assert.ok(html.includes("نمونه · مبنای محاسبه"));
  assert.ok(html.includes("پیوند این ردیف"));
  assert.ok(html.includes("شمولشان جداگانه باید بررسی شود · ۳"));
});
