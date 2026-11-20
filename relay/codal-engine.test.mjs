// تست‌های واحد موتور کدال v3 — بدون شبکه و بدون درج در دیتابیس.
// اجرا: node relay/codal-engine.test.mjs
import assert from "node:assert";
import { classifyAnnouncement } from "./codal.mjs";
import { feedCategory, sentKey } from "./codal-engine.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}

console.log("codal-engine unit tests:");

t("sentKey: تاریخ+ساعت فارسی به کلید عددی مرتب‌شونده", () => {
  const a = { date_send: "۱۴۰۵/۰۴/۲۵", time_send: "۲۱:۲۶:۳۸" };
  assert.equal(sentKey(a), 14050425212638);
});
t("sentKey: بدون ساعت — صفر پُر می‌شود", () => {
  assert.equal(sentKey({ date_send: "۱۴۰۵/۰۴/۲۵" }), 14050425000000);
});
t("sentKey: ترتیب درست بین دو اطلاعیه", () => {
  const older = sentKey({ date_send: "۱۴۰۵/۰۴/۲۴", time_send: "۲۳:۵۹:۵۹" });
  const newer = sentKey({ date_send: "۱۴۰۵/۰۴/۲۵", time_send: "۰۰:۰۰:۰۱" });
  assert.ok(newer > older);
});
t("sentKey: ورودی خراب → 0", () => {
  assert.equal(sentKey({}), 0);
  assert.equal(sentKey({ date_send: "نامشخص" }), 0);
});
t("classify: ن-۳۰ ماهانه", () => {
  assert.equal(classifyAnnouncement({ title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۳/۳۱" }), "ن-۳۰");
});
t("classify: ن-۱۰ صورت مالی", () => {
  assert.equal(classifyAnnouncement({ title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ (حسابرسی شده)" }), "ن-۱۰");
});
t("classify: پورتفوی رد می‌شود", () => {
  assert.equal(classifyAnnouncement({ title: "صورت‌های مالی پورتفوی سرمایه‌گذاری‌ها" }), null);
});
t("classify: مجمع/آگهی رد می‌شود", () => {
  assert.equal(classifyAnnouncement({ title: "آگهی دعوت به مجمع عمومی عادی سالیانه" }), null);
});

// M4 — دستهٔ فید عمومی کدال (codal_feed.category)
t("feedCategory: ن-۳۰ → ماهانه", () => {
  assert.equal(feedCategory({ code: "ن-۳۰", title: "گزارش فعالیت ماهانه" }), "ماهانه");
});
t("feedCategory: ن-۱۰ → صورت مالی", () => {
  assert.equal(feedCategory({ code: "ن-۱۰", title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹" }), "صورت مالی");
});
t("feedCategory: شفاف‌سازی از عنوان", () => {
  assert.equal(feedCategory({ code: "ن-۲۰", title: "شفاف سازی در خصوص نوسان قیمت سهام" }), "شفاف‌سازی");
});
t("feedCategory: مجمع", () => {
  assert.equal(feedCategory({ code: "ن-۴۱", title: "آگهی دعوت به مجمع عمومی عادی سالیانه" }), "مجمع");
});
t("feedCategory: ناشناخته → سایر", () => {
  assert.equal(feedCategory({ code: "", title: "معرفی یا تغییر در ترکیب اعضای هیئت مدیره" }), "سایر");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
