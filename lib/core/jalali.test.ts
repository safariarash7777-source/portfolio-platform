// تست تبدیل جلالی→میلادی — مقادیر مرجع با jdatetime پایتون راستی‌آزمایی شده‌اند.
import { test } from "node:test";
import assert from "node:assert/strict";
import { jalaliYmdToGregorian } from "./jalali";

test("تبدیل‌های مرجع (راستی‌آزمایی‌شده با jdatetime)", () => {
  assert.equal(jalaliYmdToGregorian("1404-04-25"), "2025-07-16");
  assert.equal(jalaliYmdToGregorian("1403-12-30"), "2025-03-20"); // سال کبیسهٔ جلالی
  assert.equal(jalaliYmdToGregorian("1404-06-31"), "2025-09-22");
  assert.equal(jalaliYmdToGregorian("1403-09-30"), "2024-12-20");
  assert.equal(jalaliYmdToGregorian("1405-01-01"), "2026-03-21");
  assert.equal(jalaliYmdToGregorian("1404-12-29"), "2026-03-20");
  assert.equal(jalaliYmdToGregorian("1400-01-01"), "2021-03-21");
});

test("فرمت اسلش هم پذیرفته می‌شود", () => {
  assert.equal(jalaliYmdToGregorian("1404/04/25"), "2025-07-16");
});

test("ورودی نامعتبر → null", () => {
  assert.equal(jalaliYmdToGregorian("abc"), null);
  assert.equal(jalaliYmdToGregorian(""), null);
  assert.equal(jalaliYmdToGregorian("1404-13-01"), null);
  assert.equal(jalaliYmdToGregorian("999-01-01"), null);
});
