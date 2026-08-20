import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ماشینِ راستی‌آزماییِ بکاپ، روی Postgresِ **واقعی**.
 *
 * ── چه چیزی اینجا اثبات می‌شود و چه چیزی نه ─────────────────────────────────
 *
 * اثبات می‌شود:
 *   • بازگردانیِ اتمیک با `--single-transaction` + `ON_ERROR_STOP=1` واقعاً
 *     با کدِ غیرصفر شکست می‌خورد و **ساختارِ نیمه‌اعمال‌شده جا نمی‌گذارد**؛
 *   • `inventory.sql` تغییری را می‌گیرد که **تعداد را عوض نمی‌کند**؛
 *   • `compare.mjs` هر دو جهت را می‌بیند: گمشده و اضافه.
 *
 * اثبات **نمی‌شود** (و نباید ادعا شود): اینکه یک بکاپِ واقعیِ Production
 * قابلِ بازگردانی است. آن فقط با اجرای واقعیِ اسکریپت روی دستگاهِ آرش و روی
 * یک استکِ Supabaseِ محلی معلوم می‌شود. این فایل **ابزار** را می‌سنجد، نه
 * بکاپ را.
 */

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};

const ROOT = process.cwd();
const INVENTORY = join(ROOT, "scripts", "backup", "inventory.sql");
const ASSERT_SCHEMAS = join(ROOT, "scripts", "backup", "assert-managed-schemas.sql");
const COMPARE = join(ROOT, "scripts", "backup", "compare.mjs");

const SRC = "bk_src";
const DST = "bk_dst";

