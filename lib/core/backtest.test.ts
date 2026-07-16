// تست‌های موتور بک‌تست — سری‌های مصنوعیِ قطعی برای راستی‌آزمایی ریاضیِ هزینه‌ها.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { HistoryDay } from "./engine";
import {
  runBacktest,
  IRAN_EQUITY_COSTS,
  sma,
  smaCrossSignal,
  dualSmaSignal,
  flowTrendSignal,
  type SignalFn,
} from "./backtest";

function day(date: string, close: number, buyVal?: number, sellVal?: number): HistoryDay {
  return {
    trade_date: date,
    close,
    open: close,
    high: close,
    low: close,
    volume: 1_000_000,
    value_traded: close * 1_000_000,
    individual_buy_value: buyVal ?? null,
    individual_sell_value: sellVal ?? null,
  } as unknown as HistoryDay;
}

function series(closes: number[], startDate = "2024-01-01"): HistoryDay[] {
  const d0 = new Date(startDate).getTime();
  return closes.map((c, i) =>
    day(new Date(d0 + i * 86400000).toISOString().slice(0, 10), c)
  );
}

// ── ۱) سیگنال همیشه-صفر → هیچ معامله‌ای، equity = 1 ──────────────────────────
test("no-signal → no trades, flat equity", () => {
  const days = series(Array.from({ length: 60 }, (_, i) => 1000 + i));
  const res = runBacktest(days, () => 0);
  assert.equal(res.trades.length, 0);
  assert.equal(res.metrics.tradeCount, 0);
  assert.equal(res.equityCurve[res.equityCurve.length - 1].equity, 1);
  assert.equal(res.metrics.exposurePct, 0);
});

// ── ۲) ریاضی دقیق یک معاملهٔ رفت‌وبرگشت با هزینه‌ها ───────────────────────────
test("single round-trip cost math is exact", () => {
  // سیگنال: فقط در روز شاخص 10 تا 19 داخل بازار (اجرا: خرید روز 11، فروش روز 21)
  const closes = Array.from({ length: 40 }, () => 1000); // قیمت ثابت → فقط هزینه‌ها
  const days = series(closes);
  const sig: SignalFn = (_d, i) => (i >= 10 && i < 20 ? 1 : 0);
  const res = runBacktest(days, sig, IRAN_EQUITY_COSTS);

  assert.equal(res.trades.length, 1);
  const t = res.trades[0];
  const entry = 1000 * (1 + 0.005) * (1 + 0.003712);
  const exit = 1000 * (1 - 0.005) * (1 - 0.0088);
  const expectedRet = (exit / entry - 1) * 100;
  assert.equal(t.entryPrice, Math.round(entry * 10000) / 10000);
  assert.equal(t.exitPrice, Math.round(exit * 10000) / 10000);
  assert.ok(Math.abs((t.returnPct ?? 0) - Math.round(expectedRet * 100) / 100) < 0.011);
  // با قیمت ثابت، بازده معامله باید منفی (فقط هزینه) باشد ≈ -2.3٪
  assert.ok((t.returnPct ?? 0) < -2 && (t.returnPct ?? 0) > -3);
});

// ── ۳) بدون look-ahead: سیگنال روز i با قیمت روز i+1 اجرا می‌شود ─────────────
test("execution happens next day (no look-ahead)", () => {
  // جهش قیمت در روز 21؛ سیگنال از روز 20 روشن می‌شود → خرید باید با قیمت روز 21 باشد
  const closes = Array.from({ length: 40 }, (_, i) => (i >= 21 ? 2000 : 1000));
  const days = series(closes);
  const sig: SignalFn = (_d, i) => (i >= 20 ? 1 : 0);
  const res = runBacktest(days, sig);
  assert.equal(res.trades.length, 1);
  // ورود باید بر مبنای 2000 (قیمت روز اجرا) باشد نه 1000
  assert.ok(res.trades[0].entryPrice > 2000);
});

