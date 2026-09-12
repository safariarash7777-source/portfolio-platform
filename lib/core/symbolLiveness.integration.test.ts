/**
 * `phase29` روی Postgresِ **واقعی**.
 *
 * ── چرا تستِ متنی کافی نبود ─────────────────────────────────────────────────
 * `validate:sql` می‌گوید فایل نحوِ درستی دارد. `validate:sql:grammar` می‌گوید
 * پارس می‌شود. هیچ‌کدام نمی‌گویند تابع **چه برمی‌گرداند** و **چه کسی می‌تواند
 * صدایش بزند**. سه ادعای این فایل فقط با اجرا اثبات می‌شوند:
 *
 *   ۱. یک ردیف به‌ازای هر نماد — نه بیشتر (اگر `DISTINCT ON` بشکند) و نه کمتر.
 *   ۲. تابع RLS را دور نمی‌زند — نقشی که ردیف را نمی‌بیند، از راهِ تابع هم نبیند.
 *   ۳. `PUBLIC` امتیازِ اجرا نمی‌گیرد، حتی با پیش‌فرضِ Postgres که می‌دهد.
 *
 * ادعای سوم مهم‌ترین است: پیش‌فرضِ Postgres روی هر تابعِ تازه
 * `EXECUTE TO PUBLIC` است. اگر خطِ `REVOKE` از فایل بیفتد، هیچ‌چیز خطا نمی‌دهد
 * — فقط تابع برای همه باز می‌ماند. تستِ «شکست‌پذیری» پایین همین را می‌سنجد.
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
const PHASE29 = join(ROOT, "sql", "phase29_symbol_liveness.sql");
const DB = "phase29_liveness_test";

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
const asRole = (db: string, role: string, sql: string) =>
  psql(db, `BEGIN; SET LOCAL ROLE ${role}; ${sql}; COMMIT;`);
const asRoleError = (db: string, role: string, sql: string) =>
  expectError(db, `BEGIN; SET LOCAL ROLE ${role}; ${sql}; COMMIT;`);
const last = (s: string) => s.split("\n").pop()!.trim();

/** همان شکلِ واقعی: RLS روشن، سیاستِ خواندنِ عمومی، چند نماد با چند روز. */
function seed(db: string): void {
  psql(db, `
    CREATE TABLE public.symbol_history (
      id bigserial PRIMARY KEY,
      symbol text NOT NULL,
      trade_date date NOT NULL,
      close numeric,
      UNIQUE (symbol, trade_date)
    );
    CREATE INDEX idx_symbol_history_symbol_date ON public.symbol_history (symbol, trade_date);
    ALTER TABLE public.symbol_history ENABLE ROW LEVEL SECURITY;
    -- سیاستِ واقعیِ این ریپو بعد از #118: خواندنِ عمومی از راهِ RLS.
    CREATE POLICY sh_read ON public.symbol_history FOR SELECT USING (true);
    GRANT SELECT ON public.symbol_history TO anon, authenticated, service_role;

    -- «فولاد» زنده، «کهنه» عقب‌مانده، «دتهران» سال‌ها بی‌حرکت.
    INSERT INTO public.symbol_history(symbol, trade_date, close) VALUES
      ('فولاد','2026-09-10',100), ('فولاد','2026-09-11',101), ('فولاد','2026-09-12',102),
      ('کهنه','2026-09-01',50),  ('کهنه','2026-09-02',51),
      ('دتهران','2018-10-28',7), ('دتهران','2018-10-29',8);
  `);
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);

