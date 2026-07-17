// تست فیلترهای تابلوخوانی (M7) — بدون شبکه.
// اجرا:  npx tsx --test lib/core/screener.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  realMoneyFlow,
  perCapitaBuy,
  buyerPower,
  distanceToDayHigh,
  volumeRatio,
  runFilter,
  SCREENER_FILTERS,
  THRESHOLDS,
} from "./screener";
import type { IrStockRow } from "@/lib/market-ir";

function row(over: Partial<IrStockRow>): IrStockRow {
  return {
    id: "تست",
    faName: "شرکت تست",
    price: 1000,
    unit: "toman",
    ...over,
  } as IrStockRow;
}

test("ورود پول حقیقی: (خرید − فروش) × قیمت پایانی", () => {
  const r = row({ buyI: 2_000_000, sellI: 500_000, closingPrice: 1000 });
  assert.equal(realMoneyFlow(r), 1_500_000 * 1000);
});

test("ورود پول حقیقی: بدون حجم حقیقی → null (صداقت داده)", () => {
  const r = row({ buyI: undefined, sellI: undefined });
  // asStockRows در عمل ۰ می‌گذارد؛ اینجا مسیر نبودِ فیلد آزموده می‌شود
  assert.equal(realMoneyFlow(r), null);
});

test("سرانهٔ خرید: ارزش خرید ÷ تعداد خریدار — بدون شمارنده null", () => {
  const withCount = row({ buyI: 1_000_000, buyCountI: 100, closingPrice: 500 });
  assert.equal(perCapitaBuy(withCount), (1_000_000 * 500) / 100);
  const noCount = row({ buyI: 1_000_000, buyCountI: null, closingPrice: 500 });
  assert.equal(perCapitaBuy(noCount), null);
});

test("قدرت خریدار: سرانهٔ خرید ÷ سرانهٔ فروش", () => {
  const r = row({
    buyI: 1_000_000, buyCountI: 100,   // سرانه خرید = 10000×قیمت
    sellI: 1_000_000, sellCountI: 400, // سرانه فروش = 2500×قیمت
    closingPrice: 1000,
  });
  assert.equal(buyerPower(r), 4);
});

test("فاصله تا سقف روز: (سقف − قیمت) ÷ سقف × ۱۰۰؛ بدون سقف null", () => {
  const r = row({ price: 990, dayHigh: 1000 });
  const d = distanceToDayHigh(r);
  assert.ok(d != null && Math.abs(d - 1) < 1e-9);
  assert.equal(distanceToDayHigh(row({ price: 990, dayHigh: null })), null);
});

test("نسبت حجم: حجم امروز ÷ میانگین ۳۰روزه؛ بدون تاریخچه null", () => {
  const ctx = { avgVolume30: new Map([["تست", 1_000_000]]) };
  assert.equal(volumeRatio(row({ volume: 4_000_000 }), ctx), 4);
  assert.equal(volumeRatio(row({ id: "غایب", volume: 4_000_000 }), ctx), null);
  assert.equal(volumeRatio(row({ volume: 4_000_000 }), {}), null);
});

test("فیلتر ورود پول قوی: آستانهٔ ۱ میلیارد تومان — نماد بی‌داده حذف", () => {
  const strong = row({ id: "قوی", buyI: 3_000_000, sellI: 0, closingPrice: 1000 }); // 3B
  const weak = row({ id: "ضعیف", buyI: 100, sellI: 0, closingPrice: 1000 });
  const out = runFilter([strong, weak], "strong_inflow");
  assert.deepEqual(out.map((r) => r.id), ["قوی"]);
});

test("فیلتر قدرت خریدار: بدون تعداد معامله‌گران → حذف از نتیجه (نه false-positive)", () => {
  const good = row({
    id: "خوب", buyI: 1_000_000, buyCountI: 10, sellI: 1_000_000, sellCountI: 100, closingPrice: 1000,
  }); // قدرت = 10
  const noData = row({ id: "بی‌داده", buyI: 1_000_000, sellI: 1_000_000, closingPrice: 1000 });
  const out = runFilter([good, noData], "buyer_power");
  assert.deepEqual(out.map((r) => r.id), ["خوب"]);
});

test("فیلتر نزدیک سقف روز: فقط فاصلهٔ کمتر از ۱٪", () => {
  const near = row({ id: "نزدیک", price: 999, dayHigh: 1000 });   // 0.1%
  const far = row({ id: "دور", price: 950, dayHigh: 1000 });      // 5%
  const noHigh = row({ id: "بی‌سقف", price: 999 });
  const out = runFilter([near, far, noHigh], "near_day_high");
  assert.deepEqual(out.map((r) => r.id), ["نزدیک"]);
});

test("فیلتر حجم مشکوک: فقط با تاریخچهٔ ۳۰روزه — بقیه حذف", () => {
  const ctx = { avgVolume30: new Map([["الف", 1_000_000], ["ب", 1_000_000]]) };
  const spike = row({ id: "الف", volume: 5_000_000 });   // 5x
  const normal = row({ id: "ب", volume: 1_100_000 });    // 1.1x
  const noHist = row({ id: "ج", volume: 99_000_000 });   // بدون تاریخچه
  const out = runFilter([spike, normal, noHist], "suspicious_volume", ctx);
  assert.deepEqual(out.map((r) => r.id), ["الف"]);
});

test("همهٔ فیلترها تعریف عمومی غیرتجویزی دارند", () => {
  for (const f of SCREENER_FILTERS) {
    assert.ok(f.definition.length > 30, `تعریف کوتاه: ${f.key}`);
    for (const banned of ["بخرید", "بفروشید", "پیشنهاد", "توصیه", "سیگنال", "حمایت", "مقاومت", "هدف قیمتی"]) {
      assert.ok(!f.definition.includes(banned), `واژهٔ ممنوع «${banned}» در ${f.key}`);
      assert.ok(!f.label.includes(banned), `واژهٔ ممنوع «${banned}» در برچسب ${f.key}`);
    }
  }
  assert.equal(THRESHOLDS.strongInflowToman, 1_000_000_000);
});

test("فیلتر ناشناخته → فهرست خالی (بدون خطا)", () => {
  assert.deepEqual(runFilter([row({})], "nonexistent"), []);
});
