import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * `phase26_change_radar` روی **Postgresِ واقعی** — همان الگوی
 * `lib/cron/ledger.integration.test.ts`.
 *
 * چرا این جدول‌ها تستِ واقعی می‌خواهند و تستِ متنی کافی نیست:
 *  • ایده‌مپوتنسی ادعایی دربارهٔ **ایندکسِ یکتا** است، نه دربارهٔ کد.
 *  • «دیده‌شده» ادعایی دربارهٔ **RLS** است؛ فقط با دو کاربرِ واقعی سنجیده می‌شود.
 *  • append-only بدونِ بستنِ `TRUNCATE` دور زدنی است (درسِ `B-044`) و
 *    `TRUNCATE` را RLS فیلتر نمی‌کند.
 *
 * migration مقابلِ **هر دو پروفایلِ امتیاز** اجرا می‌شود.
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
const MIGRATION = join(ROOT, "sql", "phase26_change_radar.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

const USER_A = "22222222-2222-2222-2222-222222222222";
const USER_B = "33333333-3333-3333-3333-333333333333";

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

function expectError(db: string, sql: string): string {
  try {
    psql(db, sql);
  } catch (e) {
    return String((e as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}

/** یک قطعه SQL را در نقشِ کاربرِ احرازشده با شناسهٔ مشخص اجرا می‌کند. */
function asUser(db: string, uid: string, sql: string): string {
  return psql(db, `SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    ${sql}`);
}

function asUserExpectError(db: string, uid: string, sql: string): string {
  return expectError(db, `SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    ${sql}`);
}

const INSERT_EVENT = `
  INSERT INTO public.radar_events (kind, symbol, dedup_key, basis, event_date, significance)
  VALUES ('new_report', 'فملی', 'new_report|فملی|ن-۳۰|1405-05-31', '{"report_kind":"ن-۳۰"}'::jsonb,
          DATE '2026-09-01', 'گزارشِ تازه برای این نماد ثبت شد.')`;

for (const [profileName, profileFile] of Object.entries(PROFILES)) {
  describe(`phase26 رادارِ تغییر — پروفایلِ ${profileName}`, () => {
    const db = `radar_${profileName}`;

    before(() => {
      psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
      psql("postgres", `CREATE DATABASE ${db}`);
      psqlFile(db, BOOTSTRAP);
      psqlFile(db, profileFile);
      psqlFile(db, MIGRATION);
      psql(db, `INSERT INTO auth.users (id) VALUES ('${USER_A}'), ('${USER_B}')`);
      psql(db, `INSERT INTO public.profiles (id, role) VALUES ('${USER_A}','user'), ('${USER_B}','user')`);
    });

    test("migration اجرا می‌شود و هر سه جدول RLSِ اجباری دارند", () => {
      const rows = psql(db, `SELECT relname||':'||relrowsecurity||relforcerowsecurity
        FROM pg_class WHERE relname LIKE 'radar%' AND relkind='r' ORDER BY 1`);
      assert.deepEqual(rows.split("\n").sort(), [
        "radar_events:truetrue", "radar_review_flags:truetrue", "radar_seen:truetrue",
      ]);
    });

    test("ایده‌مپوتنسی: درجِ دوبارهٔ همان کلید ردیفِ تکراری نمی‌سازد", () => {
      psql(db, INSERT_EVENT);
      const err = expectError(db, INSERT_EVENT);
      assert.match(err, /duplicate key|uq_radar_events_dedup/i);
      assert.equal(psql(db, `SELECT count(*) FROM public.radar_events`), "1");
    });

    test("append-only: UPDATE و DELETE روی رویداد رد می‌شوند", () => {
      const u = expectError(db, `UPDATE public.radar_events SET symbol='x' WHERE id > 0`);
      assert.match(u, /فقط افزودنی|PT409/);
      const d = expectError(db, `DELETE FROM public.radar_events WHERE id > 0`);
      assert.match(d, /فقط افزودنی|PT409/);
    });

    test("هشدارِ بدونِ علتِ اهمیت پذیرفته نمی‌شود", () => {
      const err = expectError(db, `
        INSERT INTO public.radar_events (kind, symbol, dedup_key, basis, event_date, significance)
        VALUES ('new_report','فملی','k-short','{}'::jsonb, DATE '2026-09-01','کوتاه')`);
      assert.match(err, /check constraint|significance/i);
    });

    test("تغییرِ عملکرد بدونِ مقدار یا واحد پذیرفته نمی‌شود", () => {
      const err = expectError(db, `
        INSERT INTO public.radar_events (kind, symbol, dedup_key, basis, event_date, significance)
        VALUES ('performance_change','فملی','k-perf-novalue','{}'::jsonb, DATE '2026-09-01',
                'تغییرِ معنادارِ فروشِ ماهانه رخ داد.')`);
      assert.match(err, /radar_perf_needs_value/i);
    });

    test("فقط اصلاحیه می‌تواند رویدادِ دیگری را باطل کند", () => {
      const err = expectError(db, `
        INSERT INTO public.radar_events (kind, symbol, dedup_key, basis, event_date, significance, supersedes_event_id)
        VALUES ('new_report','فملی','k-bad-supersede','{}'::jsonb, DATE '2026-09-01',
                'گزارشِ تازه برای این نماد ثبت شد.', 1)`);
      assert.match(err, /radar_supersedes_only_amendment/i);
    });

    test("منبعِ غیر-http رد می‌شود", () => {
      const err = expectError(db, `
        INSERT INTO public.radar_events (kind, symbol, dedup_key, basis, event_date, significance, source_url)
        VALUES ('new_report','فملی','k-bad-url','{}'::jsonb, DATE '2026-09-01',
                'گزارشِ تازه برای این نماد ثبت شد.', 'javascript:alert(1)')`);
      assert.match(err, /check constraint/i);
    });

    test("پرچمِ بازبینی: بستن بدونِ توضیح ممکن نیست", () => {
      const eid = psql(db, `SELECT id FROM public.radar_events ORDER BY id LIMIT 1`);
      psql(db, `INSERT INTO public.radar_review_flags (event_id, dependent_kind, dependent_ref)
                VALUES (${eid}, 'quarterly', 'فملی|1405-03-31')`);
      const err = expectError(db, `UPDATE public.radar_review_flags
                SET resolved_at = now(), resolved_note = 'ok' WHERE event_id = ${eid}`);
      assert.match(err, /check constraint/i);
      psql(db, `UPDATE public.radar_review_flags SET resolved_at = now(),
                resolved_note = 'بازبینی شد و عدد تغییر نکرد.' WHERE event_id = ${eid}`);
      assert.equal(psql(db, `SELECT count(*) FROM public.radar_review_flags WHERE resolved_at IS NOT NULL`), "1");
    });

    test("پرچمِ تکراری برای همان وابسته ساخته نمی‌شود", () => {
      const eid = psql(db, `SELECT id FROM public.radar_events ORDER BY id LIMIT 1`);
      const err = expectError(db, `INSERT INTO public.radar_review_flags (event_id, dependent_kind, dependent_ref)
                VALUES (${eid}, 'quarterly', 'فملی|1405-03-31')`);
      assert.match(err, /duplicate key|uq_radar_flag_target/i);
    });

    /* ── «دیده‌شده» — تفکیکِ واقعیِ کاربران ─────────────────────────────── */

    test("هر کاربر فقط «دیده‌شده»ی خودش را می‌بیند", () => {
      const eid = psql(db, `SELECT id FROM public.radar_events ORDER BY id LIMIT 1`);
      asUser(db, USER_A, `INSERT INTO public.radar_seen (user_id, event_id) VALUES ('${USER_A}', ${eid})`);
      assert.equal(asUser(db, USER_A, `SELECT count(*) FROM public.radar_seen`), "1");
      assert.equal(asUser(db, USER_B, `SELECT count(*) FROM public.radar_seen`), "0",
        "دیدنِ کاربرِ A نباید برای B هم «دیده‌شده» باشد");
    });

    test("کاربر نمی‌تواند به نامِ کاربرِ دیگر «دیده‌شده» ثبت کند", () => {
      const eid = psql(db, `SELECT id FROM public.radar_events ORDER BY id LIMIT 1`);
      const err = asUserExpectError(db, USER_B,
        `INSERT INTO public.radar_seen (user_id, event_id) VALUES ('${USER_A}', ${eid})`);
      assert.match(err, /row-level security|policy/i);
    });

    test("کاربر نمی‌تواند «دیده‌شده»ی کاربرِ دیگر را پاک کند", () => {
      asUser(db, USER_B, `DELETE FROM public.radar_seen WHERE user_id = '${USER_A}'`);
      assert.equal(asUser(db, USER_A, `SELECT count(*) FROM public.radar_seen`), "1",
        "ردیفِ A باید دست‌نخورده بماند");
    });

    test("کاربرِ عادی رویداد نمی‌سازد و پاک نمی‌کند", () => {
      const i = asUserExpectError(db, USER_A, INSERT_EVENT.replace("dedup_key)", "dedup_key)"));
      assert.match(i, /permission denied|row-level security|فقط افزودنی/i);
      const d = asUserExpectError(db, USER_A, `DELETE FROM public.radar_events WHERE id > 0`);
      assert.match(d, /permission denied|row-level security|فقط افزودنی/i);
    });

    test("پرچم‌های بازبینی برای کاربرِ غیرادمین دیده نمی‌شوند", () => {
      assert.equal(asUser(db, USER_A, `SELECT count(*) FROM public.radar_review_flags`), "0");
      psql(db, `UPDATE public.profiles SET role='admin' WHERE id='${USER_A}'`);
      assert.equal(asUser(db, USER_A, `SELECT count(*) FROM public.radar_review_flags`), "1",
        "ادمین باید ببیند");
      psql(db, `UPDATE public.profiles SET role='user' WHERE id='${USER_A}'`);
    });

    /* ── گرنت‌ها: اندازه‌گیری، نه فرض (درسِ B-044) ───────────────────────── */

    test("هیچ نقشی TRUNCATE ندارد — RLS آن را فیلتر نمی‌کند", () => {
      const rows = psql(db, `
        SELECT r||'/'||t||'='||has_table_privilege(r, 'public.'||t, 'TRUNCATE')::text
        FROM unnest(ARRAY['anon','authenticated','service_role']) r,
             unnest(ARRAY['radar_events','radar_review_flags','radar_seen']) t
        ORDER BY 1`);
      const trues = rows.split("\n").filter((x) => x.endsWith("=true"));
      assert.deepEqual(trues, [], `TRUNCATE باید همه‌جا بسته باشد، ولی: ${trues.join(", ")}`);
    });

    test("anon روی هر سه جدول هیچ امتیازی ندارد", () => {
      const rows = psql(db, `
        SELECT t||'.'||p||'='||has_table_privilege('anon', 'public.'||t, p)::text
        FROM unnest(ARRAY['radar_events','radar_review_flags','radar_seen']) t,
             unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
        ORDER BY 1`);
      const trues = rows.split("\n").filter((x) => x.endsWith("=true"));
      assert.deepEqual(trues, [], `anon نباید چیزی داشته باشد، ولی: ${trues.join(", ")}`);
    });

    test("service_role رویداد را پاک نمی‌کند — نویسنده است، نه مالک", () => {
      assert.equal(psql(db, `SELECT has_table_privilege('service_role','public.radar_events','DELETE')::text`), "false");
      assert.equal(psql(db, `SELECT has_table_privilege('service_role','public.radar_events','INSERT')::text`), "true");
    });
  });
}
