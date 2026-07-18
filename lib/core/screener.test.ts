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
  rangePosition,
  distanceToBandHigh,
  distanceToBandLow,
  closeLastDivergence,
  dailyRangeVolatility,
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

/* ── تست‌های پرست‌های T2-الف ─────────────────────────────────────── */

test("جایگاه در دامنهٔ روز: ۰=کف، ۱=سقف؛ دامنهٔ صفر/غایب → null", () => {
  assert.equal(rangePosition(row({ price: 1000, dayHigh: 1000, dayLow: 900 })), 1);
  assert.equal(rangePosition(row({ price: 900, dayHigh: 1000, dayLow: 900 })), 0);
  assert.equal(rangePosition(row({ price: 950, dayHigh: 1000, dayLow: 900 })), 0.5);
  assert.equal(rangePosition(row({ price: 950, dayHigh: 950, dayLow: 950 })), null);
  assert.equal(rangePosition(row({ price: 950 })), null);
});

test("گارد صعودی: ۲۰٪ بالایی دامنه + سرانهٔ خرید > فروش؛ بی‌داده حذف", () => {
  const hit = row({
    id: "گارد", price: 990, dayHigh: 1000, dayLow: 900, closingPrice: 980,
    buyI: 1_000_000, buyCountI: 10, sellI: 1_000_000, sellCountI: 100,
  }); // pos=0.9، سرانه خرید ۱۰× فروش
  const lowPos = row({
    id: "پایین", price: 920, dayHigh: 1000, dayLow: 900, closingPrice: 950,
    buyI: 1_000_000, buyCountI: 10, sellI: 1_000_000, sellCountI: 100,
  }); // pos=0.2 → رد
  const noCounts = row({ id: "بی‌داده", price: 990, dayHigh: 1000, dayLow: 900 });
  const out = runFilter([hit, lowPos, noCounts], "bullish_guard");
  assert.deepEqual(out.map((r) => r.id), ["گارد"]);
});

test("گارد نزولی: ۲۰٪ پایینی دامنه + سرانهٔ فروش > خرید", () => {
  const hit = row({
    id: "نزول", price: 910, dayHigh: 1000, dayLow: 900, closingPrice: 930,
    buyI: 1_000_000, buyCountI: 100, sellI: 1_000_000, sellCountI: 10,
  }); // pos=0.1، سرانه فروش ۱۰× خرید
  const buyStronger = row({
    id: "خریدقوی", price: 910, dayHigh: 1000, dayLow: 900, closingPrice: 930,
    buyI: 1_000_000, buyCountI: 10, sellI: 1_000_000, sellCountI: 100,
  }); // سرانه خرید بیشتر → رد
  const out = runFilter([hit, buyStronger], "bearish_guard");
  assert.deepEqual(out.map((r) => r.id), ["نزول"]);
});

test("فاصله تا سقف/کف دامنهٔ مجاز: محاسبه و null بدون داده", () => {
  const r = row({ price: 990, bandHigh: 1000, bandLow: 900 });
  const dh = distanceToBandHigh(r);
  const dl = distanceToBandLow(r);
  assert.ok(dh != null && Math.abs(dh - 1) < 1e-9);
  assert.ok(dl != null && Math.abs(dl - 10) < 1e-9);
  assert.equal(distanceToBandHigh(row({ price: 990 })), null);
  assert.equal(distanceToBandLow(row({ price: 990 })), null);
});

test("آستانهٔ صف خرید: نزدیک سقف ولی نرسیده؛ روی سقف (صفـشده) حذف", () => {
  const near = row({ id: "نزدیک", price: 995, bandHigh: 1000 });        // 0.5%
  const atCeil = row({ id: "صفـشده", price: 1000, bandHigh: 1000 });   // فاصله ۰ → حذف
  const far = row({ id: "دور", price: 950, bandHigh: 1000 });            // 5%
  const noBand = row({ id: "بی‌دامنه", price: 995 });
  const out = runFilter([near, atCeil, far, noBand], "near_buy_queue");
  assert.deepEqual(out.map((r) => r.id), ["نزدیک"]);
});

test("آستانهٔ صف فروش: نزدیک کف ولی نرسیده", () => {
  const near = row({ id: "نزدیک", price: 905, bandLow: 900 });   // ~0.56%
  const atFloor = row({ id: "کف", price: 900, bandLow: 900 });     // ۰ → حذف
  const out = runFilter([near, atFloor], "near_sell_queue");
  assert.deepEqual(out.map((r) => r.id), ["نزدیک"]);
});

test("اختلاف پایانی/آخرین: دو جهت جدا + null بدون داده", () => {
  // آخرین بالاتر از پایانی: plp=+3، pcp=+1 → divergence = −2
  const up = row({ id: "بالا", changePercent: 3, closingChangePercent: 1 });
  // آخرین پایین‌تر از پایانی: plp=−1، pcp=+2 → divergence = +3
  const down = row({ id: "پایین", changePercent: -1, closingChangePercent: 2 });
  const small = row({ id: "کم", changePercent: 1, closingChangePercent: 0.5 });
  const noData = row({ id: "بی‌داده" });
  assert.equal(closeLastDivergence(up), -2);
  assert.equal(closeLastDivergence(noData), null);
  assert.deepEqual(runFilter([up, down, small, noData], "divergence_up").map((r) => r.id), ["بالا"]);
  assert.deepEqual(runFilter([up, down, small, noData], "divergence_down").map((r) => r.id), ["پایین"]);
});

test("نوسان روزانه: (سقف−کف)÷پایانی×۱۰۰؛ آستانهٔ ۴٪؛ بی‌داده حذف", () => {
  const wild = row({ id: "پرنوسان", dayHigh: 1050, dayLow: 1000, closingPrice: 1000 }); // 5%
  const calm = row({ id: "آرام", dayHigh: 1010, dayLow: 1000, closingPrice: 1000 });    // 1%
  const noData = row({ id: "بی‌داده" });
  const v = dailyRangeVolatility(wild);
  assert.ok(v != null && Math.abs(v - 5) < 1e-9);
  assert.equal(dailyRangeVolatility(noData), null);
  assert.deepEqual(
    runFilter([wild, calm, noData], "high_range_volatility").map((r) => r.id),
    ["پرنوسان"]
  );
});

test("پرست‌های جدید هم تعریف عمومی دارند (کل فهرست = ۱۱)", () => {
  assert.equal(SCREENER_FILTERS.length, 11);
  const keys = SCREENER_FILTERS.map((f) => f.key);
  for (const k of ["bullish_guard", "bearish_guard", "near_buy_queue", "near_sell_queue", "divergence_up", "divergence_down", "high_range_volatility"]) {
    assert.ok(keys.includes(k), `پرست غایب: ${k}`);
  }
});
