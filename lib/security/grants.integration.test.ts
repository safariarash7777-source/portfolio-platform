import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * `phase23` روی Postgresِ **واقعی** — `B-044`.
 *
 * ── ادعایی که این فایل باید ثابت کند، نه تکرار ───────────────────────────────
 * در `docs/COMMAND-CENTER.md` نوشتیم «RLS جایگزینِ گرنت نیست». آن یک جمله بود.
 * `rls is not a substitute for the grant` پایین، همان جمله را روی دیتابیسِ
 * واقعی **اجرا** می‌کند:
 *
 *   • `anon` با DELETE مواجه می‌شود با سکوت — RLS صفر ردیف را حذف می‌کند.
 *   • همان `anon` با TRUNCATE **کلِ جدول را پاک می‌کند**، و تریگرِ append-only
 *     که دقیقاً برای جلوگیری از همین نوشته شده بود، اصلاً صدا زده نمی‌شود.
 *
 * اگر روزی کسی `phase23` را بردارد، آن تست سبز می‌ماند (چون نقصِ پیش از
 * migration را می‌سنجد) ولی `after phase23` قرمز می‌شود. این تفکیک عمدی است:
 * یکی نشان می‌دهد خطر **واقعی بود**، دیگری نشان می‌دهد **بسته شد**.
 */

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const ROOT = process.cwd();
const BOOTSTRAP = join(ROOT, "sql", "test", "supabase_bootstrap.sql");
const PHASE23 = join(ROOT, "sql", "phase23_grant_hardening.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

const USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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
function wrap(role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string): string {
  const claims = sub ? `{"sub":"${sub}","role":"${role}"}` : `{"role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (db: string, role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) =>
  psql(db, wrap(role, sub, sql));
const asRoleError = (db: string, role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) =>
  expectError(db, wrap(role, sub, sql));
const last = (s: string) => s.split("\n").pop()!.trim();

/**
 * چهار جدولِ نماینده که هر کدام یک شکلِ واقعی از این ریپو را بازتولید می‌کنند.
 * عمداً هم‌نامِ جدول‌های واقعی‌اند تا مسیرِ `waitlist` در `phase23` واقعاً سنجیده
 * شود، نه یک شاخهٔ ساختگی.
 */
function seedSchema(db: string): void {
  psql(db, `
    -- append-only، مثل codal_reports و symbol_history: RLS روشن، سیاستِ خواندنِ
    -- عمومی، و گاردِ حذف به‌صورتِ تریگر — همان گاردی که TRUNCATE دور می‌زند.
    CREATE TABLE public.symbol_history (id bigserial PRIMARY KEY, sym text NOT NULL);
    ALTER TABLE public.symbol_history ENABLE ROW LEVEL SECURITY;
    CREATE POLICY sh_read ON public.symbol_history FOR SELECT USING (true);
    CREATE FUNCTION public.sh_guard() RETURNS trigger LANGUAGE plpgsql AS
      $g$ BEGIN RAISE EXCEPTION 'append-only'; END $g$;
    CREATE TRIGGER sh_no_delete BEFORE DELETE ON public.symbol_history
      FOR EACH ROW EXECUTE FUNCTION public.sh_guard();
    INSERT INTO public.symbol_history(sym) SELECT 'S' || g FROM generate_series(1,50) g;

    -- فرمِ عمومی: تنها نوشتنی که anon واقعاً لازم دارد.
    CREATE TABLE public.waitlist (id bigserial PRIMARY KEY, email text UNIQUE NOT NULL);
    ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
    CREATE POLICY wl_public_insert ON public.waitlist FOR INSERT WITH CHECK (true);

    -- دادهٔ مالکِ کاربر: authenticated باید DELETE را نگه دارد.
    CREATE TABLE public.holdings (id bigserial PRIMARY KEY, user_id uuid NOT NULL, qty int);
    ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY hold_owner_write ON public.holdings FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    INSERT INTO public.holdings(user_id, qty) VALUES ('${USER}', 10);

    -- RLS روشن و **صفر سیاست** — دقیقاً وضعیتِ signals/signal_drafts روی staging.
    CREATE TABLE public.signals (id bigserial PRIMARY KEY, note text);
    ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
    INSERT INTO public.signals(note) VALUES ('x');

    INSERT INTO auth.users(id) VALUES ('${USER}');
    INSERT INTO public.profiles(id, role) VALUES ('${USER}', 'user');

    -- گرنت‌هایی که یک migrationِ واقعیِ فیچر می‌دهد. بدونِ این‌ها پروفایلِ
    -- explicit از «هیچ» شروع می‌کند و تست چیزی جز نبودِ گرنت را نمی‌سنجد.
    -- با این‌ها هر دو پروفایل از «فیچر کار می‌کند» شروع می‌کنند و تفاوتشان فقط
    -- امتیازِ اضافیِ موروثی است — یعنی دقیقاً همان چیزی که phase23 باید ببرد.
    GRANT SELECT ON public.symbol_history TO anon, authenticated;
    GRANT SELECT, INSERT ON public.symbol_history TO service_role;
    GRANT INSERT ON public.waitlist TO anon;
    GRANT SELECT, INSERT ON public.waitlist TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO authenticated;
    GRANT SELECT ON public.holdings TO service_role;
    GRANT SELECT ON public.signals TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.signals TO service_role;
    -- ستونِ bigserial بدونِ USAGE روی sequence قابلِ INSERT نیست. پروفایلِ
    -- legacy فقط TABLES و FUNCTIONS را پیش‌فرض می‌دهد، نه SEQUENCES.
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
  `);
}

/** اثرِ انگشتِ کاملِ امتیازها — برای مقایسهٔ دو پروفایل و سنجشِ idempotency. */
function grantFingerprint(db: string): string {
  return psql(db, `
    SELECT coalesce(string_agg(grantee||':'||table_name||':'||privilege_type, ','
             ORDER BY grantee, table_name, privilege_type), '')
      FROM information_schema.role_table_grants
     WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')`);
}

function createDb(db: string, profile: string, applyPhase23: boolean): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
  psql("postgres", `CREATE DATABASE ${db}`);
  psqlFile(db, BOOTSTRAP);
  psqlFile(db, profile);
  seedSchema(db);
  if (applyPhase23) psqlFile(db, PHASE23);
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);

