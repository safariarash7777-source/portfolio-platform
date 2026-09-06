import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * `phase27_member_import` روی **Postgresِ واقعی** — `D-031`.
 *
 * ⚠️ **همهٔ دادهٔ این تست مصنوعی است.** هیچ فهرستِ واقعی، هیچ شمارهٔ واقعی و
 * هیچ نشانیِ واقعی اینجا نیست و هیچ حسابِ واقعی ساخته نمی‌شود.
 *
 * چیزی که سنجیده می‌شود، همانی است که یک واردسازیِ عضو باید تضمین کند:
 * پیش‌نمایش پیش از اعطا · تطبیق با شناسهٔ تأییدشده · تکرار‌ناپذیری ·
 * مسیرِ موارد تطبیق‌نیافته · سابقهٔ اعطا · لغوِ برگشت‌پذیر.
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
const MIGRATION = join(ROOT, "sql", "phase27_member_import.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

// شناسه‌های مصنوعی — عمداً غیرواقعی و آشکارا آزمایشی.
const ADMIN = "11111111-1111-1111-1111-111111111111";
const MEMBER_A = "22222222-2222-2222-2222-222222222222";
const MEMBER_B = "33333333-3333-3333-3333-333333333333";

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
  try { psql(db, sql); } catch (e) { return String((e as { stderr?: Buffer | string }).stderr ?? ""); }
  return "";
}
function asUser(db: string, uid: string, sql: string): string {
  return psql(db, `SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}'; ${sql}`);
}

