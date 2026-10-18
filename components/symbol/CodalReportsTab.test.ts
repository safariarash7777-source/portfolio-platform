import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CodalReportsTab from "./CodalReportsTab";
Object.assign(globalThis, { React });

test("failed processed-report read never claims an empty/unprocessed history", () => {
  const html = renderToStaticMarkup(React.createElement(CodalReportsTab, { symbol: "نماد", stored: [], readFailed: true }));
  assert.match(html, /خواندن گزارش‌های پردازش‌شده موفق نشد/);
  assert.doesNotMatch(html, /هنوز گزارشی برای این نماد پردازش نشده/);
  const empty = renderToStaticMarkup(React.createElement(CodalReportsTab, { symbol: "نماد", stored: [] }));
  assert.match(empty, /هنوز گزارشی برای این نماد پردازش نشده/);
});

test("processed-report links only navigate to approved HTTPS Codal sources", () => {
  const stored = ["https://evil.test/report", "http://codal.ir/report", "https://codal.ir.evil.test/report", "javascript:alert(1)", "https://codal.ir/report?token=private", "/Reports/Decision.aspx?id=7"]
    .map((url, i) => ({ kind: "ن-۱۰", title: `source-${i}`, periodEnd: null, url }));
  const html = renderToStaticMarkup(React.createElement(CodalReportsTab, { symbol: "نماد", stored }));
  assert.match(html, /href="https:\/\/codal.ir\/Reports\/Decision.aspx\?id=7"/);
  assert.doesNotMatch(html, /evil\.test|javascript:|token=private|href="#"/);
  for (let i = 0; i < stored.length; i++) assert.ok(html.includes(`source-${i}`),'unsafe URL does not erase report metadata');
});

test("actual reports tab labels the reporting period and does not imply a complete live announcement feed", () => {
  const html = renderToStaticMarkup(React.createElement(CodalReportsTab, { symbol: "نماد", stored: [{ kind: "ن-۱۰", title: "صورت مالی", periodEnd: "1405-04-31", url: null }] }));
  assert.match(html, /دورهٔ مالی: ۱۴۰۵-۰۴-۳۱/);
  assert.match(html, /اطلاعیه‌های ذخیره‌شدهٔ کدال/);
  assert.doesNotMatch(html, /همهٔ اطلاعیه‌های کدال|تاریخ انتشار/);
});
