import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import { startVisiblePoll, type PollEnvironment } from "../../lib/visible-poll";
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


// The existing p07 host does not run effect cleanups or unmount. This bounded,
// test-only driver exercises the actual detail TSX + real poller with isolated
// transport/clock/scheduler, including lifecycle; it is not browser/DOM proof.
function mountLiveDetail(transport: (url: string, options?: RequestInit) => Promise<Response>, symbol = "فولاد") {
  let clock = Date.parse("2026-10-30T14:23:14.900Z"), cursor = 0, tree: React.ReactElement, mounted = true;
  const props = { symbol, sections: "market" }, slots: unknown[] = [];
  const effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  const pending: (() => void)[] = [], timers = new Set<() => void>(), resumes = new Set<() => void>();
  const calls: { url: string; signal: AbortSignal | null | undefined }[] = [];
  const hooks = { ...React,
    useState(initial: unknown) {
      const key = cursor++;
      if (!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial;
      return [slots[key], (next: unknown) => { slots[key] = typeof next === "function" ? next(slots[key]) : next; }];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const key = cursor++, previous = effects.get(key);
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) pending.push(() => {
        previous?.cleanup?.(); const cleanup = effect();
        effects.set(key, { deps, cleanup: cleanup || undefined });
      });
    },
  };
  const environment: PollEnvironment = {
    available: () => true,
    now: () => clock,
    every(callback, ms) { assert.equal(ms, 60_000); timers.add(callback); return () => { timers.delete(callback); }; },
    onResume(callback) { resumes.add(callback); return () => { resumes.delete(callback); }; },
  };
  const filename = resolve("components/symbol/SymbolLiveDetail.tsx"), local = createRequire(filename);
  const taskModule = { exports: {} as { default: (props: object) => React.ReactElement } };
  const load = (name: string) => name === "react" ? hooks : name === "@/lib/visible-poll"
    ? { startVisiblePoll, browserPollEnvironment: () => environment }
    : local(name.startsWith("@/") ? resolve(name.slice(2)) : name);
  class FixedDate extends Date { constructor(value: string | number = clock) { super(value); } static now() { return clock; } }
  const fetch = (url: string, options?: RequestInit) => { calls.push({ url, signal: options?.signal }); return transport(url, options); };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", "React", "fetch", "Date", js)(load, taskModule, taskModule.exports, React, fetch, FixedDate);
  const render = () => { if (!mounted) return; cursor = 0; tree = taskModule.exports.default(props); pending.splice(0).forEach(run => run()); };
  const settle = async () => { for (let i = 0; i < 5; i++) { render(); await new Promise<void>(done => setImmediate(done)); } render(); };
  render();
  return {
    settle, calls, timers, resumes,
    html: () => renderToStaticMarkup(tree),
    async switchSymbol(next: string) { props.symbol = next; await settle(); },
    async poll() { clock += 60_000; timers.forEach(tick => tick()); await settle(); },
    unmount() { mounted = false; effects.forEach(effect => effect.cleanup?.()); effects.clear(); },
  };
}

const detailNow = Date.parse("2026-10-30T14:23:14.900Z");
const oldSource = { date_update: "1405-08-06", date: "1405-08-06", time: "12:30:01" };
const detailData = () => ({ ...oldSource, l18: "فولاد", pc: 4210, pl: 4260, eps: 693, pd1: 4260, po1: 4270 });

test("actual detail effect keeps fresh receipt independent of the 53-hour-old source and preserves existing units", async () => {
  const data = detailData(), host = mountLiveDetail(async () => Response.json({ data, at: 1793370106585 }));
  try {
    assert.match(host.html(), /در حال دریافت/);
    await host.settle();
    const html = host.html();
    assert.match(html, /اسنپ‌شات با دریافت تازه/);
    assert.match(html, /زمان دریافت:/); assert.match(html, /dateTime="2026-10-30T14:21:46.585Z"/);
    assert.match(html, /زمان منبع:/); assert.match(html, /dateTime="2026-10-28T09:00:01.000Z"/);
    assert.match(html, /تازگی دریافت، تازگی قیمت یا اطلاعات منبع را اثبات نمی‌کند/);
    assert.match(html, /قرارداد نمایش این بخش/); assert.match(html, /پاسخ، واحد صریح مستقلی اعلام نمی‌کند/);
    assert.match(html, /EPS \(ریال\)<\/p><p[^>]*>۶۹۳<\/p>/);
    assert.match(html, /۴۲۶/); assert.match(html, /قیمت‌ها به تومان/);
    assert.equal(host.calls.length, 1); assert.match(host.calls[0].url, /^\/api\/symbol-detail\?l18=/);
    assert.equal(data.pc, 4210, "source values are not rewritten");
  } finally { host.unmount(); }
});

