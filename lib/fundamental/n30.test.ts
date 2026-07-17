// تست مشتق‌های ن-۳۰ (چارت‌های ۴–۶ / T5) — دادهٔ نمونه بازتولید ساختار واقعی
// فولاد (کدال) است: دو ماه + یک تکرار (باید یکتاسازی شود) + بازار داخلی/صادراتی.
import test from "node:test";
import assert from "node:assert/strict";
import { deriveN30 } from "./calc";
import type { CodalN30Data } from "./types";

const mk = (
  period_end: string,
  products: CodalN30Data["products"],
  total: number,
): CodalN30Data => ({
  symbol: "فولاد",
  report_kind: "ن-۳۰",
  period_end,
  fiscal_year: Number(period_end.slice(0, 4)),
  products,
  period_total_amount: total,
  fy_cumulative_amount: 0,
});

const m1 = mk("1404-09-30", [
  { product_name: "محصولات گرم", market: "داخلی", production_qty: 250, sales_qty: 200, sales_rate: 500_000_000, sales_amount: 100_000 },
  { product_name: "محصولات سرد", market: "داخلی", production_qty: 120, sales_qty: 100, sales_rate: 550_000_000, sales_amount: 55_000 },
  { product_name: "اسلب صادراتی", market: "صادراتی", production_qty: 80, sales_qty: 60, sales_rate: 450_000_000, sales_amount: 27_000 },
], 182_000);

const m2 = mk("1404-10-30", [
  { product_name: "محصولات گرم", market: "داخلی", production_qty: 260, sales_qty: 220, sales_rate: 520_000_000, sales_amount: 114_400 },
  { product_name: "محصولات سرد", market: "داخلی", production_qty: 110, sales_qty: 90, sales_rate: 560_000_000, sales_amount: 50_400 },
  { product_name: "اسلب صادراتی", market: "صادراتی", production_qty: 70, sales_qty: 80, sales_rate: 460_000_000, sales_amount: 36_800 },
], 201_600);

// تکرار همان ماه (ردیف duplicate واقعی در codal_reports) — باید حذف شود.
const dup = mk("1404-10-30", m2.products, 201_600);

test("deriveN30: dedups months and sorts ascending", () => {
  const d = deriveN30([m2, dup, m1]);
  assert.equal(d.months.length, 2);
  assert.equal(d.months[0].month, "1404-09");
  assert.equal(d.months[1].month, "1404-10");
});

test("deriveN30: domestic/export split per month", () => {
  const d = deriveN30([m1, m2]);
  assert.equal(d.months[0].domesticAmount, 155_000);
  assert.equal(d.months[0].exportAmount, 27_000);
  assert.equal(d.months[0].totalAmount, 182_000);
  assert.equal(d.months[1].exportAmount, 36_800);
});

test("deriveN30: product mix ranked with shares summing to ~100", () => {
  const d = deriveN30([m1, m2]);
  assert.equal(d.productMix[0].name, "محصولات گرم");
  assert.equal(d.productMix[0].amount, 214_400);
  const total = d.productMix.reduce((a, p) => a + (p.sharePct ?? 0), 0);
  assert.ok(Math.abs(total - 100) < 0.5, String(total));
});

test("deriveN30: export share of total", () => {
  const d = deriveN30([m1, m2]);
  // (27000+36800) / 383600 = 16.6%
  assert.equal(d.exportSharePct, 16.6);
});

test("deriveN30: top product monthly rate series", () => {
  const d = deriveN30([m1, m2]);
  assert.equal(d.topProductName, "محصولات گرم");
  assert.equal(d.topProductMonths.length, 2);
  assert.equal(d.topProductMonths[0].rate, 500_000_000);
  assert.equal(d.topProductMonths[1].rate, 520_000_000);
});

test("deriveN30: production vs sales totals per month", () => {
  const d = deriveN30([m1, m2]);
  assert.deepEqual(d.prodVsSales[0], { month: "1404-09", production: 450, sales: 360 });
  assert.deepEqual(d.prodVsSales[1], { month: "1404-10", production: 440, sales: 390 });
});

test("deriveN30: empty input → empty derived, no fabricated numbers", () => {
  const d = deriveN30([]);
  assert.equal(d.months.length, 0);
  assert.equal(d.productMix.length, 0);
  assert.equal(d.exportSharePct, null);
  assert.equal(d.topProductName, null);
  assert.equal(d.prodVsSales.length, 0);
});
