import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dedupKey, reportEvent, performanceEvent, dependentsOf,
  type ReportInput, type PerformanceInput,
} from "./changeRadar";

const REPORT: ReportInput = {
  symbol: "فملی", reportKind: "ن-۳۰", periodEnd: "1405-05-31",
  publishDate: "2026-09-01", sourceUrl: "https://codal.ir/x", isAmendment: false, supersedesKey: null,
  dateKind: "published",
};

const PERF: PerformanceInput = {
  symbol: "فملی", metric: "monthly_sales", period: "1405-05",
  current: 130, baseline: 100, baselineLabel: "میانگینِ سه ماهِ قبل",
  unit: "میلیون ریال", eventDate: "2026-09-01", dateKind: "captured", sourceUrl: null, thresholdPercent: 20,
};

/* ── سه رویداد از هم جدا می‌مانند ─────────────────────────────────────────── */

test("گزارشِ تازه و اصلاحیه دو رویدادِ متفاوت‌اند، نه یک هشدار", () => {
  const fresh = reportEvent(REPORT)!;
  const amend = reportEvent({ ...REPORT, isAmendment: true, publishDate: "2026-09-04" })!;
  assert.equal(fresh.kind, "new_report");
  assert.equal(amend.kind, "amendment");
  assert.notEqual(fresh.dedupKey, amend.dedupKey);
});

test("هر رویداد مبنا، تاریخ، منبع و علتِ اهمیت دارد", () => {
  const e = reportEvent(REPORT)!;
  assert.equal(e.eventDate, "2026-09-01");
  assert.equal(e.sourceUrl, "https://codal.ir/x");
  assert.ok(e.significance.length >= 10, "علتِ اهمیت اجباری است");
  assert.equal(e.basis.report_kind, "ن-۳۰");
  assert.equal(e.basis.period_end, "1405-05-31");
});

test("تغییرِ عملکرد مقدار و واحد دارد؛ گزارشِ تازه ندارد و null است نه صفر", () => {
  assert.equal(reportEvent(REPORT)!.changeValue, null);
  const p = performanceEvent(PERF).event!;
  assert.equal(p.changeValue, 30);
  assert.equal(p.changeUnit, "percent");
});

/* ── ایده‌مپوتنسی: پردازشِ تکراری هشدارِ تکراری نمی‌سازد ──────────────────── */

test("پردازشِ دوباره دقیقاً همان کلید را می‌دهد", () => {
  assert.equal(reportEvent(REPORT)!.dedupKey, reportEvent({ ...REPORT })!.dedupKey);
  assert.equal(performanceEvent(PERF).event!.dedupKey, performanceEvent({ ...PERF }).event!.dedupKey);
});

test("کلیدِ گزارشِ عادی به تاریخِ انتشار وابسته نیست", () => {
  // همان اطلاعیه، دیده‌شده در روزِ دیگر — نباید رویدادِ تازه بسازد
  const a = reportEvent(REPORT)!;
  const b = reportEvent({ ...REPORT, publishDate: "2026-09-03" })!;
  assert.equal(a.dedupKey, b.dedupKey);
});

test("کلیدِ تغییرِ عملکرد به مقدار وابسته نیست — بازمحاسبهٔ جزئی تکرار نمی‌سازد", () => {
  const a = performanceEvent(PERF).event!;
  const b = performanceEvent({ ...PERF, current: 131 }).event!;
  assert.equal(a.dedupKey, b.dedupKey);
});

test("فاصله و حروفِ بزرگ کلیدِ متفاوت نمی‌سازند", () => {
  assert.equal(dedupKey("new_report", ["  فملی ", "ن-۳۰"]), dedupKey("new_report", ["فملی", "ن-۳۰"]));
  assert.equal(dedupKey("new_report", ["ABC"]), dedupKey("new_report", ["abc"]));
});

test("دورهٔ متفاوت رویدادِ متفاوت است", () => {
  const a = reportEvent(REPORT)!;
  const b = reportEvent({ ...REPORT, periodEnd: "1405-06-31" })!;
  assert.notEqual(a.dedupKey, b.dedupKey);
});

/* ── چهار علتِ «رویداد نساز»، از هم تفکیک‌شده ──────────────────────────────── */

test("مقدارِ ناموجود: علتش برگردانده می‌شود، نه یک null خاموش", () => {
  assert.equal(performanceEvent({ ...PERF, current: null }).skipped, "missing_current");
  assert.equal(performanceEvent({ ...PERF, baseline: null }).skipped, "missing_baseline");
  assert.equal(performanceEvent({ ...PERF, current: NaN }).skipped, "missing_current");
});

