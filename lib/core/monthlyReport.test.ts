// تست‌های T1 — lib/core/monthlyReport.ts
// پوشش موارد الزامی بریف: سال مالی غیرمنطبق، ماه غایب (گپ)، محصول تک‌قلمی، واحد.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlySales,
  dedupeByMonth,
  fyMonthOrder,
  monthKeyOf,
  monthlyCalendarKeys,
  narrativeCumulative,
  narrativeMix,
  narrativeMonthlyVsAvg,
  narrativeProdVsSales,
  narrativeRate,
  meaningfulRate,
} from "./monthlyReport";
import type { CodalN30Data, N30ProductRow } from "@/lib/fundamental/types";
import { withKnownMonthlyQuantities } from "./monthly-quantity";

function prod(p: Partial<N30ProductRow> & { product_name: string }): N30ProductRow {
  // `sales_qty` پیش‌فرضِ ۱ دارد، نه null.
  // چرا: در دادهٔ واقعیِ Production **هیچ** ردیفی نرخِ مثبت با مقدارِ خالی ندارد
  // (۳۱٬۰۷۳ از ۳۱٬۰۷۳ ردیفِ دارای نرخِ مثبت، مقدار هم دارند). فیکسچرِ قبلی
  // ترکیبی می‌ساخت که در واقعیت وجود ندارد و به همین دلیل گاردِ `meaningfulRate`
  // را بی‌دلیل قرمز می‌کرد. تستِ اختصاصیِ مقدارِ خالی پایین‌تر آمده است.
  return {
    market: "داخلی",
    production_qty: null,
    sales_qty: 1,
    sales_rate: null,
    sales_amount: null,
    ...p,
  };
}

function report(periodEnd: string, total: number, products: N30ProductRow[], cum?: number): CodalN30Data {
  return {
    symbol: "تست",
    report_kind: "ن-۳۰",
    period_end: periodEnd,
    fiscal_year: Number(periodEnd.slice(0, 4)),
    products,
    period_total_amount: total,
    fy_cumulative_amount: cum ?? total,
  };
}

test("market basis: historical labels cannot establish a market split or erase valid rates", () => {
  const input = [report("1405-01-31", 500, [prod({ product_name: "الف", sales_amount: 500, sales_rate: 250, market_basis: undefined })])];
  const before = JSON.stringify(input), m = buildMonthlySales(input)!;
  assert.equal(m.latestExportSharePct, null);
  assert.equal(m.latestDomesticAmount, null); assert.equal(m.latestExportAmount, null);
  assert.equal(m.latestMix[0].market, "نامشخص"); assert.equal(m.latestMix[0].amount, 500);
  assert.deepEqual(m.rateSeries[0].points.map(p => p.rate), [250]);
  assert.equal(m.rateSeries[0].market, "نامشخص");
  assert.doesNotMatch(narrativeMix(m) ?? "", /کل فروش داخلی|صادراتی گزارش نشده/);
  assert.equal(JSON.stringify(input), before);
});

test("market basis: verified services, exact zero and incomplete coverage are distinct", () => {
  const rows = [prod({ product_name: "کالا", market_basis: "section_header", sales_amount: 300 }), prod({ product_name: "خدمت", market: "خدمات", market_basis: "section_header", sales_amount: 200 })];
  const known = buildMonthlySales([report("1405-01-31", 500, rows)])!;
  assert.equal(known.latestDomesticAmount, 300); assert.equal(known.latestExportAmount, 0);
  assert.equal(known.latestExportSharePct, 0); assert.equal(known.marketUnavailableReason, null);
  assert.equal(known.latestMix.find(x => x.name === "خدمت")!.market, "خدمات");
  assert.equal(known.latestMix.find(x => x.name === "خدمت")!.sharePct, 40);
  assert.doesNotMatch(narrativeMix(known)!, /کل فروش داخلی/);
  for (const basis of [undefined, "unknown", "section_header " as "unknown"] as const) {
    const uncertain = buildMonthlySales([report("1405-01-31", 500, rows.map(p => ({ ...p, market_basis: basis })))])!;
    assert.equal(uncertain.latestExportSharePct, null); assert.equal(uncertain.marketUnavailableReason, "unverified-market");
  }
  const explicitUnknown = buildMonthlySales([report("1405-01-31", 500, rows.map(p => ({ ...p, market: "نامشخص" })))])!;
  assert.equal(explicitUnknown.latestExportSharePct, null); assert.equal(explicitUnknown.marketUnavailableReason, "unverified-market");
  for (const r of [report("1405-01-31", 501, rows), report("1405-01-31", 500, [rows[0], { ...rows[1], sales_amount: null }])]) {
    const incomplete = buildMonthlySales([r])!;
    assert.equal(incomplete.latestExportSharePct, null); assert.equal(incomplete.marketUnavailableReason, "incomplete-market-coverage");
  }
  const signed = buildMonthlySales([report("1405-01-31", 290, [rows[0], { ...rows[1], market: "صادراتی", sales_amount: -10 }])])!;
  assert.equal(signed.latestExportSharePct, null); assert.equal(signed.marketUnavailableReason, "signed-market-adjustment");
  assert.match(narrativeMix(signed)!, /اصلاحی\/منفی/);
  assert.doesNotMatch(narrativeMix(signed)!, /تفکیک.*در دسترس نیست|تأیید نشده|پوشش.*کامل نیست/);
});

