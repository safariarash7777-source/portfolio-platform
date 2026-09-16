// پلِ حساب حق ندارد چیزی بگوید که سرور نگفته.
//
// دو محور اینجا با هم اشتباه گرفته می‌شوند: `standing` می‌گوید **چرا** کاربر
// در این وضعیت است، و `level` می‌گوید **چه چیزی فعال نیست**. تستِ زیر هر دو را
// جدا نگه می‌دارد — مخصوصاً `standing === null` که یعنی «نتوانستیم بفهمیم».
import { strict as assert } from "node:assert";
import test from "node:test";
import type { AccessInfo } from "@/lib/access";
import { accountSubtitle } from "./accountSubtitle";

const access = (o: Partial<AccessInfo>): AccessInfo => ({
  level: "registered",
  via: null,
  expiresAt: null,
  standing: null,
  standingSince: null,
  userId: "u1",
  email: "a@b.c",
  ...o,
});

test("دسترسی کامل: تاریخِ انقضا وقتی هست نشان داده می‌شود، وقتی نیست ادعا نمی‌شود", () => {
  const withDate = accountSubtitle(access({ level: "full", via: "manual", expiresAt: "2026-12-01T00:00:00.000Z" }));
  assert.match(withDate, /دسترسی کامل فعال است/);
  assert.match(withDate, /·/, "تاریخ باید بیاید");

  const noDate = accountSubtitle(access({ level: "full", via: "admin", expiresAt: null }));
  assert.equal(noDate, "دسترسی کامل فعال است.");
  assert.doesNotMatch(noDate, /·/, "بدونِ expiresAt هیچ تاریخی ساخته نمی‌شود");
});

test("مهمان: دربارهٔ حسابی که ندارد چیزی ادعا نمی‌شود", () => {
  const t = accountSubtitle(access({ level: "visitor", userId: null, email: null }));
  assert.doesNotMatch(t, /حساب شما فعال است/);
  assert.doesNotMatch(t, /پایان رسیده|لغو|ثبت شده/);
});

test("منقضی با «هیچ‌وقت نداشته» یکی نمی‌شود", () => {
  const expired = accountSubtitle(access({ standing: "expired", standingSince: "2026-09-01T00:00:00.000Z" }));
  const never = accountSubtitle(access({ standing: "never" }));
  assert.notEqual(expired, never);
  assert.match(expired, /به پایان رسیده/);
  assert.doesNotMatch(never, /به پایان رسیده/);
});

test("هر وضعیتِ registered می‌گوید دسترسی کامل فعال نیست", () => {
  for (const standing of ["expired", "revoked", "scheduled", "never", null] as const) {
    const t = accountSubtitle(access({ standing }));
    assert.match(
      t,
      /دسترسی(ِ)? کامل(ِ شما)? (هنوز )?(فعال نیست|فعال نشده است|لغو شده است|به پایان رسیده است|ثبت شده)/,
      `«${standing}» باید نبودِ دسترسیِ کامل را صریح بگوید — متن: ${t}`,
    );
  }
});

test("standing نامعلوم دربارهٔ سابقهٔ کاربر ساکت می‌ماند", () => {
  const t = accountSubtitle(access({ standing: null }));
  assert.doesNotMatch(t, /به پایان رسیده|لغو شده|هنوز فعال نشده/,
    "`null` یعنی نخواندیم — نه منقضی، نه تازه‌وارد");
  assert.match(t, /دسترسی کامل فعال نیست/);
});

test("بدونِ standingSince تاریخِ ساختگی درست نمی‌شود", () => {
  for (const standing of ["expired", "revoked", "scheduled"] as const) {
    const t = accountSubtitle(access({ standing, standingSince: null }));
    assert.doesNotMatch(t, /\d/, `«${standing}» بدونِ تاریخ نباید رقمی چاپ کند — متن: ${t}`);
  }
});
