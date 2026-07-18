// تست‌های T3 — فصل‌سازی ن-۱۰ با تفاضل زنجیره‌ای و P/E TTM.
// همهٔ حالت‌های سخت مشخص‌شده در تسک: حلقهٔ غایب، تقدم حسابرسی‌شده، اصلاحیهٔ متأخر،
// تفاضل منفی (تعدیل)، EPS TTM فقط با ۴ فصل کامل و متوالی.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveQuarters,
  dedupePeriods,
  fyOf,
  ttmSeries,
  peOf,
  rolling4,
  type QuarterInput,
} from "./quarterly";

let idc = 1;
function rep(over: Partial<QuarterInput>): QuarterInput {
  return {
    id: idc++,
    period_end: "1403-03-31",
    period_months: 3,
    audited: false,
    capital: 1_000_000,
    revenue: 100,
    gross_profit: 40,
    operating_profit: 30,
    net_profit: 20,
    ...over,
  };
}

// زنجیرهٔ کامل یک سال مالی تقویمی (پایان اسفند)
function fullYear(fy: number, base: number): QuarterInput[] {
  return [
    rep({ period_end: `${fy}-03-31`, period_months: 3, revenue: base, gross_profit: base * 0.4, operating_profit: base * 0.3, net_profit: base * 0.2 }),
    rep({ period_end: `${fy}-06-31`, period_months: 6, revenue: base * 2.2, gross_profit: base * 0.9, operating_profit: base * 0.7, net_profit: base * 0.5 }),
    rep({ period_end: `${fy}-09-30`, period_months: 9, revenue: base * 3.5, gross_profit: base * 1.5, operating_profit: base * 1.1, net_profit: base * 0.8 }),
    rep({ period_end: `${fy}-12-29`, period_months: 12, revenue: base * 5, gross_profit: base * 2.1, operating_profit: base * 1.6, net_profit: base * 1.2 }),
  ];
}

test("fyOf: سال مالی تقویمی از پایان دوره‌های میانی و سالانه یکی است", () => {
  assert.equal(fyOf(rep({ period_end: "1403-03-31", period_months: 3 })), 1403);
  assert.equal(fyOf(rep({ period_end: "1403-12-29", period_months: 12 })), 1403);
  assert.equal(fyOf(rep({ period_end: "1403-09-30", period_months: 9 })), 1403);
});

test("fyOf: سال مالی غیرتقویمی (پایان شهریور) — هر دو دوره به یک FY می‌روند", () => {
  // سال مالی منتهی به شهریور ۱۴۰۴: Q1 = پایان آذر ۱۴۰۳ (۳ماهه)
  const q1 = rep({ period_end: "1403-09-30", period_months: 3 });
  const y = rep({ period_end: "1404-06-31", period_months: 12 });
  assert.equal(fyOf(q1), fyOf(y));
});

test("زنجیرهٔ کامل: چهار فصل با تفاضل درست", () => {
  const qs = deriveQuarters(fullYear(1403, 1000));
  assert.equal(qs.length, 4);
  assert.equal(qs[0].revenue, 1000); // Q1 = ۳ماهه
  assert.equal(qs[1].revenue, 1200); // Q2 = 2200-1000
  assert.equal(qs[2].revenue, 1300); // Q3 = 3500-2200
  assert.equal(qs[3].revenue, 1500); // Q4 = 5000-3500
  assert.ok(Math.abs((qs[1].netProfit as number) - 300) < 1e-9);
});

test("حلقهٔ غایب: بدون ۶ماهه، Q2 و Q3 هر دو null — هرگز تقسیم نمی‌شود", () => {
  const reports = fullYear(1403, 1000).filter((r) => r.period_months !== 6);
  const qs = deriveQuarters(reports);
  const q2 = qs.find((q) => q.q === 2)!;
  const q3 = qs.find((q) => q.q === 3)!;
  const q4 = qs.find((q) => q.q === 4)!;
  assert.equal(q2.revenue, null);
  assert.equal(q3.revenue, null); // ۹م−۶م ممکن نیست
  assert.equal(q4.revenue, 1500); // ۱۲م−۹م مستقل از گپ قبلی
});

test("دو نسخه از یک دوره: حسابرسی‌شده مقدم است", () => {
  const a = rep({ period_end: "1403-03-31", period_months: 3, revenue: 900, audited: false });
  const b = rep({ period_end: "1403-03-31", period_months: 3, revenue: 950, audited: true });
  const c = rep({ period_end: "1403-03-31", period_months: 3, revenue: 999, audited: false }); // id بزرگ‌تر ولی نشده
  const m = dedupePeriods([a, b, c]);
  assert.equal(m.get("1403|3")!.revenue, 950);
});