test("market basis: two historical rate buckets keep their points and unknown rows stay outside other", () => {
  const products = [prod({ product_name: "الف", market: "داخلی", sales_amount: 300, sales_rate: 250, market_basis: undefined }),
    prod({ product_name: "الف", market: "صادراتی", sales_amount: 200, sales_rate: 310, market_basis: undefined })];
  const m = buildMonthlySales([report("1405-01-31", 500, products), report("1405-03-31", 500, products)])!;
  assert.equal(m.rateSeries.length, 2);
  assert.deepEqual(m.rateSeries.map(s => s.points.map(p => p.rate)), [[250, null, 250], [310, null, 310]]);
  assert.ok(m.rateSeries.every(s => s.market === "نامشخص" && s.label.includes("تفکیک نامعلوم")));
  const many = Array.from({ length: 8 }, (_, i) => prod({ product_name: `محصول${i}`, sales_amount: 10 - i,
    market_basis: i === 7 ? undefined : "section_header" }));
  const mix = buildMonthlySales([report("1405-01-31", 52, many)])!.latestMix;
  assert.equal(mix.find(p => p.name === "محصول7")!.market, "نامشخص");
  assert.equal(mix.find(p => p.name === "سایر")!.market, null);
  assert.equal(mix.reduce((sum, p) => sum + p.amount, 0), 52);
});

test("rounded positive: narrative distinguishes small exports from observed zero without changing the model", () => {
  const model = (domestic: number, exports: number) => buildMonthlySales(["1405-01-31", "1405-03-31"].map(end => report(end, domestic + exports, [
    prod({ product_name: "داخلی آزمون", market: "داخلی", market_basis: "section_header", sales_amount: domestic }),
    prod({ product_name: "صادرات آزمون", market: "صادراتی", market_basis: "section_header", sales_amount: exports }),
  ])))!;
  for (const [domestic, exports] of [[999999, 1], [999999999999, 1]]) {
    const m = model(domestic, exports), before = JSON.stringify(m), narrative = narrativeMix(m)!;
    assert.equal(m.latestExportSharePct, 0); assert.equal(m.latestExportAmount, exports);
    assert.match(narrative, /کمتر از یک‌دهم درصد/); assert.doesNotMatch(narrative, /صفر/);
    assert.equal(m.currentMonths.find(p => p.monthNo === 2)!.amount, null);
    assert.equal(JSON.stringify(m), before);
  }
  const zero = model(1000000, 0);
  assert.match(narrativeMix(zero)!, /صفر/); assert.doesNotMatch(narrativeMix(zero)!, /کمتر از/);
  const boundary = model(999000, 1000);
  assert.equal(boundary.latestExportSharePct, 0.1); assert.match(narrativeMix(boundary)!, /0\.1 درصد/);
  assert.doesNotMatch(narrativeMix(boundary)!, /کمتر از|صفر/);
});

test("monthKeyOf: جلالی معتبر و نامعتبر", () => {
  assert.equal(monthKeyOf("1404-10-30"), "1404-10");
  assert.equal(monthKeyOf("1405-02-31"), "1405-02"); // اردیبهشت ۳۱روزه معتبر
  assert.equal(monthKeyOf("bad"), null);
  assert.equal(monthKeyOf("1404-13-01"), null);
});

test("shared monthly calendar: sorted unique slots, year rollover, empty and invalid axes", () => {
  const keys = Object.freeze(["1405-02", "1404-11", "1405-02"]);
  assert.deepEqual(monthlyCalendarKeys(keys), ["1404-11", "1404-12", "1405-01", "1405-02"]);
  assert.deepEqual(monthlyCalendarKeys(["1405-02"]), ["1405-02"]);
  assert.deepEqual(monthlyCalendarKeys([]), []);
  for (const bad of ["1405-00", "1405-13", "bad", "1405-1", "1405-01-31"])
    assert.deepEqual(monthlyCalendarKeys(["1405-01", bad]), []);
  assert.deepEqual(keys, ["1405-02", "1404-11", "1405-02"]);
});

test("fyMonthOrder: سال مالی منتهی به شهریور از مهر شروع می‌شود", () => {
  assert.deepEqual(fyMonthOrder(7).slice(0, 3), [7, 8, 9]);
  assert.deepEqual(fyMonthOrder(7)[11], 6);
  assert.deepEqual(fyMonthOrder(1)[0], 1);
});

test("dedupeByMonth: جدیدترین اصلاحیه برنده؛ نسخهٔ جمع‌صفر کنار می‌رود", () => {
  const newer = report("1404-12-29", 500, [prod({ product_name: "الف", sales_amount: 500 })]);
  const older = report("1404-12-29", 400, [prod({ product_name: "الف", sales_amount: 400 })]);
  // ورودی از جدید به قدیم — اولین دیده‌شده (جدیدترین) برنده.
  const m1 = dedupeByMonth([newer, older]);
  assert.equal(m1.get("1404-12")?.period_total_amount, 500);
  // نسخهٔ نگه‌داشتهٔ صفر با نسخهٔ ناصفر بعدی جایگزین می‌شود.
  const zero = report("1404-07-30", 0, [prod({ product_name: "الف", sales_amount: 0 })]);
  const real = report("1404-07-30", 450, [prod({ product_name: "الف", sales_amount: 450 })]);
  const m2 = dedupeByMonth([zero, real]);
  assert.equal(m2.get("1404-07")?.period_total_amount, 450);
});

