import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FundComparisonPanel, { FundComparisonDetails } from "./FundComparisonPanel";
import { formatSignedPercent, formatToman } from "../../lib/format";
import type { FundComparisonRow } from "../../lib/core/fundComparison";
Object.assign(globalThis, { React });

const row: FundComparisonRow = {
  id: "نمونه-آزمون", type: "اهرمی", unit: "toman", price: 900, closingPrice: 110, nav: 100,
  navState: "stale", navReason: "NAV منبع کهنه است", sourceDate: "1405-07-08", sourceTime: "13:25:00",
  navDate: "1405-07-07", navTime: null,
  returnObservations: { w1: { value: 0, periodStart: "2026-09-21", periodEnd: "2026-09-30", startField: "close", endField: "close", method: "unadjusted-price", source: "symbol_history" } },
};

test("comparison shell has five labeled native selectors, honest empty state and no automatic selection", () => {
  const html = renderToStaticMarkup(React.createElement(FundComparisonPanel, { funds: [row], from: "/market/funds?type=اهرم" }));
  assert.equal((html.match(/<select/g) ?? []).length, 5);
  assert.equal((html.match(/<label/g) ?? []).length, 5);
  assert.ok(html.includes("هنوز صندوقی انتخاب نشده"));
  assert.ok(!html.includes("<article"));
});

test("five selected observations keep the fifth source/unknown evidence and avoid fabricated total return", () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ ...row, id: `نمونه-${index + 1}` }));
  rows[4] = { ...rows[4], nav: null, navReason: "شاهد NAV صندوق پنجم موجود نیست", returnObservations: undefined };
  const html = renderToStaticMarkup(React.createElement(FundComparisonDetails, { rows, from: "/market/funds" }));
  assert.equal((html.match(/<article/g) ?? []).length, 5);
  assert.ok(html.includes("نمونه-5"));
  assert.ok(html.includes("شاهد NAV صندوق پنجم موجود نیست"));
  assert.ok(html.includes("شاهد دوره موجود نیست"));
  assert.ok(html.includes("بدون سود تقسیمی و هزینه‌ها"));
  assert.ok(html.includes("بازده کل نیست"));
  assert.ok(html.includes("فرض سرمایه‌گذاری مجدد در داده مشخص نیست"));
  assert.ok(html.includes("طبقه واحد با منبع مستند مشخص نشده است"));
});

test("unknown classes leave observed closing price/NAV/zero return and source dates visible", () => {
  const html = renderToStaticMarkup(React.createElement(FundComparisonDetails, { rows: [row, { ...row, id: "نمونه-دوم" }], from: "/market/funds?q=test" }));
  assert.ok(html.includes(formatToman(110)));
  assert.ok(html.includes(formatToman(100)));
  assert.ok(!html.includes(formatToman(900)), "no last price silently presented as close");
  assert.ok(html.includes(formatSignedPercent(0)));
  assert.ok(html.includes("شاهد طبقه واحد موجود نیست"));
  assert.ok(html.includes("NAV منبع کهنه است"));
  assert.ok(html.includes("ساعت نامشخص"));
  assert.ok(html.includes("تطبیق طبقه واحد NAV"));
  assert.ok(html.includes("تاریخچه ثبت‌شده"));
  assert.ok(html.includes("from=%2Fmarket%2Ffunds%3Fq%3Dtest"));
});

test("missing observations never become zero; empty source exposes unavailable state", () => {
  const html = renderToStaticMarkup(React.createElement(FundComparisonDetails, { rows: [{ ...row, nav: null, closingPrice: undefined, returnObservations: undefined }], from: "/market/funds" }));
  assert.ok(html.includes("شاهد دوره موجود نیست"));
  assert.ok(!html.includes(formatSignedPercent(0)));
  const empty = renderToStaticMarkup(React.createElement(FundComparisonPanel, { funds: [], from: "/market/funds" }));
  assert.ok(empty.includes("داده صندوق در دسترس نیست"));
});
