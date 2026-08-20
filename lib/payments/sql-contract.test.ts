import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * قراردادِ SQLِ مسیرِ «پرداخت → دسترسی».
 *
 * ⚠️ این تست **فایل را** می‌سنجد، نه دیتابیس را. اتمیک‌بودنِ واقعی و رفتارِ
 * قیدِ یکتا فقط با اجرای migration اثبات می‌شود؛ آن بخش در
 * `docs/RUNBOOK-payment-activation.md` است و روی staging اجرا می‌شود.
 *
 * پس چرا وجود دارد: گاردهایی که اینجا سنجیده می‌شوند دقیقاً همان‌هایی‌اند که
 * یک بار حذف شده بودند. تستِ ایستا نمی‌تواند ثابت کند دیتابیس درست است، ولی
 * می‌تواند جلوی برگشتِ خاموشِ همان حذف را بگیرد.
 */

const ROOT = process.cwd();
const PHASE24 = readFileSync(join(ROOT, "sql", "phase24_payment_entitlement.sql"), "utf8");
const PHASE5 = readFileSync(join(ROOT, "sql", "phase5_payments_telegram.sql"), "utf8");

/** خطوطِ اجرایی — کامنت‌ها کنار گذاشته می‌شوند تا متنِ توضیحی تست را سبز نکند. */
function executable(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
}

const EXEC24 = executable(PHASE24);
const EXEC5 = executable(PHASE5);

describe("idempotency در سطحِ دیتابیس", () => {
  test("قیدِ یکتا روی payment_id — یک پرداخت ⇒ حداکثر یک دسترسی", () => {
    // این قیدِ **اصلی** است. قالبِ رشتهٔ source دیگر کلیدِ یکتایی نیست، چون
    // وقتی هر محصول پیشوندِ خودش را داشت، یک authority می‌توانست دو دسترسی
    // بسازد و قیدِ (user_id, source) جلویش را نمی‌گرفت.
    assert.match(
      EXEC24,
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_entitlements_payment[\s\S]*?ON\s+public\.entitlements\s*\(\s*payment_id\s*\)/i
    );
  });

  test("قیدِ یکتا روی webinar_registrations.payment_id", () => {
    assert.match(
      EXEC24,
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_webinar_registrations_payment[\s\S]*?ON\s+public\.webinar_registrations\s*\(\s*payment_id\s*\)/i
    );
  });

  test("درجِ دسترسی از ON CONFLICT DO NOTHING روی payment_id استفاده می‌کند", () => {
    assert.match(EXEC24, /ON\s+CONFLICT\s*\(\s*payment_id\s*\)[\s\S]{0,60}DO\s+NOTHING/i);
  });

  test("نوعِ محصول روی ردیفِ پرداخت ثبت و تغییرناپذیر می‌شود", () => {
    assert.match(EXEC24, /ALTER\s+TABLE\s+public\.payments[\s\S]{0,80}ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+purpose/i);
    assert.match(EXEC24, /NEW\.purpose\s+IS\s+DISTINCT\s+FROM\s+OLD\.purpose/i);
  });

  test("finalizer نوعِ callback را با purposeِ ذخیره‌شده می‌سنجد", () => {
    assert.match(EXEC24, /v_purpose\s*<>\s*p_kind[\s\S]{0,200}RAISE\s+EXCEPTION/i);
    assert.match(EXEC24, /v_purpose\s+IS\s+NULL[\s\S]{0,160}RAISE\s+EXCEPTION/i);
  });

  test("پرداختِ وبینار بدونِ ثبت‌نامِ متصل رد می‌شود", () => {
    assert.match(EXEC24, /v_reg_id\s+IS\s+NULL[\s\S]{0,180}RAISE\s+EXCEPTION/i);
  });

  test("ساخت و اتصالِ پرداختِ وبینار در یک تابع اتمیک است", () => {
    assert.match(EXEC24, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_webinar_payment/i);
    assert.match(EXEC24, /UPDATE\s+public\.webinar_registrations[\s\S]{0,120}SET\s+payment_id\s*=\s*v_payment/i);
  });

  test("مدتِ دسترسی از جدولِ پیکربندی خوانده می‌شود، نه از ورودی", () => {
    assert.match(EXEC24, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.entitlement_durations/i);
    assert.match(EXEC24, /FROM\s+public\.entitlement_durations\s+WHERE\s+purpose\s*=\s*v_purpose/i);
    assert.doesNotMatch(EXEC24, /p_expires_at/i, "انقضا نباید پارامترِ ورودی باشد");
  });
});

