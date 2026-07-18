// تست‌های واحد بک‌فیل آرشیو کدال (T4) — بدون شبکه.
import test from "node:test";
import assert from "node:assert/strict";
import { jdateKey, ARCHIVE_DAILY_CAP } from "./codal-archive.mjs";

test("jdateKey: جلالی اسلش‌دار → عدد قابل مقایسه", () => {
  assert.equal(jdateKey("1402/05/12"), 14020512);
  assert.equal(jdateKey("1401/1/1"), 14010101);
});

test("jdateKey: ارقام فارسی و خط‌تیره", () => {
  assert.equal(jdateKey("۱۴۰۳/۱۲/۳۰"), 14031230);
  assert.equal(jdateKey("1404-04-25"), 14040425);
});

test("jdateKey: نامعتبر → null", () => {
  assert.equal(jdateKey(""), null);
  assert.equal(jdateKey(null), null);
  assert.equal(jdateKey("2026-07-18"), null); // میلادی نیست (قرن ۱۳/۱۴ جلالی می‌خواهد)
});

test("مرزهای آرشیو: مقایسهٔ عددی درست کار می‌کند", () => {
  // ن-۳۰ از ۱۴۰۲: اطلاعیهٔ ۱۴۰۱/۱۲/۲۹ باید قدیمی‌تر از مرز باشد
  assert.ok(jdateKey("1401/12/29") < 14020101);
  assert.ok(jdateKey("1402/01/01") >= 14020101);
  // ن-۱۰ از ۱۴۰۱
  assert.ok(jdateKey("1400/12/28") < 14010101);
  assert.ok(jdateKey("1401/01/05") >= 14010101);
});

test("سقف بودجهٔ روزانه صریح و مثبت است", () => {
  assert.ok(Number.isFinite(ARCHIVE_DAILY_CAP));
  assert.ok(ARCHIVE_DAILY_CAP > 0 && ARCHIVE_DAILY_CAP <= 1000);
});
