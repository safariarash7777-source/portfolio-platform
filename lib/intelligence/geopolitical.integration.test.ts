import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * `phase25` روی Postgresِ **واقعی**.
 *
 * تستِ ایستا فقط می‌گوید «این خط در فایل هست». چیزی که باید اثبات شود رفتار
 * است: آیا `anon` واقعاً نمی‌تواند بنویسد؟ آیا قیدِ «انتشار فقط پس از بازبینی»
 * واقعاً جلوی UPDATE را می‌گیرد، یا فقط در متن ادعا شده؟
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
const PHASE25 = join(ROOT, "sql", "phase25_geopolitical_intake.sql");
const LEGACY_PROFILE = join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql");
const DB = "geo_intake";
/** همان دیتابیس، ولی با پیش‌فرض‌های سخاوتمندانهٔ Supabase از پیش برقرار. */
const DB_LEGACY = "geo_intake_legacy";

const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function psql(db: string, sql: string): string {
  return execFileSync(
    "psql",
    ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

function psqlFile(db: string, file: string): void {
  execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
}

/** رشتهٔ تهی یعنی دستور **موفق** شد — که در این تست‌ها معمولاً شکست است. */
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
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);

const asRole = (role: string, sql: string, uid?: string) =>
  `BEGIN; ${uid ? `SELECT set_config('request.jwt.claims','{"sub":"${uid}","role":"${role}"}',true);` : ""}
   SET LOCAL ROLE ${role}; ${sql} COMMIT;`;

/** یک رویدادِ معتبر با مقادیرِ حداقلی. */
function insertEvent(over: Record<string, string> = {}): string {
  const cols: Record<string, string> = {
    title: `'رویدادِ نمونه'`,
    source_url: `'https://example.test/news/1'`,
    observed_at: `now() - interval '1 day'`,
    fact_summary: `'متنِ واقعیتِ قابلِ استناد برای آزمون'`,
    affected_markets: `ARRAY['gold']`,
    impact_path: `'مسیرِ اثر برای آزمونِ خودکار'`,
    ...over,
  };
  const keys = Object.keys(cols).join(", ");
  const vals = Object.values(cols).join(", ");
  return psql(DB, `INSERT INTO public.geopolitical_events (${keys}) VALUES (${vals}) RETURNING id`);
}

describe("phase25 روی Postgresِ واقعی", {
  skip: dbError ? `Postgres در دسترس نیست: ${dbError}` : false,
}, () => {
  before(() => {
    psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
    psql("postgres", `CREATE DATABASE ${DB}`);
    psqlFile(DB, BOOTSTRAP);
    psql(
      DB,
      `CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
         LANGUAGE sql STABLE AS $f$
           SELECT EXISTS (SELECT 1 FROM public.profiles
                           WHERE id = auth.uid() AND role = 'admin');
         $f$;`
    );
    psql(
      DB,
      `INSERT INTO auth.users (id) VALUES ('${ADMIN}'), ('${USER}') ON CONFLICT DO NOTHING;
       INSERT INTO public.profiles (id, role) VALUES ('${ADMIN}','admin'), ('${USER}','user')
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;`
    );
    // ⚠️ فایلِ واقعی. اگر بلوکِ تأییدِ انتهایش بشکند، همین‌جا می‌شکند.
    psqlFile(DB, PHASE25);
  });

  describe("امتیازها — رفتار، نه ادعا", () => {
    test("anon هیچ امتیازی روی هیچ‌کدام از دو جدول ندارد", () => {
      for (const tbl of ["geopolitical_events", "geopolitical_scenario_impacts"]) {
        for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          assert.equal(
            psql(DB, `SELECT has_table_privilege('anon','public.${tbl}','${priv}')`),
            "f",
            `anon نباید ${priv} روی ${tbl} داشته باشد`
          );
        }
      }
    });

    test("کاربرِ واردشده فقط SELECT دارد — نه حذف، نه TRUNCATE", () => {
      // ⚠️ RLS جلوی TRUNCATE را **نمی‌گیرد** (درسِ B-044). پس امتیاز باید
      // خودش نبوده باشد، نه اینکه به policy تکیه کنیم.
      for (const tbl of ["geopolitical_events", "geopolitical_scenario_impacts"]) {
        assert.equal(psql(DB, `SELECT has_table_privilege('authenticated','public.${tbl}','SELECT')`), "t");
        for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          assert.equal(
            psql(DB, `SELECT has_table_privilege('authenticated','public.${tbl}','${priv}')`),
            "f",
            `authenticated نباید ${priv} داشته باشد`
          );
        }
      }
    });

    test("کاربرِ واردشده واقعاً نمی‌تواند بنویسد", () => {
      const err = expectError(
        DB,
        asRole(
          "authenticated",
          `INSERT INTO public.geopolitical_events
             (title, source_url, observed_at, fact_summary, affected_markets, impact_path)
           VALUES ('عنوانِ آزمون','https://a.test/1', now(), 'متنِ به‌اندازه بلند', ARRAY['gold'], 'مسیرِ اثرِ نمونه');`,
          USER
        )
      );
      assert.match(err, /permission denied|denied/i);
    });

    test("RLS هم فعال و هم FORCE است", () => {
      for (const tbl of ["geopolitical_events", "geopolitical_scenario_impacts"]) {
        assert.equal(
          psql(
            DB,
            `SELECT relrowsecurity AND relforcerowsecurity FROM pg_class c
               JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname='${tbl}'`
          ),
          "t",
          `${tbl}`
        );
      }
    });
  });

  describe("انتشار بدونِ بازبینی ممکن نیست", () => {
    test("درجِ مستقیمِ ردیفِ عمومیِ بازبینی‌نشده رد می‌شود", () => {
      const err = expectError(
        DB,
        `INSERT INTO public.geopolitical_events
           (title, source_url, observed_at, fact_summary, affected_markets, impact_path, visibility)
         VALUES ('عنوانِ آزمون','https://a.test/2', now(), 'متنِ به‌اندازه بلند', ARRAY['fx'], 'مسیرِ اثرِ نمونه', 'public')`
      );
      assert.match(err, /geopolitical_public_requires_review/);
    });

    test("ارتقا به public بدونِ review هم رد می‌شود", () => {
      const id = insertEvent();
      const err = expectError(
        DB,
        `UPDATE public.geopolitical_events SET visibility='public' WHERE id='${id}'`
      );
      assert.match(err, /geopolitical_public_requires_review/);
      assert.equal(
        psql(DB, `SELECT visibility FROM public.geopolitical_events WHERE id='${id}'`),
        "private"
      );
    });

    test("پس از بازبینی، انتشار مجاز است", () => {
      const id = insertEvent();
      psql(
        DB,
        `UPDATE public.geopolitical_events
            SET review_state='reviewed', visibility='public' WHERE id='${id}'`
      );
      assert.equal(
        psql(DB, `SELECT visibility FROM public.geopolitical_events WHERE id='${id}'`),
        "public"
      );
    });

    test("رویدادِ ردشده نمی‌تواند عمومی بماند", () => {
      const id = insertEvent();
      psql(DB, `UPDATE public.geopolitical_events
                   SET review_state='reviewed', visibility='public' WHERE id='${id}'`);
      const err = expectError(
        DB,
        `UPDATE public.geopolitical_events SET review_state='rejected' WHERE id='${id}'`
      );
      assert.match(err, /geopolitical_public_requires_review/);
    });
  });

  describe("پیش‌فرض‌ها و تفکیکِ واقعیت از تفسیر", () => {
    test("ردیفِ تازه خصوصی و پیش‌نویس است", () => {
      const id = insertEvent();
      assert.equal(
        psql(DB, `SELECT visibility || '/' || review_state
                    FROM public.geopolitical_events WHERE id='${id}'`),
        "private/draft"
      );
    });

    test("تفسیر اختیاری است ولی واقعیت نیست", () => {
      const id = insertEvent();
      assert.equal(
        psql(DB, `SELECT interpretation IS NULL FROM public.geopolitical_events WHERE id='${id}'`),
        "t"
      );
      assert.notEqual(
        expectError(
          DB,
          `INSERT INTO public.geopolitical_events
             (title, source_url, observed_at, fact_summary, affected_markets, impact_path)
           VALUES ('عنوانِ آزمون','https://a.test/3', now(), 'کوتاه', ARRAY['gold'], 'مسیرِ اثرِ نمونه')`
        ),
        "",
        "خلاصهٔ واقعیتِ کوتاه باید رد شود"
      );
    });

    test("زمانِ رویداد از زمانِ ثبت جدا می‌ماند", () => {
      const id = insertEvent({ observed_at: `now() - interval '10 days'` });
      assert.equal(
        psql(DB, `SELECT recorded_at > observed_at + interval '9 days'
                    FROM public.geopolitical_events WHERE id='${id}'`),
        "t"
      );
    });

    test("منبعِ بدونِ http رد می‌شود", () => {
      assert.notEqual(
        expectError(DB, `INSERT INTO public.geopolitical_events
          (title, source_url, observed_at, fact_summary, affected_markets, impact_path)
          VALUES ('عنوانِ آزمون','شنیده‌ام', now(), 'متنِ به‌اندازه بلند', ARRAY['gold'], 'مسیرِ اثرِ نمونه')`),
        ""
      );
    });

    test("بازارِ متأثرِ خالی رد می‌شود", () => {
      assert.notEqual(
        expectError(DB, `INSERT INTO public.geopolitical_events
          (title, source_url, observed_at, fact_summary, affected_markets, impact_path)
          VALUES ('عنوانِ آزمون','https://a.test/4', now(), 'متنِ به‌اندازه بلند', ARRAY[]::text[], 'مسیرِ اثرِ نمونه')`),
        ""
      );
    });
  });

  describe("اثرِ سناریویی", () => {
    const addImpact = (eventId: string, scenario: string, affected = "gold") =>
      psql(
        DB,
        `INSERT INTO public.geopolitical_scenario_impacts
           (event_id, scenario, affected, direction, assumptions)
         VALUES ('${eventId}','${scenario}','${affected}','up','فروضِ آزمونِ خودکار') RETURNING id`
      );

    test("سه سناریو برای یک چیزِ متأثر ثبت می‌شوند", () => {
      const id = insertEvent();
      for (const s of ["adverse", "base", "favorable"]) addImpact(id, s);
      assert.equal(
        psql(DB, `SELECT count(*) FROM public.geopolitical_scenario_impacts WHERE event_id='${id}'`),
        "3"
      );
    });

    test("سناریوی تکراری برای همان دارایی رد می‌شود", () => {
      const id = insertEvent();
      addImpact(id, "base");
      assert.match(expectError(DB, `INSERT INTO public.geopolitical_scenario_impacts
        (event_id, scenario, affected, direction, assumptions)
        VALUES ('${id}','base','gold','down','فروضِ دیگر')`), /uq_geo_scenario/);
    });

    test("بزرگیِ اثر باندِ کیفی است، نه عدد", () => {
      const id = insertEvent();
      const impact = addImpact(id, "base");
      assert.equal(
        psql(DB, `SELECT magnitude FROM public.geopolitical_scenario_impacts WHERE id='${impact}'`),
        "unknown",
        "پیش‌فرض باید «نامعلوم» باشد، نه یک عددِ حدسی"
      );
      assert.notEqual(
        expectError(DB, `UPDATE public.geopolitical_scenario_impacts
                            SET magnitude='12.5%' WHERE id='${impact}'`),
        "",
        "عدد نباید پذیرفته شود"
      );
    });

    test("فروض الزامی است", () => {
      const id = insertEvent();
      assert.notEqual(
        expectError(DB, `INSERT INTO public.geopolitical_scenario_impacts
          (event_id, scenario, affected, direction, assumptions)
          VALUES ('${id}','base','fx','up','کوتاه')`),
        ""
      );
    });

    test("حذفِ رویداد اثرهایش را هم می‌برد", () => {
      const id = insertEvent();
      addImpact(id, "base");
      psql(DB, `DELETE FROM public.geopolitical_events WHERE id='${id}'`);
      assert.equal(
        psql(DB, `SELECT count(*) FROM public.geopolitical_scenario_impacts WHERE event_id='${id}'`),
        "0"
      );
    });
  });
});

