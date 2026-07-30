import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * تستِ یکپارچگیِ `public.leads` روی **Postgresِ واقعی** — `G2-006`.
 *
 * ## چرا این فایل وجود دارد
 *
 * تمرینِ stagingِ `G2-006` یک نقصِ واقعی پیدا کرد: فایلِ migration فقط
 * `REVOKE ALL … FROM anon` داشت، پس نقشِ `authenticated` امتیازِ پیش‌فرضِ
 * Supabase را نگه می‌داشت — از جمله `TRUNCATE`. و **RLS روی `TRUNCATE` اعمال
 * نمی‌شود**، یعنی هر کاربرِ لاگین‌کردهٔ عادی می‌توانست کلِ جدولِ لید را خالی کند.
 *
 * آن نقص با اندازه‌گیریِ دستی روی staging پیدا شد. `lib/leads/grants.test.ts`
 * جلوی برگشتنش را می‌گیرد، ولی آن تست فقط **متنِ فایل** را می‌خوانَد. این فایل
 * چیزِ قوی‌تری می‌سنجد: **رفتارِ واقعیِ دیتابیس**.
 *
 * ## چرا بدونِ شبکه ممکن است
 *
 * هاپِ آخرِ تمرین (نوشتنِ ردیف از مسیرِ اپلیکیشن) به‌خاطرِ `B-030` بسته ماند —
 * شبکهٔ محیطِ اجرا `*.supabase.co` را می‌بندد. ولی چیزی که واقعاً می‌خواستیم
 * اثبات کنیم رفتارِ RLS و گرنت‌ها بود، و آن را می‌شود روی هر Postgresی سنجید،
 * به‌شرطی که نقش‌ها و امتیازهای پیش‌فرضِ Supabase درست بازتولید شوند —
 * کارِ `sql/test/supabase_bootstrap.sql`.
 *
 * ## این تست چه چیزی را اثبات **نمی‌کند**
 *
 * اینجا PostgREST نیست. پس «کلاینتِ مرورگر چه می‌بیند» سنجیده نمی‌شود؛ فقط
 * لایهٔ Postgres. آن هاپ همچنان `UNPROVEN` است.
 */

const PSQL_ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};

