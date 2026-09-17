import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildPriceMap, priceableSymbols, isSubTicker, rialToToman } from "./prices";
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
