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

console.log("brsapi-legacy-meter:");
for (const [n, f] of tests) {
  try { await f(); pass++; console.log(`  ✓ ${n}`); }
  catch (e) { fail++; console.error(`  ✗ ${n}: ${e.message}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
