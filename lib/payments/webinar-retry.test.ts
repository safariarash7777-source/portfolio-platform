import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decideWebinarRetry,
  shouldOfferHelp,
  type ExistingPayment,
} from "./webinar-retry";

/**
 * سیاستِ تلاشِ دوباره — نسخهٔ پس از بازبینیِ Command Center.
 *
 * قاعده یک جمله است: **تا وقتی پرداختی pending است، لینکِ تازه ساخته
 * نمی‌شود.** طراحیِ قبلی اجازه می‌داد پس از یک پنجرهٔ زمانی جایگزینی انجام
 * شود؛ آن پنجره بر فرضی دربارهٔ انقضای لینکِ درگاه بنا شده بود که سندی
 * نداشت، و اگر فرض غلط بود پولِ پرداخت‌شده به هیچ ثبت‌نامی نمی‌رسید.
 */

const NOW = new Date("2026-08-20T12:00:00Z");

function pending(over: Partial<ExistingPayment> = {}): ExistingPayment {
  return {
    id: "pay-1",
    status: "pending",
    authority: "A0000000000000000000000000000000001",
    created_at: NOW.toISOString(),
    ...over,
  };
}

const decide = (over: Partial<Parameters<typeof decideWebinarRetry>[0]> = {}) =>
  decideWebinarRetry({
    registrationPaymentStatus: "pending",
    existingPayment: null,
    now: NOW,
    ...over,
  });

describe("بدونِ پرداختِ قبلی", () => {
  test("لینکِ تازه ساخته می‌شود", () => {
    assert.deepEqual(decide(), { action: "create" });
  });
});

describe("پرداختِ در جریان — همیشه از سرگیری", () => {
  test("همان authorityِ اول برمی‌گردد", () => {
    const d = decide({ existingPayment: pending() });
    assert.equal(d.action, "resume");
    assert.equal(d.action === "resume" && d.authority, pending().authority);
  });

  test("گذشتِ زمان چیزی را عوض نمی‌کند — حتی بعد از یک سال", () => {
    // ⚠️ این قلبِ اصلاح است. هیچ مقدارِ زمانی نباید مسیر را از resume خارج کند.
    for (const created of [
      "2026-08-20T11:59:00Z",
      "2026-08-20T11:00:00Z",
      "2026-08-19T12:00:00Z",
      "2025-08-20T12:00:00Z",
    ]) {
      const d = decide({ existingPayment: pending({ created_at: created }) });
      assert.equal(d.action, "resume", `created_at=${created} نباید جایگزینی بدهد`);
    }
  });

  test("هیچ خروجیِ «جایگزینی» در قرارداد وجود ندارد", () => {
    const actions = new Set<string>();
    for (const created of ["2026-08-20T12:00:00Z", "2020-01-01T00:00:00Z"]) {
      actions.add(decide({ existingPayment: pending({ created_at: created }) }).action);
    }
    assert.deepEqual([...actions], ["resume"]);
  });

  test("created_atِ نامعتبر هم به resume ختم می‌شود", () => {
    const d = decide({ existingPayment: pending({ created_at: "not-a-date" }) });
    assert.equal(d.action, "resume");
  });

  test("pendingِ بدونِ authority قابلِ از سرگیری نیست و خاموش رد نمی‌شود", () => {
    const d = decide({ existingPayment: pending({ authority: null }) });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "broken_link");
  });
});

describe("وضعیت‌های نهایی", () => {
  test("ثبت‌نامِ پرداخت‌شده لینکِ تازه نمی‌گیرد", () => {
    const d = decide({ registrationPaymentStatus: "paid" });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "already_paid");
  });

  test("پرداختِ paid حتی وقتی ثبت‌نام هنوز flip نشده، رد می‌شود", () => {
    const d = decide({ existingPayment: pending({ status: "paid" }) });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "already_paid");
  });

  test("پرداختِ failed (پس از بازیابیِ ادمین) اجازهٔ تلاشِ دوباره می‌دهد", () => {
    // تنها راهِ خروج از pending، رسیدن به وضعیتِ نهایی است.
    const d = decide({ existingPayment: pending({ status: "failed" }) });
    assert.deepEqual(d, { action: "create" });
  });
});

describe("راهنمای رابط کاربری — تزئینی و بی‌اثر", () => {
  test("پیش از پنجره، کمکی پیشنهاد نمی‌شود", () => {
    assert.equal(shouldOfferHelp(pending({ created_at: "2026-08-20T11:50:00Z" }), 15, NOW), false);
  });

  test("پس از پنجره، پیشنهاد می‌شود", () => {
    assert.equal(shouldOfferHelp(pending({ created_at: "2026-08-20T11:40:00Z" }), 15, NOW), true);
  });

  test("این پرچم روی تصمیم اثر ندارد", () => {
    // همان پرداختی که «کمک» برایش پیشنهاد می‌شود، باز هم resume می‌گیرد.
    const old = pending({ created_at: "2026-08-20T10:00:00Z" });
    assert.equal(shouldOfferHelp(old, 15, NOW), true);
    assert.equal(decide({ existingPayment: old }).action, "resume");
  });
});
