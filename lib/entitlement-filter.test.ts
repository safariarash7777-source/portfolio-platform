import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { activeEntitlementFilter, isEntitlementActive } from "./entitlement-filter";

/**
 * دسترسیِ بدونِ انقضا.
 *
 * تصمیمِ آرش: مدتِ دسترسی باید هر عددی بتواند باشد، «و تا هر زمان که بخواهم».
 * پس NULL در `expires_at` یعنی همیشگی.
 *
 * ⚠️ خطرِ اصلی وارونه است: فیلترِ قبلی (`.gt('expires_at', now)`) روی NULL
 * ردیف را **حذف** می‌کرد، یعنی دسترسیِ همیشگی به «هیچ دسترسی» تبدیل می‌شد و
 * هیچ خطایی هم دیده نمی‌شد.
 */

const NOW = new Date("2026-08-20T12:00:00Z");

describe("فیلترِ کوئری", () => {
  test("هر دو حالت را می‌پذیرد: تهی، یا هنوز منقضی‌نشده", () => {
    const filter = activeEntitlementFilter(NOW.toISOString());
    assert.match(filter, /expires_at\.is\.null/);
    assert.match(filter, /expires_at\.gt\.2026-08-20T12:00:00\.000Z/);
  });

  test("شرطِ تهی حذف نشده است", () => {
    // اگر کسی این را ساده کند، دسترسیِ همیشگی بی‌صدا از کار می‌افتد.
    assert.ok(activeEntitlementFilter(NOW.toISOString()).includes("is.null"));
  });
});

describe("تصمیم روی ردیفِ در دست", () => {
  test("انقضای تهی ⇒ فعال", () => {
    assert.equal(isEntitlementActive({ expires_at: null }, NOW), true);
  });

  test("انقضای آینده ⇒ فعال", () => {
    assert.equal(
      isEntitlementActive({ expires_at: "2026-12-01T00:00:00Z" }, NOW),
      true
    );
  });

  test("انقضای گذشته ⇒ غیرفعال", () => {
    assert.equal(
      isEntitlementActive({ expires_at: "2026-01-01T00:00:00Z" }, NOW),
      false
    );
  });

  test("ابطالِ دستی بر همیشگی هم مقدم است", () => {
    // وگرنه یک دسترسیِ ابدیِ باطل‌شده هرگز قابلِ پس‌گرفتن نبود.
    assert.equal(
      isEntitlementActive(
        { expires_at: null, revoked_at: "2026-08-01T00:00:00Z" },
        NOW
      ),
      false
    );
  });

  test("دسترسیِ همیشگی که هنوز شروع نشده، فعال نیست", () => {
    assert.equal(
      isEntitlementActive(
        { expires_at: null, starts_at: "2026-09-01T00:00:00Z" },
        NOW
      ),
      false
    );
  });
});