for (const [profileName, profileFile] of Object.entries(PROFILES)) {
  describe(`phase27 وارد‌سازیِ عضو — پروفایلِ ${profileName}`, () => {
    const db = `member_${profileName}`;

    before(() => {
      psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
      psql("postgres", `CREATE DATABASE ${db}`);
      psqlFile(db, BOOTSTRAP);
      psqlFile(db, profileFile);
      psqlFile(db, MIGRATION);
      psql(db, `INSERT INTO auth.users (id) VALUES ('${ADMIN}'),('${MEMBER_A}'),('${MEMBER_B}')`);
      psql(db, `INSERT INTO public.profiles (id, role) VALUES
        ('${ADMIN}','admin'), ('${MEMBER_A}','user'), ('${MEMBER_B}','user')`);
      psql(db, `INSERT INTO public.member_import_batches (id, source_label, evidence, imported_by)
        VALUES (1, 'synthetic-test-list.csv', 'دادهٔ مصنوعیِ تست — هیچ فهرستِ واقعی', '${ADMIN}')`);
    });

    test("دسته منبع و شاهد و اپراتور دارد — بدونِ شاهد پذیرفته نمی‌شود", () => {
      const err = expectError(db, `INSERT INTO public.member_import_batches (source_label, evidence, imported_by)
        VALUES ('x.csv', 'کوتاه', '${ADMIN}')`);
      assert.match(err, /check constraint/i);
    });

    test("پیش‌نمایش: ردیف وارد می‌شود ولی هیچ اعطایی ساخته نمی‌شود", () => {
      psql(db, `INSERT INTO public.member_import_rows
        (batch_id, contact_kind, contact_value, access_from, access_until)
        VALUES (1,'email','synthetic-a@example.invalid', DATE '2026-09-01', DATE '2026-12-01')`);
      assert.equal(psql(db, `SELECT status FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`), "pending");
      assert.equal(psql(db, `SELECT count(*) FROM public.member_grants`), "0",
        "ورودِ ردیف نباید به‌خودیِ‌خود دسترسی بدهد");
    });

    test("دورهٔ معکوس یا صفر رد می‌شود — تاریخِ پایان از خودِ فهرست می‌آید", () => {
      const err = expectError(db, `INSERT INTO public.member_import_rows
        (batch_id, contact_kind, contact_value, access_from, access_until)
        VALUES (1,'email','synthetic-bad@example.invalid', DATE '2026-12-01', DATE '2026-09-01')`);
      assert.match(err, /check constraint/i);
    });

    test("ثبتِ تکراری در یک دسته ممکن نیست", () => {
      const err = expectError(db, `INSERT INTO public.member_import_rows
        (batch_id, contact_kind, contact_value, access_from, access_until)
        VALUES (1,'email','synthetic-a@example.invalid', DATE '2026-09-01', DATE '2026-12-01')`);
      assert.match(err, /duplicate key|uq_member_row_in_batch/i);
    });

    test("تطبیق: بدونِ کاربرِ تطبیق‌یافته وضعیتِ matched ممکن نیست", () => {
      const err = expectError(db, `UPDATE public.member_import_rows SET status='matched'
        WHERE contact_value='synthetic-a@example.invalid'`);
      assert.match(err, /check constraint/i);
      psql(db, `UPDATE public.member_import_rows SET status='matched', matched_user_id='${MEMBER_A}'
        WHERE contact_value='synthetic-a@example.invalid'`);
      assert.equal(psql(db, `SELECT status FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`), "matched");
    });

    test("موردِ تطبیق‌نیافته یک حالتِ معتبر است، ولی باید علت داشته باشد", () => {
      psql(db, `INSERT INTO public.member_import_rows
        (batch_id, contact_kind, contact_value, access_from, access_until)
        VALUES (1,'phone','+9800000000001', DATE '2026-09-01', DATE '2026-12-01')`);
      const err = expectError(db, `UPDATE public.member_import_rows SET status='unmatched'
        WHERE contact_value='+9800000000001'`);
      assert.match(err, /check constraint/i, "unmatched بدونِ علت پذیرفته نمی‌شود");
      psql(db, `UPDATE public.member_import_rows SET status='unmatched', note='حسابی با این شماره پیدا نشد'
        WHERE contact_value='+9800000000001'`);
      assert.equal(psql(db, `SELECT count(*) FROM public.member_import_rows WHERE status='unmatched'`), "1");
    });

    test("اعطا با دورهٔ واقعیِ فهرست ثبت می‌شود", () => {
      const rid = psql(db, `SELECT id FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`);
      psql(db, `INSERT INTO public.member_grants (row_id, user_id, access_from, access_until)
        SELECT id, matched_user_id, access_from, access_until FROM public.member_import_rows WHERE id=${rid}`);
      assert.equal(psql(db, `SELECT access_until::text FROM public.member_grants WHERE row_id=${rid}`), "2026-12-01");
    });

    test("اعطای دوباره به همان کاربر ممکن نیست", () => {
      const rid = psql(db, `SELECT id FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`);
      const err = expectError(db, `INSERT INTO public.member_grants (row_id, user_id, access_from, access_until)
        VALUES (${rid}, '${MEMBER_A}', DATE '2026-09-01', DATE '2027-01-01')`);
      assert.match(err, /duplicate key|uq_member_grant/i);
    });

    test("پردازشِ دوبارهٔ همان ردیف اعطای تکراری نمی‌سازد", () => {
      assert.equal(psql(db, `SELECT count(*) FROM public.member_grants WHERE revoked_at IS NULL`), "1");
    });

    test("همان کاربر از دستهٔ دیگر هم دسترسیِ دوم نمی‌گیرد", () => {
      // سناریوی واقعی: یک نفر در دو فهرستِ متفاوت هست. `uq_member_grant_row`
      // اینجا کمکی نمی‌کند چون ردیفِ فهرست فرق دارد؛ تنها چیزی که جلویش را
      // می‌گیرد `uq_member_grant_active` روی `user_id` است. بدونِ این تست آن
      // ایندکس **توخالی** بود — با برداشتنش هیچ تستی قرمز نمی‌شد.
      psql(db, `INSERT INTO public.member_import_batches (id, source_label, evidence, imported_by)
        VALUES (2, 'synthetic-second-list.csv', 'دستهٔ دومِ مصنوعی برای تستِ تکرار', '${ADMIN}')`);
      psql(db, `INSERT INTO public.member_import_rows
        (id, batch_id, contact_kind, contact_value, access_from, access_until, status, matched_user_id)
        VALUES (900, 2, 'email', 'synthetic-a-again@example.invalid',
                DATE '2026-10-01', DATE '2027-01-01', 'matched', '${MEMBER_A}')`);
      const err = expectError(db, `INSERT INTO public.member_grants (row_id, user_id, access_from, access_until)
        VALUES (900, '${MEMBER_A}', DATE '2026-10-01', DATE '2027-01-01')`);
      assert.match(err, /duplicate key|uq_member_grant_active/i);
    });

    test("لغو بدونِ علت ممکن نیست — حتی برای ادمین", () => {
      // هویتِ ادمین لازم است تا به گاردِ «علت» برسیم؛ گاردِ مجوز زودتر شلیک
      // می‌کند، که ترتیبِ درستی است (اول اجازه، بعد اعتبارسنجی).
      const err = expectError(db, `SET LOCAL ROLE service_role;
        SET LOCAL request.jwt.claims = '{"sub":"${ADMIN}"}';
        SELECT public.revoke_member_batch(1, 'کوتاه')`);
      assert.match(err, /علتِ لغو/);
    });

    test("لغو برگشت‌پذیر است: ردیف پاک نمی‌شود، فقط revoked_at می‌خورد", () => {
      psql(db, `SET LOCAL ROLE service_role;
        SET LOCAL request.jwt.claims = '{"sub":"${ADMIN}"}';
        SELECT public.revoke_member_batch(1, 'دستهٔ آزمایشی لغو شد برای تست.')`);
      assert.equal(psql(db, `SELECT count(*) FROM public.member_grants`), "1", "ردیف باقی می‌ماند");
      assert.equal(psql(db, `SELECT count(*) FROM public.member_grants WHERE revoked_at IS NOT NULL`), "1");
      assert.equal(psql(db, `SELECT revoke_reason IS NOT NULL FROM public.member_grants LIMIT 1`), "t");
    });

    test("پس از لغو، اعطای تازه به همان کاربر مجاز است", () => {
      const rid = psql(db, `SELECT id FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`);
      psql(db, `INSERT INTO public.member_grants (row_id, user_id, access_from, access_until)
        VALUES (${rid}, '${MEMBER_A}', DATE '2027-01-01', DATE '2027-04-01')`);
      assert.equal(psql(db, `SELECT count(*) FROM public.member_grants WHERE revoked_at IS NULL`), "1");
    });

    /* ── حریمِ خصوصی: شناسهٔ تماس دادهٔ شخصی است ─────────────────────────── */

    test("کاربرِ عادی هیچ ردیفِ فهرست یا دسته‌ای نمی‌بیند", () => {
      assert.equal(asUser(db, MEMBER_B, `SELECT count(*) FROM public.member_import_rows`), "0");
      assert.equal(asUser(db, MEMBER_B, `SELECT count(*) FROM public.member_import_batches`), "0");
    });

    test("کاربر فقط اعطای خودش را می‌بیند", () => {
      assert.equal(asUser(db, MEMBER_A, `SELECT count(*) FROM public.member_grants`), "2",
        "کاربرِ A هر دو اعطای خودش (لغوشده و فعال) را می‌بیند");
      assert.equal(asUser(db, MEMBER_B, `SELECT count(*) FROM public.member_grants`), "0");
    });

    test("ادمین فهرست را می‌بیند", () => {
      assert.ok(Number(asUser(db, ADMIN, `SELECT count(*) FROM public.member_import_rows`)) >= 2);
    });

    test("کاربرِ عادی حتی حقِ اجرای تابعِ لغو را ندارد", () => {
      const err = expectError(db, `SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_B}"}';
        SELECT public.revoke_member_batch(1, 'تلاشِ غیرمجاز برای لغو دسته.')`);
      assert.match(err, /permission denied/i, "گاردِ اول: گرنتِ EXECUTE");
    });

    test("گاردِ درونِ تابع مستقلاً کار می‌کند، نه فقط گرنتِ EXECUTE", () => {
      // این تست از **مسیرِ سرویس** می‌آید که EXECUTE دارد، ولی با هویتِ یک
      // کاربرِ غیرادمین. بدونِ آن، گاردِ `is_admin()` درونِ تابع توخالی بود:
      // با برداشتنش هیچ تستی قرمز نمی‌شد، چون تستِ قبلی روی گرنت گیر می‌کرد.
      const err = expectError(db, `SET LOCAL ROLE service_role;
        SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_B}"}';
        SELECT public.revoke_member_batch(1, 'تلاشِ غیرمجاز از مسیرِ سرویس.')`);
      assert.match(err, /فقط ادمین/, "گاردِ دوم: بررسیِ نقش درونِ تابع");
    });

    test("anon هیچ‌چیز نمی‌بیند و هیچ‌چیز نمی‌نویسد", () => {
      const rows = psql(db, `
        SELECT t||'.'||p||'='||has_table_privilege('anon','public.'||t,p)::text
        FROM unnest(ARRAY['member_import_batches','member_import_rows','member_grants']) t,
             unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p ORDER BY 1`);
      assert.deepEqual(rows.split("\n").filter((x) => x.endsWith("=true")), []);
    });

    test("هیچ نقشی TRUNCATE ندارد", () => {
      const rows = psql(db, `
        SELECT r||'/'||t||'='||has_table_privilege(r,'public.'||t,'TRUNCATE')::text
        FROM unnest(ARRAY['anon','authenticated','service_role']) r,
             unnest(ARRAY['member_import_batches','member_import_rows','member_grants']) t ORDER BY 1`);
      assert.deepEqual(rows.split("\n").filter((x) => x.endsWith("=true")), []);
    });
  });
}
