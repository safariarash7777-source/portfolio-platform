import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * تستِ یکپارچگیِ `public.leads` روی **Postgresِ واقعی** — `G2-006` / `P2-G2-010`.
 *
 * ## چرا این فایل وجود دارد
 *
 * تمرینِ stagingِ `G2-006` یک نقصِ واقعی پیدا کرد: فایلِ migration فقط
 * `REVOKE ALL … FROM anon` داشت، پس `authenticated` امتیازِ `TRUNCATE` را نگه
 * می‌داشت. و **RLS روی `TRUNCATE` اعمال نمی‌شود** — یعنی هر کاربرِ لاگین‌کردهٔ
 * عادی می‌توانست کلِ جدولِ لید را خالی کند.
 *
 * `lib/leads/grants.test.ts` فقط **متنِ فایل** را می‌خوانَد. این فایل چیزِ
 * قوی‌تری می‌سنجد: **رفتارِ واقعیِ دیتابیس**.
 *
 * ## دو پروفایلِ امتیاز
 *
 * migration مقابلِ **هر دو** اجرا می‌شود:
 *   • `legacy`   — بدترین‌حالتی که روی stagingِ خودمان اندازه گرفتیم
 *   • `explicit` — محیطی که هیچ امتیازِ خودکاری نمی‌دهد
 *
 * نتیجهٔ نهایی باید در هر دو یکسان باشد. اگر نبود، یعنی migration به یک فرضِ
 * محیطیِ نانوشته تکیه کرده.
 *
 * ## این تست چه چیزی را اثبات **نمی‌کند**
 *
 * اینجا PostgREST نیست. «کلاینتِ مرورگر چه می‌بیند» سنجیده نمی‌شود؛ فقط لایهٔ
 * Postgres. آن هاپ همچنان `UNPROVEN` است (`B-030`).
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
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

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

function wrap(role: string, sub: string | null, sql: string): string {
  const claims = sub === null ? `{"role":"${role}"}` : `{"sub":"${sub}","role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims', '${claims}', true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}

const asRole = (db: string, role: string, sub: string | null, sql: string) => psql(db, wrap(role, sub, sql));
const asRoleExpectError = (db: string, role: string, sub: string | null, sql: string) =>
  psqlExpectError(db, wrap(role, sub, sql));

function createDb(name: string, profile: string, migrationPath = MIGRATION): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${name}`);
  psql("postgres", `CREATE DATABASE ${name}`);
  psqlFile(name, BOOTSTRAP);
  psqlFile(name, profile);
  psqlFile(name, migrationPath);
  psql(
    name,
    `INSERT INTO auth.users (id) VALUES ('${ADMIN_ID}'), ('${USER_ID}');
     INSERT INTO public.profiles (id, role) VALUES ('${ADMIN_ID}','admin'), ('${USER_ID}','user');`
  );
}

// ── در دسترس بودنِ Postgres ─────────────────────────────────────────────────
//
// قاعدهٔ `P2-G2-010`: در CI **نبودنِ Postgres یا psql باید تست را بشکند**، نه
// اینکه بی‌صدا skip کند و گیت را سبز نگه دارد. یک گیتِ سبزی که هیچ چیز اجرا
// نکرده از نداشتنِ گیت بدتر است، چون اعتماد کاذب می‌سازد.
const REQUIRE_DB = process.env.CI === "true" || process.env.REQUIRE_DB === "1";

let dbError: string | null = null;
try {
  execFileSync("psql", ["-d", "postgres", "-X", "-q", "-c", "select 1"], { env: PSQL_ENV, stdio: "ignore" });
} catch (e) {
  dbError = e instanceof Error ? e.message : String(e);
}

if (dbError !== null && REQUIRE_DB) {
  throw new Error(
    `[G2-006] Postgres در دسترس نیست و این محیط CI است، پس skip مجاز نیست.\n` +
      `PGHOST=${PSQL_ENV.PGHOST} PGPORT=${PSQL_ENV.PGPORT} PGUSER=${PSQL_ENV.PGUSER}\n` +
      `علت: ${dbError}`
  );
}

const skipReason = dbError === null ? false : "Postgres در دسترس نیست (خارج از CI)";