function psql(db: string, args: string[]): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], {
    env: ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** کدِ خروجی را برمی‌گرداند — همان چیزی که اسکریپت‌ها بر اساسش تصمیم می‌گیرند. */
function psqlExit(db: string, args: string[]): number {
  try {
    psql(db, args);
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

function compareExit(a: string, b: string): number {
  try {
    execFileSync("node", [COMPARE, a, b], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError = "";
try {
  psql("postgres", ["-c", "SELECT 1"]);
} catch (error) {
  dbError = error instanceof Error ? error.message : String(error);
}
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);

/** اسکیمای نمونه — به‌اندازهٔ کافی غنی که اثرِ انگشت چیزی برای دیدن داشته باشد. */
const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE storage.objects (id uuid PRIMARY KEY, name text);
CREATE TABLE public.profiles (
  id serial PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notes (id serial PRIMARY KEY, owner int REFERENCES public.profiles(id), body text);
CREATE INDEX idx_notes_owner ON public.notes(owner);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_admin ON public.profiles FOR UPDATE USING (role = 'admin');
CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RETURN NEW; END $fn$;
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.touch();
CREATE VIEW public.admins AS SELECT id FROM public.profiles WHERE role = 'admin';
`;

const DATA_SQL = `
INSERT INTO public.profiles (email, role)
  SELECT 'u' || g || '@example.test', CASE WHEN g % 5 = 0 THEN 'admin' ELSE 'user' END
    FROM generate_series(1, 23) g;
INSERT INTO public.notes (owner, body)
  SELECT (g % 23) + 1, 'note ' || g FROM generate_series(1, 61) g;
INSERT INTO auth.users SELECT gen_random_uuid(), 'a' || g || '@example.test'
  FROM generate_series(1, 9) g;
INSERT INTO storage.objects SELECT gen_random_uuid(), 'obj-' || g
  FROM generate_series(1, 4) g;
`;

let work = "";
let schemaDump = "";
let dataDump = "";

function freshSource(): void {
  psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${SRC}`]);
  psql("postgres", ["-c", `CREATE DATABASE ${SRC}`]);
  psql(SRC, ["-c", SCHEMA_SQL]);
  psql(SRC, ["-c", DATA_SQL]);
}

/**
 * مقصدِ خالی که اسکیماهای مدیریت‌شده را **از قبل** دارد — مثلِ استکِ Supabase.
 *
 * ⚠️ فقط ساختنِ اسکیما کافی نیست: استکِ واقعی **جدول‌های** `auth.users` و
 * `storage.objects` را هم دارد، و dumpِ data مستقیماً داخلِ همان‌ها می‌نویسد.
 * اولین نسخهٔ این تست فقط اسکیما می‌ساخت و بازگردانی با کدِ ۳ می‌شکست — که
 * دقیقاً همان چیزی است که روی `postgres:17-alpine` اتفاق می‌افتاد.
 */
const MANAGED_SQL = `
-- dumpِ schema خودش \`public\` را می‌سازد (رفتارِ pg_dump از PG15 به بعد)،
-- پس مقصد نباید نسخهٔ پیش‌فرضش را داشته باشد.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE storage.objects (id uuid PRIMARY KEY, name text);
`;

function freshTarget(withManagedSchemas = true): void {
  psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${DST}`]);
  psql("postgres", ["-c", `CREATE DATABASE ${DST}`]);
  if (withManagedSchemas) psql(DST, ["-c", MANAGED_SQL]);
}

function inventory(db: string, out: string): void {
  const text = execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", INVENTORY], {
    env: ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(out, text, "utf8");
}

/** بازگردانیِ اتمیک، دقیقاً به همان شکلی که اسکریپت‌ها اجرا می‌کنند. */
function restore(schemaFile: string, dataFile: string): number {
  return psqlExit(DST, [
    "--single-transaction",
    "--file", schemaFile,
    "--command", "SET session_replication_role = replica",
    "--file", dataFile,
  ]);
}

describe("ماشینِ راستی‌آزماییِ بکاپ روی Postgresِ واقعی", {
  skip: dbError ? `Postgres در دسترس نیست: ${dbError}` : false,
}, () => {
  before(() => {
    work = mkdtempSync(join(tmpdir(), "bk-verify-"));
    schemaDump = join(work, "schema.sql");
    dataDump = join(work, "data.sql");
    freshSource();

    // ⚠️ اسکیماهای مدیریت‌شده از dumpِ schema بیرون می‌مانند — دقیقاً همان
    // کاری که Supabase CLI می‌کند — ولی دادهٔ داخلشان در dumpِ data هست.
    execFileSync("pg_dump", ["-d", SRC, "--schema-only", "--schema=public", "-f", schemaDump], {
      env: ENV, stdio: ["ignore", "pipe", "pipe"],
    });
    execFileSync("pg_dump", ["-d", SRC, "--data-only", "--column-inserts", "-f", dataDump], {
      env: ENV, stdio: ["ignore", "pipe", "pipe"],
    });
  });

  describe("مقصدِ وفادار", () => {
    test("Postgresِ ساده رد می‌شود — همان ایرادِ postgres:17-alpine", () => {
      freshTarget(false);
      const code = psqlExit(DST, ["-f", ASSERT_SCHEMAS]);
      assert.notEqual(code, 0, "مقصدِ بدونِ auth/storage باید رد شود");
    });

    test("مقصدی با اسکیماهای مدیریت‌شده پذیرفته می‌شود", () => {
      freshTarget(true);
      assert.equal(psqlExit(DST, ["-f", ASSERT_SCHEMAS]), 0);
    });
  });

  describe("بازگردانیِ سالم", () => {
    test("بازگردانی با کدِ ۰ تمام می‌شود", () => {
      freshTarget(true);
      assert.equal(restore(schemaDump, dataDump), 0);
    });

    test("اثرِ انگشتِ مبدأ و مقصد دقیقاً یکی است", () => {
      const a = join(work, "src.txt");
      const b = join(work, "dst.txt");
      inventory(SRC, a);
      inventory(DST, b);
      assert.equal(compareExit(a, b), 0);
    });

    test("شمارشِ ردیف‌ها پویا است و هر سه اسکیما را می‌بیند", () => {
      const text = readFileSync(join(work, "src.txt"), "utf8");
      for (const key of [
        "rowcount|public.profiles|23",
        "rowcount|public.notes|61",
        "rowcount|auth.users|9",
        "rowcount|storage.objects|4",
      ]) {
        assert.ok(text.includes(key), `${key} در فهرست نیست`);
      }
    });
  });

  describe("تزریقِ خطای عمدی", () => {
    test("یک دستورِ خراب کلِ بازگردانی را با کدِ غیرصفر می‌شکند", () => {
      const broken = join(work, "schema-broken.sql");
      const original = readFileSync(schemaDump, "utf8");
      // یک ستون به جدولی که وجود ندارد — خطای زمانِ اجرا، نه خطای نحوی.
      writeFileSync(broken, original + "\nALTER TABLE public.does_not_exist ADD COLUMN x int;\n", "utf8");

      freshTarget(true);
      const code = restore(broken, dataDump);
      assert.notEqual(code, 0, "⚠️ اگر این صفر شود، نشانگر هرگز نمی‌تواند قرمز شود");
    });

    test("تراکنشِ شکست‌خورده ساختارِ نیمه‌اعمال‌شده جا نمی‌گذارد", () => {
      // این همان دلیلِ وجودِ `--single-transaction` است.
      const remaining = psql(DST, [
        "-A", "-t", "-c",
        "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'",
      ]).trim();
      assert.equal(remaining, "0", `مقصد باید کاملاً خالی مانده باشد، ${remaining} جدول یافت شد`);
    });

    test("خطای فایل‌محورِ psql با ERROR شروع نمی‌شود — پس grep کافی نبود", () => {
      const broken = join(work, "only-broken.sql");
      writeFileSync(broken, "SELECT 1;\nALTER TABLE public.nope ADD COLUMN x int;\n", "utf8");
      freshTarget(true);
      let stderr = "";
      try {
        execFileSync("psql", ["-d", DST, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", broken], {
          env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        stderr = String((error as { stderr?: string }).stderr ?? "");
      }
      // شکلِ واقعی: `psql:/path/file.sql:2: ERROR:  ...`
      assert.match(stderr, /^psql:.*: ERROR:/m);
      assert.doesNotMatch(stderr, /^ERROR:/m, "الگوی ^ERROR اینجا هیچ‌وقت نمی‌گرفت");
    });
  });

  describe("مقایسه، دوطرفه و حساس به تعریف", () => {
    const paths = () => ({ a: join(work, "cmp-src.txt"), b: join(work, "cmp-dst.txt") });

    before(() => {
      freshTarget(true);
      restore(schemaDump, dataDump);
    });

    /** یک تغییر در مقصد اعمال، مقایسه، بعد برگرداندن. */
    function probe(mutate: string, undo: string): number {
      const { a, b } = paths();
      psql(DST, ["-c", mutate]);
      inventory(SRC, a);
      inventory(DST, b);
      const code = compareExit(a, b);
      psql(DST, ["-c", undo]);
      return code;
    }

    test("پایه: بدونِ تغییر، سبز", () => {
      const { a, b } = paths();
      inventory(SRC, a);
      inventory(DST, b);
      assert.equal(compareExit(a, b), 0);
    });

    test("گم‌شدنِ ردیف از جدولی که در فهرستِ ثابتِ قبلی نبود", () => {
      assert.equal(
        probe(
          "DELETE FROM public.notes WHERE id = (SELECT max(id) FROM public.notes)",
          "INSERT INTO public.notes (owner, body) VALUES (1, 'note 61')"
        ),
        1
      );
    });

    test("جابه‌جاییِ policy با حفظِ تعداد", () => {
      assert.equal(
        probe(
          "DROP POLICY profiles_self ON public.profiles; CREATE POLICY profiles_other ON public.profiles FOR SELECT USING (true)",
          "DROP POLICY profiles_other ON public.profiles; CREATE POLICY profiles_self ON public.profiles FOR SELECT USING (true)"
        ),
        1
      );
    });

    test("تغییرِ تعریفِ تابع با حفظِ تعداد", () => {
      // ⚠️ متنِ بازگردانی باید **بایت‌به‌بایت** همانِ SCHEMA_SQL باشد، حتی
      // در فاصله‌ها. اولین نسخهٔ این تست به‌جای خطِ جدید یک فاصله گذاشت و
      // تستِ بعدی قرمز شد — که خودش نشان می‌دهد اثرِ انگشت چقدر حساس است.
      assert.equal(
        probe(
          "CREATE OR REPLACE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $fn$\nBEGIN RAISE NOTICE 'x'; RETURN NEW; END $fn$",
          "CREATE OR REPLACE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $fn$\nBEGIN RETURN NEW; END $fn$"
        ),
        1
      );
    });

    test("خاموش‌شدنِ بی‌صدای RLS", () => {
      assert.equal(
        probe(
          "ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY",
          "ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY"
        ),
        1
      );
    });

    test("شیءِ **اضافه** در مقصد هم شکست است", () => {
      assert.equal(
        probe("CREATE TABLE public.unexpected (id int)", "DROP TABLE public.unexpected"),
        1
      );
    });

    test("امتیازِ اضافه‌شده به PUBLIC دیده می‌شود", () => {
      assert.equal(
        probe(
          "GRANT SELECT ON public.profiles TO PUBLIC",
          "REVOKE SELECT ON public.profiles FROM PUBLIC"
        ),
        1
      );
    });

    test("تغییرِ تعریفِ تریگر با حفظِ تعداد", () => {
      assert.equal(
        probe(
          "DROP TRIGGER notes_touch ON public.notes; CREATE TRIGGER notes_touch AFTER UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch()",
          "DROP TRIGGER notes_touch ON public.notes; CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch()"
        ),
        1
      );
    });

    test("پس از برگرداندنِ همهٔ تغییرها دوباره سبز است", () => {
      const { a, b } = paths();
      inventory(SRC, a);
      inventory(DST, b);
      assert.equal(compareExit(a, b), 0, "تست‌ها نباید حالتِ ماندگار جا بگذارند");
    });
  });
});
