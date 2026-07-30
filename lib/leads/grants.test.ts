import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * گاردِ کمینه‌بودنِ امتیازها روی `public.leads` — `G2-006`.
 *
 * چرا این تست وجود دارد: در تمرینِ stagingِ ۱۴۰۵/۰۵/۰۸ معلوم شد
 * `REVOKE ALL … FROM anon` به‌تنهایی کافی نیست. Supabase روی هر جدولِ تازهٔ
 * `public` به‌صورتِ پیش‌فرض `ALL` را به `authenticated` هم می‌دهد، و
 * اندازه‌گیریِ واقعی این را نشان داد:
 *
 *   authenticated → DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 *
 * نکتهٔ اصلی: **RLS روی `TRUNCATE` اعمال نمی‌شود.** پس سیاست‌های ردیفی
 * محرمانگی را نگه می‌داشتند ولی هر کاربرِ لاگین‌کردهٔ عادی امتیازِ خالی‌کردنِ
 * کلِ جدولِ لید را داشت. Security Advisor هم آن را نگرفت.
 *
 * این تست **فایل را** می‌سنجد، نه دیتابیس را؛ پس بدونِ اتصال به شبکه اجرا
 * می‌شود و در CI معنا دارد. صحتِ وضعیتِ واقعیِ دیتابیس فقط با اجرای همین
 * migration و بررسیِ `has_table_privilege` اثبات می‌شود.
 */

const SQL = readFileSync(join(process.cwd(), "sql", "phase8b_leads.sql"), "utf8");

/** خطوطِ اجراییِ فایل — کامنت‌ها کنار گذاشته می‌شوند تا متنِ توضیحی تست را سبز نکند. */
const STATEMENTS = SQL.split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

test("امتیازِ anon روی leads صریحاً پس گرفته می‌شود", () => {
  assert.match(STATEMENTS, /REVOKE\s+ALL\s+ON\s+public\.leads\s+FROM\s+anon\s*;/i);
});

test("امتیازِ authenticated روی leads صریحاً پس گرفته می‌شود", () => {
  // بدونِ این خط، `authenticated` امتیازِ پیش‌فرضِ Supabase را نگه می‌دارد.
  assert.match(STATEMENTS, /REVOKE\s+ALL\s+ON\s+public\.leads\s+FROM\s+authenticated\s*;/i);
});

test("امتیازِ PUBLIC روی leads صریحاً پس گرفته می‌شود", () => {
  assert.match(STATEMENTS, /REVOKE\s+ALL\s+ON\s+public\.leads\s+FROM\s+PUBLIC\s*;/i);
});

test("نویسندهٔ لید فقط service_role است — درج به نقشِ دیگری داده نمی‌شود", () => {
  const grants = STATEMENTS.match(/GRANT[\s\S]*?ON\s+public\.leads\s+TO\s+\w+\s*;/gi) ?? [];
  assert.ok(grants.length > 0, "هیچ GRANTی روی leads پیدا نشد");

  for (const g of grants) {
    const to = /TO\s+(\w+)\s*;/i.exec(g)?.[1]?.toLowerCase();
    if (to === "service_role") continue;

    // هر نقشِ غیرِ service_role فقط اجازهٔ خواندن/به‌روزرسانی دارد.
    assert.doesNotMatch(g, /\bINSERT\b/i, `نقشِ «${to}» نباید INSERT بگیرد: ${g}`);
    assert.doesNotMatch(g, /\bDELETE\b/i, `نقشِ «${to}» نباید DELETE بگیرد: ${g}`);
    assert.doesNotMatch(g, /\bTRUNCATE\b/i, `نقشِ «${to}» نباید TRUNCATE بگیرد: ${g}`);
    assert.doesNotMatch(g, /\bALL\b/i, `نقشِ «${to}» نباید ALL بگیرد: ${g}`);
  }
});

test("هیچ GRANTی مستقیماً به anon داده نمی‌شود", () => {
  assert.doesNotMatch(STATEMENTS, /GRANT[\s\S]*?ON\s+public\.leads\s+TO\s+anon\s*;/i);
});

test("EXECUTEِ تابعِ تریگر از PUBLIC و anon و authenticated پس گرفته می‌شود", () => {
  // فقط `FROM PUBLIC` کافی نبود؛ اندازه‌گیریِ staging نشان داد anon گرنتِ
  // مستقیم هم دارد. هر سه باید صریح باشند.
  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    assert.match(
      STATEMENTS,
      new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.leads_set_updated_at\\(\\)\\s+FROM\\s+${role}\\s*;`, "i"),
      `REVOKE EXECUTE از «${role}» در فایل نیست`
    );
  }
});

test("RLS روشن می‌ماند — گرنت‌ها جایگزینِ آن نیستند", () => {
  assert.match(STATEMENTS, /ALTER\s+TABLE\s+public\.leads\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i);
});

test("تابعِ تریگر SECURITY INVOKER با search_path بسته می‌ماند", () => {
  assert.match(STATEMENTS, /SECURITY\s+INVOKER/i);
  assert.match(STATEMENTS, /SET\s+search_path\s*=\s*''/i);
  assert.doesNotMatch(STATEMENTS, /SECURITY\s+DEFINER/i);
});

test("migration مخرب نیست — هیچ DROP TABLE یا TRUNCATE در فایل نیست", () => {
  assert.doesNotMatch(STATEMENTS, /DROP\s+TABLE/i);
  assert.doesNotMatch(STATEMENTS, /\bTRUNCATE\s+(TABLE\s+)?public\./i);
  assert.doesNotMatch(STATEMENTS, /DROP\s+COLUMN/i);
});