for (const [profileName, profileFile] of Object.entries(PROFILES)) {
  describe(`public.leads — پروفایلِ امتیازِ «${profileName}»`, { skip: skipReason }, () => {
    const DB = `leads_it_${profileName}`;

    before(() => {
      createDb(DB, profileFile);
      asRole(DB, "service_role", null, `INSERT INTO public.leads (name, phone, topic) VALUES ('SYNTHETIC LEAD','07700900123','other')`);
    });

    // ── نویسنده ─────────────────────────────────────────────────────────────

    test("service_role می‌تواند لید درج کند — تنها نویسندهٔ مجاز", () => {
      asRole(DB, "service_role", null, `INSERT INTO public.leads (name, phone, topic) VALUES ('SERVICE ROLE WRITE','07700900555','gold')`);
      const n = asRole(DB, "service_role", null, `SELECT count(*)::text FROM public.leads WHERE name='SERVICE ROLE WRITE'`);
      assert.equal(n.split("\n").pop(), "1");
      asRole(DB, "service_role", null, `DELETE FROM public.leads WHERE name='SERVICE ROLE WRITE'`);
    });

    // ── محرمانگی ────────────────────────────────────────────────────────────

    test("anon اصلاً امتیازِ خواندن ندارد", () => {
      assert.match(asRoleExpectError(DB, "anon", null, `SELECT count(*) FROM public.leads`), /permission denied/i);
    });

    test("anon امتیازِ درج ندارد", () => {
      assert.match(asRoleExpectError(DB, "anon", null, `INSERT INTO public.leads (name) VALUES ('x')`), /permission denied/i);
    });

    test("کاربرِ عادیِ لاگین‌کرده هیچ لیدی نمی‌بیند — RLS کار می‌کند", () => {
      // خطا نمی‌گیریم، صفر ردیف می‌گیریم. تفاوتش مهم است: امتیازِ SELECT هست
      // (تا ادمین بتواند بخوانَد) ولی سیاست ردیف‌ها را صفر می‌کند.
      assert.equal(asRole(DB, "authenticated", USER_ID, `SELECT count(*) FROM public.leads`).split("\n").pop(), "0");
    });

    test("ادمین لیدها را می‌بیند — سیاست و زیرپرس‌وجوی profiles هر دو کار می‌کنند", () => {
      // اگر `profiles` سیاستِ «ردیفِ خودم را ببینم» نداشته باشد، این زیرپرس‌وجو
      // بی‌صدا false می‌شود و ادمین هم چیزی نمی‌بیند. این تست آن تله را می‌گیرد.
      assert.equal(asRole(DB, "authenticated", ADMIN_ID, `SELECT count(*) FROM public.leads`).split("\n").pop(), "1");
    });

    // ── یکپارچگی ────────────────────────────────────────────────────────────

    test("کاربرِ عادی نمی‌تواند TRUNCATE کند — RLS اینجا محافظت نمی‌کند، گرنت می‌کند", () => {
      assert.match(asRoleExpectError(DB, "authenticated", USER_ID, `TRUNCATE public.leads`), /permission denied/i);
    });

    test("کاربرِ عادی امتیازِ INSERT و DELETE ندارد", () => {
      for (const stmt of [`INSERT INTO public.leads (name) VALUES ('x')`, `DELETE FROM public.leads`]) {
        assert.match(asRoleExpectError(DB, "authenticated", USER_ID, stmt), /permission denied/i, `باید رد می‌شد: ${stmt}`);
      }
    });

    test("کاربرِ عادی هیچ لیدی را UPDATE نمی‌کند — نه خطا، صفر ردیف", () => {
      // نکتهٔ ظریف: `authenticated` عمداً امتیازِ UPDATE دارد تا ادمین بتواند
      // چرخهٔ حیات را عوض کند. چیزی که کاربرِ عادی را متوقف می‌کند **RLS** است،
      // نه گرنت. پس انتظارِ درست «صفر ردیفِ تغییریافته» است، نه permission denied.
      const updated = asRole(
        DB,
        "authenticated",
        USER_ID,
        `WITH u AS (UPDATE public.leads SET status='archived' RETURNING 1) SELECT count(*)::text FROM u`
      );
      assert.equal(updated.split("\n").pop(), "0", "کاربرِ عادی نباید هیچ ردیفی را عوض کند");

      const stillNew = asRole(DB, "service_role", null, `SELECT count(*)::text FROM public.leads WHERE status='new'`);
      assert.equal(stillNew.split("\n").pop(), "1", "ردیف باید دست‌نخورده مانده باشد");
    });

    test("ادمین می‌تواند status و notes را به‌روزرسانی کند", () => {
      const updated = asRole(
        DB,
        "authenticated",
        ADMIN_ID,
        `WITH u AS (UPDATE public.leads SET status='contacted', notes='CRM note' RETURNING 1) SELECT count(*)::text FROM u`
      );
      assert.equal(updated.split("\n").pop(), "1");

      const row = asRole(DB, "service_role", null, `SELECT status || '|' || coalesce(notes,'') FROM public.leads`);
      assert.equal(row.split("\n").pop(), "contacted|CRM note");
    });

    test("به‌روزرسانیِ ادمین تریگرِ updated_at را شلیک می‌کند", () => {
      // در یک تراکنش `now()` ثابت است، پس UPDATE باید تراکنشِ جدا باشد — که
      // `asRole` هم همین کار را می‌کند.
      asRole(DB, "authenticated", ADMIN_ID, `UPDATE public.leads SET status='converted'`);
      const bumped = asRole(DB, "service_role", null, `SELECT (updated_at > created_at)::text FROM public.leads`);
      assert.equal(bumped.split("\n").pop(), "true");
      asRole(DB, "service_role", null, `UPDATE public.leads SET status='new', notes=NULL`);
    });

    test("جدولِ امتیازها دقیقاً کمینه است — و در هر دو پروفایل یکسان", () => {
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
      assert.match(map.service_role ?? "", /INSERT/);
    });

    test("EXECUTEِ تابعِ تریگر از anon و authenticated گرفته شده", () => {
      const out = psql(
        DB,
        `SELECT has_function_privilege('anon','public.leads_set_updated_at()','EXECUTE')::text
             || ',' || has_function_privilege('authenticated','public.leads_set_updated_at()','EXECUTE')::text`
      );
      assert.equal(out, "false,false");
    });

    // ── قیدها ───────────────────────────────────────────────────────────────

    test("قیدِ status مقدارِ نامعتبر را رد می‌کند", () => {
      assert.match(psqlExpectError(DB, `INSERT INTO public.leads (name, status) VALUES ('x','bogus')`), /leads_status_check/);
    });

    test("قیدِ طول با LEAD_LIMITS هم‌خوان است", () => {
      assert.match(psqlExpectError(DB, `INSERT INTO public.leads (name) VALUES (repeat('a', 201))`), /leads_name_len_check/);
    });

    test("migration idempotent است — اجرای دوباره نمی‌شکند", () => {
      psqlFile(DB, MIGRATION);
      assert.equal(psql(DB, `SELECT count(*)::text FROM public.leads`), "1", "اجرای دوباره نباید داده را از بین ببرد");
    });
  });
}

