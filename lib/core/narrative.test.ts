// تست‌های روایت‌ساز «امروز بازار» — T3/T7 ممیزی. بدون شبکه؛ دادهٔ مصنوعی قطعی.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFlowAggregates, buildNarratives, type SnapshotStockLike } from "./narrative";
import type { RegimeResult } from "./regime";

function stock(id: string, buyI: number, sellI: number, price: number, value = 1e9): SnapshotStockLike {
  return { id, buyI, sellI, closingPrice: price, value };
}

function regime(partial: Partial<RegimeResult>): RegimeResult {
  return {
    score: null,
    label: "نامشخص",
    breadthAboveSma50Pct: null,
    positive20dPct: null,
    positiveFlow10dPct: null,
    universeSize: 0,
    coveredCount: 0,
    drivers: [],
    assumptions: [],
    data_ok: false,
    as_of: null,
    ...partial,
  };
}

test("computeFlowAggregates: پوشش < ۵۰ نماد → netFlowRial=null (بدون عدد با دادهٔ ناکافی)", () => {
  const agg = computeFlowAggregates([stock("الف", 100, 50, 1000)]);
  assert.equal(agg.netFlowRial, null);
  assert.equal(agg.totalValueRial, null);
  // ولی شمارش‌ها و قهرمان‌ها همچنان معتبرند
  assert.equal(agg.inflowCount, 1);
  assert.equal(agg.topInflow?.symbol, "الف");
});

test("computeFlowAggregates: با پوشش کافی جمع خالص و قهرمان‌ها درست است", () => {
  const stocks: SnapshotStockLike[] = [];
  // ۶۰ نماد: ۴۰ ورود (+1000×100=1e5 هرکدام)، ۲۰ خروج (−1000×200=−2e5 هرکدام)
  for (let i = 0; i < 40; i++) stocks.push(stock(`in${i}`, 1100, 100, 100));
  for (let i = 0; i < 20; i++) stocks.push(stock(`out${i}`, 100, 1100, 200));
  // قهرمان ورود بزرگ‌تر
  stocks.push(stock("قهرمان", 10000, 0, 1000)); // +1e7
  const agg = computeFlowAggregates(stocks);
  const expected = 40 * (1000 * 100) + 20 * (-1000 * 200) + 10000 * 1000;
  assert.equal(agg.netFlowRial, expected);
  assert.equal(agg.inflowCount, 41);
  assert.equal(agg.outflowCount, 20);
  assert.equal(agg.topInflow?.symbol, "قهرمان");
  assert.equal(agg.topOutflow?.symbol, "out0");
  assert.ok(agg.totalValueRial != null && agg.totalValueRial > 0);
});

test("computeFlowAggregates: فیلدهای null نادیده گرفته می‌شوند (هیچ NaN)", () => {
  const agg = computeFlowAggregates([
    { id: "ناقص", buyI: null, sellI: 5, closingPrice: 100, value: null },
    { id: "بی‌قیمت", buyI: 10, sellI: 5, closingPrice: null, price: null },
  ]);
  assert.equal(agg.inflowCount, 0);
  assert.equal(agg.outflowCount, 0);
  assert.equal(agg.topInflow, null);
});

test("buildNarratives: رژیم بدون data_ok → جملهٔ رژیم ساخته نمی‌شود", () => {
  const sentences = buildNarratives(regime({ data_ok: false, score: null }), {
    netFlowRial: null,
    inflowCount: 0,
    outflowCount: 0,
    totalValueRial: null,
    topInflow: null,
    topOutflow: null,
  });
  assert.equal(sentences.length, 0);
});

test("buildNarratives: دادهٔ کامل → حداکثر ۵ جمله شامل رژیم، پهنا و جریان", () => {
  const r = regime({
    data_ok: true,
    score: 72,
    label: "سازنده",
    breadthAboveSma50Pct: 68.5,
  });
  const sentences = buildNarratives(r, {
    netFlowRial: 250e9,
    inflowCount: 120,
    outflowCount: 80,
    totalValueRial: 5e12,
    topInflow: { symbol: "فولاد", flowRial: 40e9 },
    topOutflow: { symbol: "خودرو", flowRial: -35e9 },
  });
  assert.equal(sentences.length, 5);
  assert.ok(sentences[0].includes("سازنده"));
  assert.ok(sentences.some((s) => s.includes("فولاد")));
  assert.ok(sentences.some((s) => s.includes("خودرو")));
  // قانون سخت: هیچ واژهٔ سیگنالی
  for (const s of sentences) {
    assert.ok(!s.includes("بخر") && !s.includes("بفروش") && !s.includes("توصیه می"));
  }
});

test("buildNarratives: خروج خالص منفی → واژهٔ «خروج» در جملهٔ جریان", () => {
  const r = regime({ data_ok: true, score: 35, label: "فرسایشی" });
  const sentences = buildNarratives(r, {
    netFlowRial: -120e9,
    inflowCount: 40,
    outflowCount: 160,
    totalValueRial: 3e12,
    topInflow: null,
    topOutflow: null,
  });
  assert.ok(sentences.some((s) => s.includes("خروج خالص")));
});
