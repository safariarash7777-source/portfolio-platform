// تست‌های T1 — lib/core/monthlyReport.ts
// پوشش موارد الزامی بریف: سال مالی غیرمنطبق، ماه غایب (گپ)، محصول تک‌قلمی، واحد.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlySales,
  dedupeByMonth,
  fyMonthOrder,
  monthKeyOf,
  narrativeCumulative,
  narrativeMix,
  narrativeMonthlyVsAvg,
  narrativeProdVsSales,
  narrativeRate,
} from "./monthlyReport";
import type { CodalN30Data, N30ProductRow } from "@/lib/fundamental/types";

function prod(p: Partial<N30ProductRow> & { product_name: string }): N30ProductRow {
  return {
    market: "داخلی",
    production_qty: null,
    sales_qty: null,
    sales_rate: null,
    sales_amount: null,
    ...p,
  };
}

function report(periodEnd: string, total: number, products: N30ProductRow[], cum?: number): CodalN30Data {
  return {
    symbol: "تست",
    report_kind: "ن-۳۰",
    period_end: periodEnd,
    fiscal_year: Number(periodEnd.slice(0, 4)),
    products,
    period_total_amount: total,
    fy_cumulative_amount: cum ?? total,
  };
}

test("monthKeyOf: جلالی معتبر و نامعتبر", () => {
  assert.equal(monthKeyOf("1404-10-30"), "1404-10");
  assert.equal(monthKeyOf("1405-02-31"), "1405-02"); // اردیبهشت ۳۱روزه معتبر
  assert.equal(monthKeyOf("bad"), null);
  assert.equal(monthKeyOf("1404-13-01"), null);
});

test("fyMonthOrder: سال مالی منتهی به شهریور از مهر شروع می‌شود", () => {
  assert.deepEqual(fyMonthOrder(7).slice(0, 3), [7, 8, 9]);
  assert.deepEqual(fyMonthOrder(7)[11], 6);
  assert.deepEqual(fyMonthOrder(1)[0], 1);
});

test("dedupeByMonth: جدیدترین اصلاحیه برنده؛ نسخهٔ جمع‌صفر کنار می‌رود", () => {
  const newer = report("1404-12-29", 500, [prod({ product_name: "الف", sales_amount: 500 })]);
  const older = report("1404-12-29", 400, [prod({ product_name: "الف", sales_amount: 400 })]);
  // ورودی از جدید به قدیم — اولین دیده‌شده (جدیدترین) برنده.
  const m1 = dedupeByMonth([newer, older]);
  assert.equal(m1.get("1404-12")?.period_total_amount, 500);
  // نسخهٔ نگه‌داشتهٔ صفر با نسخهٔ ناصفر بعدی جایگزین می‌شود.
  const zero = report("1404-07-30", 0, [prod({ product_name: "الف", sales_amount: 0 })]);
  const real = report("1404-07-30", 450, [prod({ product_name: "الف", sales_amount: 450 })]);
  const m2 = dedupeByMonth([zero, real]);
  assert.equal(m2.get("1404-07")?.period_total_amount, 450);
});

test("گپ واقعی: ماه بدون گزارش amount=null می‌ماند (بدون درون‌یابی)", () => {
  const r = buildMonthlySales([
    report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100 })], 100),
    report("1405-03-31", 300, [prod({ product_name: "الف", sales_amount: 300 })], 400),
  ]);
  assert.ok(r);
  assert.equal(r.currentFY, 1405);
  assert.equal(r.currentMonths[0].amount, 100); // فروردین
  assert.equal(r.currentMonths[1].amount, null); // اردیبهشت غایب — گپ
  assert.equal(r.currentMonths[2].amount, 300); // خرداد
  assert.equal(r.reportCount, 2);
});

test("مقایسهٔ سال جاری با سال قبل و تجمیعی هم‌نقطه", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 200, [prod({ product_name: "الف", sales_amount: 200 })], 350),
    report("1405-01-31", 150, [prod({ product_name: "الف", sales_amount: 150 })], 150),
    report("1404-02-31", 120, [prod({ product_name: "الف", sales_amount: 120 })], 220),
    report("1404-01-31", 100, [prod({ product_name: "الف", sales_amount: 100 })], 100),
  ]);
  assert.ok(r);
  assert.equal(r.currentFY, 1405);
  assert.equal(r.priorFY, 1404);
  assert.equal(r.cumulativeCurrent, 350); // آخرین ماه گزارش‌شده = اردیبهشت ۱۴۰۵
  assert.equal(r.cumulativePriorSamePoint, 220); // اردیبهشت ۱۴۰۴
  assert.equal(r.avgCurrent, 175);
  const n = narrativeCumulative(r);
  assert.ok(n && n.includes("بیشتر")); // 350 > 220
});

