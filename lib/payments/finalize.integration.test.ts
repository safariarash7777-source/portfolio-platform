import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * `phase24` روی Postgresِ **واقعی** — مسیرِ «پرداخت → دسترسی».
 *
 * ── چرا این فایل جدا از `sql-contract.test.ts` است ───────────────────────────
 * آن فایل **متنِ** migration را می‌سنجد و فقط می‌تواند بگوید «این خط هنوز
 * هست». چیزی که واقعاً باید اثبات شود رفتار است:
 *
 *   • آیا اعطای دسترسی زیرِ فشارِ **هم‌زمانی** واقعاً یکتا می‌ماند؟
 *   • آیا شکستِ اعطای دسترسی واقعاً پرداخت را هم **برمی‌گرداند**، یا فقط
 *     در کامنت ادعا شده؟
 *   • آیا `anon` واقعاً نمی‌تواند برای خودش دسترسی بسازد؟
 *
 * هیچ‌کدام از این سه را نمی‌شود با regex اثبات کرد. اینجا فایل‌های **واقعیِ**
 * migration روی یک Postgresِ یک‌بارمصرف اجرا می‌شوند و رفتار اندازه‌گیری
 * می‌شود. اگر روزی کسی تابع را طوری بازنویسی کند که متن سبز بماند ولی رفتار
 * عوض شود، این فایل قرمز می‌شود و آن یکی نه.
 *
 * ⚠️ روی هیچ دیتابیسِ واقعی‌ای اجرا نمی‌شود — فقط `PGHOST` محلیِ CI.
 */

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};

const ROOT = process.cwd();
const SQL_FILES = {
  bootstrap: join(ROOT, "sql", "test", "supabase_bootstrap.sql"),
  phase5: join(ROOT, "sql", "phase5_payments_telegram.sql"),
  phase8: join(ROOT, "sql", "phase8_webinars.sql"),
  phase11: join(ROOT, "sql", "phase11_access_tiers.sql"),
  phase24: join(ROOT, "sql", "phase24_payment_entitlement.sql"),
} as const;

const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const AMOUNT = 5_000_000;
let WEBINAR_FOR_CROSS = "";
let webinarSeq = 0;
/** هر ثبت‌نام وبینارِ خودش را می‌خواهد: UNIQUE(webinar_id,user_id) روی جدول هست. */
const freshWebinar = () =>
  psql(
    DB,
    `INSERT INTO public.webinars (title, starts_at, price_toman, status, registration_open)
     VALUES ('webinar-' || ${++webinarSeq}, now() + interval '30 days', ${AMOUNT}, 'published', true)
     RETURNING id`
  );

