// تست‌های رژیم بازار — T7 ممیزی (پیش‌نیاز عمومی‌سازی در T3).
// سری‌های مصنوعی با نتیجهٔ قطعی؛ هیچ وابستگی شبکه/دیتابیس.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRegime, type RegimeInput } from "./regime";
import type { HistoryDay } from "./engine";

/** سری n روزه با قیمت تابع‌داده و جریان حقیقی ثابت */
function series(
  n: number,
  price: (i: number) => number,
  flowPerDay: number,
  startDate = "2025-01-01"
): HistoryDay[] {
  const t0 = new Date(`${startDate}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => ({
    trade_date: new Date(t0 + i * 86400000).toISOString().slice(0, 10),
    close: price(i),
    last_price: price(i),
    volume: 1000,
    value_traded: 1000 * price(i),
    individual_buy_value: flowPerDay > 0 ? Math.abs(flowPerDay) : 0,
    individual_sell_value: flowPerDay > 0 ? 0 : Math.abs(flowPerDay),
    individual_buy_count: 10,
    individual_sell_count: 10,
    legal_buy_value: 0,
    legal_sell_value: 0,
    buyer_power: 1,
  }));
}

const up = (i: number) => 1000 + i * 10; // صعودی یکنواخت → بالای SMA50، بازده ۲۰روزه مثبت
const down = (i: number) => 3000 - i * 10; // نزولی یکنواخت → زیر SMA50، بازده ۲۰روزه منفی

test("رژیم سازنده: همهٔ نمادها صعودی با ورود پول → score بالا و برچسب سازنده", () => {
  const inputs: RegimeInput[] = Array.from({ length: 10 }, (_, k) => ({
    symbol: `s${k}`,
    days: series(120, up, +1e9),
  }));
  const r = computeRegime(inputs);
  assert.equal(r.data_ok, true);
  assert.equal(r.breadthAboveSma50Pct, 100);
  assert.equal(r.positive20dPct, 100);
  assert.equal(r.positiveFlow10dPct, 100);
  assert.equal(r.score, 100);
  assert.equal(r.label, "سازنده");
  assert.equal(r.universeSize, 10);
  assert.equal(r.coveredCount, 10);
  assert.equal(r.drivers.length, 3);
  assert.ok(r.drivers.every((d) => d.effect === "positive"));
});

test("رژیم فرسایشی: همهٔ نمادها نزولی با خروج پول → score صفر و برچسب فرسایشی", () => {
  const inputs: RegimeInput[] = Array.from({ length: 10 }, (_, k) => ({
    symbol: `s${k}`,
    days: series(120, down, -1e9),
  }));
  const r = computeRegime(inputs);
  assert.equal(r.data_ok, true);
  assert.equal(r.score, 0);
  assert.equal(r.label, "فرسایشی");
  assert.ok(r.drivers.every((d) => d.effect === "negative"));
});

test("رژیم خنثی: نیمی صعودی نیمی نزولی → score حدود ۵۰ و برچسب خنثی", () => {
  const inputs: RegimeInput[] = [
    ...Array.from({ length: 5 }, (_, k) => ({ symbol: `u${k}`, days: series(120, up, +1e9) })),
    ...Array.from({ length: 5 }, (_, k) => ({ symbol: `d${k}`, days: series(120, down, -1e9) })),
  ];
  const r = computeRegime(inputs);
  assert.equal(r.data_ok, true);
  assert.equal(r.score, 50);
  assert.equal(r.label, "خنثی");
});

test("گیت پوشش ۶۰٪: اکثر نمادها دادهٔ ناکافی → data_ok=false و score=null و برچسب نامشخص", () => {
  const inputs: RegimeInput[] = [
    { symbol: "ok1", days: series(120, up, 1e9) },
    { symbol: "short1", days: series(30, up, 1e9) }, // < 60 روز → حذف
    { symbol: "short2", days: series(10, up, 1e9) },
    { symbol: "short3", days: series(5, up, 1e9) },
  ];
  const r = computeRegime(inputs);
  assert.equal(r.data_ok, false);
  assert.equal(r.score, null);
  assert.equal(r.label, "نامشخص");
});

test("ورودی خالی: data_ok=false و بدون درایور", () => {
  const r = computeRegime([]);
  assert.equal(r.data_ok, false);
  assert.equal(r.score, null);
  assert.equal(r.label, "نامشخص");
  assert.equal(r.drivers.length, 0);
  assert.equal(r.as_of, null);
});

test("مرزهای برچسب: 60→سازنده، 40..59→خنثی، <40→فرسایشی (بر اساس نسبت نمادهای مثبت)", () => {
  // 6 از 10 مثبت در هر سه سنجه → score=60 → سازنده
  const mk = (nUp: number, nDown: number): RegimeInput[] => [
    ...Array.from({ length: nUp }, (_, k) => ({ symbol: `u${k}`, days: series(120, up, 1e9) })),
    ...Array.from({ length: nDown }, (_, k) => ({ symbol: `d${k}`, days: series(120, down, -1e9) })),
  ];
  const r60 = computeRegime(mk(6, 4));
  assert.equal(r60.score, 60);
  assert.equal(r60.label, "سازنده");
  const r40 = computeRegime(mk(4, 6));
  assert.equal(r40.score, 40);
  assert.equal(r40.label, "خنثی");
  const r30 = computeRegime(mk(3, 7));
  assert.equal(r30.score, 30);
  assert.equal(r30.label, "فرسایشی");
});

test("as_of = جدیدترین تاریخ در جهان بررسی", () => {
  const a = series(120, up, 1e9, "2025-01-01"); // آخر: 2025-04-30
  const b = series(120, up, 1e9, "2025-02-01"); // آخر: 2025-05-31 (جدیدتر)
  const r = computeRegime([
    { symbol: "a", days: a },
    { symbol: "b", days: b },
  ]);
  assert.equal(r.as_of, b[b.length - 1].trade_date);
});

test("فروض همیشه همراه خروجی است (قانون driver/فروض)", () => {
  const r = computeRegime([{ symbol: "x", days: series(120, up, 1e9) }]);
  assert.ok(r.assumptions.length >= 4);
  assert.ok(r.assumptions.some((s) => s.includes("توصیه")));
});
