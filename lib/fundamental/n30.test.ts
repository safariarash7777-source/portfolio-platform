// تست مشتق‌های ن-۳۰ (چارت‌های ۴–۶ / T5) — دادهٔ نمونه بازتولید ساختار واقعی
// فولاد (کدال) است: دو ماه + یک تکرار (باید یکتاسازی شود) + بازار داخلی/صادراتی.
import test from "node:test";
import assert from "node:assert/strict";
import { deriveN30 } from "./calc";
import type { CodalN30Data } from "./types";
import { withKnownMonthlyQuantities } from "../core/monthly-quantity";

const mk = (
  period_end: string,
  products: CodalN30Data["products"],
  total: number,
): CodalN30Data => ({
  symbol: "فولاد",
  report_kind: "ن-۳۰",
  period_end,
  fiscal_year: Number(period_end.slice(0, 4)),
  // These synthetic fixtures explicitly represent known, header-verified splits.
  products: products.map(p => ({ ...p, market_basis: "section_header" })),
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

test("market basis: old labels do not manufacture zero exports in the aggregate", () => {
  const legacy = { ...m1, products: m1.products.map(p => ({ ...p, market_basis: undefined })) };
  const before = JSON.stringify(legacy), d = deriveN30([legacy]);
  assert.equal(d.exportSharePct, null);
  assert.equal(d.months[0].domesticAmount, null); assert.equal(d.months[0].exportAmount, null);
  assert.equal(d.months[0].totalAmount, 182_000);
  assert.equal(d.productMix[0].amount, 100_000); assert.equal(d.topProductMonths[0].rate, 500_000_000);
  assert.equal(JSON.stringify(legacy), before);
});

test("market basis: a mixed interval is unknown while verified monthly amounts and product mix survive", () => {
  const old = { ...m1, products: m1.products.map(p => ({ ...p, market_basis: "unknown" as const })) };
  const d = deriveN30([old, m2]);
  assert.equal(d.marketUnavailableReason, "unverified-market"); assert.equal(d.exportSharePct, null);
  assert.equal(d.months[0].exportAmount, null); assert.equal(d.months[1].exportAmount, 36_800);
  assert.equal(d.productMix[0].amount, 214_400); assert.equal(d.productMix[0].sharePct, deriveN30([m1, m2]).productMix[0].sharePct);
  const rows = [{ ...m1.products[0], market: "داخلی" as const, sales_amount: 60 },
    { ...m1.products[1], market: "خدمات" as const, sales_amount: 40 }];
  const service = deriveN30([mk("1405-01-31", rows, 100)]);
  assert.equal(service.months[0].domesticAmount, 60); assert.equal(service.months[0].totalAmount, 100);
  assert.equal(service.exportSharePct, 0); assert.equal(service.marketUnavailableReason, null);
  const incomplete = deriveN30([mk("1405-01-31", rows, 101)]);
  assert.equal(incomplete.exportSharePct, null); assert.equal(incomplete.marketUnavailableReason, "incomplete-market-coverage");
  const signed = deriveN30([mk("1405-01-31", [rows[0], { ...rows[1], market: "صادراتی", sales_amount: -10 }], 50)]);
  assert.equal(signed.exportSharePct, null); assert.equal(signed.months[0].totalAmount, 50);
  assert.equal(signed.marketUnavailableReason, "signed-market-adjustment"); assert.equal(signed.months[0].exportAmount, -10);
  assert.equal(signed.productMix.find(p => p.name === rows[1].product_name)!.amount, -10);
  const oldLater = { ...old, period_end: "1405-02-31", fiscal_year: 1405 };
  assert.equal(deriveN30([mk("1405-01-31", [rows[0], { ...rows[1], sales_amount: -10 }], 50), oldLater]).marketUnavailableReason, "unverified-market");
});

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

test("deriveN30: absent month is a null axis slot, not another report or zero", () => {
  const later = { ...m2, period_end: "1404-11-30" };
  const input = [later, m1]; const before = JSON.stringify(input);
  const d = deriveN30(input);
  assert.equal(d.months.length, 2);
  assert.deepEqual(d.topProductMonths.map(p=>p.month), ["1404-09", "1404-10", "1404-11"]);
  assert.deepEqual(d.topProductMonths[1], {month:"1404-10",rate:null,salesQty:null,productionQty:null});
  assert.deepEqual(d.prodVsSales[1], {month:"1404-10",production:null,sales:null});
  assert.deepEqual(d.prodVsSales[0], {month:"1404-09",production:450,sales:360});
  assert.deepEqual(d.prodVsSales[2], {month:"1404-11",production:440,sales:390});
  assert.equal(d.productMix[0].amount, 214400);
  assert.equal(d.exportSharePct, 16.6);
  assert.equal(JSON.stringify(input), before);
});

test("deriveN30: calendar crosses year without padding before/after observed months", () => {
  const d = deriveN30([{...m1,period_end:"1404-11-30"},{...m2,period_end:"1405-02-31",fiscal_year:1405}]);
  assert.deepEqual(d.prodVsSales.map(p=>p.month), ["1404-11","1404-12","1405-01","1405-02"]);
  assert.deepEqual(d.prodVsSales.map(p=>p.sales), [360,null,null,390]);
  assert.equal(d.months.length, 2);
});

test("deriveN30: missing selected product keeps null rate, and a real zero stays zero", () => {
  const zero = {...m2, products:m2.products.map(p=>({...p,production_qty:0,sales_qty:0,sales_rate:0}))};
  const d = deriveN30([m1,zero,{...m2,period_end:"1404-11-30",products:[]}]);
  assert.equal(d.prodVsSales[1].sales, 0);
  assert.equal(d.prodVsSales[1].production, 0);
  assert.equal(d.topProductMonths[1].rate, 0);
  assert.equal(d.topProductMonths[2].rate, null);
  assert.equal(d.prodVsSales[2].sales, null);
});

test("deriveN30: incomplete product quantities never become a partial total", () => {
  const incomplete = {...m2, products:m2.products.map((p,i)=>i===1?{...p,production_qty:null}:p)};
  const d = deriveN30([m1,incomplete]);
  assert.equal(d.prodVsSales[1].production, null);
  assert.equal(d.prodVsSales[1].sales, null);
  assert.equal(d.months[1].totalAmount, 201600);
  assert.equal(d.topProductMonths[1].rate, 520000000);
});

test("deriveN30: existing unit sanitizer stays authoritative and source remains unchanged", () => {
  const input = {...m1, unit:"میلیون ریال",qty_unit:null};
  const sanitized = withKnownMonthlyQuantities(input);
  const d = deriveN30([sanitized]);
  assert.equal(d.topProductMonths[0].rate, null);
  assert.equal(d.topProductMonths[0].salesQty, null);
  assert.equal(d.prodVsSales[0].production, null);
  assert.equal(d.prodVsSales[0].sales, null);
  assert.equal(d.productMix[0].amount,100000);
  assert.equal(input.products[0].sales_qty,200);
});

test("deriveN30: duplicate precedence and incomplete end-month remain explicit", () => {
  const broken = {...m2,products:m2.products.map(p=>({...p,production_qty:null,sales_qty:null,sales_rate:null}))};
  const d = deriveN30([broken,m2,m1]);
  assert.equal(d.months.length,2);
  assert.equal(d.topProductMonths[1].rate,null);
  assert.equal(d.prodVsSales[1].sales,null);
  assert.equal(d.prodVsSales[0].sales,360);
});

test("deriveN30: nonfinite quantities are null and invalid month cannot create a calendar", () => {
  const d = deriveN30([{...m1,products:m1.products.map((p,i)=>i===0?{...p,sales_qty:Infinity}:p)}]);
  assert.equal(d.prodVsSales[0].sales,null);
  assert.deepEqual(deriveN30([{...m1,period_end:"1404-13-30"}]).prodVsSales,[]);
});
