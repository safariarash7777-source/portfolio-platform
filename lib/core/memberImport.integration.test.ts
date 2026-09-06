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
const ACCESS_TIERS = join(ROOT, "sql", "phase11_access_tiers.sql"); // پیش‌نیاز: جدولِ entitlements
const MIGRATION = join(ROOT, "sql", "phase27_member_import.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

// شناسه‌های مصنوعی — عمداً غیرواقعی و آشکارا آزمایشی.
const ADMIN = "11111111-1111-1111-1111-111111111111";
const MEMBER_A = "22222222-2222-2222-2222-222222222222";
const MEMBER_B = "33333333-3333-3333-3333-333333333333";

/** اجرای یک فراخوانی از مسیرِ سرویس با هویتِ ادمین. */
const AS_ADMIN = `SET LOCAL ROLE service_role; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';`;

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
      psqlFile(db, ACCESS_TIERS);
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

    /* ── اعطا: تولیدِ entitlements، نه سامانهٔ موازی ────────────────────── */

    test("اعطا فقط پس از تأییدِ دسته ممکن است — پیش‌نمایش دسترسی نمی‌دهد", () => {
      const rid = psql(db, `SELECT id FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`);
      const err = expectError(db, `${AS_ADMIN} SELECT public.grant_member_access(${rid})`);
      assert.match(err, /تأیید نشده/);
      psql(db, `UPDATE public.member_import_batches SET approved_at=now(), approved_by='${ADMIN}' WHERE id=1`);
    });

    test("اعطا یک ردیفِ entitlements می‌سازد و به آن وصل می‌شود", () => {
      const rid = psql(db, `SELECT id FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`);
      const gid = psql(db, `${AS_ADMIN} SELECT public.grant_member_access(${rid})`);
      assert.ok(Number(gid) > 0);
      assert.equal(psql(db, `SELECT count(*) FROM public.entitlements WHERE source='member_import'`), "1");
      assert.equal(
        psql(db, `SELECT e.expires_at::date::text FROM public.member_grants g
                    JOIN public.entitlements e ON e.id = g.entitlement_id WHERE g.id=${gid}`),
        "2026-12-01", "تاریخِ پایان از خودِ فهرست می‌آید، نه پیش‌فرضِ سیستم");
    });

    test("اعطای دوباره روی همان ردیف ردیفِ تازه نمی‌سازد — همان را برمی‌گرداند", () => {
      const rid = psql(db, `SELECT id FROM public.member_import_rows WHERE contact_value='synthetic-a@example.invalid'`);
      const a = psql(db, `${AS_ADMIN} SELECT public.grant_member_access(${rid})`);
      const b = psql(db, `${AS_ADMIN} SELECT public.grant_member_access(${rid})`);
      assert.equal(a, b, "ایده‌مپوتنت");
      assert.equal(psql(db, `SELECT count(*) FROM public.entitlements WHERE source='member_import'`), "1");
    });

    test("ردیفِ تطبیق‌نیافته اعطا نمی‌گیرد", () => {
      const rid = psql(db, `SELECT id FROM public.member_import_rows WHERE contact_value='+9800000000001'`);
      const err = expectError(db, `${AS_ADMIN} SELECT public.grant_member_access(${rid})`);
      assert.match(err, /تطبیق‌یافته/);
    });

    test("کاربرِ دارای دسترسیِ فعال اعطای دوم نمی‌گیرد — تمدید راهِ دیگری دارد", () => {
      psql(db, `INSERT INTO public.member_import_rows
        (id, batch_id, contact_kind, contact_value, access_from, access_until, status, matched_user_id)
        VALUES (901, 1, 'email', 'synthetic-a-dup@example.invalid',
                DATE '2026-09-01', DATE '2026-12-01', 'matched', '${MEMBER_A}')`);
      const err = expectError(db, `${AS_ADMIN} SELECT public.grant_member_access(901)`);
      assert.match(err, /دسترسیِ باز|renew_member_access/);
    });

    test("اعطای بدونِ اتصال به entitlements اصلاً ثبت نمی‌شود", () => {
      // بدونِ این تست، `NOT NULL` روی `entitlement_id` **توخالی** بود: همهٔ
      // مسیرهای کد آن را پر می‌کنند، پس برداشتنِ قید هیچ تستی را قرمز نمی‌کرد.
      // این تست مسیرِ نوشتنِ مستقیم را می‌بندد — همان راهی که یک اسکریپتِ
      // آیندهٔ بی‌دقت می‌تواند دفتر را از مرجعِ دسترسی جدا کند.
      const err = expectError(db, `INSERT INTO public.member_grants (row_id, user_id, entitlement_id)
        VALUES (901, '${MEMBER_A}', NULL)`);
      assert.match(err, /null value|not-null|violates/i);
    });

    /* ── انقضا — نقصی که بازبینی پیدا کرد ──────────────────────────────── */

    test("انقضای طبیعی یعنی دسترسیِ فعال نیست، حتی وقتی لغو نشده", () => {
      // دوره‌ای که در گذشته تمام شده — از خودِ فهرست، نه با دستکاریِ ردیف.
      // (تریگرِ `entitlements` اجازهٔ تغییرِ `expires_at` را نمی‌دهد، که درست است.)
      psql(db, `INSERT INTO public.member_import_rows
        (id, batch_id, contact_kind, contact_value, access_from, access_until, status, matched_user_id)
        VALUES (902, 1, 'email', 'synthetic-b-expired@example.invalid',
                DATE '2025-01-01', DATE '2025-04-01', 'matched', '${MEMBER_B}')`);
      psql(db, `${AS_ADMIN} SELECT public.grant_member_access(902)`);
      assert.equal(psql(db, `SELECT count(*) FROM public.member_grants WHERE user_id='${MEMBER_B}' AND revoked_at IS NULL`), "1",
        "اعطا ثبت شد و لغو هم نشده");
      assert.equal(psql(db, `SELECT public.member_has_active_access('${MEMBER_B}','consulting')::text`), "false",
        "ولی دسترسی فعال نیست — انقضا مستقل از لغو است");
    });

    test("پس از انقضای طبیعی، اعطای تازه ممکن است", () => {
      // ⚠️ نقصِ نسخهٔ اول: ایندکسِ یکتای جزئی روی (user_id) WHERE revoked_at IS NULL.
      // انقضا `revoked_at` را پر نمی‌کند، پس عضوی که دوره‌اش طبیعتاً تمام شده بود
      // **هرگز** نمی‌توانست دسترسیِ تازه بگیرد. تستِ اول این را نگرفت چون فقط
      // مسیرِ «لغو، بعد اعطا» را می‌آزمود و هیچ دوره‌ای را منقضی نمی‌کرد.
      psql(db, `INSERT INTO public.member_import_rows
        (id, batch_id, contact_kind, contact_value, access_from, access_until, status, matched_user_id)
        VALUES (903, 1, 'email', 'synthetic-b-renewed@example.invalid',
                DATE '2026-09-01', DATE '2026-12-01', 'matched', '${MEMBER_B}')`);
      const gid = psql(db, `${AS_ADMIN} SELECT public.grant_member_access(903)`);
      assert.ok(Number(gid) > 0, "عضوِ منقضی باید بتواند دوباره دسترسی بگیرد");
      assert.equal(psql(db, `SELECT public.member_has_active_access('${MEMBER_B}','consulting')::text`), "true");
    });

    test("دسترسیِ لغوشده هم فعال شمرده نمی‌شود", () => {
      const gid = psql(db, `SELECT id FROM public.member_grants WHERE row_id=903 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1`);
      psql(db, `${AS_ADMIN} SELECT public.revoke_member_grant(${gid}, 'لغوِ آزمایشی برای سنجشِ حالتِ فعال.')`);
      assert.equal(psql(db, `SELECT public.member_has_active_access('${MEMBER_B}','consulting')::text`), "false");
    });

    /* ── تمدید ─────────────────────────────────────────────────────────── */

    test("تمدید زنجیره می‌سازد: قبلی لغو، تازه ساخته، دو سر وصل", () => {
      const gid = psql(db, `${AS_ADMIN} SELECT public.grant_member_access(903)`);
      const nid = psql(db, `${AS_ADMIN} SELECT public.renew_member_access(${gid},
        TIMESTAMPTZ '2027-06-01', 'تمدیدِ سه‌ماههٔ آزمایشی برای تست.')`);
      assert.notEqual(gid, nid);
      assert.equal(psql(db, `SELECT revoked_at IS NOT NULL FROM public.member_grants WHERE id=${gid}`), "t");
      assert.equal(psql(db, `SELECT renewed_from_grant_id FROM public.member_grants WHERE id=${nid}`), gid);
      assert.equal(psql(db, `SELECT e.expires_at::date::text FROM public.member_grants g
                    JOIN public.entitlements e ON e.id=g.entitlement_id WHERE g.id=${nid}`), "2027-06-01");
      assert.equal(psql(db, `SELECT public.member_has_active_access('${MEMBER_B}','consulting')::text`), "true");
      assert.equal(psql(db, `SELECT source FROM public.member_grants g JOIN public.entitlements e
                    ON e.id=g.entitlement_id WHERE g.id=${nid}`), "member_import_renewal",
        "منبعِ تمدید از اعطای اولیه قابلِ تفکیک است");
    });

    test("تمدید باید تاریخِ پایان را جلو ببرد — کوتاه‌کردن تمدید نیست", () => {
      const gid = psql(db, `SELECT id FROM public.member_grants WHERE user_id='${MEMBER_B}' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1`);
      const err = expectError(db, `${AS_ADMIN} SELECT public.renew_member_access(${gid},
        TIMESTAMPTZ '2026-10-01', 'تلاش برای کوتاه‌کردنِ دوره در قالبِ تمدید.')`);
      assert.match(err, /جلو ببرد/);
    });

    test("تمدید بدونِ علت و روی اعطای لغوشده ممکن نیست", () => {
      const gid = psql(db, `SELECT id FROM public.member_grants WHERE user_id='${MEMBER_B}' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1`);
      assert.match(expectError(db, `${AS_ADMIN} SELECT public.renew_member_access(${gid}, TIMESTAMPTZ '2028-01-01', 'کوتاه')`), /علتِ تمدید/);
      const old = psql(db, `SELECT id FROM public.member_grants WHERE revoked_at IS NOT NULL ORDER BY id LIMIT 1`);
      assert.match(expectError(db, `${AS_ADMIN} SELECT public.renew_member_access(${old}, TIMESTAMPTZ '2028-01-01', 'تمدیدِ اعطای لغوشده باید رد شود.')`), /لغوشده تمدید نمی‌شود/);
    });

    /* ── لغوِ موردی و دسته‌ای ───────────────────────────────────────────── */

    test("لغوِ موردی هم دفتر و هم خودِ دسترسی را لغو می‌کند", () => {
      const gid = psql(db, `SELECT id FROM public.member_grants WHERE user_id='${MEMBER_B}' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1`);
      const ent = psql(db, `SELECT entitlement_id FROM public.member_grants WHERE id=${gid}`);
      psql(db, `${AS_ADMIN} SELECT public.revoke_member_grant(${gid}, 'لغوِ موردیِ آزمایشی با علتِ کافی.')`);
      assert.equal(psql(db, `SELECT revoked_at IS NOT NULL FROM public.member_grants WHERE id=${gid}`), "t");
      assert.equal(psql(db, `SELECT revoked_at IS NOT NULL FROM public.entitlements WHERE id='${ent}'`), "t",
        "دسترسیِ واقعی هم باید لغو شود، نه فقط دفتر");
    });

    test("لغوِ موردیِ تکراری خطا نمی‌دهد، false برمی‌گرداند", () => {
      const gid = psql(db, `SELECT id FROM public.member_grants WHERE revoked_at IS NOT NULL ORDER BY id DESC LIMIT 1`);
      assert.equal(psql(db, `${AS_ADMIN} SELECT public.revoke_member_grant(${gid}, 'تلاشِ دومِ لغو روی همان اعطا.')`), "f");
    });

    test("لغو بدونِ علت ممکن نیست — حتی برای ادمین", () => {
      assert.match(expectError(db, `${AS_ADMIN} SELECT public.revoke_member_batch(1, 'کوتاه')`), /علتِ لغو/);
    });

    test("لغوِ دسته هر اعطای بازِ آن را از مسیرِ موردی می‌بندد", () => {
      const n = psql(db, `${AS_ADMIN} SELECT public.revoke_member_batch(1, 'لغوِ کلِ دستهٔ آزمایشی با علتِ کافی.')`);
      assert.ok(Number(n) >= 1);
      assert.equal(psql(db, `SELECT count(*) FROM public.member_grants WHERE revoked_at IS NULL`), "0");
      assert.equal(psql(db, `SELECT count(*) FROM public.entitlements WHERE revoked_at IS NULL`), "0",
        "هیچ دسترسیِ بازی نباید از یک دستهٔ لغوشده باقی بماند");
    });

    test("هیچ ردیفی پاک نشد — لغو برگشت‌پذیر است، نه حذف", () => {
      assert.ok(Number(psql(db, `SELECT count(*) FROM public.member_grants`)) >= 4,
        "همهٔ اعطاها — لغوشده و فعال — باقی مانده‌اند");
      assert.ok(Number(psql(db, `SELECT count(*) FROM public.entitlements`)) >= 4,
        "هیچ ردیفِ entitlements پاک نشد");
    });

    /* ── چهار موردی که بازبینی خواست ─────────────────────────────────────── */

    test("دستهٔ تازه و تأییدشده برای موارد زیر", () => {
      // دستهٔ ۱ در تست‌های قبل لغو شد؛ این‌ها دستهٔ مستقلِ خودشان را دارند.
      psql(db, `INSERT INTO public.member_import_batches (id, source_label, evidence, imported_by, approved_at, approved_by)
        VALUES (3, 'synthetic-review-cases.csv', 'دستهٔ مصنوعیِ بازبینی — دادهٔ واقعی ندارد', '${ADMIN}', now(), '${ADMIN}')`);
      assert.equal(psql(db, `SELECT approved_at IS NOT NULL AND revoked_at IS NULL FROM public.member_import_batches WHERE id=3`), "t");
    });

    test("هم‌زمانی: دو واردسازیِ موازی برای یک کاربر فقط یک دسترسی می‌دهد", () => {
      // ⚠️ این تست باید **واقعاً هم‌زمان** باشد. نسخهٔ اولش دو فراخوانی را
      // پشتِ‌سرِ هم اجرا می‌کرد، پس دومی گاردِ «دسترسیِ باز» را می‌دید و رد
      // می‌شد — و برداشتنِ قفلِ کاربر هیچ تستی را قرمز نمی‌کرد. یعنی قفل
      // **آزموده‌نشده** بود.
      //
      // اینجا دو تراکنشِ جدا باز می‌شوند، هر دو کمی صبر می‌کنند تا واقعاً
      // هم‌پوشانی داشته باشند، و بعد commit می‌کنند. زیرِ READ COMMITTED،
      // تراکنشِ دوم درجِ اولی را تا commit نمی‌بیند — پس بدونِ قفلِ سطحِ کاربر
      // هر دو یک `entitlements` می‌سازند.
      psql(db, `UPDATE public.entitlements SET revoked_at=now() WHERE user_id='${MEMBER_A}' AND revoked_at IS NULL`);
      psql(db, `INSERT INTO public.member_import_rows
        (id, batch_id, contact_kind, contact_value, access_from, access_until, status, matched_user_id)
        VALUES (910,3,'email','synthetic-conc-1@example.invalid', DATE '2026-09-01', DATE '2026-12-01','matched','${MEMBER_A}'),
               (911,3,'email','synthetic-conc-2@example.invalid', DATE '2026-09-01', DATE '2026-12-01','matched','${MEMBER_A}')`);
      const before = Number(psql(db,
        `SELECT count(*) FROM public.entitlements WHERE user_id='${MEMBER_A}' AND revoked_at IS NULL`));

      const tx = (rowId: number) => `BEGIN;
        SET LOCAL ROLE service_role;
        SET LOCAL request.jwt.claims = '{"sub":"${ADMIN}"}';
        SELECT pg_sleep(0.4);
        SELECT public.grant_member_access(${rowId});
        COMMIT;`;
      // هر دو را با هم استارت کن و منتظرِ هر دو بمان.
      execFileSync("bash", ["-c",
        `psql -d ${db} -X -q -A -t -c "${tx(910).replace(/"/g, '\\"').replace(/\n/g, " ")}" >/dev/null 2>&1 &
         psql -d ${db} -X -q -A -t -c "${tx(911).replace(/"/g, '\\"').replace(/\n/g, " ")}" >/dev/null 2>&1 &
         wait`],
        { env: PSQL_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

      const after = Number(psql(db,
        `SELECT count(*) FROM public.entitlements WHERE user_id='${MEMBER_A}' AND revoked_at IS NULL`));
      assert.equal(after, before + 1,
        `دو واردسازیِ موازی باید فقط یک دسترسیِ فعال بسازند (بود ${before}، شد ${after})`);
    });

    test("تاریخ شروعِ آینده: دسترسی از امروز فعال شمرده نمی‌شود", () => {
      // `lib/access.ts:72` سمتِ اپ `starts_at <= now()` را چک می‌کند.
      // اگر تابعِ دیتابیس این را چک نکند، دو مرجع با هم اختلاف پیدا می‌کنند و
      // پنلِ ادمین «فعال» نشان می‌دهد در حالی که کاربر دسترسی ندارد.
      psql(db, `UPDATE public.entitlements SET revoked_at=now() WHERE user_id='${MEMBER_B}' AND revoked_at IS NULL`);
      psql(db, `INSERT INTO public.member_import_rows
        (id, batch_id, contact_kind, contact_value, access_from, access_until, status, matched_user_id)
        VALUES (912,3,'email','synthetic-future@example.invalid',
                (CURRENT_DATE + 30), (CURRENT_DATE + 120), 'matched','${MEMBER_B}')`);
      psql(db, `${AS_ADMIN} SELECT public.grant_member_access(912)`);
      assert.equal(psql(db, `SELECT public.member_has_active_access('${MEMBER_B}','consulting')::text`), "false",
        "دسترسی‌ای که هنوز شروع نشده، فعال نیست");
    });

    test("مرزِ انقضا: دقیقاً در لحظهٔ پایان، دسترسی فعال نیست", () => {
      // ⚠️ مرز باید **درونِ یک تراکنش** سنجیده شود. اگر درج و پرس‌وجو دو
      // دستورِ جدا باشند، `now()` بینشان جلو می‌رود و ردیف به‌هرحال منقضی
      // می‌شود — آن‌وقت `>` و `>=` یک نتیجه می‌دهند و مرز اصلاً آزموده نشده.
      // در یک تراکنش `now()` ثابت است، پس تفاوتِ اکید و غیراکید دیده می‌شود.
      const uid = MEMBER_B;
      psql(db, `UPDATE public.entitlements SET revoked_at=now() WHERE user_id='${uid}' AND revoked_at IS NULL`);
      const atBoundary = psql(db, `BEGIN;
        INSERT INTO public.entitlements (user_id, kind, source, starts_at, expires_at)
        VALUES ('${uid}','consulting','test', now() - interval '10 days', now());
        SELECT public.member_has_active_access('${uid}','consulting')::text;
        ROLLBACK;`).trim().split("\n").pop();
      assert.equal(atBoundary, "false",
        "expires_at = now() یعنی تمام شده — مقایسه باید اکید باشد");

      const oneSecondLeft = psql(db, `BEGIN;
        INSERT INTO public.entitlements (user_id, kind, source, starts_at, expires_at)
        VALUES ('${uid}','consulting','test', now() - interval '10 days', now() + interval '1 second');
        SELECT public.member_has_active_access('${uid}','consulting')::text;
        ROLLBACK;`).trim().split("\n").pop();
      assert.equal(oneSecondLeft, "true", "یک ثانیه مانده یعنی هنوز فعال");
    });

    test("منطقهٔ زمانی: پایانِ دوره مستقل از TimeZone نشست است", () => {
      // `date::timestamptz` به **TimeZone نشست** وابسته است: زیرِ UTC می‌شود
      // `00:00+00` و زیرِ Asia/Tehran می‌شود `00:00+03:30` — یعنی همان فهرست
      // روی دو سرور دو لحظهٔ پایانِ متفاوت می‌سازد و ۳٫۵ ساعت دسترسیِ کم‌وزیاد.
      psql(db, `INSERT INTO public.member_import_rows
        (id, batch_id, contact_kind, contact_value, access_from, access_until, status, matched_user_id)
        VALUES (913,3,'email','synthetic-tz@example.invalid', DATE '2026-09-01', DATE '2026-12-01','matched','${ADMIN}')`);
      const gid = psql(db, `${AS_ADMIN} SELECT public.grant_member_access(913)`);
      const epochAt = (tz: string) =>
        psql(db, `SET TimeZone='${tz}'; SELECT extract(epoch from e.expires_at)::bigint
          FROM public.entitlements e
          JOIN public.member_grants g ON g.entitlement_id = e.id
          WHERE g.id = ${gid}`);
      const utc = epochAt("UTC");
      const tehran = epochAt("Asia/Tehran");
      assert.equal(utc, tehran, "لحظهٔ پایان باید یک لحظهٔ مطلق باشد، نه تابعِ TimeZone نشست");

      // و آن لحظه باید **پایانِ همان روز** به وقتِ تهران باشد — یعنی ابتدای روزِ بعد.
      const expected = psql(db,
        `SELECT extract(epoch from (DATE '2026-12-01' + 1)::timestamp AT TIME ZONE 'Asia/Tehran')::bigint`);
      assert.equal(utc, expected, "پایانِ دوره = پایانِ ۱۰ آذر به وقتِ تهران، نه نیمه‌شبِ UTC");

      // شاهدِ عددیِ تفاوت: کستِ ساده‌ٔ وابسته‌به‌نشست ۳٫۵ ساعت جابه‌جا می‌شود.
      const naiveUtc = psql(db, `SET TimeZone='UTC'; SELECT extract(epoch from (DATE '2026-12-01')::timestamptz)::bigint`);
      const naiveTehran = psql(db, `SET TimeZone='Asia/Tehran'; SELECT extract(epoch from (DATE '2026-12-01')::timestamptz)::bigint`);
      assert.equal(Number(naiveUtc) - Number(naiveTehran), 12600, "کستِ ساده ۳٫۵ ساعت (۱۲۶۰۰ ثانیه) فرق می‌کند");
    });

    /* ── حریمِ خصوصی: شناسهٔ تماس دادهٔ شخصی است ─────────────────────────── */

    test("کاربرِ عادی هیچ ردیفِ فهرست یا دسته‌ای نمی‌بیند", () => {
      assert.equal(asUser(db, MEMBER_B, `SELECT count(*) FROM public.member_import_rows`), "0");
      assert.equal(asUser(db, MEMBER_B, `SELECT count(*) FROM public.member_import_batches`), "0");
    });

    test("کاربر فقط اعطای خودش را می‌بیند — و همهٔ آن‌ها را", () => {
      const totalA = psql(db, `SELECT count(*) FROM public.member_grants WHERE user_id='${MEMBER_A}'`);
      const totalB = psql(db, `SELECT count(*) FROM public.member_grants WHERE user_id='${MEMBER_B}'`);
      assert.ok(Number(totalA) > 0 && Number(totalB) > 0, "هر دو کاربر اعطا دارند");
      assert.equal(asUser(db, MEMBER_A, `SELECT count(*) FROM public.member_grants`), totalA,
        "کاربرِ A همهٔ اعطاهای خودش را می‌بیند — لغوشده و فعال");
      assert.equal(asUser(db, MEMBER_B, `SELECT count(*) FROM public.member_grants`), totalB);
      // و هیچ‌کدام ردیفِ دیگری را نمی‌بیند
      assert.equal(asUser(db, MEMBER_A, `SELECT count(*) FROM public.member_grants WHERE user_id='${MEMBER_B}'`), "0");
      assert.equal(asUser(db, MEMBER_B, `SELECT count(*) FROM public.member_grants WHERE user_id='${MEMBER_A}'`), "0");
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
