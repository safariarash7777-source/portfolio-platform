// تست‌های موتور پنل رصد ادمین — SPEC-admin-market-radar §4 (node:test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSubTicker,
  isRightsIssue,
  perCapitaBuy,
  perCapitaSell,
  buyerPower,
  realMoneyFlow,
  legalSellShare,
  closeLastDivergence,
  volumeRatio,
  computeRadarRow,
  matchesPreset,
  multiSort,
  type RadarRow,
} from "./marketRadar";
import { buildAvgMap } from "./avgVolume";
import { deriveN30Extras } from "./radarData";
import type { HistoryDay } from "./engine";

function mkDay(over: Partial<HistoryDay> = {}): HistoryDay {
  return {
    trade_date: "2026-07-19",
    close: 1000,
    last_price: 1020,
    volume: 5_000_000,
    value_traded: 5_000_000_000,
    individual_buy_value: 3_000_000_000,
    individual_sell_value: 2_000_000_000,
    individual_buy_count: 100,
    individual_sell_count: 200,
    legal_buy_value: 1_000_000_000,
    legal_sell_value: 2_000_000_000,
    buyer_power: null,
    ...over,
  };
}

/* ── فیلتر Z ── */
test("فیلتر Z: زیرنماد رقم‌دار (لاتین/فارسی/عربی) شناسایی می‌شود", () => {
  assert.equal(isSubTicker("فملی2"), true);
  assert.equal(isSubTicker("آوند4"), true);
  assert.equal(isSubTicker("کگل۳"), true); // رقم فارسی
  assert.equal(isSubTicker("فملی"), false);
  assert.equal(isSubTicker("آ س پ"), false);
});

test("حق‌تقدم: ختم به «ح»", () => {
  assert.equal(isRightsIssue("فملیح"), true);
  assert.equal(isRightsIssue("فملی"), false);
});

/* ── ستون‌ها ── */
test("سرانهٔ خرید حقیقی: ریال ÷ تعداد ÷ 1e7 = میلیون تومان", () => {
  // ۳ میلیارد ریال ÷ ۱۰۰ نفر = ۳۰ میلیون ریال/نفر = ۳ میلیون تومان
  assert.equal(perCapitaBuy(mkDay()), 3);
});

test("سرانه: تعداد صفر یا دادهٔ غایب → null (نه صفر)", () => {
  assert.equal(perCapitaBuy(mkDay({ individual_buy_count: 0 })), null);
  assert.equal(perCapitaBuy(mkDay({ individual_buy_value: null })), null);
  assert.equal(perCapitaSell(mkDay({ individual_sell_count: null })), null);
});

test("قدرت خریدار: ستون buyer_power مقدم است؛ وگرنه نسبت سرانه‌ها", () => {
  assert.equal(buyerPower(mkDay({ buyer_power: 1.4 })), 1.4);
  // fallback: سرانهٔ خرید ۳؛ سرانهٔ فروش = 2e9/200/1e7 = 1 → نسبت ۳
  assert.equal(buyerPower(mkDay()), 3);
  assert.equal(buyerPower(mkDay({ individual_sell_value: null })), null);
});

test("ورود پول حقیقی: تفاضل خرید−فروش به میلیون تومان؛ غایب → null", () => {
  assert.equal(realMoneyFlow(mkDay()), 100); // 1e9 ریال = ۱۰۰ میلیون تومان
  assert.equal(realMoneyFlow(mkDay({ individual_buy_value: null })), null);
});

test("سهم حقوقی از فروش: legal_sell/value_traded؛ مخرج صفر → null", () => {
  assert.equal(legalSellShare(mkDay()), 0.4);
  assert.equal(legalSellShare(mkDay({ value_traded: 0 })), null);
});

test("واگرایی پایانی/آخرین: (last−close)/close", () => {
  assert.equal(closeLastDivergence(mkDay()), 0.02);
  assert.equal(closeLastDivergence(mkDay({ close: null })), null);
});

test("نسبت حجم: حجم ÷ میانگین ۱۰روزه؛ میانگین غایب → null", () => {
  assert.equal(volumeRatio(10_000_000, 5_000_000), 2);
  assert.equal(volumeRatio(10_000_000, null), null);
  assert.equal(volumeRatio(null, 5_000_000), null);
});

/* ── میانگین حجم ۱۰ روزه (excludeLatest) ── */
test("buildAvgMap: آخرین روز از میانگین ۱۰روزه خارج می‌شود", () => {
  const rows = [];
  // ۱۱ روز: امروز حجم ۱۰۰؛ ۱۰ روز قبل هر کدام ۱۰
  for (let i = 0; i <= 10; i++) {
    const d = new Date(Date.UTC(2026, 6, 19 - i)).toISOString().slice(0, 10);
    rows.push({ id: 100 - i, symbol: "فملی", trade_date: d, volume: i === 0 ? 100 : 10 });
  }
  const m = buildAvgMap(rows, 10, 7, true);
  assert.equal(m.get("فملی"), 10); // امروزِ ۱۰۰ در میانگین نیست
});

test("buildAvgMap: پوشش ناکافی → نماد در Map نیست (null صادق)", () => {
  const rows = [
    { id: 1, symbol: "کم‌داده", trade_date: "2026-07-19", volume: 10 },
    { id: 2, symbol: "کم‌داده", trade_date: "2026-07-18", volume: 10 },
  ];
  const m = buildAvgMap(rows, 10, 7, true);
  assert.equal(m.has("کم‌داده"), false);
});

