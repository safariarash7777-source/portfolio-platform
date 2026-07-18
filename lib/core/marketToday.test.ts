// تست واحد محاسبات داشبورد «امروز بازار» — pure، بدون شبکه.
// اجرا:  npx tsx --test lib/core/marketToday.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMarketPulse,
  computeQueues,
  computeMoneyFlow,
  computeTopLists,
  buildFlowTrend,
  toSparkPoints,
  isBuyQueueRow,
  isSellQueueRow,
  rowChangePercent,
} from "./marketToday";
import type { IrStockRow } from "@/lib/market-ir";

function row(p: Partial<IrStockRow>): IrStockRow {
  return { id: p.id ?? "x", faName: p.faName ?? "x", price: 100, unit: "toman", ...p } as IrStockRow;
}

/* ── نبض بازار ── */
test("نبض: سطل‌بندی درست و هر نماد دقیقاً در یک سطل", () => {
  const stocks = [
    row({ id: "a", value: 1, closingChangePercent: 5 }),    // >4
    row({ id: "b", value: 1, closingChangePercent: 4 }),    // >=4 → سطل اول
    row({ id: "c", value: 1, closingChangePercent: 2.5 }),  // 2..4
    row({ id: "d", value: 1, closingChangePercent: 1 }),    // 0.5..2
    row({ id: "e", value: 1, closingChangePercent: 0 }),    // ±0.5
    row({ id: "f", value: 1, closingChangePercent: -1 }),   // −0.5..−2
    row({ id: "g", value: 1, closingChangePercent: -3 }),   // −2..−4
    row({ id: "h", value: 1, closingChangePercent: -6 }),   // <−4
    row({ id: "i", value: 0, closingChangePercent: 9 }),    // معامله‌نشده — شمرده نمی‌شود
  ];
  const p = computeMarketPulse(stocks);
  assert.equal(p.totalTraded, 8);
  assert.deepEqual(p.buckets.map((b) => b.count), [2, 1, 1, 1, 1, 1, 1]);
  assert.equal(p.buckets.reduce((s, b) => s + b.count, 0), 8);
  assert.equal(p.posCount, 4);
  assert.equal(p.negCount, 3);
  assert.equal(p.flatCount, 1);
  assert.ok(Math.abs((p.posShare ?? 0) - 50) < 1e-9);
});

test("نبض: بازار خالی → posShare صادقانه null", () => {
  const p = computeMarketPulse([]);
  assert.equal(p.totalTraded, 0);
  assert.equal(p.posShare, null);
});

test("مبنای درصد تغییر: پایانی؛ نبودش → آخرین؛ هیچ‌کدام → null", () => {
  assert.equal(rowChangePercent(row({ closingChangePercent: 2, changePercent: 5 })), 2);
  assert.equal(rowChangePercent(row({ changePercent: 5 })), 5);
  assert.equal(rowChangePercent(row({})), null);
});

/* ── صف‌ها ── */
test("صف خرید: تقاضای سطر اول روی سقف و عرضهٔ صفر", () => {
  assert.equal(isBuyQueueRow(row({ bandHigh: 1000, bestBidPrice: 1000, bestAskVolume: 0 })), true);
  assert.equal(isBuyQueueRow(row({ bandHigh: 1000, bestBidPrice: 1000, bestAskVolume: 10 })), false);
  assert.equal(isBuyQueueRow(row({ bandHigh: 1000, bestBidPrice: 999, bestAskVolume: 0 })), false);
  assert.equal(isBuyQueueRow(row({ bestBidPrice: 1000, bestAskVolume: 0 })), false); // فیلد غایب → false
});

test("صف فروش: عرضهٔ سطر اول روی کف و تقاضای صفر", () => {
  assert.equal(isSellQueueRow(row({ bandLow: 900, bestAskPrice: 900, bestBidVolume: 0 })), true);
  assert.equal(isSellQueueRow(row({ bandLow: 900, bestAskPrice: 900, bestBidVolume: 5 })), false);
  assert.equal(isSellQueueRow(row({ bandLow: 900, bestAskPrice: 901, bestBidVolume: 0 })), false);
});

test("computeQueues: شمارش، ارزش تومانی و مرتب‌سازی نزولی", () => {
  const stocks = [
    row({ id: "q1", value: 1, bandHigh: 100, bestBidPrice: 100, bestBidVolume: 1000, bestAskVolume: 0 }),
    row({ id: "q2", value: 1, bandHigh: 200, bestBidPrice: 200, bestBidVolume: 5000, bestAskVolume: 0 }),
    row({ id: "s1", value: 1, bandLow: 50, bestAskPrice: 50, bestAskVolume: 300, bestBidVolume: 0 }),
    row({ id: "n1", value: 1, bandHigh: 100, bestBidPrice: 90, bestAskVolume: 10, bestBidVolume: 5 }),
  ];
  const q = computeQueues(stocks, 8);
  assert.equal(q.buyCount, 2);
  assert.equal(q.sellCount, 1);
  assert.equal(q.buy[0].id, "q2"); // 5000×200=1,000,000 بزرگ‌تر
  assert.equal(q.buy[0].queueValueToman, 1_000_000);
  assert.equal(q.buyValueToman, 1_000_000 + 100_000);
  assert.equal(q.sellValueToman, 15_000);
  assert.equal(q.fieldsAvailable, true);
});

