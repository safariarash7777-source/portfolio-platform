// تست‌های کارت بنیادی نمادمحور (WP-F) — SPEC-symbol-fundamental-card.md
// پوشش: واحدها، ماه جلالی، YoY (حلقهٔ غایب = null)، سهم صادرات، شکاف تولید−فروش،
// روایت template لایهٔ ۱ (بند غایب حذف — نه عدد ساختگی) و تضمین واژگان ممنوع.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mrialToBToman,
  jalaliMonthLabel,
  priorYearMonth,
  buildNarrative,
  buildFundamentalCard,
} from "./fundamentalCard";
import type { CodalN30Data, N30ProductRow } from "@/lib/fundamental/types";

function prod(over: Partial<N30ProductRow> = {}): N30ProductRow {
  return {
    product_name: "کاتد",
    market: "داخلی",
    production_qty: 100,
    sales_qty: 90,
    sales_rate: 5_000_000,
    sales_amount: 450_000, // میلیون ریال
    ...over,
  };
}

function report(month: string, total: number, products: N30ProductRow[]): CodalN30Data {
  return {
    symbol: "فملی",
    report_kind: "ن-۳۰",
    period_end: `${month}-30`,
    fiscal_year: parseInt(month.slice(0, 4), 10),
    products,
    period_total_amount: total,
    fy_cumulative_amount: total,
  };
}

test("mrialToBToman: میلیون ریال → میلیارد تومان (÷۱۰هزار)؛ نامعتبر → null", () => {
  assert.equal(mrialToBToman(450_000), 45);
  assert.equal(mrialToBToman(0), 0);
  assert.equal(mrialToBToman(null), null);
  assert.equal(mrialToBToman(NaN), null);
});

test("jalaliMonthLabel: 1404-04 → تیر 1404؛ نامعتبر → null", () => {
  assert.equal(jalaliMonthLabel("1404-04"), "تیر 1404");
  assert.equal(jalaliMonthLabel("1404-12"), "اسفند 1404");
  assert.equal(jalaliMonthLabel("1404-13"), null);
  assert.equal(jalaliMonthLabel(null), null);
});

test("priorYearMonth: 1404-04 → 1403-04", () => {
  assert.equal(priorYearMonth("1404-04"), "1403-04");
  assert.equal(priorYearMonth("bad"), null);
});

test("YoY: حلقهٔ سال قبل موجود → درصد؛ غایب → null صادق", () => {
  const card = buildFundamentalCard("فملی", [
    report("1403-04", 300_000, [prod()]),
    report("1404-04", 450_000, [prod()]),
  ]);
  assert.equal(card.latestMonth, "1404-04");
  assert.equal(card.yoyPct, 50);

  const noLoop = buildFundamentalCard("فملی", [report("1404-04", 450_000, [prod()])]);
  assert.equal(noLoop.yoyPct, null);
});

test("سهم صادرات و محصول اصلی از آخرین ماه", () => {
  const card = buildFundamentalCard("فملی", [
    report("1404-04", 1_000_000, [
      prod({ product_name: "کاتد", market: "داخلی", sales_amount: 600_000 }),
      prod({ product_name: "مفتول", market: "صادراتی", sales_amount: 400_000 }),
    ]),
  ]);
  assert.equal(card.topProductName, "کاتد");
  assert.equal(card.exportSharePct, 40);
});

test("شکاف تولید−فروش: جمع production−sales؛ بدون مقدار → null", () => {
  const card = buildFundamentalCard("فملی", [
    report("1404-04", 500_000, [
      prod({ production_qty: 120, sales_qty: 90 }),
      prod({ product_name: "مفتول", production_qty: 50, sales_qty: 60 }),
    ]),
  ]);
  assert.equal(card.prodSalesGap, 20); // (120-90)+(50-60)

  const noQty = buildFundamentalCard("فملی", [
    report("1404-04", 500_000, [prod({ production_qty: null, sales_qty: null })]),
  ]);
  assert.equal(noQty.prodSalesGap, null);
});

test("روایت لایهٔ ۱: کامل با YoY/محصول/صادرات؛ بدون فروش → null (بند حذف نه عدد ساختگی)", () => {
  const full = buildNarrative({
    monthLabel: "تیر 1404",
    salesBToman: 45.27,
    yoyPct: 12.5,
    topProductName: "کاتد",
    exportSharePct: 40,
  });
  assert.equal(
    full,
    "فروش تیر 1404: 45.3 میلیارد تومان — 12.5 درصد بیشتر از همین ماه پارسال. عمدتاً از کاتد و 40 درصد صادراتی."
  );
  const negative = buildNarrative({
    monthLabel: "تیر 1404",
    salesBToman: 45,
    yoyPct: -8,
    topProductName: null,
    exportSharePct: null,
  });
  assert.equal(negative, "فروش تیر 1404: 45 میلیارد تومان — 8 درصد کمتر از همین ماه پارسال.");
  assert.equal(buildNarrative({ monthLabel: "تیر 1404", salesBToman: null, yoyPct: null, topProductName: null, exportSharePct: null }), null);
});

test("سری ۱۲ ماه: یکتاسازی ماه، مرتب قدیم←جدید، حداکثر ۱۲", () => {
  const reports: CodalN30Data[] = [];
  for (let i = 1; i <= 14; i++) {
    const y = i <= 12 ? 1403 : 1404;
    const m = ((i - 1) % 12) + 1;
    reports.push(report(`${y}-${String(m).padStart(2, "0")}`, 100_000 * i, [prod()]));
  }
  const card = buildFundamentalCard("فملی", reports);
  assert.equal(card.months12.length, 12);
  assert.equal(card.months12[11].month, "1404-02");
  // monthlyYoY: ماه‌های 1404 حلقه دارند
  const y1404 = card.monthlyYoY.find((x) => x.month === "1404-01");
  assert.ok(y1404 && y1404.yoyPct !== null);
});

test("ورودی خالی → کارت null-safe (بدون throw، بدون عدد ساختگی)", () => {
  const card = buildFundamentalCard("فملی", []);
  assert.equal(card.latestMonth, null);
  assert.equal(card.narrative, null);
  assert.equal(card.months12.length, 0);
});

test("واژگان ممنوع در خروجی روایت نیست (قانون Blueprint)", () => {
  const card = buildFundamentalCard("فملی", [
    report("1403-04", 300_000, [prod()]),
    report("1404-04", 450_000, [prod({ market: "صادراتی" })]),
  ]);
  const text = JSON.stringify(card);
  for (const banned of ["سیگنال", "توصیه", "بخرید", "بفروشید", "حد ضرر", "تارگت"]) {
    assert.ok(!text.includes(banned), `واژهٔ ممنوع در خروجی: ${banned}`);
  }
});