test("اصلاحیهٔ متأخر (id بزرگ‌تر) در نسخه‌های هم‌سطح مقدم است", () => {
  const a = rep({ period_end: "1403-03-31", period_months: 3, revenue: 900, audited: false });
  const b = rep({ period_end: "1403-03-31", period_months: 3, revenue: 950, audited: false });
  const m = dedupePeriods([a, b]);
  assert.equal(m.get("1403|3")!.revenue, 950);
});

test("تفاضل منفی نامعقول در درآمد → فصل null + پرچم adjusted", () => {
  const reports = [
    rep({ period_end: "1403-03-31", period_months: 3, revenue: 3000 }),
    rep({ period_end: "1403-06-31", period_months: 6, revenue: 2500 }), // تعدیل: ۶م < ۳م
  ];
  const qs = deriveQuarters(reports);
  const q2 = qs.find((q) => q.q === 2)!;
  assert.equal(q2.revenue, null);
  assert.equal(q2.adjusted, true);
});

test("حاشیه‌ها فقط با درآمد مثبت؛ درصد درست", () => {
  const qs = deriveQuarters(fullYear(1403, 1000));
  assert.ok(Math.abs((qs[0].grossMargin as number) - 40) < 1e-9);
  assert.ok(Math.abs((qs[0].netMargin as number) - 20) < 1e-9);
});

test("EPS TTM: فقط با ۴ فصل متوالی کامل؛ فرمول ×۱۰۰۰÷سرمایه", () => {
  const reports = [...fullYear(1403, 1000), ...fullYear(1404, 1200)];
  const points = ttmSeries(deriveQuarters(reports));
  assert.ok(points.length >= 1);
  const p0 = points[0]; // پنجرهٔ Q1..Q4 1403
  assert.equal(p0.label, "Q4 1403");
  // net quarters 1403: 200,300,300,400 → 1200 (base=1000: .2,.5,.8,1.2 تجمیعی)
  assert.ok(Math.abs(p0.netProfitTtm - 1200) < 1e-6);
  assert.ok(Math.abs(p0.epsTtm - (1200 * 1000) / 1_000_000) < 1e-9);
});

test("EPS TTM: پنجرهٔ دارای فصل null حذف می‌شود (هیچ نقطه بدون ۴ فصل کامل)", () => {
  const y1403 = fullYear(1403, 1000).filter((r) => r.period_months !== 6); // Q2,Q3 null
  const y1404 = fullYear(1404, 1200);
  const points = ttmSeries(deriveQuarters([...y1403, ...y1404]));
  // پنجره‌هایی که Q2/Q3 1403 (null) دارند نباید باشند:
  // Q4 1403 (پنجره Q1..Q4 1403)، Q1 1404 (Q2 1403..Q1 1404)، Q2 1404 (Q3 1403..Q2 1404) حذف.
  // اولین پنجرهٔ سالم: Q3 1404 (Q4 1403..Q3 1404 همه کامل).
  for (const p of points) {
    assert.notEqual(p.label, "Q4 1403");
    assert.notEqual(p.label, "Q1 1404");
    assert.notEqual(p.label, "Q2 1404");
  }
  assert.equal(points.length, 2);
  assert.equal(points[0].label, "Q3 1404");
  assert.equal(points[1].label, "Q4 1404");
});

test("peOf: قیمت یا EPS نامعتبر → null (هیچ P/E منفی/ساختگی)", () => {
  assert.equal(peOf(null, 100), null);
  assert.equal(peOf(0, 100), null);
  assert.equal(peOf(5000, -10), null);
  assert.equal(peOf(5000, 0), null);
  assert.ok(Math.abs((peOf(5000, 250) as number) - 20) < 1e-9);
});

test("rolling4: میانگین ۴فصله فقط با پنجرهٔ کامل", () => {
  const r = rolling4([10, 20, null, 40, 50, 60, 70]);
  assert.equal(r[3], null); // پنجره شامل null
  assert.equal(r[4], null);
  assert.equal(r[5], null);
  assert.ok(Math.abs((r[6] as number) - 55) < 1e-9); // 40,50,60,70
});

test("سال مالی جاری ناقص: فصل‌های آینده حذف، فصل‌های موجود می‌مانند", () => {
  const reports = [
    ...fullYear(1403, 1000),
    rep({ period_end: "1404-03-31", period_months: 3, revenue: 1500, gross_profit: 600, operating_profit: 450, net_profit: 300 }),
  ];
  const qs = deriveQuarters(reports);
  const labels = qs.map((q) => q.label);
  assert.ok(labels.includes("Q1 1404"));
  assert.ok(!labels.includes("Q4 1404")); // فصل بدون گزارش در انتها حذف
});
