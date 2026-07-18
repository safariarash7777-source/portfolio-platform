// تست واحد بک‌فیل کندل (M8-الف) — بدون شبکه، فقط منطق نگاشت.
// اجرا:  node --test candle-backfill.test.mjs
import assert from "node:assert/strict";
import { jalaliYmdToGregorian, jalaliTextToIso } from "./codal.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}

console.log("candle-backfill unit tests:");

// تبدیل جلالی → میلادی (مبنای ستون trade_date)
t("جلالی ۱۴۰۴/۰۴/۲۷ → میلادی 2025-07-18", () => {
  assert.equal(jalaliYmdToGregorian(1404, 4, 27), "2025-07-18");
});
t("جلالی ۱۴۰۳/۱۲/۳۰ (کبیسه) → میلادی معتبر", () => {
  const g = jalaliYmdToGregorian(1403, 12, 30);
  assert.match(g, /^2025-03-2\d$/);
});
t("متن جلالی با ارقام فارسی → ایزو", () => {
  assert.equal(jalaliTextToIso("۱۴۰۴/۰۴/۲۵"), "1404-04-25");
});
t("متن خراب → null", () => {
  assert.equal(jalaliTextToIso("nonsense"), null);
});

// منطق نگاشت کندل — بازتولید محلی همان قواعد ماژول (بدون export اضافی):
// close<=0 حذف؛ تاریخ نامعتبر حذف؛ ریال بدون تبدیل؛ open/high/low در raw.
function mapLike(candles) {
  const out = [];
  for (const c of candles) {
    const iso = jalaliTextToIso(String(c?.date ?? ""));
    if (!iso) continue;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    let gdate = null;
    try { gdate = jalaliYmdToGregorian(m[1], m[2], m[3]); } catch { /* skip */ }
    if (!gdate) continue;
    const close = Number(c.close);
    if (!isFinite(close) || close <= 0) continue;
    out.push({ trade_date: gdate, close, high: Number(c.high) || null });
  }
  return out;
}

t("کندل معتبر نگاشت می‌شود — ریال دست‌نخورده", () => {
  const rows = mapLike([{ date: "1404/04/25", close: 26040, high: 26500, low: 25800, volume: 100 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].close, 26040); // ریال — هیچ تبدیلی
  assert.equal(rows[0].trade_date, "2025-07-16");
});
t("کندل با close صفر یا منفی حذف می‌شود", () => {
  const rows = mapLike([
    { date: "1404/04/25", close: 0 },
    { date: "1404/04/24", close: -5 },
  ]);
  assert.equal(rows.length, 0);
});
t("کندل با تاریخ نامعتبر حذف می‌شود", () => {
  const rows = mapLike([{ date: "bad-date", close: 1000 }]);
  assert.equal(rows.length, 0);
});
// ضدتکرار دیگر با diff سمت کلاینت نیست — مکانیزم خود PostgREST + ایندکس یکتا (فاز ۱۶).
// شکل درخواست درج را از سورس ماژول راستی‌آزمایی می‌کنیم تا رگرسیون نگیرد.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./candle-backfill.mjs", import.meta.url), "utf8");

t("درج با on_conflict=symbol,trade_date انجام می‌شود", () => {
  assert.ok(src.includes("symbol_history?on_conflict=symbol,trade_date"));
});
t("هدر Prefer شامل resolution=ignore-duplicates و return=minimal است", () => {
  assert.ok(src.includes("resolution=ignore-duplicates,return=minimal"));
});
t("existingDates حذف شده (باگ Max Rows دیگر ممکن نیست)", () => {
  assert.ok(!src.includes("existingDates("));
});
t("کد رله فقط INSERT دارد — هیچ UPDATE/DELETE به symbol_history", () => {
  assert.ok(!/method:\s*"(PATCH|DELETE|PUT)"/.test(src));
});
t("مهاجرت v4: پاک کردن failed برای رد دوباره از مسیر ignore-duplicates", () => {
  assert.ok(src.includes("state.schemaV = 4"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
