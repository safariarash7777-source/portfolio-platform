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
  test("قیدِ یکتا روی (user_id, source) وجود دارد", () => {
    // بدونِ این، «اول SELECT بعد INSERT» یک TOCTOU است: دو callbackِ هم‌زمان
    // هر دو خالی می‌بینند و هر دو درج می‌کنند.
    assert.match(
      EXEC24,
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_entitlements_user_source[\s\S]*?ON\s+public\.entitlements\s*\(\s*user_id\s*,\s*source\s*\)/i
    );
  });

  test("درجِ دسترسی از ON CONFLICT DO NOTHING استفاده می‌کند", () => {
    assert.match(EXEC24, /ON\s+CONFLICT\s*\([^)]*user_id[^)]*source[^)]*\)[\s\S]{0,80}DO\s+NOTHING/i);
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
    // این مهم‌ترین خطِ فایل است: «پول گرفته شد ولی دسترسی داده نشد» نباید
    // بتواند کامیت شود.
    assert.match(EXEC24, /IF\s+v_ent_id\s+IS\s+NULL\s+THEN[\s\S]{0,160}RAISE\s+EXCEPTION/i);
  });

  test("انقضای گذشته پذیرفته نمی‌شود", () => {
    assert.match(EXEC24, /p_expires_at\s*<=\s*now\(\)[\s\S]{0,140}RAISE\s+EXCEPTION/i);
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
