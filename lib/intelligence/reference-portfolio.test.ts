import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  describeReferencePortfolio,
  REFERENCE_CONTRACT_V1,
  SLEEVE_KEYS,
  type ReferenceContract,
} from "./reference-portfolio";

/** قراردادِ کامل — فقط برای تست، نه یک تصمیمِ محصول. */
const configured = (): ReferenceContract => ({
  version: "v-test",
  objective: "هدفِ آزمایشی",
  sleeves: [
    { key: "gold", label: "طلا", targetPct: 70, bandPct: { min: 65, max: 75 }, instruments: ["نمونه-الف"] },
    { key: "fixed_income", label: "درآمد ثابت", targetPct: 15, bandPct: { min: 10, max: 20 }, instruments: ["نمونه-ب"] },
    { key: "iranian_equity", label: "سهام ایران", targetPct: 15, bandPct: { min: 10, max: 20 }, instruments: ["نمونه-پ"] },
  ],
  riskBudget: "حداکثر افتِ ۱۵٪",
  rebalanceTrigger: "انحراف بیش از بازه",
});

describe("قراردادِ نسخهٔ ۱ — همان چیزی که مالک گفت", () => {
  test("سه بخش با تخصیصِ ۷۰/۱۵/۱۵", () => {
    const g = REFERENCE_CONTRACT_V1.sleeves.find((s) => s.key === "gold")!;
    const f = REFERENCE_CONTRACT_V1.sleeves.find((s) => s.key === "fixed_income")!;
    const e = REFERENCE_CONTRACT_V1.sleeves.find((s) => s.key === "iranian_equity")!;
    assert.equal(g.targetPct, 70);
    assert.equal(f.targetPct, 15);
    assert.equal(e.targetPct, 15);
  });

  test("جمعِ تخصیص دقیقاً ۱۰۰ است", () => {
    assert.equal(describeReferencePortfolio(REFERENCE_CONTRACT_V1, []).totalPct, 100);
  });

  test("هر سه بخشِ مصوب حاضرند", () => {
    assert.deepEqual(REFERENCE_CONTRACT_V1.sleeves.map((s) => s.key), [...SLEEVE_KEYS]);
  });

  test("هیچ ابزاری حدس زده نشده", () => {
    // «۷۰٪ طلا» تخصیص است؛ «کدام صندوق» تصمیمِ مالک.
    for (const sleeve of REFERENCE_CONTRACT_V1.sleeves) {
      assert.equal(sleeve.instruments.length, 0, `${sleeve.key} نباید ابزارِ حدسی داشته باشد`);
    }
  });

  test("بازه، بودجهٔ ریسک و شرطِ بازتوازن null‌اند، نه «بدونِ محدودیت»", () => {
    assert.equal(REFERENCE_CONTRACT_V1.riskBudget, null);
    assert.equal(REFERENCE_CONTRACT_V1.rebalanceTrigger, null);
    for (const sleeve of REFERENCE_CONTRACT_V1.sleeves) assert.equal(sleeve.bandPct, null);
  });

  test("قرارداد نسخه دارد — تغییرِ تخصیص باید نسخهٔ تازه بسازد", () => {
    assert.ok(REFERENCE_CONTRACT_V1.version.length > 0);
  });
});

describe("fail-closed تا رسیدنِ تصمیمِ مالک", () => {
  test("نسخهٔ ۱ «پیکربندی نشده» است، نه «آماده»", () => {
    const view = describeReferencePortfolio(REFERENCE_CONTRACT_V1, []);
    assert.equal(view.state, "unconfigured");
  });

  test("دقیقاً می‌گوید چه تصمیمی لازم است", () => {
    const view = describeReferencePortfolio(REFERENCE_CONTRACT_V1, []);
    const keys = view.pendingDecisions.map((d) => d.key);
    assert.ok(keys.includes("instrument-map"), "نگاشتِ ابزار");
    assert.ok(keys.includes("bands"), "بازهٔ مجاز");
    assert.ok(keys.includes("risk-budget"), "بودجهٔ ریسک");
    assert.ok(keys.includes("rebalance"), "شرطِ بازتوازن");
    for (const d of view.pendingDecisions) assert.match(d.question, /؟$/, "هر تصمیم یک پرسشِ روشن است");
  });

  test("نسخهٔ نهاییِ ثبت‌شده هم نبودِ ابزار را جبران نمی‌کند", () => {
    // داشتنِ وزن در دیتابیس یعنی کسی عددی ثبت کرده؛ یعنی نمی‌دانیم آن عدد به
    // کدام ابزار اشاره دارد. هنوز قابلِ محاسبه نیست.
    const view = describeReferencePortfolio(REFERENCE_CONTRACT_V1, [
      { assetClass: "gold", weightPct: 70 },
    ]);
    assert.equal(view.state, "unconfigured");
    assert.equal(view.hasFinalizedVersion, true);
  });

  test("قراردادِ کامل بدونِ نسخهٔ نهایی «خالی» است، نه «پیکربندی نشده»", () => {
    const view = describeReferencePortfolio(configured(), []);
    assert.equal(view.pendingDecisions.length, 0);
    assert.equal(view.state, "empty");
    assert.match(view.summary, /نسخهٔ نهایی/);
  });

  test("قراردادِ کامل + نسخهٔ نهایی ⇒ آماده", () => {
    const view = describeReferencePortfolio(configured(), [{ assetClass: "gold", weightPct: 70 }]);
    assert.equal(view.state, "ready");
    assert.equal(view.pendingDecisions.length, 0);
  });
});

describe("زبان و مرزها", () => {
  test("هیچ واژهٔ اجرایی یا توصیه‌ای تولید نمی‌شود", () => {
    const text = JSON.stringify([
      describeReferencePortfolio(REFERENCE_CONTRACT_V1, []),
      describeReferencePortfolio(configured(), [{ assetClass: "gold", weightPct: 70 }]),
    ]);
    for (const banned of ["سیگنال", "توصیه", "بخرید", "بفروشید", "تضمین"]) {
      assert.ok(!text.includes(banned), `واژهٔ ممنوع: ${banned}`);
    }
  });

  test("خلاصه هرگز نبودِ پیکربندی را «آماده» جا نمی‌زند", () => {
    const view = describeReferencePortfolio(REFERENCE_CONTRACT_V1, []);
    assert.doesNotMatch(view.summary, /آماده|کامل است و/);
    assert.match(view.summary, /قابلِ محاسبه نیست/);
  });
});
