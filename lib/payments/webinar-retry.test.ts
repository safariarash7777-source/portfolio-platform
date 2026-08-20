import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideWebinarRetry, type ExistingPayment } from "./webinar-retry";

/**
 * سیاستِ تلاشِ دوباره.
 *
 * سناریوی اصلی که این تست‌ها می‌بندند، همانی است که Command Center در کامنت
 * ۵۳۵۳۳۰۹۳۲۹ توصیف کرد: کاربر دکمهٔ پرداخت را دوباره می‌زند، لینکِ دوم جای
 * لینکِ اول را می‌گیرد، بعد کاربر **لینکِ اول** را پرداخت می‌کند و پولش به
 * هیچ ثبت‌نامی نمی‌رسد.
 */

const NOW = new Date("2026-08-20T12:00:00Z");
const STALE = 60;

function pending(overrides: Partial<ExistingPayment> = {}): ExistingPayment {
  return {
    id: "pay-1",
    status: "pending",
    authority: "A00000000000000000000000000000000001",
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

function decide(input: Partial<Parameters<typeof decideWebinarRetry>[0]> = {}) {
  return decideWebinarRetry({
    registrationPaymentStatus: "unpaid",
    existingPayment: null,
    replaceRequested: false,
    staleMinutes: STALE,
    now: NOW,
    ...input,
  });
}

describe("بدونِ پرداختِ قبلی", () => {
  test("لینکِ تازه ساخته می‌شود", () => {
    assert.deepEqual(decide(), { action: "create" });
  });
});

describe("پرداختِ در جریان — پیش‌فرض از سرگیری است", () => {
  test("همان authorityِ اول برمی‌گردد، نه لینکِ تازه", () => {
    const d = decide({ existingPayment: pending() });
    assert.equal(d.action, "resume");
    assert.equal(d.action === "resume" && d.authority, pending().authority);
  });

  test("سناریوی Command Center: لینکِ اول یتیم نمی‌شود", () => {
    // درخواستِ دوم، ۵ دقیقه بعد، بدونِ replace.
    const d = decide({
      existingPayment: pending({ created_at: "2026-08-20T11:55:00Z" }),
      now: NOW,
    });
    // هیچ‌وقت "create" برنمی‌گردد ⇒ authorityِ دومی ساخته نمی‌شود.
    assert.notEqual(d.action, "create");
    assert.equal(d.action, "resume");
  });

  test("درخواستِ جایگزینی پیش از پنجرهٔ کهنه‌شدن رد می‌شود", () => {
    const d = decide({
      existingPayment: pending({ created_at: "2026-08-20T11:30:00Z" }), // ۳۰ دقیقه
      replaceRequested: true,
    });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "not_stale_yet");
    assert.equal(d.action === "reject" && d.retryAfterMinutes, 30);
  });

  test("درست روی مرزِ پنجره هنوز رد می‌شود", () => {
    const d = decide({
      existingPayment: pending({ created_at: "2026-08-20T11:00:00.001Z" }),
      replaceRequested: true,
    });
    assert.equal(d.action, "reject");
  });

  test("بعد از پنجره و با درخواستِ صریح، جایگزینی مجاز است", () => {
    const d = decide({
      existingPayment: pending({ created_at: "2026-08-20T10:30:00Z" }), // ۹۰ دقیقه
      replaceRequested: true,
    });
    assert.equal(d.action, "replace");
    assert.equal(d.action === "replace" && d.previousPaymentId, "pay-1");
  });

  test("کهنه بودن به‌تنهایی کافی نیست — جایگزینیِ خاموش ممنوع است", () => {
    const d = decide({
      existingPayment: pending({ created_at: "2026-08-20T10:00:00Z" }),
      replaceRequested: false,
    });
    assert.equal(d.action, "resume");
  });

  test("pendingِ بدونِ authority خاموش جایگزین نمی‌شود", () => {
    const d = decide({ existingPayment: pending({ authority: null }) });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "broken_link");
  });

  test("created_atِ نامعتبر باعثِ جایگزینی نمی‌شود", () => {
    const d = decide({
      existingPayment: pending({ created_at: "not-a-date" }),
      replaceRequested: true,
    });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "not_stale_yet");
  });
});

describe("وضعیت‌های نهایی", () => {
  test("ثبت‌نامِ پرداخت‌شده هیچ پرداختِ تازه‌ای نمی‌گیرد", () => {
    const d = decide({ registrationPaymentStatus: "paid" });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "already_paid");
  });

  test("پرداختِ paid حتی وقتی ثبت‌نام هنوز flip نشده، رد می‌شود", () => {
    const d = decide({ existingPayment: pending({ status: "paid" }) });
    assert.equal(d.action, "reject");
    assert.equal(d.action === "reject" && d.reason, "already_paid");
  });

  test("پرداختِ failed مانعِ تلاشِ دوباره نیست", () => {
    // گذارِ failed→paid را تریگرِ payments_guard می‌بندد، پس لینکِ قبلی
    // دیگر قابلِ پرداخت نیست و جایگزینی بی‌خطر است.
    const d = decide({ existingPayment: pending({ status: "failed" }) });
    assert.deepEqual(d, { action: "create" });
  });
});
