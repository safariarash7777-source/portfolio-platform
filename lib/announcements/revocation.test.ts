import { strict as assert } from "node:assert";
import test from "node:test";
import { describeRevocationScope, revocationConfirmText } from "./revocation";

test("دامنهٔ لغو، کانال‌های پس‌گرفته‌نشده را صریح نام می‌برد", () => {
  const s = describeRevocationScope();
  assert.ok(s.kept.some((k) => /ایمیل/.test(k)), "ایمیل باید در فهرستِ باقی‌مانده باشد");
  assert.ok(s.kept.some((k) => /تلگرام/.test(k)), "تلگرام باید در فهرستِ باقی‌مانده باشد");
  assert.ok(s.removed.some((k) => /داشبورد/.test(k)));
  assert.ok(s.removed.some((k) => /بات|announcements/.test(k)));
});

test("هیچ کانالی هم‌زمان «برداشته‌شده» و «باقی‌مانده» نیست", () => {
  const s = describeRevocationScope();
  for (const k of s.kept) assert.ok(!s.removed.includes(k), `«${k}» در هر دو فهرست است`);
});

test("متنِ توضیح، پس‌گرفتنِ ایمیل را ادعا نمی‌کند", () => {
  const note = describeRevocationScope().note;
  assert.match(note, /پس گرفته نمی‌شوند/);
  assert.doesNotMatch(note, /حذف شد|پس گرفته شد|بازگردانده شد/);
});

test("تأیید، نامِ اعلامیه را می‌آورد تا اشتباهی دیگری لغو نشود", () => {
  const t = revocationConfirmText("اعلانِ آزمایشی QA");
  assert.match(t, /«اعلانِ آزمایشی QA»/);
  assert.match(t, /پس گرفته نمی‌شوند/);
  assert.match(t, /سابقه/);
});
