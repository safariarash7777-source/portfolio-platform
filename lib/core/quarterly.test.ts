// تست‌های T3 — فصل‌سازی ن-۱۰ با تفاضل زنجیره‌ای و P/E TTM.
// همهٔ حالت‌های سخت مشخص‌شده در تسک: حلقهٔ غایب، تقدم حسابرسی‌شده، اصلاحیهٔ متأخر،
// تفاضل منفی (تعدیل)، EPS TTM فقط با ۴ فصل کامل و متوالی.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReportRecord } from "../fundamental/types";
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
    unit: "میلیون ریال",
    scope: "company",
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
  assert.equal(m.get("1403-01|3")!.revenue, 950);
});

test("اصلاحیهٔ متأخر (id بزرگ‌تر) در نسخه‌های هم‌سطح مقدم است", () => {
  const a = rep({ period_end: "1403-03-31", period_months: 3, revenue: 900, audited: false });
  const b = rep({ period_end: "1403-03-31", period_months: 3, revenue: 950, audited: false });
  const m = dedupePeriods([a, b]);
  assert.equal(m.get("1403-01|3")!.revenue, 950);
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

function withRecord(input: QuarterInput, overrides: Partial<ReportRecord> = {}): QuarterInput {
  return { ...input, record: {
    id: input.id, financialPeriodEnd: input.period_end, storedPeriodEnd: null,
    sourceUrl: `https://codal.ir/Reports/Decision.aspx?LetterSerial=${input.id}`,
    publishedAt: "1405/01/01 10:00:00", publishedDateRaw: "۱۴۰۵/۰۱/۰۱", publishedTimeRaw: "۱۰:۰۰:۰۰",
    publishedAtUtc: null, publicationUtcConfidence: "unknown",
    capturedAtRaw: "2026-10-25T13:45:56.894105+03:30", capturedAt: "2026-10-25T10:15:56.894Z",
    parserVersion: null, parserVersionSource: null, amendment: false, ...overrides,
  } };
}

function withoutProvenance<T extends { provenance?: unknown }>(values: T[]) {
  return values.map(value => { const copy = { ...value }; delete copy.provenance; return copy; });
}
const legacyInputs = (inputs: QuarterInput[]) => inputs.map(input => { const copy = { ...input }; delete copy.record; return copy; });

test("quarter provenance follows the actual direct/difference inputs and preserves financial results and source precision", () => {
  const inputs = fullYear(1403, 1000).map(input => withRecord(input));
  const before = structuredClone(inputs), quarters = deriveQuarters(inputs);
  assert.deepEqual(inputs, before);
  assert.deepEqual(withoutProvenance(quarters), deriveQuarters(legacyInputs(inputs)));
  assert.equal(quarters[0].provenance?.amounts.operation, "reported");
  assert.deepEqual(quarters[0].provenance?.amounts.contributors.map(c => [c.role, c.report.id]), [["current", inputs[0].id]]);
  assert.equal(quarters[1].provenance?.amounts.operation, "difference");
  assert.deepEqual(quarters[1].provenance?.amounts.contributors.map(c => [c.role, c.report.id]), [["current", inputs[1].id], ["previous", inputs[0].id]]);
  assert.equal(quarters[1].provenance?.capital?.id, inputs[1].id);
  const source = quarters[1].provenance!.amounts.contributors[0].report;
  assert.equal(source.binding, "matched");assert.equal(source.unit, "میلیون ریال");assert.equal(source.periodMonths, 6);
  assert.deepEqual(source.record, inputs[1].record);
  assert.equal(source.record?.capturedAtRaw, "2026-10-25T13:45:56.894105+03:30");
  assert.equal(source.record?.publishedAtUtc, null);
});

test("legacy callers retain their exact quarterly and TTM output shape without provenance", () => {
  const quarters = deriveQuarters(fullYear(1403, 1000));
  assert.ok(quarters.every(q => !Object.hasOwn(q, "provenance")));
  const ttm = ttmSeries(quarters);assert.equal(ttm.length, 1);
  assert.ok(ttm.every(t => !Object.hasOwn(t, "provenance")));
});

test("unknown, wrong-period and mismatched row metadata never become financial null or a neighboring source", () => {
  const base = fullYear(1403, 1000);
  const cases: Array<[Partial<ReportRecord> | null, string]> = [
    [null, "missing_record"], [{ id: base[3].id }, "identity_mismatch"],
    [{ financialPeriodEnd: null }, "period_mismatch"], [{ financialPeriodEnd: base[3].period_end }, "period_mismatch"],
  ];
  for (const [metadata, binding] of cases) {
    const inputs = base.map(input => withRecord(input));
    inputs[0] = metadata === null ? { ...inputs[0], record: null } : withRecord(base[0], metadata);
    const quarters = deriveQuarters(inputs);
    assert.deepEqual(withoutProvenance(quarters), deriveQuarters(base));
    const source = quarters[1].provenance!.amounts.contributors[1].report;
    assert.equal(source.binding, binding);assert.equal(source.record, null);assert.equal(source.id, base[0].id);
    assert.equal(quarters[1].provenance!.amounts.contributors[0].report.binding, "matched");
  }
});

test("invalid and ambiguous database identities fail closed only for metadata", () => {
  for (const id of [0, -1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const input = withRecord(rep({ id })), q = deriveQuarters([input])[0];
    assert.equal(q.revenue, 100);assert.equal(q.provenance?.amounts.contributors[0].report.binding, "invalid_identity");
    assert.equal(q.provenance?.amounts.contributors[0].report.id, null);
    assert.equal(q.provenance?.amounts.contributors[0].report.record, null);
  }
  const inputs = fullYear(1403, 1000).map(input => withRecord(input));
  inputs[1] = withRecord({ ...inputs[1], id: inputs[0].id });
  const quarters = deriveQuarters(inputs);
  assert.deepEqual(withoutProvenance(quarters), deriveQuarters(legacyInputs(inputs)));
  assert.ok(quarters[1].provenance!.amounts.contributors.every(c => c.report.binding === "ambiguous_identity" && c.report.record === null));
});

test("metadata follows the winning input object, never a discarded newer URL/clock or same-period report", () => {
  const older = withRecord(rep({ audited: true, revenue: 200 }));
  const newer = withRecord(rep({ audited: false, revenue: 999 }), { capturedAtRaw: "2099-01-01T00:00:00Z" });
  const q = deriveQuarters([newer, older])[0];
  assert.equal(q.revenue, 200);assert.equal(q.provenance?.amounts.contributors[0].report.record?.id, older.id);
  assert.notEqual(q.provenance?.amounts.contributors[0].report.record?.capturedAtRaw, newer.record?.capturedAtRaw);
});

test("missing/incompatible links keep unavailable provenance; rejected differences retain the two checked reports", () => {
  const complete = fullYear(1403, 1000).map(input => withRecord(input));
  for (const inputs of [complete.filter(r => r.period_months !== 6), complete.map(r => r.period_months === 6 ? { ...r, scope: "unknown" as const } : r)]) {
    const quarters = deriveQuarters(inputs);
    assert.deepEqual(withoutProvenance(quarters), deriveQuarters(legacyInputs(inputs)));
    assert.equal(quarters[2].provenance?.amounts.operation, "unavailable");
    assert.deepEqual(quarters[2].provenance?.amounts.contributors, []);
    assert.equal(quarters[2].provenance?.capital?.id, complete[2].id);
    assert.equal(ttmSeries(quarters).length, 0);
  }
  const rejected = [complete[0], withRecord({ ...complete[1], revenue: 1 })];
  const q = deriveQuarters(rejected)[1];
  assert.equal(q.adjusted, true);assert.equal(q.netProfit, null);
  assert.equal(q.provenance?.amounts.operation, "rejected_difference");
  assert.deepEqual(q.provenance?.amounts.contributors.map(c => c.report.id), [rejected[1].id, rejected[0].id]);
});

test("TTM retains all four actual quarter calculations, repeated difference contributors, and only final capital", () => {
  const inputs = [...fullYear(1403, 1000), ...fullYear(1404, 1200)].map(input => withRecord(input));
  const quarters = deriveQuarters(inputs), ttm = ttmSeries(quarters);
  assert.deepEqual(withoutProvenance(ttm), ttmSeries(deriveQuarters(legacyInputs(inputs))));
  const first = ttm[0].provenance!, crossYear = ttm[1].provenance!;
  assert.equal(first.netProfit.length, 4);
  assert.deepEqual(first.netProfit.map(q => q.amounts?.contributors.map(c => c.report.id)), [
    [inputs[0].id], [inputs[1].id, inputs[0].id], [inputs[2].id, inputs[1].id], [inputs[3].id, inputs[2].id],
  ]);
  assert.equal(first.capital?.id, inputs[3].id);
  assert.deepEqual(crossYear.netProfit.map(q => q.periodEnd), quarters.slice(1, 5).map(q => q.periodEnd));
  assert.equal(crossYear.capital?.id, inputs[4].id);
  assert.ok(!Object.hasOwn(first, "capturedAt"));assert.ok(!Object.hasOwn(first, "price"));
});

test("TTM preserves legacy/missing contributor slots as unknown without borrowing another quarter's metadata", () => {
  const inputs = fullYear(1403, 1000).map(input => withRecord(input));
  const quarters = deriveQuarters(inputs);delete quarters[1].provenance;
  quarters[3].provenance!.capital = null;
  const point = ttmSeries(quarters)[0];
  assert.equal(point.provenance?.netProfit.length, 4);assert.equal(point.provenance?.netProfit[1].amounts, null);
  assert.equal(point.provenance?.capital, null);assert.ok(point.epsTtm > 0);
});

test("noncalendar fiscal chains keep their own period identities; invalid periods do not gain admission through metadata", () => {
  const ends = ["1403-09-30", "1403-12-29", "1404-03-31", "1404-06-31"];
  const inputs = fullYear(1403, 1000).map((input, index) => withRecord({ ...input, period_end: ends[index] }));
  const quarters = deriveQuarters(inputs), point = ttmSeries(quarters)[0];
  assert.deepEqual(point.provenance?.netProfit.map(q => q.periodEnd), ends);
  assert.equal(point.provenance?.capital?.record?.financialPeriodEnd, ends[3]);
  const invalid = withRecord(rep({ period_end: "unknown" }));
  assert.deepEqual(deriveQuarters([invalid]), []);
  const missing = withRecord(rep({ period_months: 0 }));
  assert.deepEqual(deriveQuarters([missing]), []);
});

test("matched metadata cannot certify nonfinite values, invent margins on zero revenue, or create missing capital", () => {
  for (const patch of [{ revenue: 0 }, { net_profit: NaN }, { gross_profit: Infinity }, { capital: 0 }]) {
    const inputs = fullYear(1403, 1000).map(input => withRecord({ ...input, ...patch }));
    const quarters = deriveQuarters(inputs);
    assert.deepEqual(withoutProvenance(quarters), deriveQuarters(legacyInputs(inputs)));
    assert.deepEqual(withoutProvenance(ttmSeries(quarters)), ttmSeries(deriveQuarters(legacyInputs(inputs))));
    assert.equal(quarters[0].provenance?.amounts.contributors[0].report.binding, "matched");
    if (patch.revenue === 0) assert.equal(quarters[0].netMargin, null);
    if (patch.capital === 0) assert.equal(quarters[0].provenance?.capital, null);
  }
  const inputs = fullYear(1403, 1000).map(input => withRecord(input));delete inputs[0].record;
  const point = ttmSeries(deriveQuarters(inputs))[0];
  assert.equal(point.provenance?.netProfit[0].amounts?.contributors[0].report.binding, "missing_record");
  assert.ok(point.epsTtm > 0);
});
