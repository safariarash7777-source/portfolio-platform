// تست واحد قرنطینهٔ زیرنمادها (C1 — اخطار رسمی BrsApi) — بدون شبکه.
// اجرا:  node symbols-util.test.mjs
import assert from "node:assert/strict";
import { SUB_TICKER_RE, isSubTicker, isRightsIssue, isMainTicker } from "./symbols-util.mjs";
import { isNavBlacklisted, recordNavResult, navBlacklistStatus } from "./nav-blacklist.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`);
  } catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}

console.log("symbols-util unit tests (C1):");

// ── زیرنماد رقم‌دار ──
t("فملی2 زیرنماد است (رقم لاتین)", () => {
  assert.equal(isSubTicker("فملی2"), true);
});
t("آوند4 زیرنماد است (نماد متوقف — ریشهٔ اخطار BrsApi)", () => {
  assert.equal(isSubTicker("آوند4"), true);
});
t("کگل3 زیرنماد است", () => {
  assert.equal(isSubTicker("کگل3"), true);
});
t("رقم فارسی: خودرو۲ زیرنماد است", () => {
  assert.equal(isSubTicker("خودرو۲"), true);
});
t("رقم عربی: فولاد٤ زیرنماد است", () => {
  assert.equal(isSubTicker("فولاد٤"), true);
});
t("فاصلهٔ انتهایی نادیده گرفته می‌شود: «فملی2 » زیرنماد است", () => {
  assert.equal(isSubTicker("فملی2 "), true);
});

// ── نمادهای اصلی نباید فیلتر شوند ──
t("«آ س پ» فیلتر نمی‌شود (فاصله در وسط نماد)", () => {
  assert.equal(isSubTicker("آ س پ"), false);
  assert.equal(isRightsIssue("آ س پ"), false);
  assert.equal(isMainTicker("آ س پ"), true);
});
t("«فملی» فیلتر نمی‌شود", () => {
  assert.equal(isSubTicker("فملی"), false);
  assert.equal(isMainTicker("فملی"), true);
});
t("«شپنا» و «طلا» نماد اصلی‌اند", () => {
  assert.equal(isMainTicker("شپنا"), true);
  assert.equal(isMainTicker("طلا"), true);
});

// ── حق تقدم ──
t("فملیح حق تقدم شناخته می‌شود", () => {
  assert.equal(isRightsIssue("فملیح"), true);
  assert.equal(isMainTicker("فملیح"), false);
});
t("خودروح حق تقدم است ولی زیرنماد رقم‌دار نیست", () => {
  assert.equal(isRightsIssue("خودروح"), true);
  assert.equal(isSubTicker("خودروح"), false);
});

// ── ورودی‌های مرزی ──
t("رشتهٔ خالی/null/undefined: نه زیرنماد، نه حق تقدم، نه نماد اصلی", () => {
  for (const v of ["", null, undefined, "   "]) {
    assert.equal(isSubTicker(v), false);
    assert.equal(isRightsIssue(v), false);
    assert.equal(isMainTicker(v), false);
  }
});
t("SUB_TICKER_RE همان قاعدهٔ ثبت‌شدهٔ پروژه است", () => {
  assert.equal(SUB_TICKER_RE.source, "[0-9۰-۹٠-٩]$");
});

// ── صف NAV: شبیه‌سازی فیلتر حلقه‌های refreshNavs/refreshNavCompletion ──
t("صف NAV هیچ نماد رقم‌دار یا حق تقدمی ندارد", () => {
  const funds = [
    { id: "طلا", value: 900 },
    { id: "آوند4", value: 800 },   // زیرنماد — باید حذف شود
    { id: "فملی2", value: 700 },   // زیرنماد — باید حذف شود
    { id: "کگل3", value: 600 },    // زیرنماد — باید حذف شود
    { id: "عیار", value: 500 },
    { id: "فملیح", value: 400 },   // حق تقدم — باید حذف شود
    { id: "خودرو۲", value: 300 },  // رقم فارسی — باید حذف شود
    { id: "آ س پ", value: 200 },   // نماد اصلی با فاصله — می‌ماند
  ];
  // همان فیلتر به‌کاررفته در server.mjs (refreshNavs / refreshNavCompletion)
  const queue = funds
    .filter((f) => !isSubTicker(f.id) && !isRightsIssue(f.id) && !isNavBlacklisted(f.id))
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .map((f) => f.id);
  assert.deepEqual(queue, ["طلا", "عیار", "آ س پ"]);
  for (const id of queue) assert.equal(/[0-9۰-۹٠-٩]$/.test(id), false, `نماد رقم‌دار در صف: ${id}`);
});

// ── بلک‌لیست NAV: ۲ دور ناموفق → دائمی ──
t("۲ دور NAV ناموفق → بلک‌لیست دائمی؛ دور موفق شمارنده را صفر می‌کند", () => {
  assert.equal(isNavBlacklisted("تست‌الف"), false);
  recordNavResult("تست‌الف", false);
  assert.equal(isNavBlacklisted("تست‌الف"), false); // هنوز یک دور
  recordNavResult("تست‌الف", false);
  assert.equal(isNavBlacklisted("تست‌الف"), true);  // دور دوم → دائمی
  // نماد دیگری که بعد از یک شکست موفق می‌شود، بلک‌لیست نمی‌شود
  recordNavResult("تست‌ب", false);
  recordNavResult("تست‌ب", true);
  recordNavResult("تست‌ب", false);
  assert.equal(isNavBlacklisted("تست‌ب"), false);
  const st = navBlacklistStatus();
  assert.equal(st.size >= 1, true);
  assert.equal(st.threshold, 2);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
