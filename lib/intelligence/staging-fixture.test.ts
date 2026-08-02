import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * گاردهای fixtureِ staging — `P2-G3-003`.
 *
 * ── درسی که این فایل نگه می‌دارد ────────────────────────────────────────
 * روی staging جدولِ `profiles` با RLSِ روشن و **صفر سیاست** ساخته شده بود.
 * چون سیاستِ همهٔ جدول‌های `intel_*` این است —
 *   `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role='admin')`
 * — آن زیرپرس‌وجو همیشه false می‌شد و **ادمین بی‌صدا از هر نوشتنی قفل بود**
 * (`B-041`). هم‌زمان `anon` روی همان جدول `DELETE` و `TRUNCATE` داشت که
 * فقط تصادفاً پوشیده مانده بود (`B-042`).
 *
 * نکتهٔ ظریفی که این تست را لازم می‌کند: «کپی‌کردنِ سیاست‌های Production» به
 * تنهایی **خطرناک** بود — افزودنِ سیاستِ خواندن بدونِ اصلاحِ گرنت‌ها، گرنتِ
 * `DELETE`ِ `anon` را از حالتِ پوشیده به حالتِ زنده می‌برد. پس ترتیب
 * (REVOKE → GRANT حداقلی → POLICY) خودش بخشی از درستی است و همین‌جا قفل می‌شود.
 */

const ROOT = process.cwd();
const FIXTURE = join(ROOT, "sql", "staging", "g3003_staging_profiles_prereq.sql");

test("the staging prerequisite fixture is committed, not just applied by hand", () => {
  assert.ok(
    existsSync(FIXTURE),
    "اصلاحی که روی staging اجرا شد باید در مخزن هم باشد، وگرنه قابلِ بازتولید نیست"
  );
});

const sql = existsSync(FIXTURE) ? readFileSync(FIXTURE, "utf8") : "";
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

test("the fixture is labelled staging-only and names both project ids", () => {
  assert.match(sql, /STAGING ONLY/i);
  assert.match(sql, /oqjcvkzyvhqnphopedpn/, "پروژهٔ staging باید صریح نام‌برده شود");
  assert.match(sql, /uooeygybrniptzdxuzhj/, "پروژهٔ Production باید صریح به‌عنوانِ «هرگز» نام‌برده شود");
  assert.match(sql, /NEVER run this on Production/i);
});

/**
 * ترتیب، خودِ کنترل است: اگر GRANT یا POLICY پیش از REVOKE بیاید، یک پنجرهٔ
 * واقعی باز می‌شود که در آن `anon` هم‌زمان سیاستِ خواندن و گرنتِ حذف دارد.
 */
test("revoke comes before any grant or policy — the order is the control", () => {
  const revoke = code.search(/REVOKE ALL ON TABLE public\.profiles FROM anon/i);
  const grant = code.search(/GRANT\s+SELECT/i);
  const policy = code.search(/CREATE POLICY/i);
  assert.ok(revoke > -1, "گرنت‌های پیش‌فرض باید صریح پس گرفته شوند");
  assert.ok(grant > -1 && policy > -1);
  assert.ok(revoke < grant, "REVOKE باید پیش از GRANT باشد");
  assert.ok(revoke < policy, "REVOKE باید پیش از CREATE POLICY باشد");
});

test("no role is granted DELETE or TRUNCATE on profiles", () => {
  const grants = code.match(/GRANT[^;]*ON TABLE public\.profiles[^;]*;/gi) ?? [];
  assert.ok(grants.length > 0, "دستِ‌کم یک گرنتِ حداقلی لازم است");
  for (const g of grants) {
    assert.doesNotMatch(g, /\bDELETE\b|\bTRUNCATE\b|\bALL\b/i, `گرنتِ بیش‌ازحد: ${g}`);
  }
});

test("anon receives no grant at all on profiles", () => {
  const anonGrants = (code.match(/GRANT[^;]*;/gi) ?? []).filter((g) => /\banon\b/.test(g));
  assert.deepEqual(anonGrants, [], `anon نباید هیچ گرنتی روی profiles بگیرد: ${anonGrants.join(" ")}`);
});

/**
 * سیاستِ `profiles` نباید دوباره از `profiles` پرس‌وجو کند — بازگشتی می‌شود.
 * Production این را با `is_admin()`ِ SECURITY DEFINER حل کرده؛ staging اصلاً
 * به آن نیاز ندارد چون سیاست‌های `intel_*` فقط سطرِ خودِ فراخوان را می‌بینند.
 */
test("the profiles policy does not query profiles recursively", () => {
  const policyBlock = code.match(/CREATE POLICY[^;]*ON public\.profiles[^;]*;/i)?.[0] ?? "";
  assert.ok(policyBlock, "سیاستِ profiles پیدا نشد");
  assert.match(policyBlock, /id = auth\.uid\(\)/i);
  assert.doesNotMatch(policyBlock, /FROM\s+public\.profiles|FROM\s+profiles/i,
    "سیاستِ profiles نباید از خودِ profiles بخواند — بازگشتی می‌شود");
});

test("the fixture is wrapped in a transaction", () => {
  assert.match(code, /^\s*BEGIN;/m);
  assert.match(code, /^\s*COMMIT;/m);
});

/**
 * فایلِ bootstrapِ محلی این تله را از قبل توضیح داده بود. اگر آن توضیح حذف
 * شود، درس گم می‌شود — پس همین‌جا به آن گره می‌خورد.
 */
test("the local bootstrap still carries the same lesson", () => {
  const bootstrap = readFileSync(join(ROOT, "sql", "test", "supabase_bootstrap.sql"), "utf8");
  assert.match(bootstrap, /own profile readable/i);
  assert.match(bootstrap, /GRANT SELECT ON public\.profiles TO authenticated/i);
});
