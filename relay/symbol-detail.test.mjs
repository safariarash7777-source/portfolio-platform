// تستِ بودجه‌آگاهیِ چرخش و کرانِ کش — بدونِ شبکه.
// اجرا:  node relay/symbol-detail.test.mjs
import assert from "node:assert/strict";
import { rotationBudgetForCycle, msUntilTehranMidnight } from "./symbol-detail.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const CYCLE = 5 * 60 * 1000;
const DAY = 86_400_000;

/** شبیه‌سازیِ یک روزِ کامل با بودجهٔ مشخص. */
function simulate(cap, cycles = 288, cycleMs = CYCLE) {
  let credit = 0, total = 0;
  const perCycle = [];
  for (let c = 0; c < cycles; c++) {
    const r = rotationBudgetForCycle({
      remaining: cap - total, msLeft: DAY - c * cycleMs, cycleMs, credit,
    });
    credit = r.credit; total += r.take; perCycle.push(r.take);
  }
  return { total, perCycle };
}

console.log("symbol-detail — بودجهٔ چرخش:");

t("کلِ بودجهٔ روز مصرف می‌شود، نه کمتر", () => {
  const { total } = simulate(500);
  assert.equal(total, 500, `مصرف ${total} از ۵۰۰ — انباشتِ اعشاری نباید سهمیه را هدر بدهد`);
});

t("بودجه در کلِ روز پخش می‌شود، نه در ساعاتِ اول", () => {
  // نقصِ نسخهٔ قبل: ۶ تا در هر چرخه ⇒ ۵۰۰ تا در ۸۴ چرخه (~۷ ساعت) تمام می‌شد.
  const { perCycle } = simulate(500);
  const first7h = perCycle.slice(0, 84).reduce((a, b) => a + b, 0);
  assert.ok(first7h < 200, `در ۷ ساعتِ اول ${first7h} مصرف شد — باید خیلی کمتر از ۵۰۰ باشد`);
  const last7h = perCycle.slice(-84).reduce((a, b) => a + b, 0);
  assert.ok(last7h > 100, `در ۷ ساعتِ آخر ${last7h} مصرف شد — بودجه نباید زودتر تمام شده باشد`);
});

t("هیچ چرخه‌ای از سقفِ انفجار بالاتر نمی‌رود", () => {
  const { perCycle } = simulate(500);
  assert.ok(Math.max(...perCycle) <= 6, `بیشینهٔ چرخه ${Math.max(...perCycle)} — سقف ۶ است`);
});

t("بودجهٔ تمام‌شده صفر می‌دهد، نه عددِ منفی", () => {
  const r = rotationBudgetForCycle({ remaining: 0, msLeft: DAY / 2, cycleMs: CYCLE, credit: 3 });
  assert.deepEqual(r, { take: 0, credit: 0 });
  const neg = rotationBudgetForCycle({ remaining: -5, msLeft: DAY / 2, cycleMs: CYCLE, credit: 0 });
  assert.equal(neg.take, 0);
});

t("در پایانِ روز بودجهٔ باقی‌مانده حبس نمی‌شود", () => {
  // یک چرخه تا نیمه‌شب مانده و ۴ درخواست باقی است ⇒ باید همان چرخه خرج شود.
  const r = rotationBudgetForCycle({ remaining: 4, msLeft: CYCLE, cycleMs: CYCLE, credit: 0 });
  assert.equal(r.take, 4);
});

t("سقفِ انفجار حتی با بودجهٔ زیاد رعایت می‌شود", () => {
  const r = rotationBudgetForCycle({ remaining: 500, msLeft: CYCLE, cycleMs: CYCLE, credit: 0 });
  assert.equal(r.take, 6, "آخرین چرخه هم نباید ۵۰۰ درخواست یک‌جا بفرستد");
});

t("بودجهٔ کوچک‌تر از یک در چرخه نه گم می‌شود، نه به آخرِ روز می‌افتد", () => {
  // ۱۰۰ در روز = ۰٫۳۵ در هر چرخه. بدونِ انباشتِ اعشاری، `floor` تا وقتی
  // `cyclesLeft > remaining` نشود صفر می‌دهد — یعنی کلِ بودجه به **یک‌سومِ
  // آخرِ روز** می‌افتد. جمعِ کل در هر دو حالت ۱۰۰ است، پس فقط سنجیدنِ جمع
  // این نقص را نمی‌گیرد؛ **توزیع** باید سنجیده شود.
  const { total, perCycle } = simulate(100);
  assert.equal(total, 100, `مصرف ${total} از ۱۰۰`);
  const firstThird = perCycle.slice(0, 96).reduce((a, b) => a + b, 0);
  assert.ok(firstThird >= 25,
    `در یک‌سومِ اولِ روز فقط ${firstThird} مصرف شد — بودجه باید از ابتدا جاری باشد`);
});

t("msUntilTehranMidnight در بازهٔ معتبر است", () => {
  const ms = msUntilTehranMidnight(new Date("2026-09-10T12:00:00Z"));
  assert.ok(ms > 0 && ms <= DAY, `مقدار ${ms} خارج از بازه`);
  // ۱۲:۰۰ UTC = ۱۵:۳۰ تهران ⇒ ۸٫۵ ساعت تا نیمه‌شب
  assert.ok(Math.abs(ms - 8.5 * 3600_000) < 60_000, `${ms / 3600000} ساعت، انتظار ۸٫۵`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