/**
 * ── چرا این suite جدا وجود دارد ───────────────────────────────────────────────
 *
 * روی یک Postgresِ ساده، جدولِ تازه هیچ امتیازِ اضافه‌ای نمی‌گیرد. یعنی
 * `REVOKE`های migration **چیزی برای پس‌گرفتن ندارند** و تستِ امتیاز پوچ است:
 * حذفِ کاملِ خطِ `REVOKE` هم تست را قرمز نمی‌کند. دقیقاً همین را سنجیدم و
 * تست سبز ماند.
 *
 * `profile_legacy_default_privileges.sql` وضعیتی را بازتولید می‌کند که روی
 * پروژهٔ stagingِ خودمان اندازه‌گیری شد: `ALTER DEFAULT PRIVILEGES` روی
 * `public` که به `authenticated` تا `TRUNCATE` هم می‌دهد. زیرِ آن پروفایل،
 * `REVOKE` واقعاً کار می‌کند و حذفش دیده می‌شود.
 */
describe("phase25 زیرِ پیش‌فرض‌های خطرناکِ Supabase", {
  skip: dbError ? `Postgres در دسترس نیست: ${dbError}` : false,
}, () => {
  before(() => {
    psql("postgres", `DROP DATABASE IF EXISTS ${DB_LEGACY}`);
    psql("postgres", `CREATE DATABASE ${DB_LEGACY}`);
    psqlFile(DB_LEGACY, BOOTSTRAP);
    psql(
      DB_LEGACY,
      `CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
         LANGUAGE sql STABLE AS $f$
           SELECT EXISTS (SELECT 1 FROM public.profiles
                           WHERE id = auth.uid() AND role = 'admin');
         $f$;`
    );
    // ⚠️ ترتیب مهم است: پروفایل **قبل** از migration اعمال می‌شود، چون
    // `ALTER DEFAULT PRIVILEGES` فقط روی جدول‌هایی اثر دارد که بعدش ساخته شوند.
    psqlFile(DB_LEGACY, LEGACY_PROFILE);
    psqlFile(DB_LEGACY, PHASE25);
  });

  test("پروفایل واقعاً امتیازِ خطرناک تولید می‌کند (وگرنه این suite بی‌معناست)", () => {
    // اگر این تست قرمز شود یعنی پروفایل دیگر چیزی شبیه‌سازی نمی‌کند و بقیهٔ
    // ادعاهای این فایل بی‌پشتوانه‌اند.
    psql(DB_LEGACY, `CREATE TABLE IF NOT EXISTS public.canary_unguarded (id int)`);
    assert.equal(
      psql(DB_LEGACY, `SELECT has_table_privilege('authenticated','public.canary_unguarded','TRUNCATE')`),
      "t",
      "پروفایلِ legacy باید به جدولِ محافظت‌نشده TRUNCATE بدهد"
    );
  });

  test("با وجودِ پیش‌فرض‌ها، anon هیچ امتیازی روی هیچ‌کدام ندارد", () => {
    for (const tbl of ["geopolitical_events", "geopolitical_scenario_impacts"]) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        assert.equal(
          psql(DB_LEGACY, `SELECT has_table_privilege('anon','public.${tbl}','${priv}')`),
          "f",
          `anon نباید ${priv} روی ${tbl} داشته باشد`
        );
      }
    }
  });

  test("با وجودِ پیش‌فرض‌ها، کاربرِ عادی TRUNCATE/DELETE ندارد", () => {
    // RLS جلوی TRUNCATE را نمی‌گیرد؛ تنها دفاع همان REVOKE است.
    for (const tbl of ["geopolitical_events", "geopolitical_scenario_impacts"]) {
      for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        assert.equal(
          psql(DB_LEGACY, `SELECT has_table_privilege('authenticated','public.${tbl}','${priv}')`),
          "f",
          `authenticated نباید ${priv} روی ${tbl} داشته باشد`
        );
      }
    }
  });
});