function psql(db: string, sql: string): string {
  return execFileSync(
    "psql",
    ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

function psqlFile(db: string, file: string): void {
  execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** خطای مورد انتظار را برمی‌گرداند؛ رشتهٔ تهی یعنی دستور **موفق** شد. */
function expectError(db: string, sql: string): string {
  try {
    psql(db, sql);
  } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError = "";
try {
  psql("postgres", "SELECT 1");
} catch (error) {
  dbError = error instanceof Error ? error.message : String(error);
}
// در CI نبودِ Postgres باید **خطا** باشد، نه skipِ بی‌صدا — وگرنه این فایل
// می‌تواند ماه‌ها سبز بماند بدونِ آنکه یک بار اجرا شده باشد.
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);

const DB = "pay_finalize";

/**
 * پیش‌نیازهایی که فایل‌های migration فرض می‌کنند و در `supabase_bootstrap`
 * نیستند: `audit_log` (+ گاردِ append-only) و `is_admin`.
 */
function seedPrerequisites(db: string): void {
  psql(
    db,
    `
    CREATE TABLE IF NOT EXISTS public.audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid, action text NOT NULL, entity text NOT NULL,
      target_user_id uuid, before jsonb, after jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
      LANGUAGE sql STABLE AS $f$
        SELECT EXISTS (SELECT 1 FROM public.profiles
                        WHERE id = auth.uid() AND role = 'admin');
      $f$;
    `
  );
}

function createDb(): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
  psql("postgres", `CREATE DATABASE ${DB}`);
  psqlFile(DB, SQL_FILES.bootstrap);
  seedPrerequisites(DB);
  psqlFile(DB, SQL_FILES.phase5);
  psqlFile(DB, SQL_FILES.phase8);
  psqlFile(DB, SQL_FILES.phase11);
  // ⚠️ فایلِ واقعی — نه رونوشت. اگر بلوکِ تأییدِ انتهایش بشکند، همین‌جا می‌شکند.
  psqlFile(DB, SQL_FILES.phase24);

  psql(
    DB,
    `INSERT INTO auth.users (id) VALUES ('${USER}'), ('${OTHER}') ON CONFLICT DO NOTHING;
     INSERT INTO public.profiles (id) VALUES ('${USER}'), ('${OTHER}') ON CONFLICT DO NOTHING;`
  );
}

/** یک پرداختِ pending با authorityِ دلخواه می‌سازد. */
function seedPayment(authority: string, user = USER, amount = AMOUNT): string {
  return seedPaymentWithPurpose(authority, "consulting", user, amount);
}

function finalizeSql(
  authority: string,
  opts: { kind?: string; amount?: number; registrationId?: string | null } = {}
): string {
  const kind = opts.kind ?? "consulting";
  const reg = opts.registrationId ? `'${opts.registrationId}'` : "NULL";
  return `SELECT public.finalize_paid_access('${authority}', 'REF-1', ${
    opts.amount ?? AMOUNT
  }, '${kind}', NULL, ${reg})`;
}

/** پرداختِ pending با نوعِ محصولِ مشخص. */
function seedPaymentWithPurpose(authority: string, purpose: string, user = USER, amount = AMOUNT): string {
  return psql(
    DB,
    `INSERT INTO public.payments (user_id, amount, authority, status, purpose)
     VALUES ('${user}', ${amount}, '${authority}', 'pending', '${purpose}') RETURNING id`
  );
}

const entCount = (source: string) =>
  Number(psql(DB, `SELECT count(*) FROM public.entitlements WHERE source = '${source}'`));
/** شمارشِ دسترسی‌های ساخته‌شده برای یک authority — **بدونِ توجه به نوع**. */
const entCountForAuthority = (authority: string) =>
  Number(psql(DB, `SELECT count(*) FROM public.entitlements e
                     JOIN public.payments p ON p.id = e.payment_id
                    WHERE p.authority = '${authority}'`));
const paymentStatus = (authority: string) =>
  psql(DB, `SELECT status FROM public.payments WHERE authority = '${authority}'`);

describe("phase24 روی Postgresِ واقعی", { skip: dbError ? `Postgres در دسترس نیست: ${dbError}` : false }, () => {
  before(() => {
    createDb();
    WEBINAR_FOR_CROSS = psql(
      DB,
      `INSERT INTO public.webinars (title, starts_at, price_toman, status, registration_open)
       VALUES ('وبینارِ مشترکِ تست', now() + interval '30 days', ${AMOUNT}, 'published', true)
       RETURNING id`
    );
  });

  // ── مسیرِ موفق ────────────────────────────────────────────────────────────

  test("پرداختِ موفق: وضعیت paid و دقیقاً یک دسترسی", () => {
    const a = "AUTH-HAPPY";
    seedPayment(a);
    psql(DB, finalizeSql(a));

    assert.equal(paymentStatus(a), "paid");
    assert.equal(entCountForAuthority(a), 1);
    assert.equal(
      psql(DB, `SELECT kind FROM public.entitlements WHERE source = 'consulting:${a}'`),
      "consulting"
    );
  });

  test("دسترسیِ ساخته‌شده کاربر را واقعاً full می‌کند", () => {
    // این همان چیزی است که middleware و lib/access.ts می‌خوانند.
    assert.equal(psql(DB, `SELECT public.fn_user_access('${USER}')`), "full");
    assert.equal(psql(DB, `SELECT public.fn_user_access('${OTHER}')`), "registered");
  });

  test("ممیزیِ اعطا ثبت می‌شود", () => {
    assert.equal(
      psql(
        DB,
        `SELECT count(*) FROM public.audit_log
          WHERE action = 'entitlement.granted' AND target_user_id = '${USER}'`
      ),
      "1"
    );
  });

  // ── idempotency و replay ──────────────────────────────────────────────────

  test("replay: فراخوانیِ دوم دسترسیِ دوم نمی‌سازد و خطا هم نمی‌دهد", () => {
    const a = "AUTH-REPLAY";
    seedPayment(a);
    psql(DB, finalizeSql(a));
    psql(DB, finalizeSql(a));
    psql(DB, finalizeSql(a));

    assert.equal(entCountForAuthority(a), 1, "سه بار فراخوانی، یک دسترسی");
    assert.equal(paymentStatus(a), "paid");
  });

  test("replay ردیفِ ممیزیِ تکراری نمی‌سازد", () => {
    assert.equal(
      psql(
        DB,
        `SELECT count(*) FROM public.audit_log
          WHERE action = 'entitlement.granted'
            AND after->>'source' = 'consulting:AUTH-REPLAY'`
      ),
      "1"
    );
  });

  test("قیدِ یکتا مستقیماً هم درجِ دوم را می‌بندد", () => {
    // اثباتِ خودِ قید، مستقل از تابع.
    const err = expectError(
      DB,
      `INSERT INTO public.entitlements (user_id, kind, source, expires_at)
       VALUES ('${USER}', 'consulting', 'consulting:AUTH-REPLAY', now() + interval '1 month')`
    );
    assert.match(err, /duplicate key|uq_entitlements_user_source/i);
  });

  test("دو محصولِ متفاوت با یک کاربر هر دو دسترسی می‌گیرند", () => {
    // اگر قالبِ source مشترک بود، خریدِ دوم بی‌صدا نادیده گرفته می‌شد.
    const a = "AUTH-TWO-PRODUCTS";
    seedPaymentWithPurpose(a, "webinar");
    const regTwo = psql(DB, `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status, payment_id)
      VALUES ('${freshWebinar()}', '${USER}', 'pending',
              (SELECT id FROM public.payments WHERE authority='${a}')) RETURNING id`);
    assert.ok(regTwo.length > 0);
    psql(DB, finalizeSql(a, { kind: "webinar" }));
    assert.equal(entCountForAuthority(a), 1);
    assert.equal(entCountForAuthority('AUTH-REPLAY'), 1, "دسترسیِ قبلی دست‌نخورده");
  });

  // ── هم‌زمانی واقعی ────────────────────────────────────────────────────────

  test("هم‌زمانی: N تراکنشِ واقعاً موازی فقط یک دسترسی می‌سازند", async () => {
    const a = "AUTH-CONCURRENT";
    seedPayment(a);

    // ⚠️ `execFileSync` در یک حلقه **موازی نیست** — نسخهٔ اولِ همین تست آن
    // اشتباه را داشت و عملاً چیزی دربارهٔ هم‌زمانی اثبات نمی‌کرد. اینجا
    // پروسه‌ها با `execFile` غیرهمگام و `Promise.all` واقعاً هم‌زمان اجرا
    // می‌شوند، و `pg_sleep` داخلِ تراکنش تضمین می‌کند پنجره‌شان هم‌پوشانی کند.
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);

    const stmt = `BEGIN; SELECT pg_sleep(0.4); ${finalizeSql(a)}; COMMIT;`;
    const settled = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        run("psql", ["-d", DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", stmt], {
          env: ENV,
          encoding: "utf8",
        })
      )
    );

    const rejected = settled.filter((r) => r.status === "rejected");
    // هیچ‌کدام نباید خطا بگیرد: بازنده‌های مسابقه باید idempotent رد شوند،
    // نه با `duplicate key` به کاربر برگردند.
    assert.equal(
      rejected.length,
      0,
      `هر چهار تراکنش باید موفق شوند: ${rejected
        .map((r) => String((r as PromiseRejectedResult).reason?.stderr ?? ""))
        .join(" | ")}`
    );
    assert.equal(entCountForAuthority(a), 1, "زیرِ هم‌زمانی هم دقیقاً یک دسترسی");
    assert.equal(paymentStatus(a), "paid");
    assert.equal(
      psql(
        DB,
        `SELECT count(*) FROM public.audit_log
          WHERE action = 'entitlement.granted' AND after->>'source' = 'consulting:${a}'`
      ),
      "1",
      "ممیزی هم باید یکتا بماند"
    );
  });

  // ── گاردهای رد ────────────────────────────────────────────────────────────

  test("authorityِ ناشناخته رد می‌شود", () => {
    const err = expectError(DB, finalizeSql("AUTH-DOES-NOT-EXIST"));
    assert.match(err, /یافت نشد/);
  });

  test("عدمِ تطبیقِ مبلغ رد می‌شود و پرداخت pending می‌ماند", () => {
    const a = "AUTH-WRONG-AMOUNT";
    seedPayment(a);
    const err = expectError(DB, finalizeSql(a, { amount: AMOUNT + 1 }));
    assert.match(err, /عدم تطبیق مبلغ/);
    assert.equal(paymentStatus(a), "pending", "پرداخت نباید دست بخورد");
    assert.equal(entCountForAuthority(a), 0);
  });

  test("پرداختِ failed دوباره نهایی نمی‌شود", () => {
    const a = "AUTH-ALREADY-FAILED";
    seedPayment(a);
    psql(DB, `SELECT public.fail_payment('${a}')`);
    assert.equal(paymentStatus(a), "failed");

    const err = expectError(DB, finalizeSql(a));
    assert.match(err, /ناموفق ثبت شده/);
    assert.equal(entCountForAuthority(a), 0);
  });

  test("نوعِ دسترسیِ نامعتبر رد می‌شود", () => {
    const a = "AUTH-BAD-KIND";
    seedPayment(a);
    const err = expectError(DB, finalizeSql(a, { kind: "admin" }));
    assert.match(err, /نوعِ دسترسی نامعتبر/);
    assert.equal(paymentStatus(a), "pending");
  });

  // ── بایندِ ثبت‌نامِ وبینار ──────────────────────────────────────────────────

  describe("بایندِ ثبت‌نام", () => {
    let webinarId = "";
    let regOfUser = "";
    let regOfOther = "";
    let paidAuthority = "";

    before(() => {
      webinarId = psql(
        DB,
        `INSERT INTO public.webinars (title, starts_at, price_toman, status, registration_open)
         VALUES ('وبینار آزمایشی', now() + interval '10 days', ${AMOUNT}, 'published', true)
         RETURNING id`
      );
      paidAuthority = "AUTH-WEBINAR-OK";
      const paymentId = seedPaymentWithPurpose(paidAuthority, "webinar");
      regOfUser = psql(
        DB,
        `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status, payment_id)
         VALUES ('${webinarId}', '${USER}', 'pending', '${paymentId}') RETURNING id`
      );
      regOfOther = psql(
        DB,
        `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status)
         VALUES ('${webinarId}', '${OTHER}', 'pending') RETURNING id`
      );
    });

    test("ثبت‌نامِ متصل و هم‌کاربر: paid می‌شود", () => {
      psql(
        DB,
        finalizeSql(paidAuthority, {
          kind: "webinar",
          registrationId: regOfUser,
        })
      );
      assert.equal(
        psql(DB, `SELECT payment_status FROM public.webinar_registrations WHERE id = '${regOfUser}'`),
        "paid"
      );
      assert.equal(entCountForAuthority(paidAuthority), 1);
    });

    test("ثبت‌نامِ کاربرِ دیگر رد می‌شود و هیچ اثری نمی‌گذارد", () => {
      const a = "AUTH-WRONG-USER";
      seedPaymentWithPurpose(a, "webinar");
      const err = expectError(
        DB,
        finalizeSql(a, {
          kind: "webinar",
          registrationId: regOfOther,
        })
      );
      assert.match(err, /بدونِ ثبت‌نامِ متصل|کاربرِ دیگری/);
      assert.equal(paymentStatus(a), "pending");
      assert.equal(entCountForAuthority(a), 0);
      assert.equal(
        psql(DB, `SELECT payment_status FROM public.webinar_registrations WHERE id = '${regOfOther}'`),
        "pending",
        "ثبت‌نامِ کاربرِ دیگر نباید paid شود"
      );
    });

    test("ثبت‌نامی که به این پرداخت متصل نیست رد می‌شود (replayِ متقاطع)", () => {
      const a = "AUTH-UNLINKED-REG";
      seedPaymentWithPurpose(a, "webinar");
      const orphan = psql(
        DB,
        `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status)
         VALUES ('${webinarId}', '${USER}', 'pending')
         ON CONFLICT (webinar_id, user_id) DO UPDATE SET payment_status = 'pending'
         RETURNING id`
      );
      const err = expectError(
        DB,
        finalizeSql(a, {
          kind: "webinar",
          registrationId: orphan,
        })
      );
      assert.match(err, /بدونِ ثبت‌نامِ متصل|متصل نیست|کاربرِ دیگری/);
      assert.equal(paymentStatus(a), "pending");
    });
  });

  // ── اتمیک‌بودن ────────────────────────────────────────────────────────────

  test("شکستِ اعطای دسترسی، نهایی‌سازیِ پرداخت را هم برمی‌گرداند", () => {
    // مهم‌ترین ادعای این migration. با یک تریگرِ موقت روی entitlements
    // شکستِ درج شبیه‌سازی می‌شود؛ پرداخت **نباید** paid بماند.
    const a = "AUTH-GRANT-EXPLODES";
    seedPayment(a);
    psql(
      DB,
      `CREATE FUNCTION public.boom() RETURNS trigger LANGUAGE plpgsql AS
         $b$ BEGIN RAISE EXCEPTION 'شکستِ ساختگیِ اعطا'; END $b$;
       CREATE TRIGGER ent_boom BEFORE INSERT ON public.entitlements
         FOR EACH ROW EXECUTE FUNCTION public.boom();`
    );

    const err = expectError(DB, finalizeSql(a));
    assert.match(err, /شکستِ ساختگیِ اعطا/);

    // ← این خط کلِ طراحی را اثبات می‌کند.
    assert.equal(
      paymentStatus(a),
      "pending",
      "پرداخت نباید paid بماند وقتی دسترسی ساخته نشد"
    );
    assert.equal(entCountForAuthority(a), 0);

    psql(DB, `DROP TRIGGER ent_boom ON public.entitlements; DROP FUNCTION public.boom();`);
  });

  test("درجِ **بی‌صدا بی‌اثر** هم پرداخت را برمی‌گرداند", () => {
    // ── چرا این تست جدا از تستِ بالاست ────────────────────────────────────
    // آن تست با تریگری که `RAISE` می‌کند شکست را می‌سازد — و آنجا اتمیک‌بودن
    // را خودِ Postgres تضمین می‌کند، نه گاردِ ما. یعنی آن تست بدونِ
    // `IF v_ent_id IS NULL` هم سبز می‌ماند (اندازه‌گیری شد).
    //
    // خطرِ واقعی این است: نوشتنی که **خطا نمی‌دهد ولی کاری هم نمی‌کند**.
    // تریگرِ BEFORE INSERT که `NULL` برگرداند دقیقاً همین است. بدونِ گاردِ
    // `v_ent_id IS NULL`، تابع اینجا با موفقیت برمی‌گشت و مشتری صفحهٔ سبز
    // می‌دید بدونِ آنکه ردیفِ دسترسی وجود داشته باشد.
    const a = "AUTH-GRANT-SILENT-NOOP";
    seedPayment(a);
    psql(
      DB,
      `CREATE FUNCTION public.skip_insert() RETURNS trigger LANGUAGE plpgsql AS
         $b$ BEGIN RETURN NULL; END $b$;
       CREATE TRIGGER ent_skip BEFORE INSERT ON public.entitlements
         FOR EACH ROW EXECUTE FUNCTION public.skip_insert();`
    );

    const err = expectError(DB, finalizeSql(a));
    assert.match(err, /اعطای دسترسی انجام نشد/, "باید صریحاً بشکند، نه موفق برگردد");
    assert.equal(paymentStatus(a), "pending", "پرداخت نباید paid بماند");
    assert.equal(entCountForAuthority(a), 0);

    psql(DB, `DROP TRIGGER ent_skip ON public.entitlements; DROP FUNCTION public.skip_insert();`);
  });

  test("پس از رفعِ علت، همان پرداخت با موفقیت نهایی می‌شود", () => {
    // خودترمیم‌شوندگی: مشتری فقط لینکِ بازگشت را دوباره باز می‌کند.
    const a = "AUTH-GRANT-EXPLODES";
    psql(DB, finalizeSql(a));
    assert.equal(paymentStatus(a), "paid");
    assert.equal(entCountForAuthority(a), 1);
  });

  // ══════════════════════════════════════════════════════════════════════
  // بازنگریِ Command Center — اثباتِ روی Postgresِ واقعی
  // ══════════════════════════════════════════════════════════════════════

  describe("یک authority ⇒ حداکثر یک دسترسی", () => {
    test("همان authorityِ پرداخت‌شده از callbackِ دوم رد می‌شود", () => {
      // ⚠️ دقیقاً سناریوی گزارشِ P1. پیش از بایندِ purpose، اجرای دوم با
      // kind='webinar' یک دسترسیِ دومِ کاملاً معتبر می‌ساخت.
      const a = "AUTH-CROSS-CALLBACK";
      seedPaymentWithPurpose(a, "consulting");

      psql(DB, finalizeSql(a, { kind: "consulting" }));
      assert.equal(entCountForAuthority(a), 1);

      const err = expectError(DB, finalizeSql(a, { kind: "webinar" }));
      assert.match(err, /نمی‌خواند/, "callbackِ وبینار باید رد شود");
      assert.equal(entCountForAuthority(a), 1, "هنوز فقط یک دسترسی");
    });

    test("جهتِ معکوس: پرداختِ وبینار از callbackِ مشاوره رد می‌شود", () => {
      const a = "AUTH-CROSS-REVERSE";
      const pid = seedPaymentWithPurpose(a, "webinar");
      psql(DB, `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status, payment_id)
                VALUES ('${freshWebinar()}', '${OTHER}', 'pending', '${pid}')`);
      const err = expectError(DB, finalizeSql(a, { kind: "consulting" }));
      assert.match(err, /نمی‌خواند/);
      assert.equal(entCountForAuthority(a), 0);
    });

    test("قیدِ یکتای payment_id مستقیماً درجِ دوم را می‌بندد", () => {
      const a = "AUTH-CROSS-CALLBACK";
      const pid = psql(DB, `SELECT id FROM public.payments WHERE authority='${a}'`);
      const err = expectError(
        DB,
        `INSERT INTO public.entitlements (user_id, kind, source, expires_at, payment_id)
         VALUES ('${USER}', 'webinar', 'webinar:${a}', now() + interval '1 month', '${pid}')`
      );
      assert.match(err, /duplicate key|uq_entitlements_payment/i);
    });

    test("پرداختِ بدونِ purpose قابلِ نهایی‌سازی نیست", () => {
      const a = "AUTH-NO-PURPOSE";
      psql(DB, `INSERT INTO public.payments (user_id, amount, authority, status)
                VALUES ('${USER}', ${AMOUNT}, '${a}', 'pending')`);
      const err = expectError(DB, finalizeSql(a));
      assert.match(err, /نوعِ محصول ندارد/);
      assert.equal(entCountForAuthority(a), 0);
    });

    test("purpose پس از ساخت تغییرناپذیر است", () => {
      const a = "AUTH-CROSS-REVERSE";
      const err = expectError(
        DB,
        `UPDATE public.payments SET purpose='consulting' WHERE authority='${a}'`
      );
      assert.match(err, /تغییرناپذیر|نهایی‌شده|گذارِ وضعیت/);
    });
  });

  describe("وبینار بدونِ ثبت‌نامِ متصل", () => {
    test("نهایی‌سازی رد می‌شود و پرداخت pending می‌ماند", () => {
      const a = "AUTH-WEBINAR-NO-REG";
      seedPaymentWithPurpose(a, "webinar");
      const err = expectError(DB, finalizeSql(a, { kind: "webinar" }));
      assert.match(err, /بدونِ ثبت‌نامِ متصل/);
      assert.equal(paymentStatus(a), "pending");
      assert.equal(entCountForAuthority(a), 0);
    });

    test("یک ثبت‌نام نمی‌تواند به دو پرداخت وصل شود", () => {
      const a1 = "AUTH-REG-LINK-1";
      const a2 = "AUTH-REG-LINK-2";
      const p1 = seedPaymentWithPurpose(a1, "webinar");
      const p2 = seedPaymentWithPurpose(a2, "webinar");
      const reg = psql(DB, `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status, payment_id)
                            VALUES ('${freshWebinar()}', '${USER}', 'pending', '${p1}') RETURNING id`);
      assert.ok(reg.length > 0);
      const err = expectError(
        DB,
        `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status, payment_id)
         VALUES ('${freshWebinar()}', '${OTHER}', 'pending', '${p1}')`
      );
      assert.match(err, /duplicate key|uq_webinar_registrations_payment/i, "دو ثبت‌نام روی یک پرداخت");
      assert.ok(p2.length > 0);
    });
  });

  describe("مدتِ دسترسی سمتِ سرور و به‌ازای محصول", () => {
    test("مدت از جدولِ پیکربندی می‌آید، نه از فراخواننده", () => {
      psql(DB, `UPDATE public.entitlement_durations SET months = 7 WHERE purpose = 'consulting'`);
      const a = "AUTH-DURATION";
      seedPaymentWithPurpose(a, "consulting");
      psql(DB, finalizeSql(a));
      const months = psql(
        DB,
        `SELECT round(extract(epoch FROM (e.expires_at - now())) / 2629746.0)::int
           FROM public.entitlements e JOIN public.payments p ON p.id = e.payment_id
          WHERE p.authority = '${a}'`
      );
      assert.equal(months, "7", "مدت باید از جدول خوانده شود");
      psql(DB, `UPDATE public.entitlement_durations SET months = 3 WHERE purpose = 'consulting'`);
    });

    test("محصولات می‌توانند مدتِ متفاوت داشته باشند", () => {
      const rows = psql(DB, `SELECT count(DISTINCT purpose) FROM public.entitlement_durations`);
      assert.equal(rows, "2");
    });

    test("مدتِ حذف‌شده باعثِ شکست می‌شود، نه دسترسیِ بی‌انقضا", () => {
      psql(DB, `DELETE FROM public.entitlement_durations WHERE purpose='consulting'`);
      const a = "AUTH-NO-DURATION";
      seedPaymentWithPurpose(a, "consulting");
      const err = expectError(DB, finalizeSql(a));
      assert.match(err, /مدتِ دسترسی برای محصول/);
      assert.equal(paymentStatus(a), "pending");
      psql(DB, `INSERT INTO public.entitlement_durations (purpose, months) VALUES ('consulting', 3)`);
    });
  });

  describe("ساختِ اتمیکِ پرداختِ وبینار", () => {
    test("create_webinar_payment پرداخت و اتصال را با هم می‌سازد", () => {
      const reg = psql(DB, `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status)
                            VALUES ('${freshWebinar()}', '${USER}', 'pending') RETURNING id`);
      const pid = psql(
        DB,
        `BEGIN; SELECT set_config('request.jwt.claims','{"sub":"${USER}","role":"authenticated"}',true);
         SELECT public.create_webinar_payment('${reg}', ${AMOUNT}, 'AUTH-ATOMIC-LINK'); COMMIT;`
      ).split("\n").pop()!.trim();
      assert.ok(pid.length > 0);
      assert.equal(
        psql(DB, `SELECT payment_id::text FROM public.webinar_registrations WHERE id='${reg}'`),
        pid,
        "اتصال باید در همان تراکنش نوشته شده باشد"
      );
      assert.equal(psql(DB, `SELECT purpose FROM public.payments WHERE authority='AUTH-ATOMIC-LINK'`), "webinar");
    });

    test("ثبت‌نامِ کاربرِ دیگر رد می‌شود و هیچ پرداختی ساخته نمی‌شود", () => {
      const reg = psql(DB, `INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status)
                            VALUES ('${freshWebinar()}', '${OTHER}', 'pending') RETURNING id`);
      const err = expectError(
        DB,
        `BEGIN; SELECT set_config('request.jwt.claims','{"sub":"${USER}","role":"authenticated"}',true);
         SELECT public.create_webinar_payment('${reg}', ${AMOUNT}, 'AUTH-ATOMIC-DENY'); COMMIT;`
      );
      assert.match(err, /متعلقِ شما نیست/);
      assert.equal(psql(DB, `SELECT count(*) FROM public.payments WHERE authority='AUTH-ATOMIC-DENY'`), "0",
        "شکستِ اتصال نباید پرداختِ یتیم بسازد");
    });
  });

  // ── امتیازها ──────────────────────────────────────────────────────────────

  describe("امتیازها", () => {
    const SIG =
      "public.finalize_paid_access(text,text,integer,text,text,uuid)";

    test("anon اجازهٔ اجرا ندارد", () => {
      assert.equal(psql(DB, `SELECT has_function_privilege('anon','${SIG}','EXECUTE')`), "f");
    });

    test("authenticated اجازهٔ اجرا ندارد — کاربر نباید برای خودش دسترسی بسازد", () => {
      assert.equal(
        psql(DB, `SELECT has_function_privilege('authenticated','${SIG}','EXECUTE')`),
        "f"
      );
    });

    test("service_role اجازهٔ اجرا دارد", () => {
      assert.equal(
        psql(DB, `SELECT has_function_privilege('service_role','${SIG}','EXECUTE')`),
        "t"
      );
    });

    test("کاربرِ لاگین‌کرده واقعاً نمی‌تواند تابع را صدا بزند", () => {
      // سنجشِ رفتار، نه فقط کاتالوگ.
      const err = expectError(
        DB,
        `BEGIN; SET LOCAL ROLE authenticated; ${finalizeSql("AUTH-HAPPY")}; COMMIT;`
      );
      assert.match(err, /permission denied/i);
    });

    test("کاربرِ لاگین‌کرده نمی‌تواند مستقیماً دسترسی درج کند", () => {
      const err = expectError(
        DB,
        `BEGIN;
         SELECT set_config('request.jwt.claims','{"sub":"${USER}","role":"authenticated"}',true);
         SET LOCAL ROLE authenticated;
         INSERT INTO public.entitlements (user_id, kind, source, expires_at)
         VALUES ('${USER}','consulting','consulting:SELF-GRANT', now() + interval '99 years');
         COMMIT;`
      );
      assert.notEqual(err, "", "درجِ مستقیم باید رد شود");
      assert.equal(entCount('consulting:SELF-GRANT'), 0);
    });
  });
});