test("گپ واقعی: ماه بدون گزارش amount=null می‌ماند (بدون درون‌یابی)", () => {
  const r = buildMonthlySales([
    report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100 })], 100),
    report("1405-03-31", 300, [prod({ product_name: "الف", sales_amount: 300 })], 400),
  ]);
  assert.ok(r);
  assert.equal(r.currentFY, 1405);
  assert.equal(r.currentMonths[0].amount, 100); // فروردین
  assert.equal(r.currentMonths[1].amount, null); // اردیبهشت غایب — گپ
  assert.equal(r.currentMonths[2].amount, 300); // خرداد
  assert.equal(r.reportCount, 2);
});

test("مقایسهٔ سال جاری با سال قبل و تجمیعی هم‌نقطه", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 200, [prod({ product_name: "الف", sales_amount: 200 })], 350),
    report("1405-01-31", 150, [prod({ product_name: "الف", sales_amount: 150 })], 150),
    report("1404-02-31", 120, [prod({ product_name: "الف", sales_amount: 120 })], 220),
    report("1404-01-31", 100, [prod({ product_name: "الف", sales_amount: 100 })], 100),
  ]);
  assert.ok(r);
  assert.equal(r.currentFY, 1405);
  assert.equal(r.priorFY, 1404);
  assert.equal(r.cumulativeCurrent, 350); // آخرین ماه گزارش‌شده = اردیبهشت ۱۴۰۵
  assert.equal(r.cumulativePriorSamePoint, 220); // اردیبهشت ۱۴۰۴
  assert.equal(r.avgCurrent, 175);
  const n = narrativeCumulative(r);
  assert.ok(n && n.includes("بیشتر")); // 350 > 220
});

test("missing immediately prior year never labels an older year as prior-year growth", () => {
  const current = report("1405-06-31", 300, [prod({ product_name: "الف", sales_amount: 300 })], 1500);
  const older = report("1403-06-31", 100, [prod({ product_name: "الف", sales_amount: 100 })], 600);
  const gap = buildMonthlySales([current, older]);
  assert.ok(gap);
  assert.equal(gap.currentFY, 1405);
  assert.equal(gap.priorFY, null);
  assert.equal(gap.priorMonths, null);
  assert.equal(gap.cumulativePriorSamePoint, null);
  assert.equal(narrativeCumulative(gap), null);
  assert.equal(gap.cumulativeCurrent, 1500);
  assert.equal(gap.reportCount, 2); // Older evidence remains available for other series.

  const contiguous = buildMonthlySales([current,
    report("1404-06-31", 200, [prod({ product_name: "الف", sales_amount: 200 })], 1000), older]);
  assert.ok(contiguous);
  assert.equal(contiguous.priorFY, 1404);
  assert.equal(contiguous.cumulativePriorSamePoint, 1000);
  assert.ok(narrativeCumulative(contiguous)?.includes("بیشتر"));
});

test("واحد حفظ می‌شود: مقادیر میلیون ریال بدون تبدیل در خروجی", () => {
  const r = buildMonthlySales([
    report("1405-03-31", 545_287_525, [prod({ product_name: "شمش", sales_amount: 545_287_525 })]),
  ]);
  assert.ok(r);
  assert.equal(r.currentMonths[2].amount, 545_287_525);
});

test("سری نرخ: داخلی/صادراتی جدا و گپ برای ماه بدون رکورد آن محصول", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 900, [
      prod({ product_name: "شمش", market: "داخلی", market_basis: "section_header", sales_amount: 500, sales_rate: 250 }),
      prod({ product_name: "شمش صادراتی", market: "صادراتی", market_basis: "section_header", sales_amount: 400, sales_rate: 310 }),
    ]),
    report("1405-01-31", 500, [
      prod({ product_name: "شمش", market: "داخلی", market_basis: "section_header", sales_amount: 500, sales_rate: 240 }),
    ]),
  ]);
  assert.ok(r);
  const dom = r.rateSeries.find((s) => s.market === "داخلی");
  const exp = r.rateSeries.find((s) => s.market === "صادراتی");
  assert.ok(dom && exp);
  assert.equal(dom.points.length, 2);
  assert.equal(dom.points[0].rate, 240);
  assert.equal(dom.points[1].rate, 250);
  assert.equal(exp.points[0].rate, null); // فروردین: رکورد صادراتی نیست — گپ
  assert.equal(exp.points[1].rate, 310);
});

test("محصول تک‌قلمی: ترکیب فروش و تولید/فروش سالم", () => {
  const r = buildMonthlySales([
    report("1405-03-31", 3_162_098, [
      prod({ product_name: "آمادگي", market_basis: "section_header", sales_amount: 3_162_098, sales_qty: 617_199_000, production_qty: 617_199_000 }),
    ]),
  ]);
  assert.ok(r);
  assert.equal(r.latestMix.length, 1);
  assert.equal(r.latestMix[0].sharePct, 100);
  assert.equal(r.mainProductName, "آمادگي");
  assert.equal(r.prodVsSales.length, 1);
  assert.equal(r.latestExportSharePct, 0);
  const n = narrativeMix(r);
  assert.ok(n && n.includes("تفکیک تأییدشده") && n.includes("صفر"));
  assert.doesNotMatch(n, /کل فروش داخلی/);
});

