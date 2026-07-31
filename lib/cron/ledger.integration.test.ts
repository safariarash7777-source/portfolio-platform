import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * تستِ یکپارچگیِ `public.cron_runs` روی **Postgresِ واقعی** — `P2-G2-012`.
 *
 * همان الگوی `lib/leads/leads.integration.test.ts`: migration مقابلِ **دو
 * پروفایلِ امتیاز** اجرا می‌شود و رفتار سنجیده می‌شود، نه متنِ فایل.
 *
 * چرا برای این جدول هم لازم است: دفترِ اجرا **تله‌متری** است، و وسوسه‌اش این
 * است که «خب مهم نیست، داده‌ٔ حساسی ندارد». ولی اگر یک کاربرِ عادی بتواند
 * ردیف‌هایش را دستکاری یا پاک کند، دفتر دقیقاً در لحظه‌ای که به آن نیاز داریم
 * — بعد از یک حادثه — بی‌ارزش می‌شود.
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
const MIGRATION = join(ROOT, "sql", "phase21_cron_runs.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: PSQL_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function psqlFile(db: string, file: string): void {
  execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: PSQL_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
}

function psqlExpectError(db: string, sql: string): string {
  try {
    psql(db, sql);
  } catch (e) {
    return String((e as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}

function wrap(role: string, sub: string | null, sql: string): string {
  const claims = sub === null ? `{"role":"${role}"}` : `{"sub":"${sub}","role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims', '${claims}', true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (db: string, role: string, sub: string | null, sql: string) => psql(db, wrap(role, sub, sql));
const asRoleErr = (db: string, role: string, sub: string | null, sql: string) => psqlExpectError(db, wrap(role, sub, sql));

// درسِ `P2-G2-010`: در CI اسکیپ مجاز نیست — گیتِ سبزی که چیزی اجرا نکرده از
// نداشتنِ گیت بدتر است.
const REQUIRE_DB = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try {
  execFileSync("psql", ["-d", "postgres", "-X", "-q", "-c", "select 1"], { env: PSQL_ENV, stdio: "ignore" });
} catch (e) {
  dbError = e instanceof Error ? e.message : String(e);
}
if (dbError !== null && REQUIRE_DB) {
  throw new Error(`[P2-G2-012] Postgres در دسترس نیست و این محیط CI است، پس skip مجاز نیست.\nعلت: ${dbError}`);
}
const skipReason = dbError === null ? false : "Postgres در دسترس نیست (خارج از CI)";

for (const [profileName, profileFile] of Object.entries(PROFILES)) {
  describe(`public.cron_runs — پروفایلِ امتیازِ «${profileName}»`, { skip: skipReason }, () => {
    const DB = `cron_it_${profileName}`;

    before(() => {
      psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
      psql("postgres", `CREATE DATABASE ${DB}`);
      psqlFile(DB, BOOTSTRAP);
      psqlFile(DB, profileFile);
      psqlFile(DB, MIGRATION);
      psql(DB, `INSERT INTO auth.users (id) VALUES ('${ADMIN_ID}'), ('${USER_ID}');
                INSERT INTO public.profiles (id, role) VALUES ('${ADMIN_ID}','admin'), ('${USER_ID}','user');`);
    });

    // ── نویسنده ───────────────────────────────────────────────────────────

    test("service_role اجرا را شروع و تمام می‌کند", () => {
      const id = asRole(DB, "service_role", null,
        `INSERT INTO public.cron_runs (job_key) VALUES ('alerts') RETURNING id`).split("\n").pop()!;
      assert.match(id, /^[0-9a-f-]{36}$/);

      asRole(DB, "service_role", null,
        `UPDATE public.cron_runs SET status='succeeded', finished_at=now(), processed_count=3, duration_ms=120 WHERE id='${id}'`);

      const row = asRole(DB, "service_role", null,
        `SELECT status || '|' || processed_count::text FROM public.cron_runs WHERE id='${id}'`);
      assert.equal(row.split("\n").pop(), "succeeded|3");
    });

    // ── گذارها ────────────────────────────────────────────────────────────

    test("اجرای تمام‌شده دیگر تغییر نمی‌کند", () => {
      const id = asRole(DB, "service_role", null,
        `INSERT INTO public.cron_runs (job_key) VALUES ('alerts') RETURNING id`).split("\n").pop()!;
      asRole(DB, "service_role", null,
        `UPDATE public.cron_runs SET status='succeeded', finished_at=now() WHERE id='${id}'`);

      const err = asRoleErr(DB, "service_role", null,
        `UPDATE public.cron_runs SET status='failed', error_code='x' WHERE id='${id}'`);
      assert.match(err, /اجرای تمام‌شده/);
    });

    test("running به running معنا ندارد", () => {
      const id = asRole(DB, "service_role", null,
        `INSERT INTO public.cron_runs (job_key) VALUES ('telegram-sync') RETURNING id`).split("\n").pop()!;
      const err = asRoleErr(DB, "service_role", null,
        `UPDATE public.cron_runs SET status='running' WHERE id='${id}'`);
      assert.match(err, /running به running/);
    });

    test("job_key و started_at پس از درج ثابت‌اند", () => {
      const id = asRole(DB, "service_role", null,
        `INSERT INTO public.cron_runs (job_key) VALUES ('alerts') RETURNING id`).split("\n").pop()!;
      const err = asRoleErr(DB, "service_role", null,
        `UPDATE public.cron_runs SET job_key='telegram-sync', status='succeeded', finished_at=now() WHERE id='${id}'`);
      assert.match(err, /تغییر نمی‌کنند/);
    });

    test("تاریخچهٔ اجرا حذف‌شدنی نیست — حتی برای نویسنده", () => {
      // دو لایه: نبودِ گرنتِ DELETE، و تریگر. تستِ اول این را کشف کرد که در
      // پروفایلِ legacy نویسنده امتیازِ DELETE/TRUNCATE را نگه می‌داشت و دو
      // پروفایل واگرا می‌شدند — همان نشانه‌ای که یعنی migration به فرضِ
      // محیطیِ نانوشته تکیه کرده. حالا در هر دو پروفایل یکسان رد می‌شود.
      assert.match(asRoleErr(DB, "service_role", null, `DELETE FROM public.cron_runs`), /permission denied/i);
      assert.match(asRoleErr(DB, "service_role", null, `TRUNCATE public.cron_runs`), /permission denied/i);
    });

    // ── قیدها ─────────────────────────────────────────────────────────────

    test("اجرای تمام‌شده باید زمانِ پایان داشته باشد", () => {
      const err = psqlExpectError(DB,
        `INSERT INTO public.cron_runs (job_key, status) VALUES ('alerts','succeeded')`);
      assert.match(err, /cron_runs_finished_consistent/);
    });

    test("شکست بدونِ کدِ خطا پذیرفته نمی‌شود", () => {
      // وگرنه دفتر فقط می‌گوید «خراب شد» و در تشخیص هیچ کمکی نمی‌کند.
      const err = psqlExpectError(DB,
        `INSERT INTO public.cron_runs (job_key, status, finished_at) VALUES ('alerts','failed', now())`);
      assert.match(err, /cron_runs_failure_has_reason/);
    });

    test("خلاصهٔ خطای بلندتر از سقف رد می‌شود", () => {
      const err = psqlExpectError(DB,
        `INSERT INTO public.cron_runs (job_key, status, finished_at, error_code, safe_error_summary)
         VALUES ('alerts','failed', now(), 'x', repeat('a', 301))`);
      assert.match(err, /safe_error_summary/);
    });

    // ── دسترسی ────────────────────────────────────────────────────────────

    test("anon هیچ دسترسی‌ای به دفتر ندارد", () => {
      assert.match(asRoleErr(DB, "anon", null, `SELECT count(*) FROM public.cron_runs`), /permission denied/i);
    });

    test("کاربرِ عادی چیزی نمی‌بیند — RLS، نه خطا", () => {
      assert.equal(asRole(DB, "authenticated", USER_ID, `SELECT count(*) FROM public.cron_runs`).split("\n").pop(), "0");
    });

    test("ادمین دفتر را می‌خوانَد", () => {
      const n = Number(asRole(DB, "authenticated", ADMIN_ID, `SELECT count(*) FROM public.cron_runs`).split("\n").pop());
      assert.ok(n > 0, "ادمین باید ردیف‌ها را ببیند");
    });

    test("حتی ادمین هم از نشستِ کاربر نمی‌نویسد — دفتر فقط سرور-نویس است", () => {
      for (const stmt of [
        `INSERT INTO public.cron_runs (job_key) VALUES ('alerts')`,
        `UPDATE public.cron_runs SET processed_count = 999`,
        `DELETE FROM public.cron_runs`,
        `TRUNCATE public.cron_runs`,
      ]) {
        assert.match(asRoleErr(DB, "authenticated", ADMIN_ID, stmt), /permission denied/i, `باید رد می‌شد: ${stmt}`);
      }
    });

    test("جدولِ امتیازها کمینه است و در هر دو پروفایل یکسان", () => {
      const rows = psql(DB,
        `SELECT grantee || '=' || string_agg(privilege_type, ',' ORDER BY privilege_type)
           FROM information_schema.role_table_grants
          WHERE table_schema='public' AND table_name='cron_runs'
            AND grantee IN ('anon','authenticated','service_role')
          GROUP BY grantee ORDER BY grantee`);
      const map = Object.fromEntries(rows.split("\n").filter(Boolean).map((r) => r.split("=")));
      assert.equal(map.anon, undefined);
      assert.equal(map.authenticated, "SELECT");
      assert.equal(map.service_role, "INSERT,SELECT,UPDATE");
    });

    test("RLS روشن است و migration دوباره اجرا می‌شود", () => {
      assert.equal(psql(DB, `SELECT relrowsecurity::text FROM pg_class WHERE oid='public.cron_runs'::regclass`), "true");
      psqlFile(DB, MIGRATION);
      assert.ok(Number(psql(DB, `SELECT count(*)::text FROM public.cron_runs`)) > 0, "اجرای دوباره نباید داده را ببرد");
    });
  });
}
