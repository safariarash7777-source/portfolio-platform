// تست واحد ماژول محاسبات بنیادی (الزام پذیرش WP4).
// اجرا: npm run test:calc  (node:test از طریق tsx — بدون وابستگی جدید)
// اعداد مرجع از docs/archive/i1-fameli-1404.md — گزارش رسمی حسابرسی‌شدهٔ فملی ۱۴۰۴.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pct,
  growthPct,
  margins,
  salesTrend,
  consecutiveGrowthYears,
  deriveN10,
  narrativeRevenueGrowth,
  narrativeGrossMargin,
  narrativeConsecutiveGrowth,
  narrativeFxShare,
} from "./calc";
import { FAMELI_N10_1404 } from "./fixtures/fameli-1404.fixture";

test("pct: حالت عادی و تقسیم بر صفر", () => {
  assert.equal(pct(50, 200), 25);
  assert.equal(pct(1, 0), null);
  assert.equal(pct(NaN, 10), null);
});

test("growthPct: رشد، افت و پایهٔ صفر", () => {
  assert.equal(growthPct(120, 100), 20);
  assert.equal(growthPct(80, 100), -20);
  assert.equal(growthPct(100, 0), null);
});

test("حاشیه‌های فملی ۱۴۰۴ با سند i1 یکی است (۵۷٫۹ / ۵۶٫۱ / ۴۶٫۸)", () => {
  const m = margins(FAMELI_N10_1404.standalone);
  assert.equal(m.gross, 57.9);
  assert.equal(m.operating, 56.1);
  assert.equal(m.net, 46.8);
});

test("حاشیه‌های ۱۴۰۳ (تجدید ارائه) با سند i1 یکی است (۵۴٫۹ / ۵۲٫۱ / ۴۳٫۹)", () => {
  const prior = FAMELI_N10_1404.standalone.prior!;
  const m = margins(prior);
  assert.equal(m.gross, 54.9);
  assert.equal(m.operating, 52.1);
  assert.equal(m.net, 43.9);
});

test("رشدهای ۱۴۰۴: فروش ۷۹٫۸٪ و سود خالص ۹۱٫۶٪ و EPS ۹۱٫۷٪", () => {
  const d = deriveN10(FAMELI_N10_1404);
  assert.equal(d.revenueGrowthPct, 79.8);
  // 1,506,011,965 / 785,868,563 − 1 = 91.63٪ → با یک رقم اعشار 91.6
  assert.equal(d.netProfitGrowthPct, 91.6);
  // 1434 / 748 − 1 = 91.71٪ → 91.7 (سند به‌صورت گرد «+۹۲٪» چاپ کرده)
  assert.equal(d.epsGrowthPct, 91.7);
});

test("نرخ مؤثر مالیات ۱۶٫۵٪ مطابق سند i1", () => {
  const d = deriveN10(FAMELI_N10_1404);
  assert.equal(d.effectiveTaxRatePct, 16.5);
});

test("روند ۵ساله: حاشیهٔ ناخالص هر سال با جدول رسمی گزارش یکی است", () => {
  const t = salesTrend(FAMELI_N10_1404.sales_trend_5y!);
  const byFy = Object.fromEntries(t.map((r) => [r.fy, r.grossMarginPct]));
  assert.equal(byFy[1399], 67.9);
  assert.equal(byFy[1400], 69.9);
  assert.equal(byFy[1401], 58.9);
  assert.equal(byFy[1402], 59.2);
  assert.equal(byFy[1403], 54.9);
  assert.equal(byFy[1404], 57.9);
});

test("روند ۵ساله: رشد فروش ۱۴۰۴ برابر ۷۹٫۸٪ و ۱۴۰۱ منفی است", () => {
  const t = salesTrend(FAMELI_N10_1404.sales_trend_5y!);
  const byFy = Object.fromEntries(t.map((r) => [r.fy, r.revenueGrowthPct]));
  assert.equal(byFy[1404], 79.8);
  assert.equal(byFy[1401], -2.8);
  assert.equal(byFy[1399], null); // سال اول سری، پایه ندارد
});

test("سال‌های متوالی رشد: ۱۴۰۲→۱۴۰۳→۱۴۰۴ یعنی ۳ سال پیاپی", () => {
  const t = salesTrend(FAMELI_N10_1404.sales_trend_5y!);
  assert.equal(consecutiveGrowthYears(t), 3);
});

test("روایت‌ها: قالب ثابت با عدد واقعی؛ بدون داده → null", () => {
  const d = deriveN10(FAMELI_N10_1404);
  assert.equal(
    narrativeRevenueGrowth(d, "۱۴۰۴"),
    "فروش سال ۱۴۰۴ نسبت به سال قبل 79.8 درصد رشد کرده است."
  );
  assert.equal(
    narrativeGrossMargin(d),
    "حاشیهٔ سود ناخالص از 54.9 درصد به 57.9 درصد بهبود یافته است."
  );
  assert.equal(narrativeConsecutiveGrowth(d), "فروش شرکت 3 سال پیاپی رشد کرده است.");
  // سهم تسعیر ارز: 289,398,665 / 1,806,426,640 = 16.0٪ → روایت تولید می‌شود
  assert.ok(narrativeFxShare(d)?.includes("16 درصد"));

  // بدون دادهٔ سال قبل، روایت‌ها null هستند — نه جملهٔ جایگزین
  const noPrior = deriveN10({
    ...FAMELI_N10_1404,
    standalone: { ...FAMELI_N10_1404.standalone, prior: undefined },
    sales_trend_5y: undefined,
  });
  assert.equal(narrativeRevenueGrowth(noPrior, "۱۴۰۴"), null);
  assert.equal(narrativeGrossMargin(noPrior), null);
  assert.equal(narrativeConsecutiveGrowth(noPrior), null);
});
