import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  MARKET_SECTIONS,
  normalizeFa,
  searchMarket,
  buildSearchIndex,
  isIndexableSymbol,
  resolveBackTarget,
  SEARCH_MAX_LEN,
  STOCK_SORT_KEYS,
  FUND_SORT_KEYS,
  type MarketSearchEntry,
} from "./market-nav";
import { fundSelectionHref } from "./core/fund-comparison-selection";

test("a delayed real URL hook writer preserves a comparison selected after its render", () => {
  const source = readFileSync(new URL("./useUrlState.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const targets: string[] = [];
  const location = { pathname: "/market/funds", search: "?sort=faName" };
  const hookModule = { exports: {} as { useUrlState: () => { set: (updates: Record<string, string | null>) => void } } };
  runInNewContext(output, {
    module: hookModule, exports: hookModule.exports, URLSearchParams, window: { location, history: {
      replaceState: (state: unknown, _title: string, href: string) => { assert.equal(state, null); targets.push(href); },
    } },
    require: (name: string) => {
      if (name === "react") return { useCallback: (fn: unknown) => fn };
      if (name === "next/navigation") return {
        useRouter: () => ({ replace: (href: string) => targets.push(href) }),
        usePathname: () => "/market/funds", useSearchParams: () => new URLSearchParams("sort=faName"),
      };
      throw new Error(`unexpected import: ${name}`);
    },
  });
  const delayedWriter = hookModule.exports.useUrlState().set;
  const selection = JSON.stringify(["عیار", "طلا", "", "", ""]);
  location.search = `?sort=faName&compare=${encodeURIComponent(selection)}`;
  delayedWriter({ q: "طلا" });
  const result = new URL(targets[0], "https://site.test");
  assert.equal(result.searchParams.get("compare"), selection);
  assert.equal(result.searchParams.get("q"), "طلا");
  assert.equal(result.searchParams.get("sort"), "faName");
});

test("fund filters commit immediately and merge subsequent search/selection writes without RSC navigation", () => {
  const source = readFileSync(new URL("./useUrlState.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const location = new URL("https://site.test/market/funds?sort=faName#comparison");
  const hookModule = { exports: {} as { useUrlState: () => { set: (updates: Record<string, string | null>) => void } } };
  let routerCalls = 0, historyCalls = 0;
  const history = { state: { __NA: true }, replaceState(state: unknown, _title: string, href: string) {
    assert.equal(state, null, "Next must receive an external write, not its reserved internal state");
    location.href = new URL(href, location).href; historyCalls++;
  } };
  runInNewContext(output, {
    module: hookModule, exports: hookModule.exports, URLSearchParams, window: { location, history },
    require: (name: string) => {
      if (name === "react") return { useCallback: (fn: unknown) => fn };
      if (name === "next/navigation") return {
        useRouter: () => ({ replace: () => { routerCalls++; } }),
        usePathname: () => "/market/funds", useSearchParams: () => new URLSearchParams(location.search),
      };
      throw new Error(`unexpected import: ${name}`);
    },
  });
  const write = hookModule.exports.useUrlState().set;
  const ids = ["اهرم", "موج", "نارنج اهرم", "توان", "جهش"];
  history.replaceState(null, "", fundSelectionHref(location.href, ids));
  write({ q: "اهرم", type: "اهرم" });
  assert.equal(location.searchParams.get("q"), "اهرم", "URL is committed before any server promise can complete");
  assert.deepEqual(JSON.parse(location.searchParams.get("compare")!), ids);
  write({ dir: "asc" });
  history.replaceState(null, "", fundSelectionHref(location.href, ids.slice(0, 4).concat("")));
  assert.equal(location.searchParams.get("q"), "اهرم");
  assert.equal(location.searchParams.get("sort"), "faName");
  assert.equal(location.searchParams.get("dir"), "asc");
  assert.equal(location.hash, "#comparison");
  write({ q: null });
  assert.equal(location.searchParams.has("q"), false);
  assert.equal(location.searchParams.get("compare"), JSON.stringify(ids.slice(0, 4).concat("")));
  assert.equal(routerCalls, 0);
  assert.equal(historyCalls, 5);
  location.pathname = "/market/stocks";
  write({ q: "stale-timer" });
  assert.equal(historyCalls, 5, "a writer from an unmounted page cannot overwrite the next page");
});

test("non-fund URL writers keep their existing server navigation", () => {
  const source = readFileSync(new URL("./useUrlState.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const targets: string[] = [];
  const hookModule = { exports: {} as { useUrlState: () => { set: (updates: Record<string, string | null>) => void } } };
  runInNewContext(output, { module: hookModule, exports: hookModule.exports, URLSearchParams,
    window: { location: { pathname: "/market/stocks", search: "?sort=faName", hash: "#table" } },
    require: (name: string) => name === "react" ? { useCallback: (fn: unknown) => fn } : {
      useRouter: () => ({ replace: (href: string) => targets.push(href) }),
      usePathname: () => "/market/stocks", useSearchParams: () => new URLSearchParams(),
    },
  });
  hookModule.exports.useUrlState().set({ q: "فولاد" });
  assert.equal(new URL(targets[0], "https://site.test").searchParams.get("q"), "فولاد");
  assert.match(targets[0], /#table$/);
});

test("Back cancels pending typing even when the restored query value did not change", () => {
  const source = readFileSync(new URL("./useUrlState.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const listeners = new Map<string, () => void>(), timers = new Map<number, () => void>();
  const localValues: string[] = [], cleanup: (() => void)[] = [];
  const location = { pathname: "/market/funds", search: "?sort=faName" };
  let writes = 0, nextTimer = 0;
  const hookModule = { exports: {} as { useUrlBackedText: (key: string) => [string, (value: string) => void] } };
  runInNewContext(output, { module: hookModule, exports: hookModule.exports, URLSearchParams,
    setTimeout: (fn: () => void) => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: (id: number) => timers.delete(id),
    window: { location, history: { replaceState: () => { writes++; } },
      addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) },
    require: (name: string) => name === "react" ? {
      useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }),
      useState: (value: string) => [value, (next: string) => localValues.push(next)],
      useEffect: (fn: () => (() => void) | undefined) => { const done = fn(); if (done) cleanup.push(done); },
    } : { useRouter: () => ({ replace: () => { writes++; } }), usePathname: () => location.pathname, useSearchParams: () => new URLSearchParams(location.search) },
  });
  const [, update] = hookModule.exports.useUrlBackedText("q");
  update("اهرم");
  assert.equal(timers.size, 1);
  location.search = "?sort=price";
  listeners.get("popstate")!();
  assert.equal(localValues.at(-1), "");
  assert.equal(timers.size, 0);
  for (const fn of timers.values()) fn();
  assert.equal(writes, 0);
  cleanup.forEach(fn => fn());
});

test("the funds account link follows and validates the current client URL", () => {
  const source = readFileSync(new URL("../components/market/FundsAccountBridge.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const ids = JSON.stringify(["اهرم", "موج", "", "", ""]);
  let current = `/market/funds?q=اهرم&compare=${encodeURIComponent(ids)}&sort=faName&unsafe=discard`;
  const bridge = { exports: {} as { default: (props: { access: unknown }) => { props: { access: unknown; returnTo: string } } } };
  runInNewContext(output, { module: bridge, exports: bridge.exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }) };
    if (name === "@/lib/market-nav") return { resolveBackTarget };
    if (name === "@/lib/useUrlState") return { useCurrentHref: () => current };
    if (name === "@/components/account/AccountBridge") return { default: "actual-account-bridge" };
    throw new Error(`unexpected import: ${name}`);
  } });
  const access = { level: "visitor" };
  const tree = bridge.exports.default({ access });
  const next = new URL(tree.props.returnTo, "https://site.test");
  assert.equal(tree.props.access, access);
  assert.equal(next.searchParams.get("q"), "اهرم");
  assert.equal(next.searchParams.get("compare"), ids);
  assert.equal(next.searchParams.has("unsafe"), false);
  current = "/market/funds?sort=price";
  assert.equal(bridge.exports.default({ access }).props.returnTo, current);
});

test("fund comparison selections survive the existing validated symbol/account return path", () => {
  const compare = JSON.stringify(["عیار", "طلا", "", "", ""]);
  const path = resolveBackTarget(`/market/funds?compare=${encodeURIComponent(compare)}&q=طلا&dir=asc`, { href: "/market", label: "بازار" });
  const url = new URL(path.href, "https://site.test");
  assert.equal(url.searchParams.get("compare"), compare);
  assert.equal(url.searchParams.get("q"), "طلا");
  assert.equal(url.searchParams.get("dir"), "asc");
  assert.equal(new URL(resolveBackTarget(`/market/stocks?compare=${encodeURIComponent(compare)}`, { href: "/market", label: "بازار" }).href, "https://site.test").searchParams.has("compare"), false);
});

/* ── بخش‌ها ───────────────────────────────────────────────────────────────── */

test("هیچ بخشی مسیرِ تازه نمی‌سازد — همه زیرِ /market", () => {
  for (const s of MARKET_SECTIONS) {
    assert.ok(s.href.startsWith("/market"), `${s.key} خارج از /market است: ${s.href}`);
  }
});

test("لنگرِ درون‌صفحه‌ای صریحاً برچسب anchor دارد", () => {
  for (const s of MARKET_SECTIONS) {
    assert.equal(s.href.includes("#"), s.anchor === true, `ناهماهنگیِ anchor در ${s.key}`);
  }
});

test("کلیدِ بخش‌ها یکتاست", () => {
  const keys = MARKET_SECTIONS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

/* ── یکسان‌سازیِ فارسی ────────────────────────────────────────────────────── */

test("یِ عربی و کافِ عربی به فارسی یکسان می‌شوند", () => {
  assert.equal(normalizeFa("طلاي"), normalizeFa("طلای"));
  assert.equal(normalizeFa("ملك"), normalizeFa("ملک"));
});

test("نیم‌فاصله و اعراب حذف می‌شوند", () => {
  assert.equal(normalizeFa("درآمد‌ثابت"), "درآمدثابت");
  assert.equal(normalizeFa("طَلا"), "طلا");
});

/* ── جست‌وجو ─────────────────────────────────────────────────────────────── */

const INDEX: MarketSearchEntry[] = [
  { id: "طلا", name: "صندوق طلای لوتوس", kind: "fund", type: "طلا" },
  { id: "وبملت", name: "بانک ملت", kind: "stock" },
  { id: "کهربا", name: "صندوق طلای کهربا", kind: "fund", type: "طلا" },
  { id: "فملی", name: "ملی صنایع مس ایران", kind: "stock" },
];

test("جست‌وجوی خالی هیچ نتیجه‌ای نمی‌دهد (نه همهٔ نتایج)", () => {
  assert.deepEqual(searchMarket(INDEX, ""), []);
  assert.deepEqual(searchMarket(INDEX, "   "), []);
});

test("تطابقِ دقیقِ نماد اولِ فهرست است", () => {
  const r = searchMarket(INDEX, "طلا");
  assert.equal(r[0].id, "طلا");
});

test("جست‌وجو با یِ عربی هم نماد را پیدا می‌کند", () => {
  // کاربر «طلاي» را با یِ عربی تایپ می‌کند و منبع «طلای» را با یِ فارسی دارد.
  const r = searchMarket(INDEX, "طلاي");
  assert.ok(r.some((x) => x.id === "طلا"), "نمادِ طلا باید پیدا شود");
  // عبارتِ چندکلمه‌ای هم داخلِ نامِ کامل جست‌وجو می‌شود.
  const r2 = searchMarket(INDEX, "طلاي لوتوس");
  assert.deepEqual(r2.map((x) => x.id), ["طلا"]);
});

test("جست‌وجو در نامِ کامل کار می‌کند، نه فقط نماد", () => {
  const r = searchMarket(INDEX, "بانک ملت");
  assert.equal(r[0].id, "وبملت");
});

test("عبارتِ بی‌تطابق فهرستِ خالی می‌دهد — نه نتیجهٔ تقریبی", () => {
  assert.deepEqual(searchMarket(INDEX, "zzzz"), []);
});

test("سقفِ نتایج رعایت می‌شود", () => {
  const many: MarketSearchEntry[] = Array.from({ length: 50 }, (_, i) => ({
    id: `نماد${i}`, name: `نام ${i}`, kind: "stock" as const,
  }));
  assert.equal(searchMarket(many, "نماد", 8).length, 8);
});

/* ── قاعدهٔ Z — زیرنماد و حقِ تقدم ────────────────────────────────────────── */

test("زیرنمادِ رقم‌دار وارد نمایه نمی‌شود (قاعدهٔ Z)", () => {
  assert.equal(isIndexableSymbol("وبملت"), true);
  assert.equal(isIndexableSymbol("آوند4"), false);
  assert.equal(isIndexableSymbol("آوند۴"), false); // رقمِ فارسی
  assert.equal(isIndexableSymbol("وبملتح"), false); // حقِ تقدم
  assert.equal(isIndexableSymbol(""), false);
});

test("buildSearchIndex زیرنمادها را می‌اندازد و تکراری نمی‌سازد", () => {
  const idx = buildSearchIndex(
    [{ id: "وبملت", faName: "بانک ملت" }, { id: "آوند4", faName: "زیرنماد" }, { id: "طلا", faName: "تکراری" }],
    [{ id: "طلا", faName: "صندوق طلای لوتوس", type: "طلا" }],
  );
  assert.equal(idx.length, 2);
  const gold = idx.find((x) => x.id === "طلا");
  assert.equal(gold?.kind, "fund", "نمادِ مشترک باید صندوق بماند، نه سهم");
  assert.equal(gold?.name, "صندوق طلای لوتوس");
  assert.ok(!idx.some((x) => x.id === "آوند4"));
});

test("نمایه فقط میدان‌های لازم را حمل می‌کند (بدونِ دادهٔ مصرف‌نشده)", () => {
  const idx = buildSearchIndex([{ id: "وبملت", faName: "بانک ملت" }], []);
  assert.deepEqual(Object.keys(idx[0]).sort(), ["id", "kind", "name"]);
});

/* ── مسیرِ بازگشت ────────────────────────────────────────────────────────── */

const FALLBACK = { href: "/data", label: "بانک داده" };

test("مقصدِ شناخته‌شده برگردانده می‌شود", () => {
  assert.deepEqual(resolveBackTarget("/market", FALLBACK), { href: "/market", label: "میز بازار" });
  assert.equal(resolveBackTarget("/market/funds", FALLBACK).href, "/market/funds");
});

test("ورودیِ غایب یا ناشناخته به fallback می‌افتد", () => {
  assert.deepEqual(resolveBackTarget(undefined, FALLBACK), FALLBACK);
  assert.deepEqual(resolveBackTarget("", FALLBACK), FALLBACK);
  assert.deepEqual(resolveBackTarget("/admin", FALLBACK), FALLBACK);
  assert.deepEqual(resolveBackTarget("/dashboard", FALLBACK), FALLBACK);
});

test("هیچ مقصدِ بیرونی‌ای عبور نمی‌کند (ضدِ ری‌دایرکتِ باز)", () => {
  for (const bad of [
    "//evil.com",
    "https://evil.com",
    "http://evil.com/market",
    "/\\evil.com",
    "javascript:alert(1)",
    "/market@evil.com",
    " //evil.com",
    "//evil.com/market?find=x",
  ]) {
    assert.deepEqual(resolveBackTarget(bad, FALLBACK), FALLBACK, `عبور کرد: ${bad}`);
  }
});

/* ── حفظِ وضعیت ─────────────────────────────────────────────────────────── */

test("فیلترِ صنعت و نما و مرتب‌سازیِ تابلوی سهام حفظ می‌شوند", () => {
  const r = resolveBackTarget(
    "/market/stocks?industry=استخراج کانه‌های فلزی&view=map&sort=value&dir=desc",
    FALLBACK,
  );
  const u = new URL(r.href, "https://x.test");
  assert.equal(u.pathname, "/market/stocks");
  assert.equal(u.searchParams.get("industry"), "استخراج کانه‌های فلزی");
  assert.equal(u.searchParams.get("view"), "map");
  assert.equal(u.searchParams.get("sort"), "value");
  assert.equal(u.searchParams.get("dir"), "desc");
});

test("دستهٔ صندوق و جست‌وجوی جدول حفظ می‌شوند", () => {
  const r = resolveBackTarget("/market/funds?type=طلا&q=لوتوس&sort=bubblePercent&dir=asc", FALLBACK);
  const u = new URL(r.href, "https://x.test");
  assert.equal(u.searchParams.get("type"), "طلا");
  assert.equal(u.searchParams.get("q"), "لوتوس");
  assert.equal(u.searchParams.get("sort"), "bubblePercent");
  assert.equal(u.searchParams.get("dir"), "asc");
});

test("جست‌وجوی پوسته روی همهٔ صفحاتِ بازار حفظ می‌شود", () => {
  for (const base of ["/market", "/market/stocks", "/market/funds", "/market/map"]) {
    const r = resolveBackTarget(`${base}?find=وبملت`, FALLBACK);
    assert.equal(new URL(r.href, "https://x.test").searchParams.get("find"), "وبملت", base);
  }
});

test("خروجی مستقل از ترتیبِ ورودی است", () => {
  const a = resolveBackTarget("/market/stocks?view=map&industry=خودرو", FALLBACK).href;
  const b = resolveBackTarget("/market/stocks?industry=خودرو&view=map", FALLBACK).href;
  assert.equal(a, b);
});

/* ── آنچه حفظ **نمی‌شود** ────────────────────────────────────────────────── */

test("پارامترِ تعریف‌نشده برای آن مسیر دور ریخته می‌شود", () => {
  // `type` مالِ صندوق‌هاست، نه تابلوی سهام؛ و `view` مالِ سهام است، نه صندوق‌ها.
  assert.equal(resolveBackTarget("/market/stocks?type=طلا", FALLBACK).href, "/market/stocks");
  assert.equal(resolveBackTarget("/market/funds?view=map", FALLBACK).href, "/market/funds");
  // پارامترِ کاملاً بیگانه
  assert.equal(resolveBackTarget("/market?utm_source=x&next=/admin", FALLBACK).href, "/market");
});

test("مقدارِ خارج از enum دور ریخته می‌شود، ولی بقیه می‌مانند", () => {
  const r = resolveBackTarget("/market/stocks?view=evil&sort=dropTable&industry=خودرو", FALLBACK);
  const u = new URL(r.href, "https://x.test");
  assert.equal(u.searchParams.get("view"), null);
  assert.equal(u.searchParams.get("sort"), null);
  assert.equal(u.searchParams.get("industry"), "خودرو", "پارامترِ معتبر نباید قربانیِ نامعتبر شود");
});

test("کنترل‌کاراکتر و جهت‌گردان در متنِ جست‌وجو رد می‌شود", () => {
  for (const bad of ["a\u0000b", "a\u202Eb", "a\nb", "a\u007Fb"]) {
    const r = resolveBackTarget(`/market/stocks?q=${encodeURIComponent(bad)}`, FALLBACK);
    assert.equal(r.href, "/market/stocks", `عبور کرد: ${JSON.stringify(bad)}`);
  }
});

test("عبارتِ جست‌وجوی بیش از حد بلند رد می‌شود", () => {
  const long = "ا".repeat(SEARCH_MAX_LEN + 1);
  assert.equal(resolveBackTarget(`/market/stocks?q=${encodeURIComponent(long)}`, FALLBACK).href, "/market/stocks");
  const ok = "ا".repeat(SEARCH_MAX_LEN);
  assert.ok(resolveBackTarget(`/market/stocks?q=${encodeURIComponent(ok)}`, FALLBACK).href.includes("q="));
});

test("نامِ صنعتِ بدشکل رد می‌شود", () => {
  for (const bad of ["<script>", "a\"b", "x".repeat(61), "خودرو<img>"]) {
    const r = resolveBackTarget(`/market/stocks?industry=${encodeURIComponent(bad)}`, FALLBACK);
    assert.equal(r.href, "/market/stocks", `عبور کرد: ${bad}`);
  }
});

test("پارامترِ تکراری فقط یک بار و با اولین مقدار می‌آید", () => {
  const r = resolveBackTarget("/market/stocks?view=map&view=industry", FALLBACK);
  const u = new URL(r.href, "https://x.test");
  assert.deepEqual(u.searchParams.getAll("view"), ["map"]);
});

test("hash دور ریخته می‌شود ولی مسیر و پارامتر می‌مانند", () => {
  const r = resolveBackTarget("/market/stocks?industry=خودرو#top", FALLBACK);
  assert.ok(!r.href.includes("#"));
  assert.ok(r.href.includes("industry="));
});

test("سقفِ تعدادِ پارامتر رعایت می‌شود", () => {
  const many = Array.from({ length: 30 }, (_, i) => `x${i}=1`).join("&");
  const r = resolveBackTarget(`/market/stocks?${many}&industry=خودرو`, FALLBACK);
  assert.equal(new URL(r.href, "https://x.test").searchParams.size <= 8, true);
});

test("کلیدهای مرتب‌سازی با همان فهرستی است که جدول‌ها می‌شناسند", () => {
  // اگر این دو از هم جدا بیفتند، مقداری که در URL مجاز است در جدول بی‌اثر می‌شود.
  assert.ok(STOCK_SORT_KEYS.includes("marketValue"));
  assert.ok(FUND_SORT_KEYS.includes("bubblePercent"));
  assert.equal(new Set(STOCK_SORT_KEYS).size, STOCK_SORT_KEYS.length);
  assert.equal(new Set(FUND_SORT_KEYS).size, FUND_SORT_KEYS.length);
});
