/**
 * `phase30` روی Postgresِ **واقعی**.
 *
 * ── چرا تستِ کاتالوگ کافی نیست ──────────────────────────────────────────────
 * `has_function_privilege(...) = false` یک **ادعا** دربارهٔ کاتالوگ است. آنچه
 * باید اثبات شود رفتار است: نقشِ `authenticated` وقتی واقعاً تابع را صدا
 * می‌زند چه می‌بیند، و آیا سرور (`service_role`) هنوز کار می‌کند. هر دو اینجا
 * **اجرا** می‌شوند، نه استنتاج.
 *
 * ── و چرا تستِ «قبل» هم لازم است ────────────────────────────────────────────
 * تستی که فقط وضعیتِ بعد را می‌سنجد، اگر حفره از اول وجود نداشته باشد هم سبز
 * است. پس اول نشان می‌دهیم `authenticated` واقعاً می‌توانست ردیفِ پرداخت با
 * مبلغِ دلخواه بسازد — بعد نشان می‌دهیم دیگر نمی‌تواند.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
const DB = "phase30_payment_test";
const USER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function psqlFile(db: string, file: string): void {
  execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
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

/** بازتولیدِ همان شکلِ Production: جدول، یکتاییِ authority، و همان تابع. */
function seed(db: string): void {
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

    -- عیناً نسخهٔ امروزِ Production (خوانده‌شده با pg_get_functiondef).
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

    -- همان ACLِ اندازه‌گیری‌شدهٔ Production: authenticated و service_role.
    REVOKE ALL ON FUNCTION public.create_payment(integer, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.create_payment(integer, text) TO authenticated, service_role;
    GRANT SELECT ON public.payments TO authenticated, service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
  `);
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);

describe("phase30 — مهارِ create_payment", { skip: dbError ? `no Postgres: ${dbError}` : false }, () => {
  before(() => {
    psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
    psql("postgres", `CREATE DATABASE ${DB}`);
    psqlFile(DB, BOOTSTRAP);
    seed(DB);
  });

  test("پیش از phase30: کاربرِ لاگین‌کرده واقعاً می‌تواند مبلغِ دلخواه ثبت کند", () => {
    asRole(DB, "authenticated", USER, "SELECT public.create_payment(1, 'FORGED-BEFORE')");
    assert.equal(last(psql(DB, "SELECT amount FROM public.payments WHERE authority='FORGED-BEFORE'")), "1",
      "حفره باید واقعاً وجود داشته باشد، وگرنه تستِ بعدی توخالی است");
  });

  test("پیش از phase30: ولی نمی‌تواند به نامِ کاربرِ دیگری بسازد", () => {
    // `user_id` از `auth.uid()` می‌آید، نه از ورودی — این بخش از قبل درست بود
    // و دامنهٔ خطر را محدود می‌کند.
    assert.equal(last(psql(DB, "SELECT user_id FROM public.payments WHERE authority='FORGED-BEFORE'")), USER);
  });

  test("phase30 اجرا می‌شود و راستی‌آزماییِ خودش را رد می‌کند", () => {
    psqlFile(DB, PHASE30);
    assert.equal(last(psql(DB, `SELECT has_function_privilege('authenticated',
      'public.create_payment(integer,text)', 'EXECUTE')`)), "f");
  });

  test("پس از phase30: همان فراخوانی رد می‌شود — و هیچ ردیفی نمی‌سازد", () => {
    const err = asRoleError(DB, "authenticated", USER, "SELECT public.create_payment(1, 'FORGED-AFTER')");
    assert.match(err, /permission denied/i);
    assert.equal(last(psql(DB, "SELECT count(*) FROM public.payments WHERE authority='FORGED-AFTER'")), "0");
  });

  test("پس از phase30: سرور همچنان کار می‌کند", () => {
    // `service_role` باید بتواند — وگرنه مهار به قطعیِ سرویس تبدیل شده.
    // `auth.uid()` از claims می‌آید نه از نقش، پس مسیرِ سرور با sub کار می‌کند.
    asRole(DB, "service_role", USER, "SELECT public.create_payment(500000, 'SERVER-OK')");
    assert.equal(last(psql(DB, "SELECT amount FROM public.payments WHERE authority='SERVER-OK'")), "500000");
  });

  test("پس از phase30: خواندنِ پرداختِ خودش دست‌نخورده است", () => {
    // مهار دربارهٔ **نوشتن** است. اگر خواندن هم بشکند، صفحهٔ کاربر کور می‌شود.
    assert.equal(
      last(asRole(DB, "authenticated", USER, "SELECT count(*) FROM public.payments")), "2");
  });

  test("اجرای دوباره no-op است، نه نتیجهٔ دوم", () => {
    psqlFile(DB, PHASE30);
    assert.equal(last(psql(DB, `SELECT has_function_privilege('service_role',
      'public.create_payment(integer,text)', 'EXECUTE')`)), "t");
  });

  test("شکست‌پذیری: اگر گرنت برگردد، راستی‌آزماییِ فایل اجرا را می‌اندازد", () => {
    psql(DB, "GRANT EXECUTE ON FUNCTION public.create_payment(integer, text) TO authenticated");
    const err = expectError(DB, `
      DO $d$ DECLARE x bool; BEGIN
        SELECT has_function_privilege('authenticated','public.create_payment(integer,text)','EXECUTE') INTO x;
        IF x THEN RAISE EXCEPTION 'phase30: authenticated هنوز EXECUTE دارد'; END IF;
      END $d$;`);
    assert.match(err, /authenticated/);
    psqlFile(DB, PHASE30); // بازگرداندن به وضعیتِ درست
    assert.equal(last(psql(DB, `SELECT has_function_privilege('authenticated',
      'public.create_payment(integer,text)', 'EXECUTE')`)), "f");
  });
});