test("prodVsSales ماه با مقدار ناقص را با اسلات null نگه می‌دارد", () => {
  const r = buildMonthlySales([
    report("1405-01-31", 100, [
      prod({ product_name: "الف", sales_amount: 100, sales_qty: 10, production_qty: null }),
    ]),
  ]);
  assert.ok(r);
  assert.equal(r.prodVsSales.length, 1);
  assert.deepEqual(r.prodVsSales[0], {
    monthKey: "1405-01", monthLabel: "فروردین",
    production: null, sales: null, unavailableReason: "incomplete-quantity", quantityUnit: null,
  });
  assert.equal(narrativeProdVsSales(r), null);
});

test("مقدار: ماه کاملاً غایب همان محور نرخ را دارد؛ گزارش/صفر اختراع نمی‌شود", () => {
  const reports = [
    report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100, production_qty: 12, sales_qty: 10 })]),
    report("1405-03-31", 300, [prod({ product_name: "الف", sales_amount: 300, production_qty: 32, sales_qty: 30 })]),
  ];
  const before = JSON.stringify(reports);
  const m = buildMonthlySales(reports)!;
  assert.deepEqual(m.prodVsSales.map(p => p.monthKey), ["1405-01", "1405-02", "1405-03"]);
  assert.deepEqual(m.prodVsSales[1], { monthKey: "1405-02", monthLabel: "اردیبهشت", production: null, sales: null, unavailableReason: "missing-report", quantityUnit: null });
  assert.deepEqual(m.rateSeries[0].points.map(p => p.monthKey), m.prodVsSales.map(p => p.monthKey));
  assert.equal(m.reportCount, 2);
  assert.equal(m.avgCurrent, 200);
  assert.equal(m.currentMonths[1].amount, null);
  assert.equal(JSON.stringify(reports), before);
});

test("مقدار: صفر گزارش‌شده با نبود محصول و ماه غایب متفاوت است", () => {
  const m = buildMonthlySales([
    report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100, production_qty: 0, sales_qty: 0 })]),
    report("1405-02-31", 1, [prod({ product_name: "ب", sales_amount: 1, production_qty: 9, sales_qty: 8 })]),
    report("1405-04-31", 400, [prod({ product_name: "الف", sales_amount: 400, production_qty: 42, sales_qty: 40 })]),
  ])!;
  assert.equal(m.prodVsSales[0].production, 0);
  assert.equal(m.prodVsSales[0].sales, 0);
  assert.equal(m.prodVsSales[0].unavailableReason, null);
  assert.equal(m.prodVsSales[1].unavailableReason, "missing-product");
  assert.equal(m.prodVsSales[1].sales, null);
  assert.equal(m.prodVsSales[2].unavailableReason, "missing-report");
});

test("مقدار: ردیف ناقص یک بازار به جمع ظاهراً کامل بازارهای دیگر تبدیل نمی‌شود", () => {
  const m = buildMonthlySales([report("1405-01-31", 300, [
    prod({ product_name: "الف", market: "داخلی", sales_amount: 200, production_qty: 20, sales_qty: 18 }),
    prod({ product_name: "الف", market: "صادراتی", sales_amount: 100, production_qty: null, sales_qty: 10 }),
  ])])!;
  assert.equal(m.prodVsSales[0].production, null);
  assert.equal(m.prodVsSales[0].sales, null);
  assert.equal(m.prodVsSales[0].unavailableReason, "incomplete-quantity");
  assert.equal(narrativeProdVsSales(m), null);
});

test("مقدار: جمع ردیف‌های کامل تغییر نمی‌کند؛ ماه ناقص آخر روایت ماه قبلی را حمل نمی‌کند", () => {
  const m = buildMonthlySales([
    report("1405-01-31", 300, [
      prod({ product_name: "الف", sales_amount: 200, production_qty: 20, sales_qty: 18 }),
      prod({ product_name: "الف", market: "صادراتی", sales_amount: 100, production_qty: 10, sales_qty: 8 }),
    ]),
    report("1405-02-31", 400, [prod({ product_name: "الف", sales_amount: 400, production_qty: 40, sales_qty: null })]),
  ])!;
  assert.equal(m.prodVsSales[0].production, 30);
  assert.equal(m.prodVsSales[0].sales, 26);
  assert.equal(m.prodVsSales[1].sales, null);
  assert.equal(narrativeProdVsSales(m), null);
});

test("مقدار: گپ اسفند/فروردین تقویمی است و سال مالی جدید ساخته نمی‌شود", () => {
  const m = buildMonthlySales([
    report("1404-11-30", 100, [prod({ product_name: "الف", sales_amount: 100, production_qty: 12, sales_qty: 10 })]),
    report("1405-02-31", 200, [prod({ product_name: "الف", sales_amount: 200, production_qty: 22, sales_qty: 20 })]),
  ])!;
  assert.deepEqual(m.prodVsSales.map(p => p.monthKey), ["1404-11", "1404-12", "1405-01", "1405-02"]);
  assert.deepEqual(m.prodVsSales.map(p => p.sales), [10, null, null, 20]);
  assert.equal(m.currentFY, 1405);
  assert.equal(m.reportCount, 2);
});

test("مقدار: واحد نامعلوم در sanitizer موجود null می‌ماند؛ نبود محصول سری اختراعی نمی‌سازد", () => {
  const raw = report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100, production_qty: 12, sales_qty: 10 })]);
  const sanitized = withKnownMonthlyQuantities(raw);
  const m = buildMonthlySales([sanitized])!;
  assert.equal(sanitized.qty_unit, null);
  assert.equal(m.prodVsSales[0].production, null);
  assert.equal(m.prodVsSales[0].sales, null);
  assert.equal(m.prodVsSales[0].unavailableReason, "incomplete-quantity");
  assert.equal(raw.products[0].production_qty, 12);
  assert.deepEqual(buildMonthlySales([report("1405-01-31", 100, [])])?.prodVsSales, []);
});