// ── اثباتِ اینکه این تست پوچ نیست ────────────────────────────────────────────

describe("گاردِ failability", { skip: skipReason }, () => {
  test("بدونِ خطِ REVOKE، کاربرِ عادی واقعاً می‌تواند کلِ جدول را TRUNCATE کند", () => {
    // این همان باگی است که در staging پیدا شد. اگر تست‌های بالا روزی سبز بمانند
    // در حالی که خطِ REVOKE حذف شده، یعنی کلِ این فایل بی‌ارزش است. پس همین‌جا
    // نسخهٔ معیوب ساخته و رفتارِ خطرناکش اثبات می‌شود.
    //
    // فقط روی پروفایلِ `legacy` معنا دارد: در پروفایلِ `explicit` جدولِ تازه
    // اصلاً امتیازِ موروثی نمی‌گیرد، پس حذفِ REVOKE هم چیزی را باز نمی‌کند.
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
    createDb(BROKEN_DB, PROFILES.legacy, broken);
    asRole(BROKEN_DB, "service_role", null, `INSERT INTO public.leads (name) VALUES ('WILL BE WIPED')`);
    assert.equal(psql(BROKEN_DB, `SELECT count(*)::text FROM public.leads`), "1");

    asRole(BROKEN_DB, "authenticated", USER_ID, `TRUNCATE public.leads`);
    assert.equal(
      psql(BROKEN_DB, `SELECT count(*)::text FROM public.leads`),
      "0",
      "انتظار می‌رفت نسخهٔ معیوب اجازهٔ TRUNCATE بدهد — اگر نداد، این گارد دیگر چیزی را نمی‌سنجد"
    );

    psql("postgres", `DROP DATABASE IF EXISTS ${BROKEN_DB}`);
  });
});
