import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageMinutes,
  classifyFreshness,
  classifyQueryError,
  rollup,
  classifyEnv,
  classifyPaymentConsistency,
  classifyLeadReadiness,
  STATE_LABEL,
  type HealthSignal,
} from "./status";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString();

// ── ageMinutes ──────────────────────────────────────────────────────────────

test("ageMinutes: null/undefined/empty → null", () => {
  assert.equal(ageMinutes(null, NOW), null);
  assert.equal(ageMinutes(undefined, NOW), null);
  assert.equal(ageMinutes("", NOW), null);
});

test("ageMinutes: تاریخِ نامعتبر → null، نه NaN", () => {
  assert.equal(ageMinutes("not-a-date", NOW), null);
});

test("ageMinutes: محاسبهٔ درست و کفِ صفر برای زمانِ آینده", () => {
  assert.equal(ageMinutes(minutesAgo(0), NOW), 0);
  assert.equal(ageMinutes(minutesAgo(90), NOW), 90);
  // ساعتِ ناهماهنگ نباید سنِ منفی بسازد
  const future = new Date(NOW.getTime() + 60 * 60000).toISOString();
  assert.equal(ageMinutes(future, NOW), 0);
});

test("ageMinutes: Date و رشته یکسان رفتار می‌کنند", () => {
  const d = new Date(NOW.getTime() - 45 * 60000);
  assert.equal(ageMinutes(d, NOW), 45);
  assert.equal(ageMinutes(d.toISOString(), NOW), 45);
});

// ── classifyFreshness ───────────────────────────────────────────────────────

const TH = { okWithinMinutes: 60, staleWithinMinutes: 24 * 60 };

test("classifyFreshness: تازه → ok", () => {
  assert.deepEqual(classifyFreshness(minutesAgo(10), TH, NOW), { state: "ok", age: 10 });
});

test("classifyFreshness: مرزها شامل‌اند (<=)", () => {
  assert.equal(classifyFreshness(minutesAgo(60), TH, NOW).state, "ok");
  assert.equal(classifyFreshness(minutesAgo(61), TH, NOW).state, "stale");
  assert.equal(classifyFreshness(minutesAgo(1440), TH, NOW).state, "stale");
  assert.equal(classifyFreshness(minutesAgo(1441), TH, NOW).state, "failed");
});

test("classifyFreshness: نبودِ timestamp → unknown، نه failed", () => {
  // «هرگز اجرا نشده» با «اجرا شد و شکست» یکی نیست.
  assert.deepEqual(classifyFreshness(null, TH, NOW), { state: "unknown", age: null });
});

// ── rollup ──────────────────────────────────────────────────────────────────

const sig = (state: HealthSignal["state"]): HealthSignal => ({
  key: "k",
  label: "l",
  state,
  detail: "d",
});

test("rollup: بدونِ سیگنال → unknown، نه ok", () => {
  // سیستمی که هیچ سیگنالی ندارد نمی‌تواند ادعای سلامت کند.
  assert.equal(rollup([]), "unknown");
});

test("rollup: همه سالم → ok", () => {
  assert.equal(rollup([sig("ok"), sig("ok")]), "ok");
});

test("rollup: بدترین وضعیت برنده است", () => {
  assert.equal(rollup([sig("ok"), sig("stale")]), "stale");
  assert.equal(rollup([sig("ok"), sig("unknown")]), "unknown");
  assert.equal(rollup([sig("ok"), sig("failed")]), "failed");
});

test("rollup: unknown از stale بدتر است ولی از failed بهتر", () => {
  // دادهٔ بیاتِ دیده‌شده از سیگنالِ نابینا کم‌خطرتر است؛
  // ولی خرابیِ قطعی از هر دو بدتر.
  assert.equal(rollup([sig("stale"), sig("unknown")]), "unknown");
  assert.equal(rollup([sig("unknown"), sig("failed")]), "failed");
});

// ── classifyEnv ─────────────────────────────────────────────────────────────

test("classifyEnv: همه حاضر → ok", () => {
  const s = classifyEnv([{ key: "A", present: true }, { key: "B", present: true }]);
  assert.equal(s.state, "ok");
});

