import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildPriceMap,
  priceableSymbols,
  isSubTicker,
  rialToToman,
  resolvePricesByPosition,
  SYMBOL_HISTORY_PRICE_UNIT,
} from "./prices";
import type { HoldingPosition } from "./contracts";
import type { SymbolHistoryRow } from "./prices";

const row = (o: Partial<SymbolHistoryRow> & { symbol: string; trade_date: string }): SymbolHistoryRow => ({
  close: 760, last_price: 750, source: "relay_eod", ...o,
});

describe("قیمت از symbol_history (#140)", () => {
  test("ریال به تومان تبدیل می‌شود — یک‌بار، در همین مرز", () => {
    assert.equal(rialToToman(760), 76);
    const m = buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16" })]);
    assert.equal(m.get("خودرو")!.toman, 76);
  });

  test("asOf از trade_date می‌آید، نه از زمان خواندن ما", () => {
    const m = buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16" })]);
    assert.equal(m.get("خودرو")!.asOf, "2026-09-16");
  });

  test("منبع صریح حمل می‌شود", () => {
    const m = buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16" })]);
    assert.match(m.get("خودرو")!.source, /symbol_history/);
    assert.match(m.get("خودرو")!.source, /relay_eod/);
  });

  test("جدیدترین trade_date برنده است، مستقل از ترتیب ورودی", () => {
    const m = buildPriceMap([
      row({ symbol: "خودرو", trade_date: "2026-09-12", close: 750 }),
      row({ symbol: "خودرو", trade_date: "2026-09-16", close: 760 }),
      row({ symbol: "خودرو", trade_date: "2026-09-14", close: 770 }),
    ]);
    assert.equal(m.get("خودرو")!.asOf, "2026-09-16");
    assert.equal(m.get("خودرو")!.toman, 76);
  });

  // ⚠️ قاعدهٔ Z1 اسکیل بازار
  test("زیرنماد رقم‌دار قیمت نمی‌گیرد", () => {
    assert.equal(isSubTicker("فولاد2"), true);
    assert.equal(isSubTicker("آوند۴"), true);
    assert.equal(isSubTicker("فولاد"), false);
    const m = buildPriceMap([row({ symbol: "فولاد2", trade_date: "2026-09-16" })]);
    assert.equal(m.size, 0, "زیرنماد نباید وارد محاسبه شود");
    assert.deepEqual(priceableSymbols([{ symbol: "فولاد2" }, { symbol: "فولاد" }]), ["فولاد"]);
  });

  // ⚠️ قاعدهٔ D2 — دادهٔ غایب null است، نه صفر یا حدس
  test("قیمت نامعتبر یا غایب ساخته نمی‌شود", () => {
    assert.equal(buildPriceMap([row({ symbol: "الف", trade_date: "2026-09-16", close: null, last_price: null })]).size, 0);
    assert.equal(buildPriceMap([row({ symbol: "ب", trade_date: "2026-09-16", close: 0, last_price: null })]).size, 0);
    assert.equal(buildPriceMap([row({ symbol: "ج", trade_date: "2026-09-16", close: -5, last_price: null })]).size, 0);
  });

  test("اگر پایانی نباشد، آخرین قیمت جایگزین می‌شود", () => {
    const m = buildPriceMap([row({ symbol: "د", trade_date: "2026-09-16", close: null, last_price: 500 })]);
    assert.equal(m.get("د")!.toman, 50);
  });

  test("قلم دستی قیمت نمی‌گیرد — پوشش ناقص، نه عدد ساختگی", () => {
    assert.deepEqual(priceableSymbols([{ symbol: null }, { symbol: "  " }]), []);
  });

  test("نماد تکراری در فهرست درخواست دوبار نمی‌آید", () => {
    assert.deepEqual(priceableSymbols([{ symbol: "فولاد" }, { symbol: "فولاد" }]), ["فولاد"]);
  });
});

const pos = (positionKey: string, symbol: string | null): HoldingPosition => ({
  positionKey, symbol, manualLabel: symbol ? null : "دستی",
  assetClass: "equity_ir", qty: 1, unit: "سهم", costBasis: null, asOf: "2026-09-15",
});

describe("نگاشت قیمت نماد به شناسهٔ قلم (#140)", () => {
  test("قیمت حمل می‌کند که به ازای چه واحدی است", () => {
    const m = buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16" })]);
    assert.equal(m.get("خودرو")!.unit, SYMBOL_HISTORY_PRICE_UNIT);
  });

  // ⚠️ قبلاً موتور با `positionKey` در نقشه‌ای که کلیدش نماد بود جست‌وجو
  // می‌کرد، پس قلمی که کلیدش با نمادش فرق داشت بی‌صدا «بدون قیمت» می‌شد.
  test("شناسهٔ پایدارِ متفاوت از نماد، قیمت را از دست نمی‌دهد", () => {
    const bySymbol = buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16" })]);
    const byPosition = resolvePricesByPosition([pos("key-1", "خودرو")], bySymbol);
    assert.deepEqual([...byPosition.keys()], ["key-1"]);
    assert.equal(byPosition.get("key-1")!.toman, 76);
  });

  test("دو قلم با نماد یکسان، هر دو قیمت می‌گیرند", () => {
    const bySymbol = buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16" })]);
    const byPosition = resolvePricesByPosition(
      [pos("حساب-الف", "خودرو"), pos("حساب-ب", "خودرو")],
      bySymbol
    );
    assert.deepEqual([...byPosition.keys()].sort(), ["حساب-الف", "حساب-ب"]);
    assert.equal(byPosition.get("حساب-الف")!.toman, byPosition.get("حساب-ب")!.toman);
  });

  test("تغییر نماد یک قلم، شناسهٔ پایدارش را عوض نمی‌کند", () => {
    const before = resolvePricesByPosition(
      [pos("key-1", "خودرو")],
      buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16", close: 760 })])
    );
    // همان قلم، با نماد تازه
    const after = resolvePricesByPosition(
      [pos("key-1", "خساپا")],
      buildPriceMap([row({ symbol: "خساپا", trade_date: "2026-09-16", close: 500 })])
    );
    assert.deepEqual([...before.keys()], ["key-1"]);
    assert.deepEqual([...after.keys()], ["key-1"], "شناسهٔ قلم باید ثابت بماند");
    assert.notEqual(before.get("key-1")!.toman, after.get("key-1")!.toman);
  });

  test("قلم دستی نگاشت نمی‌شود", () => {
    const bySymbol = buildPriceMap([row({ symbol: "خودرو", trade_date: "2026-09-16" })]);
    assert.equal(resolvePricesByPosition([pos("نفت", null)], bySymbol).size, 0);
  });

  // ⚠️ «نامشخص» خالی نیست، پس از گارد «منبع باید باشد» رد می‌شد.
  test("ردیف بدون منبع اصلاً قیمت نمی‌سازد", () => {
    assert.equal(buildPriceMap([row({ symbol: "الف", trade_date: "2026-09-16", source: null })]).size, 0);
    assert.equal(buildPriceMap([row({ symbol: "ب", trade_date: "2026-09-16", source: "   " })]).size, 0);
  });
});