test("مقدار: عدد نامعتبر هم null است و به ستون صفر تبدیل نمی‌شود", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const m = buildMonthlySales([report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100, production_qty: bad, sales_qty: 10 })])])!;
    assert.equal(m.prodVsSales[0].production, null);
    assert.equal(m.prodVsSales[0].sales, null);
    assert.equal(m.prodVsSales[0].unavailableReason, "incomplete-quantity");
  }
});

test("ورودی خالی یا بی‌اعتبار → null (بخش رندر نشود)", () => {
  assert.equal(buildMonthlySales([]), null);
  assert.equal(buildMonthlySales([{ ...report("bad-date", 1, []), period_end: "xx" }]), null);
});

test("روایت‌ها: قطعی و بدون واژهٔ تجویزی", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 300, [
      prod({ product_name: "الف", sales_amount: 300, sales_rate: 30, sales_qty: 10, production_qty: 12 }),
    ], 400),
    report("1405-01-31", 100, [
      prod({ product_name: "الف", sales_amount: 100, sales_rate: 10, sales_qty: 10, production_qty: 8 }),
    ], 100),
    report("1404-02-31", 90, [prod({ product_name: "الف", sales_amount: 90 })], 190),
  ]);
  assert.ok(r);
  const texts = [
    narrativeMonthlyVsAvg(r),
    narrativeCumulative(r),
    narrativeRate(r),
    narrativeMix(r),
    narrativeProdVsSales(r),
  ].filter((t): t is string => t !== null);
  assert.ok(texts.length >= 4);
  for (const t of texts) {
    for (const bad of ["سیگنال", "توصیه", "پیشنهاد", "بخرید", "بفروشید", "خرید", "فروش را"]) {
      // «فروش» به‌تنهایی نام دادهٔ رسمی است؛ واژه‌های تجویزی نباید باشند.
      if (bad === "خرید") continue; // در متن روایت‌ها به کار نمی‌رود؛ چک زیر پوشش می‌دهد
      assert.ok(!t.includes(bad), `واژهٔ ممنوع «${bad}» در روایت: ${t}`);
    }
  }
});

test("روایت میانگین: بالاتر/پایین‌تر درست", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 300, [prod({ product_name: "الف", sales_amount: 300 })]),
    report("1405-01-31", 100, [prod({ product_name: "الف", sales_amount: 100 })]),
  ]);
  assert.ok(r);
  const n = narrativeMonthlyVsAvg(r);
  assert.ok(n && n.includes("بالاتر")); // 300 نسبت به میانگین 200
});

/* ── گاردِ نرخِ معنادار — الگوهای خرابِ دادهٔ واقعیِ Production ──────────── */

test("نرخ: مقدارِ مثبت با مبلغِ منفی نرخ نمی‌سازد (ردیفِ تعدیل)", () => {
  // الگوی واقعی: دزهراوی، «آمپول»، مقدار +۰.۰۱ و مبلغ −۱۳۷۱۰ ⇒ نرخِ −۱.۳۷e۱۲
  assert.equal(meaningfulRate({ sales_qty: 0.01, sales_rate: -1_371_000_000_000, sales_amount: -13710 }), null);
});

test("نرخ: نرخِ صفر یا منفی رد می‌شود — قیمتِ واحد نه صفر است نه منفی", () => {
  assert.equal(meaningfulRate({ sales_qty: 10, sales_rate: 0, sales_amount: 100 }), null);
  assert.equal(meaningfulRate({ sales_qty: 10, sales_rate: -5, sales_amount: 100 }), null);
});

test("نرخ: مقدارِ صفر یا خالی نرخ نمی‌سازد — تقسیم بر صفر", () => {
  assert.equal(meaningfulRate({ sales_qty: 0, sales_rate: 250, sales_amount: 100 }), null);
  assert.equal(meaningfulRate({ sales_qty: null, sales_rate: 250, sales_amount: 100 }), null);
});

test("نرخ: برگشت از فروش سالم است و عبور می‌کند", () => {
  // مقدار و مبلغ هر دو منفی، نرخ مثبت — واقعیتِ حسابداری، نه خطای پارس
  assert.equal(meaningfulRate({ sales_qty: -5, sales_rate: 250, sales_amount: -1250 }), 250);
});

test("نرخ: ردیفِ سالم دست‌نخورده عبور می‌کند", () => {
  assert.equal(meaningfulRate({ sales_qty: 5, sales_rate: 250, sales_amount: 1250 }), 250);
});

test("نرخ: مبلغِ خالی مانعِ نرخ نیست (فقط تناقضِ علامت مانع است)", () => {
  assert.equal(meaningfulRate({ sales_qty: 5, sales_rate: 250, sales_amount: null }), 250);
});

test("نرخ: ماهِ دارای ردیفِ خراب گپ می‌شود، نه عددِ بی‌معنا", () => {
  const r = buildMonthlySales([
    report("1405-02-31", 900, [
      prod({ product_name: "آمپول", market: "داخلی", sales_qty: 0.01, sales_rate: -1_371_000_000_000, sales_amount: -13710 }),
    ]),
    report("1405-01-31", 500, [
      prod({ product_name: "آمپول", market: "داخلی", sales_qty: 100, sales_rate: 240, sales_amount: 24 }),
    ]),
  ]);
  assert.ok(r);
  const s = r.rateSeries.find((x) => x.productName === "آمپول")!;
  assert.equal(s.points[0].rate, 240, "ماهِ سالم عدد دارد");
  assert.equal(s.points[1].rate, null, "ماهِ خراب گپ است، نه ۱.۳۷e۱۲−");
});