describe("B-044 — the exposure, measured before it is claimed", { skip: dbError ? `no Postgres: ${dbError}` : false }, () => {
  const db = "g_pre";
  before(() => createDb(db, PROFILES.legacy, false));

  test("the legacy default-privilege profile really does hand anon TRUNCATE", () => {
    // بدونِ این، بقیهٔ فایل پوچ است: REVOKE چیزی برای پس‌گرفتن ندارد.
    assert.equal(last(psql(db, `SELECT has_table_privilege('anon','public.symbol_history','TRUNCATE')`)), "t");
    assert.equal(last(psql(db, `SELECT has_table_privilege('anon','public.symbol_history','DELETE')`)), "t");
  });

  test("rls is not a substitute for the grant — DELETE is refused, TRUNCATE is not", () => {
    const before = last(psql(db, "SELECT count(*) FROM public.symbol_history"));
    assert.equal(before, "50");

    // RLS روشن است و هیچ سیاستِ DELETE وجود ندارد: حذف بی‌صدا صفر ردیف می‌گیرد.
    // نه خطا می‌دهد، نه تریگرِ append-only را صدا می‌زند — چون هیچ ردیفی مطابقت
    // نمی‌کند. تا اینجا همه‌چیز امن به نظر می‌رسد.
    asRole(db, "anon", null, "DELETE FROM public.symbol_history");
    assert.equal(last(psql(db, "SELECT count(*) FROM public.symbol_history")), "50");

    // همان نقش، همان جدول، همان RLS — و کلِ جدول می‌رود.
    // هیچ سیاستی نمی‌تواند این را متوقف کند و تریگر هم اصلاً اجرا نمی‌شود.
    asRole(db, "anon", null, "TRUNCATE public.symbol_history");
    assert.equal(
      last(psql(db, "SELECT count(*) FROM public.symbol_history")), "0",
      "اگر این صفر نشد یعنی فرضِ اصلیِ B-044 غلط بوده و باید سند اصلاح شود"
    );
  });
});

