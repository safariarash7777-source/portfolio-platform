// تست‌های تخصیص دارایی — دادهٔ مصنوعی قطعی، انتظارات دستی.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAllocation, type AssetSeries } from "./allocation";
import type { HistoryDay } from "./engine";

function mkDays(prices: number[], startDate = "2024-01-01"): HistoryDay[] {
  const d0 = new Date(startDate + "T00:00:00Z").getTime();
  return prices.map((p, i) => ({
    trade_date: new Date(d0 + i * 86400000).toISOString().slice(0, 10),
    close: p,
    last_price: p,
    volume: 1000,
    value_traded: p * 1000,
    individual_buy_value: null,
    individual_sell_value: null,
    individual_buy_count: null,
    individual_sell_count: null,
    legal_buy_value: null,
    legal_sell_value: null,
    buyer_power: null,
  })) as HistoryDay[];
}

const zeroCost = { buyFee: 0, sellFee: 0, slippage: 0 };

test("allocation: دو دارایی ثابت — ارزش سبد ثابت می‌ماند", () => {
  const flat = Array.from({ length: 100 }, () => 1000);
  const assets: AssetSeries[] = [
    { name: "الف", weight: 0.5, days: mkDays(flat), costs: zeroCost },
    { name: "ب", weight: 0.5, days: mkDays(flat), costs: zeroCost },
  ];
  const r = runAllocation(assets, 20);
  assert.ok(r.metrics);
  assert.equal(r.metrics!.totalReturnPct, 0);
  assert.equal(r.metrics!.maxDrawdownPct, 0);
});

test("allocation: وزن ۱۰۰/۰ روی دارایی صعودی = بازده همان دارایی", () => {
  const up = Array.from({ length: 100 }, (_, i) => 1000 + i * 10); // +99%
  const flat = Array.from({ length: 100 }, () => 500);
  const assets: AssetSeries[] = [
    { name: "صعودی", weight: 1, days: mkDays(up), costs: zeroCost },
    { name: "ثابت", weight: 0, days: mkDays(flat), costs: zeroCost },
  ];
  const r = runAllocation(assets, 0); // بدون ریبالانس
  assert.ok(r.metrics);
  assert.ok(Math.abs(r.metrics!.totalReturnPct - 99) < 0.01);
});

test("allocation: سبد ۵۰/۵۰ بین صعودی و ثابت بدون ریبالانس ≈ نصف بازده", () => {
  const up = Array.from({ length: 100 }, (_, i) => 1000 * (1 + i * 0.01)); // +99%
  const flat = Array.from({ length: 100 }, () => 800);
  const assets: AssetSeries[] = [
    { name: "صعودی", weight: 0.5, days: mkDays(up), costs: zeroCost },
    { name: "ثابت", weight: 0.5, days: mkDays(flat), costs: zeroCost },
  ];
  const r = runAllocation(assets, 0);
  assert.ok(r.metrics);
  assert.ok(Math.abs(r.metrics!.totalReturnPct - 49.5) < 0.01);
  // hold = همان مسیر (بدون ریبالانس یکسان‌اند)
  assert.equal(r.metrics!.totalReturnPct, r.metrics!.holdReturnPct);
});

test("allocation: ریبالانس شمارش می‌شود و هزینه ثبت می‌شود", () => {
  // دو دارایی واگرا تا ریبالانس واقعاً جابه‌جایی داشته باشد
  const up = Array.from({ length: 130 }, (_, i) => 1000 * (1 + i * 0.02));
  const down = Array.from({ length: 130 }, (_, i) => 1000 * (1 - i * 0.002));
  const assets: AssetSeries[] = [
    { name: "الف", weight: 0.5, days: mkDays(up) }, // با هزینهٔ واقعی
    { name: "ب", weight: 0.5, days: mkDays(down) },
  ];
  const r = runAllocation(assets, 25);
  assert.ok(r.metrics);
  assert.equal(r.metrics!.rebalanceCount, 5); // i=25,50,75,100,125
  assert.ok(r.metrics!.totalCostPct > 0);
});

test("allocation: ریبالانس در بازار میان‌بازگشتی بهتر از نگه‌داری است (بازگشت به میانگین)", () => {
  // دارایی نوسانی: بالا-پایین متناوب؛ ریبالانس سود «فروش در سقف» را قفل می‌کند
  const osc = Array.from({ length: 200 }, (_, i) => 1000 + (i % 2 === 0 ? 0 : 300));
  const flat = Array.from({ length: 200 }, () => 1000);
  const assets: AssetSeries[] = [
    { name: "نوسانی", weight: 0.5, days: mkDays(osc), costs: zeroCost },
    { name: "ثابت", weight: 0.5, days: mkDays(flat), costs: zeroCost },
  ];
  const r = runAllocation(assets, 1); // ریبالانس روزانه، بدون هزینه
  assert.ok(r.metrics);
  assert.ok(r.metrics!.totalReturnPct > r.metrics!.holdReturnPct);
});

test("allocation: دارایی با دادهٔ ناکافی حذف و گزارش می‌شود", () => {
  const ok = Array.from({ length: 100 }, () => 1000);
  const short = Array.from({ length: 10 }, () => 500);
  const assets: AssetSeries[] = [
    { name: "کامل۱", weight: 0.4, days: mkDays(ok), costs: zeroCost },
    { name: "کامل۲", weight: 0.4, days: mkDays(ok), costs: zeroCost },
    { name: "ناقص", weight: 0.2, days: mkDays(short), costs: zeroCost },
  ];
  const r = runAllocation(assets, 20);
  assert.deepEqual(r.dropped, ["ناقص"]);
  assert.ok(r.metrics); // با دو داراییِ سالم ادامه می‌دهد
});

test("allocation: کمتر از دو دارایی سالم = بدون نتیجه (صادقانه)", () => {
  const short = Array.from({ length: 10 }, () => 500);
  const ok = Array.from({ length: 100 }, () => 1000);
  const r = runAllocation([
    { name: "الف", weight: 0.5, days: mkDays(ok), costs: zeroCost },
    { name: "ب", weight: 0.5, days: mkDays(short), costs: zeroCost },
  ]);
  assert.equal(r.metrics, null);
  assert.equal(r.points.length, 0);
});

test("allocation: تقاطع تاریخ‌ها — روزهای غیرمشترک حذف می‌شوند", () => {
  const a = mkDays(Array.from({ length: 100 }, () => 1000), "2024-01-01");
  const b = mkDays(Array.from({ length: 100 }, () => 2000), "2024-01-11"); // ۱۰ روز دیرتر
  const r = runAllocation(
    [
      { name: "الف", weight: 0.5, days: a, costs: zeroCost },
      { name: "ب", weight: 0.5, days: b, costs: zeroCost },
    ],
    0
  );
  assert.ok(r.metrics);
  assert.equal(r.metrics!.tradingDays, 90); // فقط بازهٔ مشترک
});
