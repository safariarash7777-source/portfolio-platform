// تستِ شمارندهٔ مسیرِ قدیمی — «نامرئی» در برابر «دیده‌شده» در برابر «بسته».
import assert from "node:assert/strict";
import { LegacyMeter, LegacyBudgetError, legacyEnforced } from "./brsapi-legacy-meter.mjs";

let pass = 0, fail = 0;
const tests = [];
const t = (n, f) => tests.push([n, f]);

/** بودجهٔ آزمایشی با سقفِ ثابت و همان قراردادِ `ensure`/`reserve`. */
function fakeBudget(cap) {
  return {
    used: 0, ensured: 0,
    async ensure() { this.ensured += 1; },
    reserve() { if (this.used >= cap) return false; this.used += 1; return true; },
  };
}

t("مصرفِ مسیرِ قدیمی در همان بودجه شمرده می‌شود، نه جای دیگر", async () => {
  const b = fakeBudget(10);
  const m = new LegacyMeter(() => b, { enforced: () => false });
  await m.count("nav-bulk", "standard");
  await m.count("nav-bulk", "standard");
  await m.count("fund-meta", "bulk");
  assert.equal(b.used, 3, "هر سه از همان بودجهٔ مشترک کم شد");
  assert.deepEqual(m.snapshot().used, { "nav-bulk": 2, "fund-meta": 1 });
});

t("پیش‌فرض فقط می‌شمارد — رفتارِ امروزِ Production را عوض نمی‌کند", async () => {
  const b = fakeBudget(1);
  const m = new LegacyMeter(() => b, { enforced: () => false });
  await m.count("p", "standard");
  await m.count("p", "standard");            // از سقف رد شد
  await m.count("p", "standard");
  const s = m.snapshot();
  assert.equal(s.enforced, false);
  assert.equal(s.rejected.p, 2, "ردشدن ثبت شد");
  assert.equal(s.overBudgetPassed.p, 2, "ولی درخواست عبور کرد — و همین دیده می‌شود");
});

t("با سوییچِ اجرا، همان مورد رد می‌شود", async () => {
  const b = fakeBudget(1);
  const m = new LegacyMeter(() => b, { enforced: () => true });
  await m.count("p", "standard");
  await assert.rejects(() => m.count("p", "standard"), (e) => e instanceof LegacyBudgetError);
  const s = m.snapshot();
  assert.equal(s.enforced, true);
  assert.equal(s.rejected.p, 1);
  assert.equal(s.overBudgetPassed.p, undefined, "در حالتِ اجرا چیزی «عبورِ اضافه» نیست");
});

t("نبودِ شمارنده پنهان نمی‌شود — خودش یک عدد است", async () => {
  const m = new LegacyMeter(() => null, { enforced: () => false });
  await m.count("p", "standard");
  await m.count("p", "standard");
  const s = m.snapshot();
  assert.equal(s.unmetered, 2, "«این مصرف اصلاً شمرده نشد» باید دیده شود");
  assert.deepEqual(s.used, {}, "و با مصرفِ شمرده‌شده قاطی نمی‌شود");
});

t("قبل از رزرو، اجاره شارژ می‌شود", async () => {
  const b = fakeBudget(5);
  const m = new LegacyMeter(() => b, { enforced: () => false });
  await m.count("p", "standard");
  assert.equal(b.ensured, 1, "بدونِ ensure، بودجهٔ ماندگار هرگز اجاره نمی‌گیرد");
});

t("سوییچِ اجرا از پرچمِ کلاینت جداست", () => {
  assert.equal(legacyEnforced({ BRSAPI_CLIENT_ENABLED: "1" }), false,
    "روشن‌کردنِ پرچمِ کلاینت نباید رد‌کردنِ مسیرِ قدیمی را فعال کند");
  assert.equal(legacyEnforced({ BRSAPI_BUDGET_ENFORCE_LEGACY: "1" }), true);
  assert.equal(legacyEnforced({}), false);
});

t("طبقهٔ بودجه به بودجه منتقل می‌شود، نه اینکه همه standard شوند", async () => {
  const seen = [];
  const b = { async ensure() {}, reserve(cls) { seen.push(cls); return true; } };
  const m = new LegacyMeter(() => b, { enforced: () => false });
  await m.count("a", "critical");
  await m.count("b", "bulk");
  assert.deepEqual(seen, ["critical", "bulk"]);
});

/* ── ماتریسِ حالت‌ها: پرچم × اجرا × انبار ──────────────────────────────────────
 * مأموریت خواسته بود «در حالتِ enforce، خاموش‌شدنِ کلاینت یا خطای ذخیره‌ساز
 * نباید مصرفِ نامحدود بسازد». این چهار تست همان را می‌سنجند.
 */

/** سقفِ درون‌حافظه‌ایِ ساده — همان قراردادِ `reserve`/`snapshot`. */
function fallbackBudget(cap) {
  return {
    used: 0,
    reserve() { if (this.used >= cap) return false; this.used += 1; return true; },
    snapshot() { return { used: this.used, hardCeiling: cap }; },
  };
}

t("انبار نیست + شمارش: مصرف «دیده‌نشده» گزارش می‌شود و عبور می‌کند", async () => {
  const m = new LegacyMeter(() => null, { enforced: () => false, makeFallback: () => fallbackBudget(2) });
  await m.count("a"); await m.count("a"); await m.count("a");
  const s = m.snapshot();
  assert.equal(s.unmetered, 3, "هر سه به‌عنوان نشمرده ثبت شد");
  assert.equal(s.fallback, null, "در حالتِ شمارش نباید سقفِ اضطراری ساخته شود");
});

t("انبار نیست + اجرا: مصرف نامحدود نمی‌شود — سقفِ درون‌فرایندی می‌بندد", async () => {
  const m = new LegacyMeter(() => null, { enforced: () => true, makeFallback: () => fallbackBudget(2) });
  await m.count("a", "critical");
  await m.count("a", "critical");
  await assert.rejects(() => m.count("a", "critical"), LegacyBudgetError,
    "سومی باید رد شود، نه اینکه بی‌صدا عبور کند");
  const s = m.snapshot();
  assert.equal(s.unmetered, 0, "دیگر «نشمرده» نیست — شمرده و بسته شد");
  assert.equal(s.fallback.used, 2);
  assert.equal(s.fallback.calls, 3, "تنزل صریح گزارش می‌شود، پنهان نمی‌ماند");
});

t("انبار نیست + اجرا + بدونِ fallback: هنوز «نشمرده» است، نه ادعای کنترل", async () => {
  const m = new LegacyMeter(() => null, { enforced: () => true });
  await m.count("a");
  const s = m.snapshot();
  assert.equal(s.unmetered, 1);
  assert.equal(s.fallback, null, "نباید وانمود کند سقفی هست");
});

t("انبار برمی‌گردد: تصمیم دوباره با بودجهٔ مشترک گرفته می‌شود", async () => {
  let shared = null;
  const m = new LegacyMeter(() => shared, { enforced: () => true, makeFallback: () => fallbackBudget(1) });
  await m.count("a");                      // انبار نیست → سقفِ اضطراری
  shared = fakeBudget(5);
  await m.count("a"); await m.count("a");  // انبار برگشت → بودجهٔ مشترک
  assert.equal(shared.used, 2, "بعد از بازگشتِ انبار، مرجعِ تصمیم همان است");
});

console.log("brsapi-legacy-meter:");
for (const [n, f] of tests) {
  try { await f(); pass++; console.log(`  ✓ ${n}`); }
  catch (e) { fail++; console.error(`  ✗ ${n}: ${e.message}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