for (const [name, profile] of Object.entries(PROFILES)) {
  describe(`after phase23 — ${name} profile`, { skip: dbError ? `no Postgres: ${dbError}` : false }, () => {
    const db = `g_post_${name}`;
    before(() => createDb(db, profile, true));

    test("no role holds TRUNCATE, TRIGGER or REFERENCES on any table", () => {
      const rows = psql(db, `
        SELECT coalesce(string_agg(grantee || ':' || privilege_type || ':' || table_name, ', '), '')
          FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
           AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')`);
      assert.equal(last(rows), "", "امتیازی که RLS نمی‌تواند مهارش کند باقی مانده");
    });

    test("anon can no longer truncate the append-only table", () => {
      const err = asRoleError(db, "anon", null, "TRUNCATE public.symbol_history");
      assert.match(err, /permission denied/i);
      assert.equal(last(psql(db, "SELECT count(*) FROM public.symbol_history")), "50");
    });

    test("the public waitlist form still works — anon keeps exactly that one write", () => {
      asRole(db, "anon", null, `INSERT INTO public.waitlist(email) VALUES ('a@b.co')`);
      assert.equal(last(psql(db, "SELECT count(*) FROM public.waitlist")), "1");

      const grants = psql(db, `
        SELECT coalesce(string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name), '')
          FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee='anon'
           AND privilege_type IN ('INSERT','UPDATE','DELETE')`);
      assert.equal(last(grants), "waitlist:INSERT");
    });

    test("anon cannot write to anything else", () => {
      assert.match(asRoleError(db, "anon", null, `INSERT INTO public.symbol_history(sym) VALUES ('X')`), /permission denied/i);
      assert.match(asRoleError(db, "anon", null, `UPDATE public.holdings SET qty = 0`), /permission denied/i);
      assert.match(asRoleError(db, "anon", null, `DELETE FROM public.signals`), /permission denied/i);
    });

    test("authenticated keeps DELETE where a policy can accept it, loses it where none can", () => {
      // holdings: سیاستِ ALL دارد → گرنت باید بماند، وگرنه کاربر نمی‌تواند
      // دارایی خودش را حذف کند و یک قابلیتِ واقعی می‌شکند.
      assert.equal(last(psql(db, `SELECT has_table_privilege('authenticated','public.holdings','DELETE')`)), "t");
      asRole(db, "authenticated", USER, "DELETE FROM public.holdings");
      assert.equal(last(psql(db, "SELECT count(*) FROM public.holdings")), "0");

      // signals: صفر سیاست → هیچ DELETEای هرگز ممکن نبود، پس گرنت وزنِ مرده بود.
      assert.equal(last(psql(db, `SELECT has_table_privilege('authenticated','public.signals','DELETE')`)), "f");
    });

    test("reads are untouched — this migration is about writes", () => {
      assert.equal(last(psql(db, `SELECT has_table_privilege('anon','public.symbol_history','SELECT')`)), "t");
      assert.equal(last(asRole(db, "anon", null, "SELECT count(*) FROM public.symbol_history")), "50");
    });

    test("the server still works — service_role writes and bypasses RLS", () => {
      asRole(db, "service_role", null, `INSERT INTO public.symbol_history(sym) VALUES ('SVC')`);
      assert.equal(last(psql(db, "SELECT count(*) FROM public.symbol_history")), "51");
    });

    test("re-running the migration is a no-op, not a second outcome", () => {
      const first = grantFingerprint(db);
      psqlFile(db, PHASE23);
      assert.equal(grantFingerprint(db), first, "اجرای دوم وضعیت را عوض کرد — migration idempotent نیست");
    });
  });
}