test("مبنای صفر رویدادِ بی‌نهایت نمی‌سازد", () => {
  const r = performanceEvent({ ...PERF, baseline: 0, current: 500 });
  assert.equal(r.event, null);
  assert.equal(r.skipped, "zero_baseline", "رشدِ بی‌نهایت رویداد نیست، نامعلوم است");
});

test("زیرِ آستانه رویداد نمی‌سازد، و مرز دقیق است", () => {
  assert.equal(performanceEvent({ ...PERF, current: 119 }).skipped, "below_threshold");
  assert.equal(performanceEvent({ ...PERF, current: 120 }).skipped, null, "دقیقاً روی آستانه عبور می‌کند");
});

test("مبنای منفی: درصد با قدرمطلقِ مبنا حساب می‌شود", () => {
  const e = performanceEvent({ ...PERF, baseline: -100, current: -50 }).event!;
  assert.equal(e.changeValue, 50, "از −۱۰۰ به −۵۰ یعنی +۵۰٪ نسبت به اندازهٔ مبنا");
});

/* ── واحد ─────────────────────────────────────────────────────────────────── */

test("واحدِ سنجه در مبنا ثبت می‌شود و تغییرش رویداد را عوض می‌کند", () => {
  const rial = performanceEvent(PERF).event!;
  const toman = performanceEvent({ ...PERF, unit: "میلیون تومان" }).event!;
  assert.equal(rial.basis.unit, "میلیون ریال");
  assert.equal(toman.basis.unit, "میلیون تومان");
  // ⚠️ کلید عمداً به واحد وابسته نیست: تغییرِ واحد یک تصمیمِ ماست، نه رویدادِ
  // بازار. اگر واحد عوض شود، مبنا آن را ثبت می‌کند تا مقایسهٔ تاریخی گمراه نشود.
  assert.equal(rial.dedupKey, toman.dedupKey);
});

/* ── وابسته‌های اصلاحیه ───────────────────────────────────────────────────── */

test("اصلاحیهٔ ن-۱۰ محاسبه‌های فصلی و حاشیه و P/E را برای بازبینی علامت می‌زند", () => {
  const f = dependentsOf("ن-۱۰", "فملی", "1405-03-31");
  assert.deepEqual(f.map((x) => x.dependentKind).sort(), ["margins", "pe_ttm", "quarterly"]);
});

test("اصلاحیهٔ ن-۳۰ محاسبه‌های ماهانه و نرخ و کارتِ بنیادی را علامت می‌زند", () => {
  const f = dependentsOf("ن-۳۰", "فملی", "1405-05-31");
  assert.deepEqual(f.map((x) => x.dependentKind).sort(), ["fundamental_card", "monthly_rate", "monthly_sales"]);
});

test("نوعِ ناشناخته وابسته‌ای نمی‌سازد، و وابستهٔ حدسی هم نمی‌سازد", () => {
  assert.deepEqual(dependentsOf("ن-۹۹", "فملی", null), []);
});

/* ── ورودیِ ناقص ─────────────────────────────────────────────────────────── */

test("گزارشِ بدونِ نماد یا نوع یا تاریخ رویداد نمی‌سازد", () => {
  assert.equal(reportEvent({ ...REPORT, symbol: "  " }), null);
  assert.equal(reportEvent({ ...REPORT, reportKind: "" }), null);
  assert.equal(reportEvent({ ...REPORT, publishDate: "" }), null);
});

/* ── جنسِ تاریخ — یافتهٔ بازبینی (`B-031`) ────────────────────────────────── */

test("جنسِ تاریخ همراهِ رویداد می‌آید و حدسی نیست", () => {
  const published = reportEvent({ ...REPORT, dateKind: "published" })!;
  const captured = reportEvent({ ...REPORT, dateKind: "captured" })!;
  assert.equal(published.eventDateKind, "published");
  assert.equal(captured.eventDateKind, "captured");
});

test("جنسِ تاریخ کلید را عوض نمی‌کند — همان اطلاعیه است، نه رویدادِ تازه", () => {
  // اگر روزی `published_at` پر شود، همان اطلاعیه نباید دوباره هشدار بسازد.
  assert.equal(
    reportEvent({ ...REPORT, dateKind: "published" })!.dedupKey,
    reportEvent({ ...REPORT, dateKind: "captured" })!.dedupKey,
  );
});

test("تغییرِ عملکرد هم جنسِ تاریخش را حمل می‌کند", () => {
  assert.equal(performanceEvent({ ...PERF, dateKind: "captured" }).event!.eventDateKind, "captured");
});
