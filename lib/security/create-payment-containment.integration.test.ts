/**
 * `phase30` روی Postgresِ **واقعی**.
 *
 * ── چرا تستِ کاتالوگ کافی نیست ──────────────────────────────────────────────
 * `has_function_privilege(...) = false` یک **ادعا** دربارهٔ کاتالوگ است. آنچه
 * باید اثبات شود رفتار است: نقشِ `authenticated` وقتی واقعاً تابع را صدا
 * می‌زند چه می‌بیند، و آیا مسیرِ سرور هنوز کار می‌کند. هر دو اینجا **اجرا**
 * می‌شوند، نه استنتاج.
 *
 * ── و چرا تستِ «قبل» هم لازم است ────────────────────────────────────────────
 * تستی که فقط وضعیتِ بعد را می‌سنجد، اگر حفره از اول وجود نداشته باشد هم سبز
 * است. پس اول نشان می‌دهیم `authenticated` واقعاً می‌توانست ردیفِ پرداخت با
 * مبلغِ دلخواه بسازد — بعد نشان می‌دهیم دیگر نمی‌تواند.
 *
 * ── محدودهٔ تضمینِ این فایل ─────────────────────────────────────────────────
 * این تست‌ها روی یک Postgresِ محلیِ یک‌بارمصرف اجرا می‌شوند که نقش‌ها و شکلِ
 * جدول را بازتولید می‌کند. آنچه **اثبات می‌کنند**: منطقِ خودِ migration —
 * ترتیب، اتمیک‌بودن، تشخیصِ امتیازِ مؤثر، ایده‌مپوتنسی، و رفتارِ `auth.uid()`.
 * آنچه **اثبات نمی‌کنند**: وضعیتِ ACL روی Production در لحظهٔ اجرا. آن را
 * باید همان‌جا و پیش از اجرا خواند.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const ROOT = process.cwd();
const BOOTSTRAP = join(ROOT, "sql", "test", "supabase_bootstrap.sql");
const PHASE30 = join(ROOT, "sql", "phase30_contain_create_payment.sql");
const USER = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SIG = "public.create_payment(integer,text)";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
/**
 * خروجیِ `psql` برای یک فایل — **شاملِ stderr**.
 *
 * `RAISE NOTICE` روی stderr می‌رود، نه stdout. نسخهٔ اولِ همین تست فقط stdout
 * را می‌خواند و پیامِ موفقیتِ خودِ migration را نمی‌دید — یعنی تست دربارهٔ
 * چیزی که ادعا می‌کرد کور بود.
 */
function runFile(db: string, file: string): { code: number; out: string } {
  const r = spawnSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV, encoding: "utf8",
  });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
function psqlFile(db: string, file: string): string {
  const r = runFile(db, file);
  if (r.code !== 0) throw new Error(`psql exited ${r.code}: ${r.out}`);
  return r.out;
}
function fileError(db: string, file: string): string {
  const r = runFile(db, file);
  return r.code === 0 ? "" : r.out;
}
function expectError(db: string, sql: string): string {
  try { psql(db, sql); } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}