describe("گذارِ وضعیتِ پرداخت", () => {
  test("CHECK فقط pending/paid/failed را می‌پذیرد", () => {
    // مسیرِ وبینار زمانی `'verified'` می‌نوشت — وضعیتی که اصلاً وجود ندارد.
    assert.match(
      EXEC5,
      /status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'pending'[\s\S]{0,120}CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'paid'\s*,\s*'failed'\s*\)\s*\)/i
    );
  });

  test("تریگرِ گارد، گذارِ غیرمجاز و ویرایشِ رکوردِ نهایی‌شده را می‌بندد", () => {
    assert.match(EXEC5, /IF\s+OLD\.status\s*<>\s*'pending'\s+THEN/i);
    assert.match(EXEC5, /IF\s+NEW\.status\s+NOT\s+IN\s*\(\s*'paid'\s*,\s*'failed'\s*\)/i);
  });

  test("phase24 وضعیتِ پرداخت را مستقیماً به‌روزرسانی نمی‌کند", () => {
    // تنها نویسندهٔ مجازِ `payments.status` تابعِ verify_payment/fail_payment است.
    assert.doesNotMatch(
      EXEC24,
      /UPDATE\s+public\.payments/i,
      "phase24 نباید مستقیماً payments را بنویسد؛ باید verify_payment را صدا بزند"
    );
    assert.match(EXEC24, /PERFORM\s+public\.verify_payment\s*\(/i);
  });
});

describe("بایندِ اقتدار و مالکیت", () => {
  test("پرداخت با authority قفل می‌شود (FOR UPDATE)", () => {
    // بدونِ قفل، دو callbackِ هم‌زمان هر دو `pending` می‌بینند.
    assert.match(EXEC24, /FROM\s+public\.payments[\s\S]{0,120}WHERE\s+authority\s*=\s*p_authority[\s\S]{0,60}FOR\s+UPDATE/i);
  });

  test("مبلغ با رکوردِ خودمان سنجیده می‌شود", () => {
    assert.match(EXEC24, /IF\s+v_amount\s*<>\s*p_amount\s+THEN[\s\S]{0,120}RAISE\s+EXCEPTION/i);
  });

  test("ثبت‌نام باید هم به کاربر و هم به همان پرداخت بسته باشد", () => {
    assert.match(EXEC24, /v_reg_user\s*<>\s*v_user[\s\S]{0,120}RAISE\s+EXCEPTION/i);
    assert.match(
      EXEC24,
      /v_reg_payment\s+IS\s+DISTINCT\s+FROM\s+v_payment_id[\s\S]{0,120}RAISE\s+EXCEPTION/i
    );
  });

  test("پرداختِ failed دوباره نهایی نمی‌شود", () => {
    assert.match(EXEC24, /v_status\s*=\s*'failed'[\s\S]{0,140}RAISE\s+EXCEPTION/i);
  });
});

