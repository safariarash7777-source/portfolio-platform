// تست بازدهٔ دوره‌ای (M6) — دادهٔ مصنوعی قطعی؛ بدون شبکه.
import { test } from "node:test";
import assert from "node:assert/strict";
import { periodReturn, periodicReturns, compareNullsLast, TOLERANCE_DAYS } from "./fundReturns";
import type { HistoryDay } from "./engine";

function day(trade_date: string, close: number | null, last_price: number | null = null): HistoryDay {
  return {
    trade_date, close, last_price,
    volume: null, value_traded: null,
    individual_buy_value: null, individual_sell_value: null,
    individual_buy_count: null, individual_sell_count: null,
    legal_buy_value: null, legal_sell_value: null, buyer_power: null,
  };
}

/** تاریخچهٔ روزانهٔ پیوسته: قیمت از start روزی step واحد بالا می‌رود. */
function series(days: number, start: number, step: number, endDate = "2026-07-18"): HistoryDay[] {
  const out: HistoryDay[] = [];
  const end = Date.parse(endDate);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push(day(d, start + (days - 1 - i) * step));
  }
  return out;
}

const close = (x: number | null, y: number, eps = 1e-6) => {
  assert.ok(x != null && Math.abs(x - y) < eps, `expected ≈${y}, got ${x}`);
};

test("periodReturn: بازدهٔ ۷روزه از تاریخچهٔ کامل درست است", () => {
  // ۳۰ روز، قیمت از ۱۰۰ روزی ۱ واحد بالا — روز آخر ۱۲۹، ۷ روز قبل ۱۲۲
  const h = series(30, 100, 1);
  close(periodReturn(h, 7), ((129 - 122) / 122) * 100);
});

test("periodReturn: دادهٔ ناکافی → null (هیچ بازدهٔ ساختگی)", () => {
  const h = series(5, 100, 1);
  assert.equal(periodReturn(h, 30), null);
  assert.equal(periodReturn(h, 90), null);
});

test("periodReturn: گپ بزرگ‌تر از تلورانس → null؛ پنجرهٔ منطبق → معتبر", () => {
  const h = [day("2026-05-19", 100), day("2026-07-18", 150)]; // گپ ۶۰ روز
  assert.equal(periodReturn(h, 7), null);
  close(periodReturn(h, 60), 50);
});

test("periodReturn: تلورانس تعطیلات — مبنای ۹ روز قبل برای پنجرهٔ ۷روزه قبول است", () => {
  const h = [day("2026-07-09", 200), day("2026-07-18", 210)];
  close(periodReturn(h, 7), 5);
  assert.ok(9 <= 7 + TOLERANCE_DAYS);
});

test("periodReturn: close null → last_price مبنا؛ هر دو null → null", () => {
  close(periodReturn([day("2026-07-10", null, 100), day("2026-07-18", 110)], 7), 10);
  assert.equal(periodReturn([day("2026-07-10", null, null), day("2026-07-18", 110)], 7), null);
});

test("periodReturn: آرایهٔ خالی یا تک‌عضوی → null", () => {
  assert.equal(periodReturn([], 7), null);
  assert.equal(periodReturn([day("2026-07-18", 100)], 7), null);
});

test("periodicReturns: سه پنجره + شمار روز", () => {
  const r = periodicReturns(series(120, 1000, 2));
  assert.equal(r.daysAvailable, 120);
  assert.ok(r.w1 != null && r.m1 != null && r.m3 != null);
  assert.ok(r.w1! > 0);
  assert.ok(r.m3! > r.w1!);
});

test("periodicReturns: تاریخچهٔ ۲۰روزه — w1 دارد، m1/m3 ندارد", () => {
  const r = periodicReturns(series(20, 500, 1));
  assert.ok(r.w1 != null);
  assert.equal(r.m1, null);
  assert.equal(r.m3, null);
});

test("compareNullsLast: null همیشه آخر — در هر دو جهت", () => {
  const vals: Array<number | null> = [3, null, 1, 2];
  assert.deepEqual([...vals].sort((a, b) => compareNullsLast(a, b, 1)), [1, 2, 3, null]);
  assert.deepEqual([...vals].sort((a, b) => compareNullsLast(a, b, -1)), [3, 2, 1, null]);
});