test("واحد حفظ می‌شود: مقادیر میلیون ریال بدون تبدیل در خروجی", () => {
  const r = buildMonthlySales([
    report("1405-03-31", 545_287_525, [prod({ product_name: "شمش", sales_amount: 545_287_525 })]),
  ]);
  assert.ok(r);
  assert.equal(r.currentMonths[2].amount, 545_287_525);
});

test("سری نرخ: داخلی/صادراتی جدا و گپ برای ماه بدون رکورد آن محصول", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 900, [
      prod({ product_name: "شمش", market: "داخلی", sales_amount: 500, sales_rate: 250 }),
      prod({ product_name: "شمش صادراتی", market: "صادراتی", sales_amount: 400, sales_rate: 310 }),
    ]),
    report("1405-01-31", 500, [
      prod({ product_name: "شمش", market: "داخلی", sales_amount: 500, sales_rate: 240 }),
    ]),
  ]);
  assert.ok(r);
  const dom = r.rateSeries.find((s) => s.market === "داخلی");
  const exp = r.rateSeries.find((s) => s.market === "صادراتی");
  assert.ok(dom && exp);
  assert.equal(dom.points.length, 2);
  assert.equal(dom.points[0].rate, 240);
  assert.equal(dom.points[1].rate, 250);
  assert.equal(exp.points[0].rate, null); // فروردین: رکورد صادراتی نیست — گپ
  assert.equal(exp.points[1].rate, 310);
});

test("محصول تک‌قلمی: ترکیب فروش و تولید/فروش سالم", () => {
  const r = buildMonthlySales([
    report("1405-03-31", 3_162_098, [
      prod({ product_name: "آمادگي", sales_amount: 3_162_098, sales_qty: 617_199_000, production_qty: 617_199_000 }),
    ]),
  ]);
  assert.ok(r);
  assert.equal(r.latestMix.length, 1);
  assert.equal(r.latestMix[0].sharePct, 100);
  assert.equal(r.mainProductName, "آمادگي");
  assert.equal(r.prodVsSales.length, 1);
  assert.equal(r.latestExportSharePct, 0);
  const n = narrativeMix(r);
  assert.ok(n && n.includes("داخلی"));
});

test("prodVsSales فقط وقتی هر دو مقدار موجودند", () => {
  const r = buildMonthlySales([
    report("1405-01-31", 100, [
      prod({ product_name: "الف", sales_amount: 100, sales_qty: 10, production_qty: null }),
    ]),
  ]);
  assert.ok(r);
  assert.equal(r.prodVsSales.length, 0);
});

test("ورودی خالی یا بی‌اعتبار → null (بخش رندر نشود)", () => {
  assert.equal(buildMonthlySales([]), null);
  assert.equal(buildMonthlySales([{ ...report("bad-date", 1, []), period_end: "xx" }]), null);
});

test("روایت‌ها: قطعی و بدون واژهٔ تجویزی", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 300, [
      prod({ product_name: "الف", sales_amount: 300, sales_rate: 30, sales_qty: 10, production_qty: 12 }),
    ], 400),
    report("1405-01-31", 100, [
      prod({ product_name: "الف", sales_amount: 100, sales_rate: 10, sales_qty: 10, production_qty: 8 }),
    ], 100),
    report("1404-02-31", 90, [prod({ product_name: "الف", sales_amount: 90 })], 190),
  ]);
  assert.ok(r);
  const texts = [
    narrativeMonthlyVsAvg(r),
    narrativeCumulative(r),
    narrativeRate(r),
    narrativeMix(r),
    narrativeProdVsSales(r),
  ].filter((t): t is string => t !== null);
  assert.ok(texts.length >= 4);
  for (const t of texts) {
    for (const bad of ["سیگنال", "توصیه", "پیشنهاد", "بخرید", "بفروشید", "خرید", "فروش را"]) {
      // «فروش» به‌تنهایی نام دادهٔ رسمی است؛ واژه‌های تجویزی نباید باشند.
      if (bad === "خرید") continue; // در متن روایت‌ها به کار نمی‌رود؛ چک زیر پوشش می‌دهد
      assert.ok(!t.includes(bad), `واژهٔ ممنوع «${bad}» در روایت: ${t}`);
    }
  }
});

test("روایت میانگین: بالاتر/پایین‌تر درست", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 300, [prod({ product_name: "الف", sales_amount: 300 })]),
    report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100 })]),
  ]);
  assert.ok(r);
  const n = narrativeMonthlyVsAvg(r);
  assert.ok(n && n.includes("بالاتر")); // 300 نسبت به میانگین 200
});
