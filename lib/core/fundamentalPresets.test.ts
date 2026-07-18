// تست پرست‌های بنیادی (T2-ب) — بدون شبکه.
// اجرا:  npx tsx --test lib/core/fundamentalPresets.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  yoyGrowthPercent,
  topByGrowth,
  priceToNav,
  lowestPriceToNav,
  FUNDAMENTAL_PRESETS,
} from "./fundamentalPresets";

test("رشد YoY: فرمول و مصونیت از تقسیم بر صفر", () => {
  assert.equal(yoyGrowthPercent(150, 100), 50);
  assert.equal(yoyGrowthPercent(50, 100), -50);
  // پارسال منفی → مبنای قدرمطلق (زیان به سود)
  assert.equal(yoyGrowthPercent(50, -100), 150);
  assert.equal(yoyGrowthPercent(100, 0), null);
  assert.equal(yoyGrowthPercent(null, 100), null);
  assert.equal(yoyGrowthPercent(100, undefined), null);
});

test("topByGrowth: نزولی، برش n، مقادیر نامعتبر حذف", () => {
  const m = new Map<string, number>([
    ["الف", 20],
    ["ب", 80],
    ["ج", -10],
    ["د", NaN],
  ]);
  const out = topByGrowth(m, 2);
  assert.deepEqual(out.map((x) => x.id), ["ب", "الف"]);
  assert.equal(topByGrowth(m, 0).length, 0);
});

test("P/NAV: فقط با قیمت و NAV مثبت", () => {
  assert.equal(priceToNav(900, 1000), 0.9);
  assert.equal(priceToNav(900, 0), null);
  assert.equal(priceToNav(null, 1000), null);
  assert.equal(priceToNav(900, -5), null);
});

test("کمترین P/NAV: صعودی و حذف صندوق بدون NAV (نه false-positive)", () => {
  const funds = [
    { id: "صندوق‌الف", price: 950, nav: 1000 },  // 0.95
    { id: "صندوق‌ب", price: 1100, nav: 1000 },   // 1.1
    { id: "صندوق‌ج", price: 800, nav: 1000 },    // 0.8
    { id: "بی‌ناو", price: 500, nav: null },
  ];
  const out = lowestPriceToNav(funds, 2);
  assert.deepEqual(out.map((x) => x.id), ["صندوق‌ج", "صندوق‌الف"]);
});

test("تعریف‌های بنیادی: غیرتجویزی و کامل", () => {
  assert.equal(FUNDAMENTAL_PRESETS.length, 3);
  for (const p of FUNDAMENTAL_PRESETS) {
    assert.ok(p.definition.length > 40, `تعریف کوتاه: ${p.key}`);
    for (const banned of ["بخرید", "بفروشید", "پیشنهاد", "توصیه", "سیگنال", "ارزنده", "فرصت خرید"]) {
      assert.ok(!p.definition.includes(banned), `واژهٔ ممنوع «${banned}» در ${p.key}`);
      assert.ok(!p.label.includes(banned), `واژهٔ ممنوع در برچسب ${p.key}`);
    }
  }
});