function wrap(role: string, sub: string | null, sql: string): string {
  const claims = sub ? `{"sub":"${sub}","role":"${role}"}` : `{"role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (db: string, role: string, sub: string | null, sql: string) => psql(db, wrap(role, sub, sql));
const asRoleError = (db: string, role: string, sub: string | null, sql: string) =>
  expectError(db, wrap(role, sub, sql));
const last = (s: string) => s.split("\n").pop()!.trim();
const canExec = (db: string, role: string) =>
  last(psql(db, `SELECT has_function_privilege('${role}', '${SIG}', 'EXECUTE')`));

/** فقط جدول و نقش‌ها — بدونِ تابع. */
function seedTables(db: string): void {
  psql(db, `
    CREATE TABLE public.payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      amount integer NOT NULL,
      authority text UNIQUE,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status = ANY (ARRAY['pending','paid','failed'])),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY pay_own ON public.payments FOR SELECT USING (auth.uid() = user_id);
    CREATE TABLE public.audit_log (
      id bigserial PRIMARY KEY,
      actor_id uuid, action text, entity text, target_user_id uuid, after jsonb
    );
    INSERT INTO auth.users(id) VALUES ('${USER}');
    INSERT INTO public.profiles(id, role) VALUES ('${USER}', 'user');
    GRANT SELECT ON public.payments TO authenticated, service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
  `);
}

/** امضای **امروزِ Production** — عیناً از `pg_get_functiondef`. */
function seedOldSignature(db: string): void {
  psql(db, `
    CREATE FUNCTION public.create_payment(p_amount integer, p_authority text)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
    DECLARE v_id uuid;
    BEGIN
      IF auth.uid() IS NULL THEN RAISE EXCEPTION 'دسترسی غیرمجاز.'; END IF;
      IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ نامعتبر.'; END IF;
      INSERT INTO public.payments (user_id, amount, authority, status)
      VALUES (auth.uid(), p_amount, p_authority, 'pending') RETURNING id INTO v_id;
      INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
      VALUES (auth.uid(), 'payment.request', 'payment', auth.uid(),
              jsonb_build_object('amount', p_amount, 'authority', p_authority));
      RETURN v_id;
    END $f$;
    REVOKE ALL ON FUNCTION public.create_payment(integer, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.create_payment(integer, text) TO authenticated, service_role;
  `);
}

/** امضای چهارآرگومانیِ #113 (`phase24`) — کاربر را صریح می‌گیرد. */
function seedNewSignature(db: string): void {
  psql(db, `
    CREATE FUNCTION public.create_payment(p_user_id uuid, p_amount integer, p_authority text, p_purpose text)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
    DECLARE v_id uuid;
    BEGIN
      IF p_user_id IS NULL THEN RAISE EXCEPTION 'کاربرِ پرداخت مشخص نیست.'; END IF;
      INSERT INTO public.payments (user_id, amount, authority, status)
      VALUES (p_user_id, p_amount, p_authority, 'pending') RETURNING id INTO v_id;
      RETURN v_id;
    END $f$;
    REVOKE ALL ON FUNCTION public.create_payment(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_payment(uuid, integer, text, text) TO service_role;
  `);
}

function freshDb(name: string, withOld: boolean, withNew = false): string {
  psql("postgres", `DROP DATABASE IF EXISTS ${name}`);
  psql("postgres", `CREATE DATABASE ${name}`);
  psqlFile(name, BOOTSTRAP);
  seedTables(name);
  if (withOld) seedOldSignature(name);
  if (withNew) seedNewSignature(name);
  return name;
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);
const skip = dbError ? `no Postgres: ${dbError}` : false;

/* ── حالتِ ۱: امضای قدیمی موجود ───────────────────────────────────────────── */

describe("phase30 · امضای قدیمی موجود", { skip, concurrency: 1 }, () => {
  const DB = "p30_old";
  before(() => freshDb(DB, true));

  test("پیش از مهار: کاربرِ لاگین‌کرده واقعاً مبلغِ دلخواه ثبت می‌کند", () => {
    asRole(DB, "authenticated", USER, "SELECT public.create_payment(1, 'FORGED-BEFORE')");
    assert.equal(last(psql(DB, "SELECT amount FROM public.payments WHERE authority='FORGED-BEFORE'")), "1",
      "حفره باید واقعاً وجود داشته باشد، وگرنه تستِ بعدی توخالی است");
  });

  test("پیش از مهار: ولی هویت جعل‌شدنی نیست — `user_id` از auth.uid() می‌آید", () => {
    assert.equal(last(psql(DB, "SELECT user_id FROM public.payments WHERE authority='FORGED-BEFORE'")), USER);
  });

  test("مهار اجرا می‌شود و راستی‌آزماییِ خودش را رد می‌کند", () => {
    const out = psqlFile(DB, PHASE30);
    assert.match(out, /phase30 ok/);
    assert.equal(canExec(DB, "authenticated"), "f");
    assert.equal(canExec(DB, "anon"), "f");
    assert.equal(canExec(DB, "service_role"), "t");
  });

  test("پس از مهار: همان فراخوانی رد می‌شود و هیچ ردیفی نمی‌سازد", () => {
    const err = asRoleError(DB, "authenticated", USER, "SELECT public.create_payment(1, 'FORGED-AFTER')");
    assert.match(err, /permission denied/i);
    assert.equal(last(psql(DB, "SELECT count(*) FROM public.payments WHERE authority='FORGED-AFTER'")), "0");
  });

  test("پس از مهار: خواندنِ پرداختِ خودِ کاربر دست‌نخورده است", () => {
    // مهار دربارهٔ **نوشتن** است. اگر خواندن هم بشکند، صفحهٔ کاربر کور می‌شود.
    assert.equal(last(asRole(DB, "authenticated", USER, "SELECT count(*) FROM public.payments")), "1");
  });

  test("اجرای دوباره no-op است، نه نتیجهٔ دوم", () => {
    const aclBefore = last(psql(DB, `SELECT coalesce(array_to_string(proacl,','),'') FROM pg_proc
      WHERE oid = '${SIG}'::regprocedure`));
    psqlFile(DB, PHASE30);
    const aclAfter = last(psql(DB, `SELECT coalesce(array_to_string(proacl,','),'') FROM pg_proc
      WHERE oid = '${SIG}'::regprocedure`));
    assert.equal(aclAfter, aclBefore, "ACL نباید بینِ دو اجرا فرق کند");
  });
});

/* ── حالتِ ۲: فقط امضای جدیدِ #113 موجود ──────────────────────────────────── */

describe("phase30 · فقط امضای جدیدِ #113", { skip, concurrency: 1 }, () => {
  const DB = "p30_new_only";
  before(() => freshDb(DB, false, true));

  test("بی‌اثر است و **خطا نمی‌دهد**", () => {
    // نقصِ نسخهٔ قبل: `REVOKE` پیش از بررسیِ وجود اجرا می‌شد و فایل با
    // `function ... does not exist` می‌افتاد.
    const out = psqlFile(DB, PHASE30);
    assert.match(out, /وجود ندارد/);
    assert.doesNotMatch(out, /ERROR/);
  });

  test("به امضای چهارآرگومانی دست نمی‌زند", () => {
    assert.equal(last(psql(DB, `SELECT has_function_privilege('service_role',
      'public.create_payment(uuid,integer,text,text)', 'EXECUTE')`)), "t");
    assert.equal(last(psql(DB, `SELECT has_function_privilege('authenticated',
      'public.create_payment(uuid,integer,text,text)', 'EXECUTE')`)), "f");
  });
});

/* ── حالتِ ۳: هر دو امضا کنارِ هم ─────────────────────────────────────────── */

describe("phase30 · هر دو امضا هم‌زمان", { skip, concurrency: 1 }, () => {
  const DB = "p30_both";
  before(() => freshDb(DB, true, true));

  test("فقط امضای دوآرگومانی مهار می‌شود؛ چهارآرگومانی دست‌نخورده می‌ماند", () => {
    psqlFile(DB, PHASE30);
    assert.equal(canExec(DB, "authenticated"), "f", "دوآرگومانی باید بسته شود");
    assert.equal(last(psql(DB, `SELECT has_function_privilege('service_role',
      'public.create_payment(uuid,integer,text,text)', 'EXECUTE')`)), "t",
      "چهارآرگومانی نباید لمس شود");
  });
});

/* ── حالتِ ۴: امتیازِ مؤثر از راهِ PUBLIC ─────────────────────────────────── */

describe("phase30 · امتیاز از راهِ PUBLIC", { skip, concurrency: 1 }, () => {
  const DB = "p30_public";
  before(() => {
    freshDb(DB, true);
    // `authenticated` گرنتِ مستقیم ندارد، ولی PUBLIC دارد — یعنی همه دارند.
    psql(DB, `REVOKE ALL ON FUNCTION ${SIG} FROM authenticated;
              GRANT EXECUTE ON FUNCTION ${SIG} TO PUBLIC;`);
  });

  test("مسیرِ PUBLIC واقعاً امتیازِ مؤثر می‌دهد — وگرنه تستِ بعدی توخالی است", () => {
    assert.equal(canExec(DB, "authenticated"), "t");
    assert.equal(canExec(DB, "anon"), "t");
  });

  test("مهار مسیرِ PUBLIC را هم می‌بندد", () => {
    psqlFile(DB, PHASE30);
    assert.equal(canExec(DB, "authenticated"), "f");
    assert.equal(canExec(DB, "anon"), "f");
    assert.equal(canExec(DB, "service_role"), "t");
  });
});

/* ── حالتِ ۵: امتیازِ مؤثر از راهِ عضویتِ نقش — و اتمیک‌بودن ───────────────── */

describe("phase30 · امتیاز از راهِ عضویتِ نقش", { skip, concurrency: 1 }, () => {
  const DB = "p30_member";
  before(() => {
    freshDb(DB, true);
    // ⚠️ نقش‌ها **کلاستری‌اند**، نه per-database. بدونِ این DROP، اجرای دومِ
    // همین فایل با «role already exists» می‌افتد.
    psql("postgres", "DROP ROLE IF EXISTS payment_callers");
    psql(DB, `
      CREATE ROLE payment_callers;
      GRANT EXECUTE ON FUNCTION ${SIG} TO payment_callers;
      GRANT payment_callers TO authenticated;
    `);
  });

  test("عضویت واقعاً امتیازِ مؤثر می‌دهد", () => {
    assert.equal(canExec(DB, "authenticated"), "t");
  });

  test("مهار به‌جای ادعای موفقیتِ دروغ، با خطا می‌ایستد", () => {
    // `REVOKE ... FROM authenticated` امتیازِ نقشِ واسط را برنمی‌دارد. فایل
    // نباید «ok» بگوید — باید بگوید نتوانست.
    const err = fileError(DB, PHASE30);
    assert.match(err, /EXECUTEِ مؤثر/);
  });

  test("و ACL نیمه‌تغییریافته نمی‌ماند — تغییرها برمی‌گردند", () => {
    // این هستهٔ اتمیک‌بودن است: گرنتِ مستقیمِ `authenticated` باید سرِ جایش
    // مانده باشد، چون کلِ بلوک rollback شده.
    const acl = last(psql(DB, `SELECT coalesce(array_to_string(proacl,','),'') FROM pg_proc
      WHERE oid = '${SIG}'::regprocedure`));
    assert.match(acl, /authenticated=X/, "گرنتِ مستقیم باید برگشته باشد");
    assert.equal(canExec(DB, "payment_callers"), "t", "نقشِ واسط هم دست‌نخورده");
  });

  test("پس از برداشتنِ عضویت، همان فایل موفق می‌شود", () => {
    psql(DB, "REVOKE payment_callers FROM authenticated");
    const out = psqlFile(DB, PHASE30);
    assert.match(out, /phase30 ok/);
    assert.equal(canExec(DB, "authenticated"), "f");
  });
});

/* ── EXECUTE ≠ کارکردن: رفتارِ واقعیِ auth.uid() ──────────────────────────── */

describe("phase30 · EXECUTE برای service_role موفقیت نیست", { skip, concurrency: 1 }, () => {
  const DB = "p30_authuid";
  before(() => { freshDb(DB, true); psqlFile(DB, PHASE30); });

  test("service_role امتیاز دارد", () => {
    assert.equal(canExec(DB, "service_role"), "t");
  });

  test("ولی بدونِ claims، خودِ تابع رد می‌کند — `auth.uid()` تهی است", () => {
    // مسیرِ سرور با کلاینتِ service_role هیچ JWTای ندارد. پس «امتیاز دارد»
    // با «کار می‌کند» یکی نیست، و این فایل نباید آن را موفقیت بنامد.
    const err = expectError(DB,
      `BEGIN; SET LOCAL ROLE service_role; SELECT public.create_payment(500000, 'NO-CLAIMS'); COMMIT;`);
    assert.match(err, /دسترسی غیرمجاز/);
    assert.equal(last(psql(DB, "SELECT count(*) FROM public.payments WHERE authority='NO-CLAIMS'")), "0");
  });

  test("با claims کار می‌کند — یعنی تابع سالم است، مسیرش بسته است", () => {
    asRole(DB, "service_role", USER, "SELECT public.create_payment(500000, 'WITH-CLAIMS')");
    assert.equal(last(psql(DB, "SELECT amount FROM public.payments WHERE authority='WITH-CLAIMS'")), "500000");
  });

  test("نتیجه: پس از مهار هیچ مسیرِ کاریِ باقی‌مانده‌ای برای این امضا نیست", () => {
    // `authenticated` امتیاز ندارد؛ `service_role` امتیاز دارد ولی claims
    // ندارد. پس تا آمدنِ امضای چهارآرگومانی، پرداختِ تازه ممکن نیست — و این
    // همان «توقفِ کنترل‌شده» است، نه یک باگ.
    assert.equal(canExec(DB, "authenticated"), "f");
    assert.match(
      expectError(DB, `BEGIN; SET LOCAL ROLE service_role; SELECT public.create_payment(1, 'X'); COMMIT;`),
      /دسترسی غیرمجاز/,
    );
  });
});