test("actual detail never replaces missing invalid or future source clocks with receipt or now", async () => {
  const cases = [
    { date_update: null, date: null, time: null }, { time: null }, { time: "" }, { time: "25:99" },
    { date_update: "invalid", date: "1405-08-06" }, { date_update: "1405-13-01" },
    { date_update: "1405-08-09" }, { date_update: "1405-08-08", time: "18:00:00" },
  ];
  for (const missing of cases) {
    const host = mountLiveDetail(async () => Response.json({ data: { ...detailData(), ...missing }, at: detailNow }));
    try {
      await host.settle(); const html = host.html();
      assert.match(html, /زمان منبع: نامعلوم/);
      assert.equal((html.match(/<time /g) ?? []).length, 1, "only the independent known receipt remains");
      assert.match(html, /dateTime="2026-10-30T14:23:14.900Z"/);
      assert.equal(host.calls.length, 1);
    } finally { host.unmount(); }
  }
  const fallback = mountLiveDetail(async () => Response.json({ data: { ...detailData(), date_update: null }, at: detailNow }));
  try { await fallback.settle(); assert.match(fallback.html(), /dateTime="2026-10-28T09:00:01.000Z"/); }
  finally { fallback.unmount(); }
});

test("actual detail treats absent invalid zero and future receipt as unknown without losing the source time", async () => {
  for (const at of [null, undefined, 0, -1, "1793370106585", detailNow + 121_000]) {
    const host = mountLiveDetail(async () => Response.json({ data: detailData(), at }));
    try {
      await host.settle(); const html = host.html();
      assert.match(html, /زمان دریافت: نامعلوم/); assert.match(html, /تازگی دریافت تأیید نشده/);
      assert.match(html, /dateTime="2026-10-28T09:00:01.000Z"/);
      assert.equal((html.match(/<time /g) ?? []).length, 1);
      assert.doesNotMatch(html, /Invalid Date|NaN/);
    } finally { host.unmount(); }
  }
});

test("actual detail retains observed zero vs null through fetch and state without changing price conversion", async () => {
  for (const value of [0, null]) {
    const host = mountLiveDetail(async () => Response.json({ data: { ...oldSource, eps: value, pc: value, pl: value, pd1: value, po1: value }, at: detailNow }));
    try {
      await host.settle(); const html = host.html();
      assert.match(html, new RegExp(String.raw`EPS \(ریال\)<\/p><p[^>]*>${value === 0 ? "۰" : "—"}<\/p>`));
      assert.equal(html.includes("قیمت تقاضا"), value === 0);
      assert.doesNotMatch(html, /NaN|Infinity/);
    } finally { host.unmount(); }
  }
});

test("actual symbol switch aborts old poll and ignores its late response with no old clock or values", async () => {
  let finishOld!: (response: Response) => void;
  const host = mountLiveDetail(async url => url.includes(encodeURIComponent("فولاد"))
    ? new Promise<Response>(done => { finishOld = done; })
    : Response.json({ data: { eps: 7, date_update: null, date: null, time: null }, at: null }));
  try {
    await host.settle(); assert.equal(host.calls.length, 1);
    const oldSignal = host.calls[0].signal; assert.equal(oldSignal?.aborted, false);
    await host.switchSymbol("دوم"); assert.equal(oldSignal?.aborted, true);
    assert.equal(host.timers.size, 1); assert.equal(host.resumes.size, 1);
    finishOld(Response.json({ data: { ...detailData(), eps: 999 }, at: detailNow }));
    await host.settle(); const html = host.html();
    assert.match(html, /EPS \(ریال\)<\/p><p[^>]*>۷<\/p>/);
    assert.doesNotMatch(html, /۹۹۹|<time /); assert.match(html, /زمان دریافت: نامعلوم/);
    assert.equal(host.calls.length, 2);
  } finally { host.unmount(); }
});

test("actual failed poll hides old metadata and keeps failure distinct from a 404 rotation absence", async () => {
  let reads = 0;
  const host = mountLiveDetail(async () => ++reads === 1 ? Response.json({ data: detailData(), at: detailNow }) : Response.json({ error: "read failed" }, { status: 502 }));
  try {
    await host.settle(); assert.match(host.html(), /زمان منبع:/);
    await host.poll(); const html = host.html();
    assert.match(html, /دادهٔ زندهٔ نماد در دسترس نیست/);
    assert.doesNotMatch(html, /<time |اسنپ‌شات با دریافت تازه|هنوز در چرخه/);
    assert.equal(host.calls.length, 2);
  } finally { host.unmount(); }
  const absent = mountLiveDetail(async () => Response.json({ error: "not in rotation" }, { status: 404 }));
  try { await absent.settle(); assert.match(absent.html(), /هنوز در چرخه/); assert.equal(absent.calls.length, 1); }
  finally { absent.unmount(); }
});

test("actual detail unmount removes poll/resume listeners and aborts an in-flight request", async () => {
  let finish!: (response: Response) => void;
  const host = mountLiveDetail(async () => new Promise<Response>(done => { finish = done; }));
  await host.settle(); const signal = host.calls[0].signal;
  assert.equal(signal?.aborted, false); assert.equal(host.timers.size, 1); assert.equal(host.resumes.size, 1);
  host.unmount();
  assert.equal(signal?.aborted, true); assert.equal(host.timers.size, 0); assert.equal(host.resumes.size, 0);
  finish(Response.json({ data: detailData(), at: detailNow })); await host.settle();
  assert.match(host.html(), /در حال دریافت/); assert.equal(host.calls.length, 1);
});