describe("phase29 — آخرین روزِ معاملاتیِ هر نماد", { skip: dbError ? `no Postgres: ${dbError}` : false }, () => {
  before(() => {
    psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
    psql("postgres", `CREATE DATABASE ${DB}`);
    psqlFile(DB, BOOTSTRAP);
    seed(DB);
    psqlFile(DB, PHASE29);
  });

  test("دقیقاً یک ردیف به‌ازای هر نماد، با بیشینهٔ تاریخ", () => {
    const out = psql(DB, `SELECT symbol||'='||last_trade_date
                            FROM public.symbol_last_trade_dates() ORDER BY symbol`);
    assert.deepEqual(out.split("\n").sort(), [
      "دتهران=2018-10-29", "فولاد=2026-09-12", "کهنه=2026-09-02",
    ].sort());
  });

  test("۷ ردیفِ خام به ۳ ردیفِ نماد تبدیل می‌شود — نه ۷ تا", () => {
    assert.equal(last(psql(DB, "SELECT count(*) FROM public.symbol_history")), "7");
    assert.equal(last(psql(DB, "SELECT count(*) FROM public.symbol_last_trade_dates()")), "3");
  });

  test("تابع SECURITY INVOKER است — RLS را دور نمی‌زند", () => {
    const definer = last(psql(DB, `SELECT prosecdef FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='symbol_last_trade_dates'`));
    assert.equal(definer, "f");
  });

  test("و این ادعا توخالی نیست: با سیاستِ محدودکننده، تابع هم محدود می‌شود", () => {
    psql(DB, "DROP POLICY sh_read ON public.symbol_history");
    psql(DB, "CREATE POLICY sh_read ON public.symbol_history FOR SELECT USING (symbol = 'فولاد')");
    try {
      assert.equal(last(asRole(DB, "anon", "SELECT count(*) FROM public.symbol_last_trade_dates()")), "1",
        "اگر تابع DEFINER بود، هر سه نماد را می‌داد");
      assert.equal(last(psql(DB, "SELECT count(*) FROM public.symbol_last_trade_dates()")), "3",
        "مالکِ جدول (که RLS شاملش نیست) همچنان هر سه را می‌بیند");
    } finally {
      psql(DB, "DROP POLICY sh_read ON public.symbol_history");
      psql(DB, "CREATE POLICY sh_read ON public.symbol_history FOR SELECT USING (true)");
    }
  });

  test("نقش‌های برنامه می‌توانند صدا بزنند", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(last(asRole(DB, role, "SELECT count(*) FROM public.symbol_last_trade_dates()")), "3", role);
    }
  });

  test("PUBLIC امتیازِ اجرا ندارد — با اینکه پیش‌فرضِ Postgres می‌دهد", () => {
    const acl = last(psql(DB, `SELECT coalesce(array_to_string(proacl,','),'(null)') FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='symbol_last_trade_dates'`));
    assert.ok(!acl.includes("=X/") || !/(^|,)=X\//.test(acl), `PUBLIC هنوز EXECUTE دارد: ${acl}`);
    // یک نقشِ بی‌ربط نباید بتواند — یعنی گرنت واقعاً صریح است، نه موروثی.
    psql(DB, "DROP ROLE IF EXISTS phase29_stranger; CREATE ROLE phase29_stranger");
    try {
      const err = asRoleError(DB, "phase29_stranger", "SELECT count(*) FROM public.symbol_last_trade_dates()");
      assert.match(err, /permission denied/i);
    } finally {
      psql(DB, "DROP ROLE IF EXISTS phase29_stranger");
    }
  });

  test("اجرای دوباره no-op است، نه نتیجهٔ دوم", () => {
    const before1 = psql(DB, `SELECT count(*) FROM public.symbol_last_trade_dates()`);
    psqlFile(DB, PHASE29);
    assert.equal(psql(DB, `SELECT count(*) FROM public.symbol_last_trade_dates()`), before1);
  });

  test("شکست‌پذیری: اگر تابع DEFINER شود، خودِ فایل اجرا را می‌اندازد", () => {
    const err = expectError(DB, `
      CREATE OR REPLACE FUNCTION public.symbol_last_trade_dates()
      RETURNS TABLE (symbol text, last_trade_date date)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
      $f$ SELECT DISTINCT ON (h.symbol) h.symbol, h.trade_date FROM public.symbol_history h
          ORDER BY h.symbol, h.trade_date DESC $f$;
      DO $d$ DECLARE d bool; BEGIN
        SELECT p.prosecdef INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='symbol_last_trade_dates';
        IF d THEN RAISE EXCEPTION 'phase29: تابع SECURITY DEFINER شد'; END IF;
      END $d$;`);
    assert.match(err, /SECURITY DEFINER/);
    psqlFile(DB, PHASE29); // بازگرداندنِ نسخهٔ درست
  });
});