test("نرخ: تناقضِ علامت حتی با نرخِ مثبت هم رد می‌شود", () => {
  // ⚠️ این حالت در دادهٔ امروزِ Production **وجود ندارد**: هر ۳۰۲ ردیفِ دارای
  // تناقضِ علامت، نرخِ منفی هم دارند و گاردِ «نرخِ نامثبت» زودتر می‌گیردشان.
  // پس بدونِ این تستِ صریح، گاردِ تناقضِ علامت هرگز قرمز نمی‌شد — یعنی یک
  // گاردِ توخالی می‌ماند که هیچ‌کس نمی‌فهمید کار می‌کند یا نه.
  // اگر روزی پارسر قدرمطلق بگیرد، این تست تنها چیزی است که جلوش را می‌گیرد.
  assert.equal(meaningfulRate({ sales_qty: 5, sales_rate: 250, sales_amount: -1250 }), null);
  assert.equal(meaningfulRate({ sales_qty: -5, sales_rate: 250, sales_amount: 1250 }), null);
});

test("rate axis retains a wholly missing month as null without creating reports", () => {
  const input = [
    report("1405-03-31", 700, [prod({product_name:"شمش",sales_amount:700,sales_rate:260})], 1900),
    report("1405-01-31", 500, [prod({product_name:"شمش",sales_amount:500,sales_rate:240})], 500),
  ];
  const before=JSON.stringify(input), model=buildMonthlySales(input);
  assert.ok(model);
  assert.deepEqual(model.rateSeries[0].points.map(p=>[p.monthKey,p.rate]), [["1405-01",240],["1405-02",null],["1405-03",260]]);
  assert.equal(model.reportCount,2);
  assert.equal(model.currentMonths[1].amount,null);
  assert.equal(model.cumulativeCurrent,1900);
  assert.equal(JSON.stringify(input),before);
});
test("rate calendar slots cross a year boundary without zero fill or leading/trailing padding", () => {
  const model=buildMonthlySales([
    report("1405-02-31", 900, [prod({product_name:"شمش",sales_amount:900,sales_rate:300})]),
    report("1404-11-30", 700, [prod({product_name:"شمش",sales_amount:700,sales_rate:250})]),
  ]);
  assert.ok(model);
  assert.deepEqual(model.rateSeries[0].points.map(p=>[p.monthKey,p.rate]), [["1404-11",250],["1404-12",null],["1405-01",null],["1405-02",300]]);
  assert.equal(model.reportCount,2);
  assert.equal(model.latestMix[0].amount,900);
  assert.equal(model.prodVsSales.length,4);
  assert(model.prodVsSales.every(p=>p.production===null&&p.sales===null));
});

// Unit metadata is additive. These synthetic boundary rows never become stored
// financial fixtures, and their existing numeric outputs must remain unchanged.
function unitReport(period: string, products: N30ProductRow[]): CodalN30Data {
  return { ...report(period, 1000, products), unit: 'میلیون ریال' };
}
function unitProduct(fields: Partial<N30ProductRow> = {}): N30ProductRow {
  return prod({ product_name: 'کالا', market_basis: 'section_header', sales_amount: 100, sales_qty: 10,
    production_qty: 12, sales_rate: 20, qty_unit: 'تن', ...fields });
}

test('unit metadata carries a typed rial numerator and normalized declared denominator', () => {
  const r = buildMonthlySales([unitReport('1405-06-31', [unitProduct({ qty_unit: '  تن  ' })])])!;
  const rateUnit = { numerator: 'ریال', denominator: 'تن' };
  assert.equal(r.quantityUnit, 'تن');
  assert.equal(r.rateSeries[0].quantityUnit, 'تن');
  assert.deepEqual(r.rateSeries[0].rateUnit, rateUnit);
  assert.deepEqual(r.rateSeries[0].points[0], { monthKey: '1405-06', monthLabel: 'شهریور',
    rate: 20, quantityUnit: 'تن', rateUnit });
  assert.equal(r.prodVsSales[0].quantityUnit, 'تن');
  assert.deepEqual([r.prodVsSales[0].production, r.prodVsSales[0].sales], [12, 10]);
  assert.equal(r.currentMonths[5].amount, 1000);
});

test('quantity unit alone never certifies a rate numerator; numeric outputs are not rewritten', () => {
  for (const unit of [null, undefined, 'تومان', 'نامعلوم']) {
    const input = { ...unitReport('1405-06-31', [unitProduct()]), unit };
    const r = buildMonthlySales([input])!;
    assert.equal(r.quantityUnit, 'تن');
    assert.equal(r.rateSeries[0].points[0].quantityUnit, 'تن');
    assert.equal(r.rateSeries[0].points[0].rateUnit, null);
    assert.equal(r.rateSeries[0].rateUnit, null);
    assert.equal(r.rateSeries[0].points[0].rate, 20);
    assert.equal(r.currentMonths[5].amount, 1000);
  }
});

