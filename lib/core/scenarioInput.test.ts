import { strict as assert } from "node:assert";
import test from "node:test";
import { parseNumericField, sumWeights } from "./scenarioInput";

const val = (s: string) => {
  const r = parseNumericField(s);
  return r.state === "ok" ? r.value : r.state;
};

test("خالی با صفر یکی نیست", () => {
  assert.deepEqual(parseNumericField(""), { state: "blank" });
  assert.deepEqual(parseNumericField("   "), { state: "blank" });
  assert.deepEqual(parseNumericField("0"), { state: "ok", value: 0 });
  assert.deepEqual(parseNumericField("۰"), { state: "ok", value: 0 });
});

test("ارقام فارسی و عربی خوانده می‌شوند", () => {
  assert.equal(val("۱۲۳"), 123);
  assert.equal(val("١٢٣"), 123);
  assert.equal(val("۱۲۳۴۵۶۷۸۹۰"), 1234567890);
});

test("جداکنندهٔ اعشار: نقطه، ٫ و / هر سه", () => {
  assert.equal(val("12.5"), 12.5);
  assert.equal(val("۱۲٫۵"), 12.5);
  assert.equal(val("۱۲/۵"), 12.5);
  assert.equal(val("٫۵"), 0.5);
});

test("جداکنندهٔ هزارگان حذف می‌شود، نه اینکه عدد را خراب کند", () => {
  assert.equal(val("1,000,000"), 1_000_000);
  assert.equal(val("۱٬۰۰۰٬۰۰۰"), 1_000_000);
  assert.equal(val("۱ ۰۰۰ ۰۰۰"), 1_000_000);
});

test("عدد منفی با منهای ASCII و یونیکد", () => {
  assert.equal(val("-10"), -10);
  assert.equal(val("−۱۰"), -10);
  assert.equal(val("–۱۰"), -10);
  assert.equal(val("-۱۲٫۵"), -12.5);
});

test("علامت درصد معنا را عوض نمی‌کند", () => {
  assert.equal(val("۲۰٪"), 20);
  assert.equal(val("20%"), 20);
  assert.equal(val("-۱۰٪"), -10);
});

test("ورودیِ نامعتبر با خالی یکی نمی‌شود", () => {
  for (const bad of ["abc", "۱۲٫۳٫۴", "--۱", "۱-", "+-1", "۱۲ ریال", "-", ".", "1e5", "∞"]) {
    const r = parseNumericField(bad);
    assert.equal(r.state, "invalid", `«${bad}» باید نامعتبر باشد، شد ${r.state}`);
  }
});

test("جمع وزن‌ها: خالی صفر حساب می‌شود ولی نامعتبر کلِ جمع را نامعلوم می‌کند", () => {
  const f = (s: string) => parseNumericField(s);
  assert.equal(sumWeights([f("60"), f("30"), f("10")]), 100);
  assert.equal(sumWeights([f("60"), f(""), f("10")]), 70, "خالی هنوز وزنی نگرفته");
  assert.equal(sumWeights([f("60"), f("abc")]), null, "با ورودیِ خراب جمع ادعا نمی‌شود");
});
