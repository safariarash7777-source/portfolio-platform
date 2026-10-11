import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CodalReportsTab from "./CodalReportsTab";
Object.assign(globalThis, { React });

test("actual reports tab labels the reporting period and does not imply a complete live announcement feed", () => {
  const html = renderToStaticMarkup(React.createElement(CodalReportsTab, { symbol: "نماد", stored: [{ kind: "ن-۱۰", title: "صورت مالی", periodEnd: "1405-04-31", url: null }] }));
  assert.match(html, /دورهٔ مالی: ۱۴۰۵-۰۴-۳۱/);
  assert.match(html, /اطلاعیه‌های ذخیره‌شدهٔ کدال/);
  assert.doesNotMatch(html, /همهٔ اطلاعیه‌های کدال|تاریخ انتشار/);
});
