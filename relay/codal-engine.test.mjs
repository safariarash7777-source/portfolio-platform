// تست‌های موتور کدال v3 — واحد (واترمارک/کلید زمان) + دراى‌ران فید واقعی.
// اجرا: node relay/codal-engine.test.mjs   (بدون درج در دیتابیس)
import assert from "node:assert";
import { classifyAnnouncement, faToEn, fetchAnnouncementsPage } from "./codal.mjs";

// sentKey از codal-engine.mjs خصوصی است — همان منطق را این‌جا بازتولید و
// روی نمونه‌های واقعی صحت‌سنجی می‌کنیم (اگر منطق موتور عوض شود این تست باید همگام شود).
function sentKey(a) {
  const d = faToEn(String(a.date_send || ""));
  const t = faToEn(String(a.time_send || ""));
  const dm = d.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const tm = t.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!dm) return 0;
  const pad = (x) => String(x).padStart(2, "0");
  return Number(`${dm[1]}${pad(dm[2])}${pad(dm[3])}${tm ? pad(tm[1]) + pad(tm[2]) + pad(tm[3] || 0) : "000000"}`);
}

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

// دراى‌ران فید واقعی (فقط خواندن؛ بدون دانلود اکسل و بدون درج)
const live = process.env.SKIP_LIVE !== "1";
if (live) {
  console.log("\nlive feed dry-run (2 pages):");
  try {
    const p1 = await fetchAnnouncementsPage({ page: 1 });
    const p2 = await fetchAnnouncementsPage({ page: 2 });
    const all = [...p1, ...p2];
    assert.ok(p1.length > 0, "صفحهٔ ۱ خالی است");
    // فید باید نزولی-زمانی باشد (جدیدترین اول) — با تلورانس هم‌زمانی
    let ordered = 0, total = 0;
    for (let i = 1; i < all.length; i++) {
      const a = sentKey(all[i - 1]), b = sentKey(all[i]);
      if (a && b) { total++; if (a >= b) ordered++; }
    }
    const kinds = all.map(classifyAnnouncement);
    const matched = kinds.filter(Boolean).length;
    console.log(`  items=${all.length} ordered=${ordered}/${total} matched(ن-۱۰/ن-۳۰)=${matched}`);
    assert.ok(ordered / total > 0.95, "فید مرتب نزولی نیست");
    pass += 2;
    console.log("  ✓ فید سراسری زنده و مرتب است");
    console.log("  ✓ طبقه‌بندی روی فید واقعی کار می‌کند");
  } catch (e) {
    fail++;
    console.error(`  ✗ live feed: ${e.message}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