describe("شکستِ اعطای دسترسی کلِ تراکنش را برمی‌گرداند", () => {
  test("اگر ردیفِ دسترسی ساخته نشد، تابع می‌شکند", () => {
    assert.match(EXEC24, /IF\s+v_ent_id\s+IS\s+NULL\s+THEN[\s\S]{0,160}RAISE\s+EXCEPTION/i);
  });

  test("پیکربندیِ **گم‌شده** باعثِ شکست می‌شود، نه دسترسیِ ابدی", () => {
    // ⚠️ `SELECT ... INTO` هم برای «ردیفی نیست» و هم برای «months تهی است»
    // مقدارِ NULL می‌دهد. اگر تابع فقط `v_months IS NULL` را ببیند، یک جدولِ
    // خالی به هر مشتری دسترسیِ همیشگی می‌دهد. پس تشخیص باید با FOUND باشد.
    assert.match(EXEC24, /IF NOT FOUND THEN[\s\S]{0,160}RAISE EXCEPTION/);
    assert.doesNotMatch(
      EXEC24,
      /IF v_months IS NULL THEN[\s\S]{0,140}RAISE EXCEPTION/,
      "تشخیص نباید به تهی‌بودنِ months تکیه کند"
    );
  });

  test("months تهی یعنی دسترسیِ بدونِ انقضا، نه خطا", () => {
    assert.match(EXEC24, /WHEN v_months IS NULL THEN NULL/);
  });

  test("انقضا می‌تواند تهی باشد و خواننده‌ها همین را می‌فهمند", () => {
    assert.match(EXEC24, /ALTER TABLE public\.entitlements ALTER COLUMN expires_at DROP NOT NULL/);
  });
});

