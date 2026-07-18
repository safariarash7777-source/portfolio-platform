// تست‌های پهنای بازار روز (M1) و میز صنایع (M3) — ابرتسک «رصد بازار».
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDailyBreadth, computeIndustryDesk, type BreadthStockLike } from "./breadth";

function stock(over: Partial<BreadthStockLike> = {}): BreadthStockLike {
  return {
    id: "نماد",
    changePercent: 1,
    closingChangePercent: 1,
    buyI: 100,
    sellI: 50,
    closingPrice: 1000,
    price: 1000,
    value: 5_000_000,
    marketValue: 100_000_000,
    industry: "فلزات اساسی",
    ...over,
  };
}

// ---------------------------------------------------------------- M1: breadth

test("computeDailyBreadth: شمارش مثبت/منفی/خنثی درست است", () => {
  const b = computeDailyBreadth([
    stock({ closingChangePercent: 2 }),
    stock({ closingChangePercent: -1.5 }),
    stock({ closingChangePercent: 0 }),
    stock({ closingChangePercent: null, changePercent: null }),
  ]);
  assert.equal(b.universe, 4);
  assert.equal(b.upCount, 1);
  assert.equal(b.downCount, 1);
  assert.equal(b.flatCount, 2);
  assert.equal(b.upPct, 25);
  assert.equal(b.downPct, 25);
});

test("computeDailyBreadth: جهان خالی → درصدها null (حالت خالی صادقانه)", () => {
  const b = computeDailyBreadth([]);
  assert.equal(b.universe, 0);
  assert.equal(b.upPct, null);
  assert.equal(b.downPct, null);
  assert.equal(b.netFlowToman, null);
  assert.deepEqual(b.topInflowIndustries, []);
});

test("computeDailyBreadth: پوشش جریان < ۵۰ نماد → netFlowToman null", () => {
  const b = computeDailyBreadth(Array.from({ length: 49 }, () => stock()));
  assert.equal(b.flowCovered, 49);
  assert.equal(b.netFlowToman, null);
});

test("computeDailyBreadth: پوشش ≥ ۵۰ → خالص جریان جمع دقیق است", () => {
  // هر نماد: (100-50) × 1000 = 50,000 تومان ورود
  const b = computeDailyBreadth(Array.from({ length: 50 }, () => stock()));
  assert.equal(b.netFlowToman, 50 * 50_000);
  // value در اسنپ‌شات ریال است → تومان = ÷۱۰ (اصلاح باگ واحد)
  assert.equal(b.totalValueToman, (50 * 5_000_000) / 10);
});

test("computeDailyBreadth: صنایع با بیشترین ورود پول — فقط مثبت‌ها و حداکثر ۳", () => {
  const rows: BreadthStockLike[] = [
    ...Array.from({ length: 50 }, () => stock({ industry: "الف", buyI: 200, sellI: 0 })), // +200k هرکدام
    stock({ industry: "ب", buyI: 300, sellI: 0 }),
    stock({ industry: "ج", buyI: 150, sellI: 0 }),
    stock({ industry: "د", buyI: 10, sellI: 0 }),
    stock({ industry: "خروجی", buyI: 0, sellI: 500 }), // خروج → نباید بیاید
  ];
  const b = computeDailyBreadth(rows);
  assert.equal(b.topInflowIndustries.length, 3);
  assert.equal(b.topInflowIndustries[0].industry, "الف");
  assert.ok(b.topInflowIndustries.every((x) => x.flowToman > 0));
  assert.ok(!b.topInflowIndustries.some((x) => x.industry === "خروجی"));
});

test("computeDailyBreadth: نماد بدون داده جریان در پوشش شمرده نمی‌شود", () => {
  const b = computeDailyBreadth([stock({ buyI: null }), stock()]);
  assert.equal(b.flowCovered, 1);
});

// ------------------------------------------------------------ M3: industry desk

