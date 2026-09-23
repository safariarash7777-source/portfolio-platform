import { strict as assert } from "node:assert";
import test from "node:test";
import { scenarioErrorText, scenarioErrorTexts } from "./scenarioLabels";

test("هر کد خطای موتور جملهٔ فارسی دارد", () => {
  const codes = ["initial-value", "empty-holdings", "holding-id", "weight", "weight-total", "return", "inflation", "numeric-overflow"];
  for (const c of codes) {
    const t = scenarioErrorText(c);
    assert.doesNotMatch(t, /[a-z-]{4,}\)/, `«${c}» به متنِ خام برگشت: ${t}`);
    assert.ok(t.length > 10, `«${c}» جملهٔ کاملی ندارد`);
  }
});

test("کد ناشناخته پنهان نمی‌شود", () => {
  assert.match(scenarioErrorText("brand-new"), /brand-new/);
});

test("weight-total صریح می‌گوید نرمال‌سازی نمی‌کنیم", () => {
  assert.match(scenarioErrorText("weight-total"), /نرمال/);
});

test("کد تکراری یک‌بار نشان داده می‌شود", () => {
  assert.equal(scenarioErrorTexts(["weight", "weight", "return"]).length, 2);
});