describe("امتیازها", () => {
  test("نهایی‌سازی از anon و authenticated گرفته می‌شود", () => {
    assert.match(EXEC24, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.finalize_paid_access[\s\S]{0,140}FROM\s+anon\s*;/i);
    assert.match(
      EXEC24,
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.finalize_paid_access[\s\S]{0,140}FROM\s+authenticated\s*;/i
    );
  });

  test("فقط service_role اجازهٔ اجرا دارد", () => {
    assert.match(EXEC24, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.finalize_paid_access[\s\S]{0,140}TO\s+service_role\s*;/i);
  });

  test("migration خودش امتیازها را پس از اجرا تأیید می‌کند", () => {
    // «فایل اجرا شد» با «امتیاز درست است» یکی نیست. بلوکِ DO باید بشکند.
    assert.match(EXEC24, /has_function_privilege\(\s*'anon'/i);
    assert.match(EXEC24, /has_function_privilege\(\s*'authenticated'/i);
    assert.match(EXEC24, /has_function_privilege\(\s*'service_role'/i);
  });
});

describe("ممیزی", () => {
  test("اعطای دسترسی ردیفِ audit_log می‌نویسد", () => {
    assert.match(EXEC24, /INSERT\s+INTO\s+public\.audit_log[\s\S]{0,200}'entitlement\.granted'/i);
  });

  test("ممیزی فقط بارِ اول نوشته می‌شود، نه در هر replay", () => {
    assert.match(EXEC24, /IF\s+NOT\s+v_already\s+THEN[\s\S]{0,240}INSERT\s+INTO\s+public\.audit_log/i);
  });

  test("primitiveهای phase5 ممیزیِ خودشان را نگه داشته‌اند", () => {
    assert.match(EXEC5, /'payment\.request'/);
    assert.match(EXEC5, /'payment\.verify'/);
    assert.match(EXEC5, /'payment\.failed'/);
  });
});

// ── بازبینیِ دومِ Command Center (کامنت ۵۳۵۳۳۰۹۳۲۹) ──────────────────────────

describe("اتصالِ پرداختِ وبینار بازنویسیِ خاموش نمی‌شود", () => {
  test("اتصالِ موجود قفل و بررسی می‌شود، نه اینکه رویش نوشته شود", () => {
    assert.match(EXEC24, /IF v_reg\.payment_id IS NOT NULL THEN/);
    assert.match(EXEC24, /WHERE id = v_reg\.payment_id\s*\n\s*FOR UPDATE/);
  });

  test("پرداختِ در جریان با SQLSTATE اختصاصی رد می‌شود", () => {
    assert.match(EXEC24, /ERRCODE = 'PT409'/);
  });

  test("⚠️ هیچ مسیرِ جایگزینیِ زمان‌محوری باقی نمانده", () => {
    // پنجرهٔ کهنه‌شدن بر فرضی دربارهٔ انقضای لینکِ درگاه بنا شده بود که سندی
    // برایش نداریم. Command Center آن را رد کرد.
    assert.doesNotMatch(EXEC24, /p_replace/);
    assert.doesNotMatch(EXEC24, /ERRCODE = 'PT425'/);
    assert.doesNotMatch(EXEC24, /make_interval\(mins =>/);
    assert.doesNotMatch(EXEC24, /'payment\.replaced'/);
  });

  test("تنها راهِ خروج از pending، بازیابیِ حاکمیتیِ ادمین است", () => {
    assert.match(EXEC24, /CREATE OR REPLACE FUNCTION public\.admin_cancel_pending_payment/);
    assert.match(EXEC24, /IF NOT public\.is_admin\(\) THEN[\s\S]{0,120}RAISE EXCEPTION/);
    assert.match(EXEC24, /PERFORM public\.fail_payment\(v_pay\.authority\)/);
    assert.match(EXEC24, /'payment\.admin_cancelled'/);
    assert.match(EXEC24, /length\(trim\(p_reason\)\) < 10/);
  });

  test("بازیابیِ حاکمیتی از anon گرفته شده است", () => {
    assert.match(
      EXEC24,
      /REVOKE ALL ON FUNCTION public\.admin_cancel_pending_payment\(uuid, text\) FROM public, anon/
    );
  });

  test("عددِ راهنما فقط تزئینِ رابط است و چیزی را اجرا نمی‌کند", () => {
    assert.match(EXEC24, /'webinar_resume_hint_minutes'/);
    assert.doesNotMatch(EXEC24, /webinar_retry_stale_minutes/);
    assert.match(
      EXEC24,
      /REVOKE ALL ON TABLE public\.payment_settings FROM public, anon, authenticated/
    );
  });
});

describe("مبلغ از فراخواننده گرفته نمی‌شود", () => {
  test("قیمتِ وبینار داخلِ SQL از ردیفِ قفل‌شده استخراج می‌شود", () => {
    assert.match(EXEC24, /JOIN public\.webinars w ON w\.id = r\.webinar_id/);
    assert.match(EXEC24, /v_price := v_reg\.price_toman/);
  });

  test("مبلغِ ارسالی فقط تطبیق داده می‌شود و مبنای ذخیره نیست", () => {
    assert.match(EXEC24, /p_expected_amount IS DISTINCT FROM v_price/);
    // چیزی که به create_payment می‌رود v_price است، نه ورودیِ فراخواننده.
    assert.match(EXEC24, /create_payment\(v_user, v_price, p_authority, 'webinar'\)/);
    assert.doesNotMatch(EXEC24, /create_payment\([^)]*p_expected_amount/);
  });

  test("ساختِ پرداختِ مشاوره از authenticated گرفته شده است", () => {
    assert.match(
      EXEC24,
      /REVOKE ALL ON FUNCTION public\.create_payment\(uuid, integer, text, text\) FROM public, anon, authenticated/
    );
    assert.match(
      EXEC24,
      /GRANT EXECUTE ON FUNCTION public\.create_payment\(uuid, integer, text, text\) TO service_role/
    );
    assert.doesNotMatch(
      EXEC24,
      /GRANT EXECUTE ON FUNCTION public\.create_payment\([^)]*\) TO authenticated/
    );
  });

  test("هیچ امضای قدیمیِ مبلغ‌پذیر باقی نمی‌ماند", () => {
    assert.match(EXEC24, /DROP FUNCTION IF EXISTS public\.create_payment\(integer, text, text\)/);
    assert.match(EXEC24, /DROP FUNCTION IF EXISTS public\.create_webinar_payment\(uuid, integer, text\)/);
    assert.match(EXEC24, /DROP FUNCTION public\.create_payment\(integer, text\)/);
  });

  test("migration خودش نبودِ امضاهای قدیمی را تأیید می‌کند", () => {
    assert.match(EXEC24, /to_regprocedure\('public\.create_payment\(integer, text\)'\) IS NOT NULL THEN\s*\n\s*RAISE EXCEPTION/);
    assert.match(EXEC24, /has_function_privilege\('authenticated',\s*\n?\s*'public\.create_payment\(uuid, integer, text, text\)', 'EXECUTE'\)/);
  });
});
