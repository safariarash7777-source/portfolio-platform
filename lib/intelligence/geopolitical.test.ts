import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * قراردادِ ورودیِ دستیِ رویدادهای سیاسی/ژئوپلیتیک.
 *
 * ⚠️ تستِ ایستا روی متنِ migration. رفتارِ واقعیِ RLS و امتیازها را بلوکِ
 * تأییدِ داخلِ خودِ فایل هنگامِ اجرا می‌سنجد.
 */

const SQL = readFileSync(
  join(process.cwd(), "sql", "phase25_geopolitical_intake.sql"),
  "utf8"
);
const EXEC = SQL.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

describe("هیچ منبعِ خودکاری وجود ندارد", () => {
  test("جدول فقط ورودیِ دستی می‌گیرد — نه fetch، نه scrape، نه cron", () => {
    for (const forbidden of ["http_get", "pg_cron", "scrape", "net.http"]) {
      assert.ok(!EXEC.includes(forbidden), `${forbidden} نباید وجود داشته باشد`);
    }
  });

  test("منبعِ قابلِ استناد الزامی است", () => {
    assert.match(EXEC, /source_url\s+text NOT NULL CHECK \(source_url ~ '\^https\?:\/\/'\)/);
  });
});

describe("واقعیت از تفسیر جدا است", () => {
  test("دو ستونِ مستقل، و فقط واقعیت الزامی است", () => {
    assert.match(EXEC, /fact_summary\s+text NOT NULL/);
    assert.match(EXEC, /interpretation\s+text,/);
  });

  test("زمانِ رویداد از زمانِ ثبت جدا است", () => {
    assert.match(EXEC, /observed_at\s+timestamptz NOT NULL/);
    assert.match(EXEC, /recorded_at\s+timestamptz NOT NULL DEFAULT now\(\)/);
  });

  test("مسیرِ اثر و بازارهای متأثر الزامی‌اند", () => {
    assert.match(EXEC, /affected_markets text\[\] NOT NULL CHECK \(cardinality/);
    assert.match(EXEC, /impact_path\s+text NOT NULL/);
  });
});

describe("خصوصی به‌صورتِ پیش‌فرض", () => {
  test("visibility پیش‌فرضِ private دارد", () => {
    assert.match(EXEC, /visibility\s+text NOT NULL DEFAULT 'private'/);
  });

  test("review_state پیش‌فرضِ draft دارد", () => {
    assert.match(EXEC, /review_state\s+text NOT NULL DEFAULT 'draft'/);
  });

  test("انتشارِ عمومی بدونِ بازبینی با قیدِ دیتابیس بسته است", () => {
    // در سطحِ جدول، نه در کدِ برنامه — تا با تغییرِ کد دور زده نشود.
    assert.match(
      EXEC,
      /CHECK \(visibility <> 'public' OR review_state = 'reviewed'\)/
    );
  });

  test("کاربرِ عادی فقط ردیفِ بازبینی‌شدهٔ عمومی را می‌بیند", () => {
    assert.match(
      EXEC,
      /FOR SELECT USING \(visibility = 'public' AND review_state = 'reviewed'\)/
    );
  });
});

describe("امتیازها و RLS صریح‌اند (بندِ D)", () => {
  test("RLS هم فعال و هم اجباری است", () => {
    assert.match(EXEC, /ENABLE ROW LEVEL SECURITY/);
    assert.match(EXEC, /FORCE ROW LEVEL SECURITY/);
  });

  test("اول همه‌چیز گرفته می‌شود، بعد به‌اندازه داده می‌شود", () => {
    // درسِ B-044: پیش‌فرض‌های تاریخیِ Supabase می‌توانند TRUNCATE به anon
    // بدهند و RLS جلوی TRUNCATE را نمی‌گیرد.
    assert.match(
      EXEC,
      /REVOKE ALL ON TABLE public\.geopolitical_events FROM public, anon, authenticated/
    );
    const revokeAt = EXEC.indexOf("REVOKE ALL ON TABLE public.geopolitical_events");
    const grantAt = EXEC.indexOf("GRANT SELECT ON TABLE public.geopolitical_events");
    assert.ok(revokeAt < grantAt, "REVOKE باید قبل از GRANT بیاید");
  });

  test("anon هیچ امتیازی نمی‌گیرد", () => {
    assert.doesNotMatch(EXEC, /GRANT[^\n]*public\.geopolitical_events TO[^\n]*anon/);
  });

  test("کاربرِ عادی نمی‌تواند بنویسد یا حذف کند", () => {
    assert.match(EXEC, /GRANT SELECT ON TABLE public\.geopolitical_events TO authenticated;/);
    assert.doesNotMatch(EXEC, /GRANT[^\n]*(INSERT|UPDATE|DELETE)[^\n]*TO authenticated/);
  });

  test("migration خودش امتیازها را پس از اجرا تأیید می‌کند", () => {
    assert.match(EXEC, /has_table_privilege\('anon', 'public\.geopolitical_events', 'TRUNCATE'\)/);
    assert.match(EXEC, /relrowsecurity AND c\.relforcerowsecurity/);
  });
});