test("buildAvgMap: dedupe نماد+تاریخ — id بزرگ‌تر برنده", () => {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2026, 6, 19 - i)).toISOString().slice(0, 10);
    rows.push({ id: 10 + i, symbol: "س", trade_date: d, volume: 10 });
  }
  // نسخهٔ قدیمی‌تر (id کوچک‌تر) یک روز با حجم متفاوت — نباید اثر کند
  rows.push({ id: 1, symbol: "س", trade_date: "2026-07-15", volume: 999_999 });
  const m = buildAvgMap(rows, 10, 7, true);
  assert.equal(m.get("س"), 10);
});

/* ── مشتق‌های ن-۳۰ ── */
test("deriveN30Extras: شکاف تولید−فروش و سهم صادرات از آخرین ماه", () => {
  const rows = [
    {
      symbol: "فولاد",
      data: {
        period_end: "1405-03-31",
        products: [
          { product_name: "شمش", production_qty: 100, sales_qty: 120, sales_amount: 800, market: "داخلی" },
          { product_name: "ورق", production_qty: 50, sales_qty: 40, sales_amount: 200, market: "صادراتی" },
        ],
      },
    },
    // گزارش ماه قدیمی‌تر همان نماد — نباید انتخاب شود
    {
      symbol: "فولاد",
      data: {
        period_end: "1405-02-31",
        products: [{ product_name: "شمش", production_qty: 1, sales_qty: 1, sales_amount: 1, market: "داخلی" }],
      },
    },
  ];
  const m = deriveN30Extras(rows);
  const f = m.get("فولاد")!;
  assert.equal(f.prodSalesGap, -10); // (100+50)−(120+40) = −10 → تخلیهٔ انبار
  assert.equal(f.exportSharePct, 20); // 200/1000
});

test("deriveN30Extras: بدون مقادیر کمی → شکاف null (نه صفر)", () => {
  const rows = [
    {
      symbol: "بانک",
      data: { period_end: "1405-03-31", products: [{ product_name: "خدمات", sales_amount: 100, market: "داخلی" }] },
    },
  ];
  const f = deriveN30Extras(rows).get("بانک")!;
  assert.equal(f.prodSalesGap, null);
  assert.equal(f.exportSharePct, 0);
});

/* ── ردیف و پریست‌ها ── */
function mkRow(over: Partial<RadarRow> = {}): RadarRow {
  return {
    symbol: "فملی",
    tradeDate: "2026-07-19",
    perCapitaBuy: 3,
    buyerPower: 2,
    realMoneyFlow: 100,
    legalSellShare: 0.4,
    divergence: 0.01,
    volumeRatio: 2.5,
    yoyMonthly: 80,
    prodSalesGap: -5,
    exportSharePct: 20,
    ...over,
  };
}

test("computeRadarRow: ستون‌ها از یک روز کامل ساخته می‌شوند", () => {
  const row = computeRadarRow("فملی", mkDay(), 2_500_000, { yoyMonthly: 60 });
  assert.equal(row.perCapitaBuy, 3);
  assert.equal(row.volumeRatio, 2);
  assert.equal(row.yoyMonthly, 60);
  assert.equal(row.prodSalesGap, null); // extras داده نشده → null صادق
});

test("پریست ورود پول هوشمند: هر سه شرط لازم؛ null رد می‌شود", () => {
  assert.equal(matchesPreset(mkRow(), "smart_money"), true);
  assert.equal(matchesPreset(mkRow({ buyerPower: null }), "smart_money"), false);
  assert.equal(matchesPreset(mkRow({ realMoneyFlow: -1 }), "smart_money"), false);
  assert.equal(matchesPreset(mkRow({ volumeRatio: 1.5 }), "smart_money"), false);
});

test("پریست بیدارباش بنیادی: YoY > ۵۰ و شکاف منفی", () => {
  assert.equal(matchesPreset(mkRow(), "fundamental_alarm"), true);
  assert.equal(matchesPreset(mkRow({ prodSalesGap: 5 }), "fundamental_alarm"), false);
  assert.equal(matchesPreset(mkRow({ yoyMonthly: null }), "fundamental_alarm"), false);
});

test("پریست واگرایی تابلو: |واگرایی| > ۲٪ + حجم مشکوک", () => {
  assert.equal(matchesPreset(mkRow({ divergence: 0.03 }), "board_divergence"), true);
  assert.equal(matchesPreset(mkRow({ divergence: -0.03 }), "board_divergence"), true);
  assert.equal(matchesPreset(mkRow({ divergence: 0.01 }), "board_divergence"), false);
});

/* ── سورت چندبعدی ── */
test("multiSort: چندستونه + null همیشه انتها", () => {
  const rows = [
    mkRow({ symbol: "الف", volumeRatio: 1, buyerPower: 5 }),
    mkRow({ symbol: "ب", volumeRatio: 3, buyerPower: 1 }),
    mkRow({ symbol: "ج", volumeRatio: 3, buyerPower: 4 }),
    mkRow({ symbol: "د", volumeRatio: null, buyerPower: 9 }),
  ];
  const sorted = multiSort(rows, [
    { key: "volumeRatio", dir: "desc" },
    { key: "buyerPower", dir: "desc" },
  ]);
  assert.deepEqual(sorted.map((r) => r.symbol), ["ج", "ب", "الف", "د"]);
});