const ROOT = process.cwd();
const BOOTSTRAP = join(ROOT, "sql", "test", "supabase_bootstrap.sql");
const MIGRATION = join(ROOT, "sql", "phase8b_leads.sql");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: PSQL_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function psqlFile(db: string, file: string): void {
  execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: PSQL_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** اجرای SQLای که **باید** شکست بخورد؛ پیامِ خطا برگردانده می‌شود. */
function psqlExpectError(db: string, sql: string): string {
  try {
    psql(db, sql);
  } catch (e) {
    const err = e as { stderr?: Buffer | string };
    return String(err.stderr ?? "");
  }
  return "";
}

/** اجرا با نقش و claimهای جعلی، در یک تراکنش تا نشت نکند. */
function asRole(db: string, role: string, sub: string | null, sql: string): string {
  const claims = sub === null ? `{"role":"${role}"}` : `{"sub":"${sub}","role":"${role}"}`;
  return psql(
    db,
    `BEGIN; SELECT set_config('request.jwt.claims', '${claims}', true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`
  );
}

function asRoleExpectError(db: string, role: string, sub: string | null, sql: string): string {
  const claims = sub === null ? `{"role":"${role}"}` : `{"sub":"${sub}","role":"${role}"}`;
  return psqlExpectError(
    db,
    `BEGIN; SELECT set_config('request.jwt.claims', '${claims}', true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`
  );
}

function createDb(name: string, migrationPath = MIGRATION): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${name}`);
  psql("postgres", `CREATE DATABASE ${name}`);
  psqlFile(name, BOOTSTRAP);
  psqlFile(name, migrationPath);
  psql(
    name,
    `INSERT INTO auth.users (id) VALUES ('${ADMIN_ID}'), ('${USER_ID}');
     INSERT INTO public.profiles (id, role) VALUES ('${ADMIN_ID}','admin'), ('${USER_ID}','user');`
  );
}

let available = false;
try {
  execFileSync("psql", ["-d", "postgres", "-X", "-q", "-c", "select 1"], {
    env: PSQL_ENV,
    stdio: "ignore",
  });
  available = true;
} catch {
  available = false;
}

describe("public.leads روی Postgresِ واقعی", { skip: available ? false : "Postgres در دسترس نیست" }, () => {
  const DB = "leads_it";

  before(() => {
    createDb(DB);
    // یک لیدِ مصنوعی، نوشته‌شده از راهِ نقشی که در تولید می‌نویسد.
    asRole(DB, "service_role", null, `INSERT INTO public.leads (name, phone, topic) VALUES ('SYNTHETIC LEAD','07700900123','other')`);
  });

  // ── محرمانگی ──────────────────────────────────────────────────────────────

  test("anon اصلاً امتیازِ خواندن ندارد", () => {
    const err = asRoleExpectError(DB, "anon", null, `SELECT count(*) FROM public.leads`);
    assert.match(err, /permission denied/i);
  });

  test("anon امتیازِ درج ندارد", () => {
    const err = asRoleExpectError(DB, "anon", null, `INSERT INTO public.leads (name) VALUES ('x')`);
    assert.match(err, /permission denied/i);
  });

  test("کاربرِ عادیِ لاگین‌کرده هیچ لیدی نمی‌بیند — RLS کار می‌کند", () => {
    // نکته: اینجا خطا نمی‌گیریم، صفر ردیف می‌گیریم. تفاوتش مهم است: امتیازِ
    // SELECT هست (تا ادمین بتواند بخوانَد) ولی سیاست ردیف‌ها را صفر می‌کند.
    const out = asRole(DB, "authenticated", USER_ID, `SELECT count(*) FROM public.leads`);
    assert.equal(out.split("\n").pop(), "0");
  });

  test("ادمین لیدها را می‌بیند — سیاست و زیرپرس‌وجوی profiles هر دو کار می‌کنند", () => {
    // اگر `profiles` سیاستِ «ردیفِ خودم را ببینم» نداشته باشد، این زیرپرس‌وجو
    // بی‌صدا false می‌شود و ادمین هم چیزی نمی‌بیند. این تست آن تله را می‌گیرد.
    const out = asRole(DB, "authenticated", ADMIN_ID, `SELECT count(*) FROM public.leads`);
    assert.equal(out.split("\n").pop(), "1");
  });

  // ── یکپارچگی — هستهٔ یافتهٔ `G2-006` ───────────────────────────────────────

  test("کاربرِ عادی نمی‌تواند TRUNCATE کند — RLS اینجا محافظت نمی‌کند، گرنت می‌کند", () => {
    const err = asRoleExpectError(DB, "authenticated", USER_ID, `TRUNCATE public.leads`);
    assert.match(err, /permission denied/i);
  });

  test("کاربرِ عادی امتیازِ INSERT و DELETE ندارد", () => {
    for (const stmt of [`INSERT INTO public.leads (name) VALUES ('x')`, `DELETE FROM public.leads`]) {
      const err = asRoleExpectError(DB, "authenticated", USER_ID, stmt);
      assert.match(err, /permission denied/i, `باید رد می‌شد: ${stmt}`);
    }
  });

  test("جدولِ امتیازها دقیقاً کمینه است", () => {
    const rows = psql(
      DB,
      `SELECT grantee || '=' || string_agg(privilege_type, ',' ORDER BY privilege_type)
         FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='leads'
          AND grantee IN ('anon','authenticated','service_role')
        GROUP BY grantee ORDER BY grantee`
    );
    const map = Object.fromEntries(rows.split("\n").filter(Boolean).map((r) => r.split("=")));
    assert.equal(map.anon, undefined, "anon نباید هیچ امتیازی داشته باشد");
    assert.equal(map.authenticated, "SELECT,UPDATE");
    assert.match(map.service_role, /INSERT/);
  });

  test("EXECUTEِ تابعِ تریگر از anon و authenticated گرفته شده", () => {
    const out = psql(
      DB,
      `SELECT has_function_privilege('anon','public.leads_set_updated_at()','EXECUTE')::text
           || ',' || has_function_privilege('authenticated','public.leads_set_updated_at()','EXECUTE')::text`
    );
    assert.equal(out, "false,false");
  });

  // ── قیدها و تریگر ─────────────────────────────────────────────────────────

  test("قیدِ status مقدارِ نامعتبر را رد می‌کند", () => {
    const err = psqlExpectError(DB, `INSERT INTO public.leads (name, status) VALUES ('x','bogus')`);
    assert.match(err, /leads_status_check/);
  });

  test("قیدِ طول با LEAD_LIMITS هم‌خوان است", () => {
    const err = psqlExpectError(DB, `INSERT INTO public.leads (name) VALUES (repeat('a', 201))`);
    assert.match(err, /leads_name_len_check/);
  });

  test("تریگر updated_at را جلو می‌برد", () => {
    // در یک تراکنش `now()` ثابت است، پس UPDATE باید جدا اجرا شود.
    psql(DB, `INSERT INTO public.leads (name) VALUES ('TRIGGER PROBE')`);
    psql(DB, `UPDATE public.leads SET status='contacted' WHERE name='TRIGGER PROBE'`);
    const out = psql(DB, `SELECT (updated_at > created_at)::text FROM public.leads WHERE name='TRIGGER PROBE'`);
    assert.equal(out, "true");
    psql(DB, `DELETE FROM public.leads WHERE name='TRIGGER PROBE'`);
  });

  test("migration idempotent است — اجرای دوباره نمی‌شکند", () => {
    psqlFile(DB, MIGRATION);
    const out = psql(DB, `SELECT count(*)::text FROM public.leads`);
    assert.equal(out, "1", "اجرای دوباره نباید داده را از بین ببرد");
  });

  // ── اثباتِ اینکه این تست پوچ نیست ─────────────────────────────────────────

  test("بدونِ خطِ REVOKE، کاربرِ عادی واقعاً می‌تواند کلِ جدول را TRUNCATE کند", () => {
    // این همان باگی است که در staging پیدا شد. اگر این تست روزی سبز بماند در
    // حالی که خطِ REVOKE حذف شده، یعنی کلِ این فایل بی‌ارزش است. پس همین‌جا
    // نسخهٔ معیوب ساخته و رفتارِ خطرناکش اثبات می‌شود.
    const dir = mkdtempSync(join(tmpdir(), "leads-regression-"));
    const broken = join(dir, "phase8b_leads_without_revoke.sql");
    writeFileSync(
      broken,
      readFileSync(MIGRATION, "utf8")
        .split("\n")
        .filter((l) => !/REVOKE ALL ON public\.leads FROM (authenticated|PUBLIC)\s*;/.test(l))
        .filter((l) => !/GRANT SELECT, UPDATE ON public\.leads TO authenticated\s*;/.test(l))
        .join("\n")
    );

    const BROKEN_DB = "leads_it_broken";
    createDb(BROKEN_DB, broken);
    asRole(BROKEN_DB, "service_role", null, `INSERT INTO public.leads (name) VALUES ('WILL BE WIPED')`);

    const before = psql(BROKEN_DB, `SELECT count(*)::text FROM public.leads`);
    assert.equal(before, "1");

    // بدونِ REVOKE این کار موفق می‌شود — یعنی تستِ بالا واقعاً چیزی می‌سنجد.
    asRole(BROKEN_DB, "authenticated", USER_ID, `TRUNCATE public.leads`);
    const after = psql(BROKEN_DB, `SELECT count(*)::text FROM public.leads`);
    assert.equal(after, "0", "انتظار می‌رفت نسخهٔ معیوب اجازهٔ TRUNCATE بدهد");

    psql("postgres", `DROP DATABASE IF EXISTS ${BROKEN_DB}`);
  });
});
