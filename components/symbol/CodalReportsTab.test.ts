import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import CodalReportsTab from "./CodalReportsTab";
import CodalSourceLink from "./CodalSourceLink";
Object.assign(globalThis, { React });

test("shared Codal link fixes external navigation attributes and renders the supplied fallback verbatim", () => {
  const missing = React.createElement("span", { className: "missing-contract" }, "ناموجود");
  const props = { url: "/Reports/Decision.aspx?id=7", className: "source-contract", children: "منبع", fallback: missing };
  const html = renderToStaticMarkup(React.createElement(CodalSourceLink, {
    ...props, ...{ target: "_self", rel: "opener", href: "https://outside.test/override" },
  }));
  assert.equal(html, '<a href="https://codal.ir/Reports/Decision.aspx?id=7" target="_blank" rel="noopener noreferrer" class="source-contract">منبع</a>');
  for (const url of [null, "", "  ", "https://outside.test/report", "javascript:alert(1)", "https://user:pass@codal.ir/report", "https://codal.ir/report?api_key=private"]) {
    const fallback = renderToStaticMarkup(React.createElement(CodalSourceLink, { ...props, url }));
    assert.equal(fallback, '<span class="missing-contract">ناموجود</span>');
  }
});

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

test("stored source presentation preserves exact link attributes, metadata and invalid-link fallback", () => {
  const stored = ["/Reports/Decision.aspx?id=7", null, "", "  ", "https://user:pass@codal.ir/report", "https://codal.ir:444/report"]
    .map((url, i) => ({ kind: "ن-۱۰", title: `stored-source-${i}`, periodEnd: "1405-04-31", url }));
  const html = renderToStaticMarkup(React.createElement(CodalReportsTab, { symbol: "نماد", stored }));
  assert.ok(html.includes('<a href="https://codal.ir/Reports/Decision.aspx?id=7" target="_blank" rel="noopener noreferrer" class="font-medium hover:underline">stored-source-0</a>'));
  for (let i = 1; i < stored.length; i++) assert.ok(html.includes(`<span class="font-medium">stored-source-${i}</span>`));
  assert.equal((html.match(/دورهٔ مالی: ۱۴۰۵-۰۴-۳۱/g) ?? []).length, stored.length);
  assert.doesNotMatch(html, /user:pass|:444|href="#"/);
});

test("actual live report renderer preserves source classes, title and stored date/time without unsafe navigation", () => {
  const rows = ["https://www.codal.ir/report?id=9", "https://codal.ir.evil.test/report", null]
    .map((url, i) => ({ title: `live-source-${i}`, kind: "ن-۳۰", date: "1405/05/03", time: "16:54:53", url }));
  let index = 0;
  const states = [rows, "idle"];
  const taskModule = { exports: {} as { default: typeof CodalReportsTab } };
  const localRequire = createRequire(new URL("./CodalReportsTab.tsx", import.meta.url));
  runInNewContext(ts.transpileModule(readFileSync(new URL("./CodalReportsTab.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: taskModule.exports, require(name: string) {
    if (name === "react") return { ...React, useState: () => [states[index++], () => {}] };
    return localRequire(name.startsWith("@/") ? resolve(name.slice(2)) : name);
  } });
  const html = renderToStaticMarkup(React.createElement(taskModule.exports.default, { symbol: "نماد", stored: [] }));
  assert.ok(html.includes('<a href="https://www.codal.ir/report?id=9" target="_blank" rel="noopener noreferrer" class="font-medium hover:underline">live-source-0</a>'));
  for (const i of [1, 2]) assert.ok(html.includes(`<span class="font-medium">live-source-${i}</span>`));
  assert.ok(html.includes("۱۴۰۵/۰۵/۰۳")); assert.ok(html.includes("۱۶:۵۴:۵۳"));
  assert.doesNotMatch(html, /evil\.test|href="#"/);
});