// ── ۴) روند صعودی + SMA cross → بهتر از نقدماندن و معاملهٔ سودده ─────────────
test("sma cross captures uptrend profitably", () => {
  // 60 روز رنج، بعد 120 روز روند صعودی قوی
  const closes = [
    ...Array.from({ length: 60 }, (_, i) => 1000 + (i % 5)),
    ...Array.from({ length: 120 }, (_, i) => 1010 + i * 15),
  ];
  const days = series(closes);
  const res = runBacktest(days, smaCrossSignal(20));
  assert.ok((res.metrics.totalReturnPct ?? 0) > 50, `got ${res.metrics.totalReturnPct}`);
  assert.ok(res.metrics.tradeCount >= 1);
});

// ── ۵) حداکثر افت محاسبه می‌شود ──────────────────────────────────────────────
test("max drawdown measured on equity curve", () => {
  // صعود، سپس سقوط ۴۰٪، درحالی‌که همیشه در بازاریم
  const closes = [
    ...Array.from({ length: 50 }, (_, i) => 1000 + i * 20),
    ...Array.from({ length: 30 }, (_, i) => 2000 - i * 27),
  ];
  const days = series(closes);
  const res = runBacktest(days, () => 1);
  assert.ok((res.metrics.maxDrawdownPct ?? 0) > 30, `got ${res.metrics.maxDrawdownPct}`);
});

// ── ۶) sma helper ────────────────────────────────────────────────────────────
test("sma helper computes correctly and returns null when insufficient", () => {
  const days = series([10, 20, 30, 40, 50]);
  assert.equal(sma(days, 4, 5), 30);
  assert.equal(sma(days, 2, 3), 20);
  assert.equal(sma(days, 1, 3), null);
});

// ── ۷) dualSma: فقط وقتی سریع بالای کند است در بازاریم ───────────────────────
test("dualSmaSignal on/off transitions", () => {
  const closes = [
    ...Array.from({ length: 40 }, () => 1000),
    ...Array.from({ length: 40 }, (_, i) => 1000 + i * 30),
  ];
  const days = series(closes);
  const sig = dualSmaSignal(5, 20);
  assert.equal(sig(days, 30), 0); // رنج: سریع ≈ کند → 0 (شرط اکید >)
  assert.equal(sig(days, 70), 1); // روند: سریع > کند
});

// ── ۸) flowTrendSignal: بدون دادهٔ جریان → 0 (دادهٔ ناموجود = بی‌عمل) ─────────
test("flowTrendSignal honest with missing flow data", () => {
  const days = series(Array.from({ length: 80 }, (_, i) => 1000 + i * 10));
  const sig = flowTrendSignal(10, 20);
  assert.equal(sig(days, 60), 0); // individual_buy/sell_value = null → 0

  // با جریان مثبت → 1
  const days2 = Array.from({ length: 80 }, (_, i) =>
    day(new Date(Date.parse("2024-01-01") + i * 86400000).toISOString().slice(0, 10),
      1000 + i * 10, 5_000_000, 2_000_000)
  );
  assert.equal(sig(days2, 60), 1);
});

// ── ۹) دادهٔ کم → نتیجهٔ تهی و صادقانه ───────────────────────────────────────
test("too little data → empty result with assumptions", () => {
  const res = runBacktest(series([1000, 1010]), () => 1);
  assert.equal(res.trades.length, 0);
  assert.equal(res.metrics.totalReturnPct, null);
  assert.ok(res.assumptions.length >= 4);
});

// ── ۱۰) exposure درست شمرده می‌شود ───────────────────────────────────────────
test("exposure percentage sane", () => {
  const days = series(Array.from({ length: 100 }, (_, i) => 1000 + i));
  const sig: SignalFn = (_d, i) => (i < 49 ? 1 : 0);
  const res = runBacktest(days, sig);
  assert.ok((res.metrics.exposurePct ?? 0) > 30 && (res.metrics.exposurePct ?? 0) < 70);
});