describe("what phase23 does and does not equalise between profiles", { skip: dbError ? `no Postgres: ${dbError}` : false }, () => {
  before(() => {
    createDb("g_conv_legacy", PROFILES.legacy, true);
    createDb("g_conv_explicit", PROFILES.explicit, true);
  });

  /**
   * هر امتیازِ نوشتنی که برای `anon`/`authenticated` باقی مانده باید سیاستی
   * داشته باشد که بتواند بپذیردش.
   *
   * چرا این، و نه برابریِ دو پروفایل: نسخهٔ دومِ این تست برابری می‌خواست و باز
   * قرمز شد. علتش درست بود — `phase23` فقط پس می‌گیرد، هرگز گرنت نمی‌دهد. پس
   * پروژهٔ legacy امتیازِ `authenticated:waitlist:INSERT` را نگه می‌دارد و
   * پروژهٔ explicit اصلاً نداشته. هر دو امن‌اند، ولی یکی نیستند.
   *
   * تضمینِ واقعیِ این migration یک **خاصیتِ ایمنی** است نه تساوی، و این کوئری
   * همان خاصیت را مستقیم می‌سنجد — روی هر دو پروفایل، و روی هر جدولی که در
   * آینده اضافه شود.
   */
  const orphanWriteGrants = (db: string) => psql(db, `
    SELECT coalesce(string_agg(g.grantee||':'||g.table_name||':'||g.privilege_type, ', '
             ORDER BY g.grantee, g.table_name, g.privilege_type), '')
      FROM information_schema.role_table_grants g
      JOIN pg_class c ON c.relname = g.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE g.table_schema = 'public'
       AND g.grantee IN ('anon','authenticated')
       AND g.privilege_type IN ('INSERT','UPDATE','DELETE')
       AND c.relrowsecurity
       AND NOT EXISTS (
             SELECT 1 FROM pg_policy p
              WHERE p.polrelid = c.oid AND p.polpermissive
                AND p.polcmd IN ('*', CASE g.privilege_type
                                        WHEN 'INSERT' THEN 'a'
                                        WHEN 'UPDATE' THEN 'w'
                                        ELSE 'd' END))`);

  test("no write grant survives that no policy could ever accept — on either profile", () => {
    assert.equal(orphanWriteGrants("g_conv_legacy"), "");
    assert.equal(orphanWriteGrants("g_conv_explicit"), "");
  });

  test("that guard is not vacuous — before phase23 the legacy profile is full of orphans", () => {
    createDb("g_conv_pre", PROFILES.legacy, false);
    assert.notEqual(orphanWriteGrants("g_conv_pre"), "");
  });

  test("outside that surface the profiles still differ, and that is not hidden", () => {
    // نسخهٔ اولِ این تست کلِ اثرِ انگشت را مقایسه می‌کرد و قرمز شد. تفاوت واقعی
    // بود: پروژهٔ legacy امتیازِ **SELECT**ِ موروثی روی جدول‌هایی دارد که هیچ
    // migrationی به آن‌ها SELECT نداده، و `service_role` هم نوشتنِ موروثی دارد.
    //
    // phase23 عمداً هیچ‌کدام را برنمی‌دارد: خواندن را RLS واقعاً مهار می‌کند
    // (برخلافِ TRUNCATE)، و بریدنِ نوشتنِ `service_role` سرور را می‌شکند.
    // پس تست را به اندازهٔ ادعای migration کوچک کردیم — ولی تفاوت را پاک
    // نکردیم، چون «سنجیده نشد» نباید شبیهِ «مشکلی نبود» به نظر برسد.
    assert.notEqual(grantFingerprint("g_conv_legacy"), grantFingerprint("g_conv_explicit"));

    // و ادعای «RLS خواندن را مهار می‌کند» را همین‌جا اجرا می‌کنیم، نه اینکه
    // فقط در کامنت بنویسیم.
    assert.equal(last(psql("g_conv_legacy", `SELECT has_table_privilege('anon','public.holdings','SELECT')`)), "t");
    assert.equal(last(asRole("g_conv_legacy", "anon", null, "SELECT count(*) FROM public.holdings")), "0");
  });
});

describe("phase23 fails loudly rather than reporting a success it did not achieve", { skip: dbError ? `no Postgres: ${dbError}` : false }, () => {
  const db = "g_fail";
  before(() => createDb(db, PROFILES.legacy, true));

  test("failability — reintroducing a TRUNCATE grant makes the migration raise", () => {
    // بدونِ این تست، بلوکِ assert در بخشِ ۴ ممکن است هرگز اجرا نشده باشد و ما
    // خبر نداشته باشیم. اینجا عمداً نقص را برمی‌گردانیم و انتظارِ قرمز داریم.
    psql(db, "GRANT TRUNCATE ON public.signals TO anon");
    const err = expectError(db, `
      DO $t$
      DECLARE n int;
      BEGIN
        SELECT count(*) INTO n FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
           AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');
        IF n <> 0 THEN RAISE EXCEPTION 'B-044 not closed: % grants survive', n; END IF;
      END $t$;`);
    assert.match(err, /B-044 not closed/, "گاردِ assert نقصِ برگردانده‌شده را ندید");

    // و اجرای دوبارهٔ خودِ فایل باید دوباره ببندَدش.
    psqlFile(db, PHASE23);
    assert.equal(last(psql(db, `SELECT has_table_privilege('anon','public.signals','TRUNCATE')`)), "f");
  });
});