test("computeQueues: بدون فیلد دفتر سفارش → fieldsAvailable=false و صف‌ها خالی", () => {
  const q = computeQueues([row({ id: "a", value: 1 })]);
  assert.equal(q.fieldsAvailable, false);
  assert.equal(q.buyCount + q.sellCount, 0);
});

/* ── جریان پول حقیقی ── */
test("computeMoneyFlow: خالص، سرانه‌ها و نسبت قدرت", () => {
  const stocks = [
    row({ id: "a", value: 1, closingPrice: 100, buyI: 1000, sellI: 400, buyCountI: 10, sellCountI: 20 }),
    row({ id: "b", value: 1, closingPrice: 50, buyI: 200, sellI: 600, buyCountI: 5, sellCountI: 5 }),
  ];
  const f = computeMoneyFlow(stocks);
  // خرید: 1000×100 + 200×50 = 110,000 — فروش: 400×100 + 600×50 = 70,000
  assert.equal(f.netRealFlowToman, 40_000);
  assert.equal(f.perCapitaBuyToman, 110_000 / 15);
  assert.equal(f.perCapitaSellToman, 70_000 / 25);
  assert.ok(Math.abs((f.powerRatio ?? 0) - (110_000 / 15) / (70_000 / 25)) < 1e-9);
});

test("computeMoneyFlow: بدون دادهٔ حقیقی/حقوقی → همه null (هیچ صفر گمراه‌کننده)", () => {
  const f = computeMoneyFlow([row({ id: "a", value: 1, closingPrice: 100 })]);
  assert.equal(f.netRealFlowToman, null);
  assert.equal(f.powerRatio, null);
});

/* ── روند تاریخی ── */
test("buildFlowTrend: مرتب صعودی، ریال→میلیارد تومان، تکراری حذف", () => {
  const pts = buildFlowTrend([
    { jdate: "1405-04-27", net_real_flow: 20_000_000_000_000, per_capita_buy: null, per_capita_sell: null, trade_value: null, pos_count: null, neg_count: null, total_traded: null },
    { jdate: "1405-04-24", net_real_flow: -10_000_000_000_000, per_capita_buy: null, per_capita_sell: null, trade_value: null, pos_count: null, neg_count: null, total_traded: null },
    { jdate: "1405-04-24", net_real_flow: 999, per_capita_buy: null, per_capita_sell: null, trade_value: null, pos_count: null, neg_count: null, total_traded: null },
    { jdate: "1405-04-25", net_real_flow: null, per_capita_buy: null, per_capita_sell: null, trade_value: null, pos_count: null, neg_count: null, total_traded: null },
  ]);
  assert.equal(pts.length, 2);
  assert.equal(pts[0].jdate, "1405-04-24");
  assert.equal(pts[0].netFlowBToman, -1000); // −۱۰همت = −۱۰۰۰ میلیارد تومان
  assert.equal(pts[1].netFlowBToman, 2000);
});

/* ── برترین‌ها ── */
test("computeTopLists: چهار فهرست درست مرتب می‌شوند", () => {
  const stocks = [
    row({ id: "a", value: 500, closingChangePercent: 3, closingPrice: 10, buyI: 100, sellI: 10 }),
    row({ id: "b", value: 900, closingChangePercent: -4, closingPrice: 20, buyI: 5, sellI: 500 }),
    row({ id: "c", value: 100, closingChangePercent: 1, closingPrice: 30, buyI: 50, sellI: 50 }),
    row({ id: "d", value: 0, closingChangePercent: 9 }), // معامله‌نشده — حذف
  ];
  const t = computeTopLists(stocks, 2);
  assert.equal(t.gainers[0].id, "a");
  assert.equal(t.losers[0].id, "b");
  assert.equal(t.byValue[0].id, "b");
  assert.equal(t.byNetReal[0].id, "a"); // (100−10)×10=900 بیشترین خالص خرید
  assert.equal(t.gainers.length, 2);
});

/* ── اسپارک‌لاین ── */
test("toSparkPoints: فقط عددهای مثبت متناهی", () => {
  const pts = toSparkPoints([
    { label: "1", value: 10 },
    { label: "2", value: 0 },
    { label: "3", value: NaN },
    { label: "4", value: "25" },
  ]);
  assert.deepEqual(pts, [{ label: "1", value: 10 }, { label: "4", value: 25 }]);
});
