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
import { EMPTY_REPORT_FILTER } from "../../lib/core/companyReportDiscovery";
import { mountComponent } from "../admin/p07-component-test-host";
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
  const states = [{ symbol: 'نماد', items: rows }, "idle", EMPTY_REPORT_FILTER];
  const taskModule = { exports: {} as { default: typeof CodalReportsTab } };
  const localRequire = createRequire(new URL("./CodalReportsTab.tsx", import.meta.url));
  runInNewContext(ts.transpileModule(readFileSync(new URL("./CodalReportsTab.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: taskModule.exports, require(name: string) {
    if (name === "react") return { ...React, useState: (initial: unknown) => [index < states.length ? states[index++] : initial, () => {}] };
    return localRequire(name.startsWith("@/") ? resolve(name.slice(2)) : name);
  } });
  const html = renderToStaticMarkup(React.createElement(taskModule.exports.default, { symbol: "نماد", stored: [] }));
  assert.ok(html.includes('<a href="https://www.codal.ir/report?id=9" target="_blank" rel="noopener noreferrer" class="font-medium hover:underline">live-source-0</a>'));
  for (const i of [1, 2]) assert.ok(html.includes(`<span class="font-medium">live-source-${i}</span>`));
  assert.ok(html.includes("۱۴۰۵/۰۵/۰۳")); assert.ok(html.includes("۱۶:۵۴:۵۳"));
  assert.doesNotMatch(html, /evil\.test|href="#"/);
});

test('actual discovery controls filter the loaded subset and reset without another request', async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ data: [
      { title: 'صورت‌هاي مالي شركت ۱۴۰۵', kind: 'ن-۱۰', date: '1405/04/31', time: '12:00:00', url: null },
      { title: 'اصلاحیه صورت‌های مالی شرکت 1405', kind: 'ن-10', date: null, time: null, url: null },
      { title: 'فعالیت ماهانه', kind: 'ن-۳۰', date: null, time: null, url: null },
    ] });
  };
  try {
    const host = mountComponent('components/symbol/CodalReportsTab.tsx', { symbol: 'نمونه', stored: [] });
    await host.settle();
    await host.click('دریافت فهرست');
    const search = host.find('input', node => node.props.type === 'search');
    (search.props.onChange as (event: unknown) => void)({ target: { value: 'مالي شركت ١٤٠٥' } });
    await host.settle();
    const status = () => host.find('p', node => node.props.role === 'status').props.children as unknown[];
    assert.ok(JSON.stringify(status()).includes('۲'));
    const dateFilter = host.find('select', node => node.props.value === 'all' && JSON.stringify(node.props.children).includes('تاریخ ثبت‌نشده'));
    (dateFilter.props.onChange as (event: unknown) => void)({ target: { value: 'missing' } });
    await host.settle();
    assert.ok(JSON.stringify(status()).includes('۱'));
    host.find('li', node => JSON.stringify(node.props.children).includes('اصلاحیه صورت‌های مالی شرکت 1405'));
    await host.click('پاک‌کردن فیلترها');
    assert.ok(JSON.stringify(status()).includes('۳'));
    assert.equal(requests, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('malformed stored-announcement response remains an error with retry rather than an empty list', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: 'missing data' });
  try {
    const host = mountComponent('components/symbol/CodalReportsTab.tsx', { symbol: 'نمونه', stored: [] });
    await host.settle();
    await host.click('دریافت فهرست');
    host.find('p', node => JSON.stringify(node.props.children).includes('دریافت فهرست ذخیره‌شده ممکن نشد'));
    assert.equal(host.button('دریافت فهرست').props.disabled, false);
    assert.throws(() => host.find('input', node => node.props.type === 'search'), /not found/);
  } finally { globalThis.fetch = oldFetch; }
});