test('a known numerator in one month cannot certify another month or the whole rate series', () => {
  const unknown = { ...unitReport('1405-02-31', [unitProduct()]), unit: null };
  const known = unitReport('1405-01-31', [unitProduct()]);
  const r = buildMonthlySales([unknown, known])!;
  const s = r.rateSeries[0];
  assert.equal(s.quantityUnit, 'تن');
  assert.equal(r.quantityUnit, 'تن');
  assert.deepEqual(s.points[0].rateUnit, { numerator: 'ریال', denominator: 'تن' });
  assert.equal(s.points[1].rateUnit, null);
  assert.equal(s.rateUnit, null);
  assert.deepEqual(s.points.map(p => p.rate), [20, 20]);
  const missingBasis = buildMonthlySales([known, unitReport('1405-02-31', [unitProduct({ market_basis: undefined })])])!;
  assert.equal(missingBasis.rateSeries[0].points[0].quantityUnit, 'تن');
  assert.equal(missingBasis.rateSeries[0].points[1].quantityUnit, null);
  assert.equal(missingBasis.rateSeries[0].quantityUnit, null); assert.equal(missingBasis.rateSeries[0].rateUnit, null);
  assert.deepEqual(missingBasis.rateSeries[0].points.map(p => p.rate), [20, 20]);
});

test('explicit row null/undefined/unknown never borrows a report unit; absence uses existing contract', () => {
  const absent = unitProduct(); delete absent.qty_unit;
  const cases: Array<[N30ProductRow, string | null]> = [
    [absent, 'تن'], [unitProduct({ qty_unit: null }), null],
    [unitProduct({ qty_unit: undefined }), null], [unitProduct({ qty_unit: 'واحد حدسی' }), null],
    [unitProduct({ qty_unit: 'هزار تن' }), null], [unitProduct({ qty_unit: 'هزارتن' }), null],
  ];
  for (const [product, expected] of cases) {
    const input = { ...unitReport('1405-06-31', [product]), qty_unit: 'تن' };
    const r = buildMonthlySales([input])!;
    assert.equal(r.quantityUnit, expected);
    assert.equal(r.prodVsSales[0].quantityUnit, expected);
    assert.equal(r.rateSeries[0].points[0].quantityUnit, expected);
    assert.deepEqual(r.rateSeries[0].rateUnit, expected ? { numerator: 'ریال', denominator: expected } : null);
    assert.equal(r.rateSeries[0].points[0].rate, 20);
  }
});

test('per-market row units stay separate; mixed production contributors have no common unit', () => {
  const r = buildMonthlySales([unitReport('1405-06-31', [
    unitProduct({ market: 'داخلی', qty_unit: 'تن', sales_amount: 200 }),
    unitProduct({ market: 'صادراتی', qty_unit: 'کیلوگرم', sales_amount: 100 }),
  ])])!;
  assert.deepEqual(r.rateSeries.map(s => s.quantityUnit), ['تن', 'کیلوگرم']);
  assert.deepEqual(r.rateSeries.map(s => s.rateUnit?.denominator), ['تن', 'کیلوگرم']);
  assert.equal(r.quantityUnit, null);
  assert.equal(r.prodVsSales[0].quantityUnit, null);
  assert.deepEqual([r.prodVsSales[0].production, r.prodVsSales[0].sales], [24, 20]);
});

test('unit changes across months keep point provenance and deny a common series/output label', () => {
  const r = buildMonthlySales([
    unitReport('1405-03-31', [unitProduct({ qty_unit: 'کیلوگرم', sales_rate: 30 })]),
    unitReport('1405-01-31', [unitProduct({ qty_unit: 'تن', sales_rate: 10 })]),
  ])!;
  const s = r.rateSeries[0];
  assert.deepEqual(s.points.map(p => [p.monthKey, p.rate, p.rateUnit?.denominator]),
    [['1405-01', 10, 'تن'], ['1405-02', null, undefined], ['1405-03', 30, 'کیلوگرم']]);
  assert.equal(s.quantityUnit, null); assert.equal(s.rateUnit, null);
  assert.equal(r.quantityUnit, null);
  assert.deepEqual(r.prodVsSales.map(p => p.quantityUnit), ['تن', null, 'کیلوگرم']);
  assert.equal(r.currentMonths[1].amount, null, 'missing report stays missing');
  assert.equal(s.points[1].quantityUnit, null); assert.equal(s.points[1].rateUnit, null);
  assert.equal(s.points[1].rate, null, 'canonical missing-month slot is preserved');
  const sameUnit = buildMonthlySales([unitReport('1405-01-31', [unitProduct()]), unitReport('1405-03-31', [unitProduct()])])!;
  assert.equal(sameUnit.quantityUnit, 'تن', 'common label covers observed contributors, not an invented missing report');
  assert.equal(sameUnit.rateSeries[0].points[1].quantityUnit, null); assert.equal(sameUnit.rateSeries[0].points[1].rateUnit, null);
  assert.equal(sameUnit.prodVsSales[1].quantityUnit, null); assert.equal(sameUnit.prodVsSales[1].production, null);
});

test('missing product has null point units; another month or product cannot fill them', () => {
  const r = buildMonthlySales([
    unitReport('1405-02-31', [unitProduct({ product_name: 'دیگر', qty_unit: 'عدد', sales_amount: 1 })]),
    unitReport('1405-01-31', [unitProduct({ qty_unit: 'تن' })]),
  ])!;
  const s = r.rateSeries.find(s => s.productName === 'کالا')!;
  assert.equal(s.quantityUnit, 'تن', 'common metadata covers only observed contributing rows');
  assert.equal(s.points[1].rate, null);
  assert.equal(s.points[1].quantityUnit, null);
  assert.equal(s.points[1].rateUnit, null);
  assert.equal(r.quantityUnit, null, 'different output series do not share a denominator');
});