test("classifyEnv: متغیرِ اجباریِ غایب → failed و نامش در متن", () => {
  const s = classifyEnv([
    { key: "SUPABASE_SERVICE_ROLE_KEY", present: false },
    { key: "B", present: true },
  ]);
  assert.equal(s.state, "failed");
  assert.match(s.detail, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("classifyEnv: فقط اختیاریِ غایب → stale نه failed", () => {
  const s = classifyEnv([{ key: "A", present: true }], [{ key: "OPT", present: false }]);
  assert.equal(s.state, "stale");
  assert.match(s.detail, /OPT/);
});

test("classifyEnv: هیچ مقداری در خروجی نیست — فقط نام", () => {
  // ورودیِ این تابع اصلاً مقدار ندارد؛ این تست قرارداد را قفل می‌کند.
  const s = classifyEnv([{ key: "SECRET_THING", present: false }]);
  assert.ok(!JSON.stringify(s).includes("present\":true"));
  assert.match(s.detail, /SECRET_THING/);
});

// ── classifyPaymentConsistency ──────────────────────────────────────────────

test("پرداخت: همه دسترسی دارند → ok", () => {
  const s = classifyPaymentConsistency({ paidCount: 12, paidWithoutEntitlement: 0 });
  assert.equal(s.state, "ok");
});

test("پرداخت: حتی یک موردِ بدونِ دسترسی → failed (آستانه ندارد)", () => {
  const s = classifyPaymentConsistency({ paidCount: 12, paidWithoutEntitlement: 1 });
  assert.equal(s.state, "failed");
  assert.match(s.detail, /۱|1/);
});

test("پرداخت: شمارشِ انجام‌نشده → unknown نه ok", () => {
  assert.equal(classifyPaymentConsistency(null).state, "unknown");
});

test("پرداخت: صفر پرداخت و صفر ناسازگاری → ok", () => {
  assert.equal(
    classifyPaymentConsistency({ paidCount: 0, paidWithoutEntitlement: 0 }).state,
    "ok"
  );
});

// ── classifyLeadReadiness ───────────────────────────────────────────────────

test("لید: جدول نیست → stale با متنِ صریح، نه failed", () => {
  // migration عمداً اجرا نشده؛ این خرابی نیست، ولی سلامت هم نیست.
  const s = classifyLeadReadiness(false);
  assert.equal(s.state, "stale");
  assert.match(s.detail, /phase8b_leads/);
});

test("لید: جدول هست → ok", () => {
  assert.equal(classifyLeadReadiness(true).state, "ok");
});

test("لید: بررسی نشد → unknown", () => {
  assert.equal(classifyLeadReadiness(null).state, "unknown");
});

// ── قرارداد ─────────────────────────────────────────────────────────────────

test("هر چهار حالت برچسبِ فارسی دارند", () => {
  for (const k of ["ok", "stale", "failed", "unknown"] as const) {
    assert.ok(STATE_LABEL[k].length > 0);
  }
});

// ── طبقه‌بندیِ خطای پرس‌وجو — `P2-G2-011` ────────────────────────────────────

test("کدِ 42P01 جدولِ ناموجود است و 42703 ستونِ ناموجود", () => {
  assert.equal(classifyQueryError("42P01", "relation ... does not exist"), "missing_table");
  assert.equal(classifyQueryError("42703", "column ... does not exist"), "missing_column");
});

test("بدونِ کد هم ستونِ ناموجود با جدولِ ناموجود اشتباه نمی‌شود", () => {
  // این همان باگ بود: هر دو پیام شاملِ «does not exist»‌اند، و تشخیصِ قبلی
  // فقط همان عبارت را می‌دید. پس ستونِ اشتباهِ کدِ خودمان «جدول پیدا نشد»
  // گزارش می‌شد و اپراتور را دنبالِ مشکلی می‌فرستاد که وجود نداشت.
  assert.equal(
    classifyQueryError(null, 'column ir_market_snapshots.created_at does not exist'),
    "missing_column"
  );
  assert.equal(
    classifyQueryError(null, 'relation "public.leads" does not exist'),
    "missing_table"
  );
});

test("خطای نامرتبط هیچ‌کدام از آن دو نیست", () => {
  assert.equal(classifyQueryError("57014", "canceling statement due to statement timeout"), "other");
  assert.equal(classifyQueryError(null, null), "other");
});