test("computeIndustryDesk: جمع ارزش صنایع = جمع کل بازار (پذیرش ممیزی)", () => {
  const rows: BreadthStockLike[] = [
    stock({ industry: "الف", value: 100 }),
    stock({ industry: "الف", value: 200 }),
    stock({ industry: "ب", value: 300 }),
  ];
  const d = computeIndustryDesk(rows);
  const sumRows = d.rows.reduce((s, r) => s + r.valueToman, 0);
  assert.equal(sumRows, d.totalValueToman);
  assert.equal(d.totalValueToman, d.marketTotalValueToman); // بدون نماد بی‌صنعت
  assert.equal(sumRows, 60); // ۶۰۰ ریال → ۶۰ تومان
});

test("computeIndustryDesk: نماد بی‌صنعت حذف صادقانه ولی در کل بازار حساب می‌شود", () => {
  const rows: BreadthStockLike[] = [
    stock({ industry: "الف", value: 100 }),
    stock({ industry: null, value: 900 }),
    stock({ industry: "  ", value: 50 }),
  ];
  const d = computeIndustryDesk(rows);
  assert.equal(d.excludedNoIndustry, 2);
  assert.equal(d.totalValueToman, 10); // ۱۰۰ ریال → ۱۰ تومان
  assert.equal(d.marketTotalValueToman, 105); // ۱۰۵۰ ریال → ۱۰۵ تومان
  // سهم از کل باید نسبت به کل بازار (شامل بی‌صنعت‌ها) باشد
  assert.equal(d.rows[0].valueSharePct, Math.round((100 / 1050) * 1000) / 10);
});

test("computeIndustryDesk: جریان و پهنای هر صنعت درست جمع می‌شود", () => {
  const rows: BreadthStockLike[] = [
    stock({ industry: "الف", buyI: 100, sellI: 0, closingPrice: 10, closingChangePercent: 2 }), // +1000
    stock({ industry: "الف", buyI: 0, sellI: 30, closingPrice: 10, closingChangePercent: -1 }), // -300
    stock({ industry: "الف", buyI: null, closingChangePercent: 0 }), // بدون پوشش جریان
  ];
  const d = computeIndustryDesk(rows);
  const a = d.rows.find((r) => r.industry === "الف")!;
  assert.equal(a.symbolCount, 3);
  assert.equal(a.netFlowToman, 700);
  assert.equal(a.flowCovered, 2);
  assert.equal(a.upCount, 1);
  assert.equal(a.downCount, 1);
});

test("computeIndustryDesk: میانگین وزنی تغییر با وزن ارزش بازار", () => {
  const rows: BreadthStockLike[] = [
    stock({ industry: "الف", marketValue: 300, closingChangePercent: 2 }),
    stock({ industry: "الف", marketValue: 100, closingChangePercent: -2 }),
  ];
  const d = computeIndustryDesk(rows);
  // (2×300 + (−2)×100) / 400 = 400/400 = 1
  assert.equal(d.rows[0].weightedChangePct, 1);
});

test("computeIndustryDesk: صنعت بدون هیچ پوشش جریان → netFlowToman null", () => {
  const d = computeIndustryDesk([stock({ industry: "الف", buyI: null })]);
  assert.equal(d.rows[0].netFlowToman, null);
  assert.equal(d.rows[0].flowCovered, 0);
});

test("computeIndustryDesk: مرتب‌سازی پیش‌فرض بر اساس خالص ورود پول نزولی", () => {
  const d = computeIndustryDesk([
    stock({ industry: "کم", buyI: 10, sellI: 0 }),
    stock({ industry: "زیاد", buyI: 500, sellI: 0 }),
    stock({ industry: "بی‌داده", buyI: null }),
  ]);
  assert.equal(d.rows[0].industry, "زیاد");
  assert.equal(d.rows[d.rows.length - 1].industry, "بی‌داده"); // null آخر
});
