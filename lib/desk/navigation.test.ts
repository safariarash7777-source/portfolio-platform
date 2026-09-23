import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

/**
 * ناوبریِ داخلی — یک نقطهٔ شروع.
 *
 * پیش از این دو صفحهٔ خانه وجود داشت: بازکردنِ `/admin` روی آمارِ مدیریتی
 * می‌نشست، در حالی که نقطهٔ شروعِ مصوب (`DD-024`) میزِ فرماندهی است.
 */
const shell = () => readFileSync("components/admin/AdminShell.tsx", "utf8");

describe("یک نقطهٔ شروعِ روزانه", () => {
  test("`/admin` به میز هدایت می‌کند و صفحهٔ خانهٔ دوم نیست", () => {
    const root = readFileSync("app/(protected)/admin/page.tsx", "utf8");
    assert.match(root, /redirect\("\/admin\/desk"\)/, "ریشهٔ ادمین باید به میز برود");
    assert.ok(!root.includes("DashboardOverview"), "ریشه نباید دیگر آمار رندر کند");
  });

  test("نمای مدیریتی حذف نشده — فقط جابه‌جا شده", () => {
    // تنزلِ جایگاه، نه حذفِ قابلیت. مسیرِ برگشت در کامنتِ خودِ فایل است.
    assert.ok(existsSync("app/(protected)/admin/overview/page.tsx"), "مسیرِ جایگزین باید وجود داشته باشد");
    const moved = readFileSync("app/(protected)/admin/overview/page.tsx", "utf8");
    assert.match(moved, /DashboardOverview/, "محتوای آمار باید در مسیرِ تازه باشد");
  });

  test("ناوبری به مسیرِ جابه‌جاشده اشاره می‌کند، نه به redirect", () => {
    assert.match(shell(), /href: "\/admin\/overview"/, "لینکِ نمای مدیریتی باید به‌روز باشد");
    assert.ok(!/href: "\/admin"[,\s]/.test(shell()), "هیچ ورودیِ ناوبری نباید به ریشهٔ redirect برود");
  });

  test("میزِ فرماندهی اولین ورودیِ ناوبری است", () => {
    const src = shell();
    const deskAt = src.indexOf('href: "/admin/desk"');
    assert.ok(deskAt > 0, "میز باید در ناوبری باشد");
    for (const other of ['href: "/admin/radar"', 'href: "/admin/users"', 'href: "/admin/health"']) {
      assert.ok(src.indexOf(other) > deskAt, `${other} باید بعد از میز بیاید`);
    }
  });

  test("موتورهای تخصصی حفظ شده‌اند و از ناوبری حذف نشده‌اند", () => {
    const src = shell();
    for (const engine of [
      "/admin/radar", "/admin/fx", "/admin/analyses", "/admin/notes",
      "/admin/content", "/admin/users", "/admin/webinars", "/admin/health",
      "/admin/intelligence",
    ]) {
      assert.ok(src.includes(`href: "${engine}"`) || src.includes(`href: "${engine}?`), `${engine} گم شده`);
    }
  });

  test("میان‌برِ داشبوردِ مشتری هم به میز می‌رود، نه به redirect", () => {
    const client = readFileSync("app/(protected)/dashboard/DashboardClient.tsx", "utf8");
    assert.ok(!/href="\/admin"/.test(client), "نباید یک پرشِ اضافه از redirect بخورد");
  });
});