test('display choices preserve combined filters, sources, publication metadata and missing-date warnings without fetching', async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  // Synthetic metadata: these fixtures do not establish online data acceptance.
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ data: [
      { title: 'گزارش مالی نمونه', kind: 'ن-۱۰', date: '1405/05/03', time: '16:54:53', publishedDate: '1405/05/04', url: '/Reports/Decision.aspx?id=71' },
      { title: 'اصلاحیه مالی نمونه', kind: 'ن-۱۰', date: null, time: null, publishedDate: null, url: '/Reports/Decision.aspx?id=72' },
      { title: 'فعالیت ماهانه', kind: 'ن-۳۰', date: null, time: null, publishedDate: null, url: null },
    ] });
  };
  try {
    const host = mountComponent('components/symbol/CodalReportsTab.tsx', { symbol: 'نمونه', stored: [] });
    await host.settle(); await host.click('دریافت فهرست');
    const checkbox = (label: string) => host.find('input', node => node.props.type === 'checkbox' && node.props['aria-label'] === label);
    const choose = async (label: string, checked: boolean) => {
      (checkbox(label).props.onChange as (event: unknown) => void)({ target: { checked } });
      await host.settle();
    };
    assert.equal(checkbox('نمایش نوع اطلاعیه').props.checked, true);
    assert.equal(checkbox('نمایش زمان ارسال').props.checked, true);
    (host.find('input', node => node.props.type === 'search').props.onChange as (event: unknown) => void)({ target: { value: 'مالی نمونه' } });
    await host.settle();
    (host.find('select', node => JSON.stringify(node.props.children).includes('نوع ثبت‌نشده')).props.onChange as (event: unknown) => void)({ target: { value: 'kind:ن-۱۰' } });
    await host.settle();
    const status = () => renderToStaticMarkup(host.find('p', node => node.props.role === 'status'));
    const reasons = () => renderToStaticMarkup(host.find('details', () => true));
    const result = (title: string) => renderToStaticMarkup(host.find('li', node => node.props.className === 'py-2 text-xs' && JSON.stringify(node.props.children).includes(title)));
    const beforeStatus = status(), beforeReasons = reasons();
    await choose('نمایش نوع اطلاعیه', false); await choose('نمایش زمان ارسال', false);
    assert.equal(status(), beforeStatus); assert.equal(reasons(), beforeReasons);
    assert.match(status(), /تاریخ ارسال ۲ مورد ثبت نشده است/);
    const hidden = result('گزارش مالی نمونه');
    assert.match(hidden, /href="https:\/\/codal.ir\/Reports\/Decision.aspx\?id=71"/);
    assert.match(hidden, /انتشار: ۱۴۰۵\/۰۵\/۰۴/);
    assert.doesNotMatch(hidden, /ن-۱۰|ارسال:|۱۶:۵۴:۵۳/);
    assert.match(result('اصلاحیه مالی نمونه'), /تاریخ انتشار نامعلوم/);
    await host.click('پاک‌کردن فیلترها');
    assert.equal(checkbox('نمایش نوع اطلاعیه').props.checked, false);
    assert.equal(checkbox('نمایش زمان ارسال').props.checked, false);
    assert.match(status(), /۳ نتیجه از ۳/);
    result('فعالیت ماهانه');
    await choose('نمایش نوع اطلاعیه', true); await choose('نمایش زمان ارسال', true);
    assert.match(result('گزارش مالی نمونه'), /ن-۱۰/);
    assert.match(result('گزارش مالی نمونه'), /ارسال: ۱۴۰۵\/۰۵\/۰۳ ۱۶:۵۴:۵۳/);
    assert.match(result('اصلاحیه مالی نمونه'), /زمان ارسال نامعلوم/);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('reusing the dossier for another symbol clears filters and ignores a late old-company response', async () => {
  const oldFetch = globalThis.fetch;
  let finishOld: ((response: Response) => void) | undefined;
  globalThis.fetch = async input => String(input).includes(encodeURIComponent('اول'))
    ? new Promise<Response>(resolve => { finishOld = resolve; })
    : Response.json({ data: [{ title: 'اطلاعیه شرکت دوم', kind: null, date: null, time: null, url: null }] });
  try {
    const props = { symbol: 'اول', stored: [] };
    const host = mountComponent('components/symbol/CodalReportsTab.tsx', props);
    await host.settle();
    await host.click('دریافت فهرست');
    assert.equal(host.button('در حال دریافت').props.disabled, true);
    props.symbol = 'دوم';
    await host.settle();
    await host.click('دریافت فهرست');
    finishOld!(Response.json({ data: [{ title: 'اطلاعیه شرکت اول', kind: null, date: null, time: null, url: null }] }));
    await host.settle();
    host.find('li', node => JSON.stringify(node.props.children).includes('اطلاعیه شرکت دوم'));
    assert.throws(() => host.find('li', node => JSON.stringify(node.props.children).includes('اطلاعیه شرکت اول')), /not found/);
    for (const label of ['نمایش نوع اطلاعیه', 'نمایش زمان ارسال']) {
      const control = host.find('input', node => node.props['aria-label'] === label);
      (control.props.onChange as (event: unknown) => void)({ target: { checked: false } });
      await host.settle();
    }
    const search = host.find('input', node => node.props.type === 'search');
    (search.props.onChange as (event: unknown) => void)({ target: { value: 'نامنطبق' } });
    await host.settle();
    props.symbol = 'سوم';
    await host.settle();
    await host.click('دریافت فهرست');
    assert.equal(host.find('input', node => node.props.type === 'search').props.value, '');
    for (const label of ['نمایش نوع اطلاعیه', 'نمایش زمان ارسال']) {
      assert.equal(host.find('input', node => node.props['aria-label'] === label).props.checked, true);
    }
  } finally { globalThis.fetch = oldFetch; }
});


test('HTTP502 stored read shows error and preserves manual retry, not an empty list', async () => {
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({error:'supabase 402'},{status:502});
  try {
    const host=mountComponent('components/symbol/CodalReportsTab.tsx',{symbol:'فولاد',stored:[]});
    await host.settle(); await host.click('دریافت فهرست');
    host.find('p',node=>JSON.stringify(node.props.children).includes('دریافت فهرست ذخیره‌شده ممکن نشد'));
    assert.equal(host.button('دریافت فهرست').props.disabled,false);
  } finally {globalThis.fetch=oldFetch;}
});

test('pending stored read is bounded by deadline and becomes retryable error', async () => {
  const oldFetch=globalThis.fetch, oldTimeout=AbortSignal.timeout;
  let supplied=false, deadline=0;
  AbortSignal.timeout=(ms:number)=>{deadline=ms; return AbortSignal.abort(new DOMException('deadline','TimeoutError'));};
  globalThis.fetch=async(_input,options)=>{
    supplied=!!options?.signal;
    if(options?.signal?.aborted) throw options.signal.reason;
    return new Promise<Response>(()=>{});
  };
  try {
    const host=mountComponent('components/symbol/CodalReportsTab.tsx',{symbol:'فولاد',stored:[]});
    await host.settle(); await host.click('دریافت فهرست');
    assert.equal(supplied,true); assert.equal(deadline,20000);
    host.find('p',node=>JSON.stringify(node.props.children).includes('دریافت فهرست ذخیره‌شده ممکن نشد'));
    assert.equal(host.button('دریافت فهرست').props.disabled,false);
  } finally {globalThis.fetch=oldFetch; AbortSignal.timeout=oldTimeout;}
});