test('services and unknown markets cannot supply goods unit/rate metadata even with a matching name', () => {
  const r = buildMonthlySales([unitReport('1405-06-31', [
    unitProduct({ market: 'خدمات', qty_unit: 'عدد', sales_amount: 600 }),
    unitProduct({ market: 'نامشخص', qty_unit: 'کیلوگرم', sales_amount: 300 }),
    unitProduct({ market: 'داخلی', qty_unit: 'تن', sales_amount: 100 }),
  ])])!;
  assert.equal(r.rateSeries.length, 3);
  assert.equal(r.quantityUnit, null);
  assert.equal(r.prodVsSales[0].quantityUnit, null);
  assert.deepEqual([r.prodVsSales[0].production, r.prodVsSales[0].sales], [36, 30]);
  assert.ok(r.rateSeries.filter(s => s.market !== 'داخلی').every(s => s.quantityUnit === null && s.rateUnit === null));
  assert.equal(r.latestMix.find(p => p.market === 'خدمات')?.amount, 600);
  assert.equal(r.latestExportSharePct, null);
  const onlyServices = buildMonthlySales([unitReport('1405-06-31', [unitProduct({ market: 'خدمات' })])])!;
  assert.equal(onlyServices.quantityUnit, null);
  assert.equal(onlyServices.rateSeries.length, 1);
  assert.equal(onlyServices.rateSeries[0].quantityUnit, null); assert.equal(onlyServices.rateSeries[0].rateUnit, null);
  assert.equal(onlyServices.prodVsSales.length, 1); assert.equal(onlyServices.prodVsSales[0].quantityUnit, null);
});

test('amendment selection and pv2 absence cannot borrow old or unrelated units', () => {
  const newer = unitReport('1405-06-31', [unitProduct({ qty_unit: null })]);
  const older = unitReport('1405-06-31', [unitProduct({ qty_unit: 'تن' })]);
  const r = buildMonthlySales([newer, older])!;
  assert.equal(r.reportCount, 1); assert.equal(r.quantityUnit, null);
  assert.equal(r.rateSeries[0].rateUnit, null);
  assert.equal(r.rateSeries[0].points[0].rate, 20);
  const historical = unitReport('1405-06-31', [unitProduct({ qty_unit: null, sales_qty: null, sales_rate: null })]);
  historical.qty_unit = null;
  const pv2 = buildMonthlySales([historical])!;
  assert.equal(pv2.quantityUnit, null);
  assert.equal(pv2.rateSeries[0].points[0].quantityUnit, null);
  assert.equal(pv2.rateSeries[0].points[0].rateUnit, null);
  assert.equal(pv2.rateSeries[0].points[0].rate, null);
  const zero = { ...newer, period_total_amount: 0 };
  const selected = buildMonthlySales([zero, older])!;
  assert.equal(selected.quantityUnit, 'تن', 'metadata follows the baseline selected nonzero row');
  const historicalLabel = buildMonthlySales([unitReport('1405-06-31', [unitProduct({ market_basis: undefined })])])!;
  assert.equal(historicalLabel.quantityUnit, null); assert.equal(historicalLabel.rateSeries[0].points[0].quantityUnit, null);
  assert.equal(historicalLabel.rateSeries[0].points[0].rateUnit, null); assert.equal(historicalLabel.rateSeries[0].points[0].rate, 20);
});

test('an unrelated unselected row cannot donate or invalidate a participating row unit', () => {
  const input = unitReport('1405-06-31', [
    unitProduct({ product_name: 'الف', qty_unit: 'تن', sales_amount: 400 }),
    unitProduct({ product_name: 'ب', qty_unit: 'تن', sales_amount: 300 }),
    unitProduct({ product_name: 'پ', qty_unit: 'تن', sales_amount: 200 }),
    unitProduct({ product_name: 'ت', qty_unit: null, sales_amount: 1 }),
  ]);
  const before = JSON.stringify(input);
  input.products.forEach(Object.freeze); Object.freeze(input.products); Object.freeze(input);
  const r = buildMonthlySales([input])!;
  assert.equal(r.rateSeries.length, 3);
  assert.equal(r.quantityUnit, 'تن');
  assert.ok(r.rateSeries.every(s => s.quantityUnit === 'تن'));
  assert.equal(JSON.stringify(input), before);
});

test('zero/null quantities and invalid rates keep prior numbers while rate metadata stays null', () => {
  for (const fields of [{ sales_qty: 0, production_qty: 0 }, { sales_rate: 0 },
    { sales_rate: -1 }, { sales_rate: null }, { sales_qty: null }]) {
    const input = unitReport('1405-06-31', [unitProduct(fields)]);
    const r = buildMonthlySales([input])!;
    assert.equal(r.rateSeries[0].points[0].rate, null);
    assert.equal(r.rateSeries[0].points[0].rateUnit, null);
    assert.equal(r.rateSeries[0].points[0].quantityUnit, 'تن');
    if (fields.sales_qty === 0) assert.deepEqual([r.prodVsSales[0].production, r.prodVsSales[0].sales], [0, 0]);
    if (fields.sales_qty === null) {
      assert.equal(r.prodVsSales.length, 1); assert.equal(r.prodVsSales[0].unavailableReason, 'incomplete-quantity');
      assert.equal(r.prodVsSales[0].quantityUnit, null); assert.equal(r.prodVsSales[0].production, null);
    }
  }
});
