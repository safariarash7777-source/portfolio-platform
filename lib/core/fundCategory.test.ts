import { test } from "node:test";
import assert from "node:assert/strict";
import { fundCategory, countByCategory, FUND_CATEGORIES } from "./fundCategory";
import { FUND_TYPE_VALUES } from "../market-nav";

/** سیزده نوعِ واقعیِ اسنپ‌شاتِ ۱۴۰۵/۰۶/۲۴ با تعدادِ واقعی‌شان. */
const REAL: Array<[string, number]> = [
  ["صندوق سرمایه گذاری در اوراق با درآمدثابت", 92],
  ["صندوق سرمایه گذاری در سهام", 88],
  ["صندوق سرمایه گذاری بخشی", 62],
  ["صندوق کالایی مبتنی بر طلا", 35],
  ["صندوق کالایی مبتنی بر نقره", 14],
  ["صندوق سرمایه گذاری مختلط", 9],
  ["صندوق های سرمایه گذاری اهرمی", 9],
  ["صندوق سرمایه گذاری املاک و مستغلات", 8],
  ["صندوق سرمایه گذاری جسورانه", 4],
  ["صندوق سرمایه گذاری خصوصی", 3],
  ["صندوق س. صندوق در صندوق", 3],
  ["صندوق کالایی کشاورزی", 2],
  ["صندوق های پروژه", 1],
];

test("نوع‌های اصلیِ منبع به دستهٔ درست می‌روند", () => {
  assert.equal(fundCategory("صندوق سرمایه گذاری در اوراق با درآمدثابت"), "درآمد ثابت");
  assert.equal(fundCategory("صندوق سرمایه گذاری در سهام"), "سهامی");
  assert.equal(fundCategory("صندوق سرمایه گذاری بخشی"), "بخشی");
  assert.equal(fundCategory("صندوق کالایی مبتنی بر طلا"), "طلا");
  assert.equal(fundCategory("صندوق های سرمایه گذاری اهرمی"), "اهرمی");
});

test("صندوقِ نقره طلا شمرده نمی‌شود", () => {
  assert.equal(fundCategory("صندوق کالایی مبتنی بر نقره"), "سایر");
  assert.notEqual(fundCategory("صندوق کالایی مبتنی بر نقره"), "طلا");
});

test("نوعِ ناشناخته به سایر می‌رود — بی‌صدا حذف نمی‌شود", () => {
  assert.equal(fundCategory("صندوق سرمایه گذاری جسورانه"), "سایر");
  assert.equal(fundCategory("یک نوعِ کاملاً تازه"), "سایر");
  assert.equal(fundCategory(""), "سایر");
  assert.equal(fundCategory(null), "سایر");
  assert.equal(fundCategory(undefined), "سایر");
});

test("هیچ صندوقی در نگاشت گم نمی‌شود — جمعِ دسته‌ها برابرِ کلِ صندوق‌هاست", () => {
  const rows = REAL.flatMap(([t, n]) => Array.from({ length: n }, () => ({ type: t })));
  assert.equal(rows.length, 330, "کلِ اسنپ‌شات ۳۳۰ صندوق بود");
  const counts = countByCategory(rows);
  const sum = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, 330);
});

test("شمارشِ هر دسته با دادهٔ واقعی می‌خواند", () => {
  const rows = REAL.flatMap(([t, n]) => Array.from({ length: n }, () => ({ type: t })));
  const c = countByCategory(rows);
  assert.equal(c.get("درآمد ثابت"), 92);
  assert.equal(c.get("سهامی"), 88);
  assert.equal(c.get("بخشی"), 62);
  assert.equal(c.get("طلا"), 35);
  assert.equal(c.get("اهرمی"), 9);
  // نقره ۱۴ + مختلط ۹ + املاک ۸ + جسورانه ۴ + خصوصی ۳ + صندوق‌در‌صندوق ۳ + کشاورزی ۲ + پروژه ۱
  assert.equal(c.get("سایر"), 44);
});

test("تفاوتِ فاصله و «صندوق های» نگاشت را نمی‌شکند", () => {
  assert.equal(fundCategory("صندوق  سرمایه گذاری  اهرمی"), "اهرمی");
  assert.equal(fundCategory("اوراق با درآمد ثابت"), "درآمد ثابت");
});

test("دسته‌ها یکتا و «سایر» آخر است", () => {
  assert.equal(new Set(FUND_CATEGORIES).size, FUND_CATEGORIES.length);
  assert.equal(FUND_CATEGORIES[FUND_CATEGORIES.length - 1], "سایر");
});


/* ── مقاومت در برابرِ تغییرِ نگارشِ منبع ──────────────────────────────────── */

test("نگارشِ کوتاه‌ترِ منبع هم درست دسته‌بندی می‌شود", () => {
  // اگر منبع روزی «صندوق کالایی مبتنی بر طلا» را «صندوق طلا» بنویسد، این ۳۵
  // صندوق نباید بی‌صدا به «سایر» بیفتند.
  assert.equal(fundCategory("صندوق طلا"), "طلا");
  assert.equal(fundCategory("صندوق در سهام"), "سهامی");
  assert.equal(fundCategory("صندوق سهامی"), "سهامی");
  assert.equal(fundCategory("صندوق با درآمد ثابت"), "درآمد ثابت");
});

test("نقره هرگز طلا نمی‌شود، با هر نگارشی", () => {
  assert.equal(fundCategory("صندوق کالایی مبتنی بر نقره"), "سایر");
  assert.equal(fundCategory("صندوق نقره"), "سایر");
});

test("نگاشت روی ۱۳ نوعِ واقعی دست‌نخورده می‌ماند", () => {
  const rows = REAL.flatMap(([t, n]) => Array.from({ length: n }, () => ({ type: t })));
  const c = countByCategory(rows);
  assert.equal(c.get("درآمد ثابت"), 92);
  assert.equal(c.get("سهامی"), 88);
  assert.equal(c.get("بخشی"), 62);
  assert.equal(c.get("طلا"), 35);
  assert.equal(c.get("اهرمی"), 9);
  assert.equal(c.get("سایر"), 44);
  assert.equal([...c.values()].reduce((a, b) => a + b, 0), 330);
});

/* ── قراردادِ URL ────────────────────────────────────────────────────────── */

test("مقادیرِ مجازِ ?type= دقیقاً همان دسته‌های واقعی‌اند", () => {
  // `lib/market-nav.ts` این فهرست را برای اعتبارسنجیِ URL نگه می‌دارد. اگر دو
  // فهرست از هم جدا بیفتند، یک دستهٔ واقعی از فیلترِ برگشت می‌افتد (یا برعکس،
  // مقداری مجاز می‌شود که هیچ صندوقی ندارد) — و هیچ‌کدام سر و صدا نمی‌کند.
  assert.deepEqual([...FUND_TYPE_VALUES].sort(), [...FUND_CATEGORIES].sort());
});
