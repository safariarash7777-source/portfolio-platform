import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyCronRun, type LastRun } from "@/lib/cron/health";
import { CRON_JOB_KEYS } from "@/lib/cron/ledger";
import {
  classifyEnv,
  classifyFreshness,
  classifyQueryError,
  classifyLeadReadiness,
  classifyPaymentConsistency,
  rollup,
  type EnvPresence,
  type HealthSignal,
} from "@/lib/health/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health — نمای عملیاتیِ سلامت (فقط ادمین). `G2-003`.
 *
 * قواعدِ سختِ این روت:
 *  ۱. **هرگز** مقدارِ متغیرِ محیطی برنمی‌گرداند — فقط `present: boolean`.
 *  ۲. **هرگز** URLِ دیتابیس، توکن، یا URLِ وبهوکِ تلگرام را برنمی‌گرداند
 *     (URLِ وبهوک می‌تواند توکنِ مسیر داشته باشد؛ فقط بله/خیر گزارش می‌شود).
 *  ۳. **هرگز** دادهٔ شخصیِ کاربر برنمی‌گرداند — فقط شمارشِ تجمیعی.
 *  ۴. طبقه‌بندی در `lib/health/status.ts` است، نه اینجا؛ اینجا فقط
 *     جمع‌آوریِ سیگنال است («یک موتور، چند نما»).
 *
 * هر سیگنال try/catchِ خودش را دارد: شکستِ یک پرس‌وجو نباید کلِ نما را خالی
 * کند — دقیقاً همان چیزی که `B-024` نشان داد، جایی که یک `throw` در ساختِ
 * کلاینتِ service-role کلِ صفحه را ۵۰۰ می‌کرد.
 */

/** بدونِ این‌ها هیچ مسیرِ سرورسایدی کار نمی‌کند. */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** نبودشان یک قابلیت را از کار می‌اندازد، ولی سایت را نه. */
const OPTIONAL_ENV = [
  "CRON_SECRET",
  "PLATFORM_WEBHOOK_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_CHANNEL_ID",
  "ZARINPAL_MERCHANT_ID",
  "IR_MARKET_RELAY_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const presence = (keys: readonly string[]): EnvPresence[] =>
  keys.map((key) => ({ key, present: Boolean(process.env[key]) }));

/**
 * کلاینتی که سیگنال‌ها با آن **می‌خوانند**.
 *
 * دیگر لزوماً service-role نیست: همهٔ جدول‌های این نما برای نشستِ ادمین از
 * طریقِ RLS خواندنی‌اند (`audit_log`/`entitlements` با `is_admin()`، `payments`
 * با `own OR is_admin()`، بازار عمومی). پس نبودِ کلیدِ سرویس‌رول دیگر کلِ نما
 * را «نامعلوم» نمی‌کند — چیزی که تشخیص را کور می‌کرد، دقیقاً وقتی که بیشترین
 * نیاز به آن بود.
 */
type Admin =
  | ReturnType<typeof createAdminClient>
  | Awaited<ReturnType<typeof createClient>>;

/** آخرین مقدارِ یک ستونِ زمانی، با تفکیکِ «جدول نیست» از «خالی است». */
async function latestTimestamp(
  admin: Admin,
  table: string,
  column: string
): Promise<{ at: string | null; missing: boolean; badColumn: boolean }> {
  const { data, error } = await admin
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // «جدول نیست» ≠ «ستون نیست» ≠ «پرس‌وجو شکست خورد». تفکیکشان لازم است،
    // وگرنه یک ستونِ اشتباه در کدِ خودمان مثلِ یک جدولِ غایب به‌نظر می‌رسد و
    // اپراتور دنبالِ مشکلی می‌گردد که وجود ندارد (`P2-G2-011`).
    const kind = classifyQueryError(error.code, error.message);
    return { at: null, missing: kind === "missing_table", badColumn: kind === "missing_column" };
  }
  const row = data as Record<string, unknown> | null;
  const v = row?.[column];
  return { at: typeof v === "string" ? v : null, missing: false, badColumn: false };
}

/** یک سیگنالِ تازگی، با مهارِ کاملِ خطا. */
async function freshnessSignal(
  admin: Admin,
  key: string,
  label: string,
  table: string,
  column: string,
  okWithinMinutes: number,
  staleWithinMinutes: number,
  emptyDetail: string,
  now: Date
): Promise<HealthSignal> {
  try {
    const { at, missing, badColumn } = await latestTimestamp(admin, table, column);
    if (missing) {
      return { key, label, state: "unknown", detail: `جدولِ \`${table}\` پیدا نشد` };
    }
    if (badColumn) {
      // این حالتِ محیط نیست، **باگِ خودِ ماست**: جدول هست و ستون نیست. پس
      // `failed` است نه `unknown` — یک شاخصِ خراب باید سر و صدا کند، نه اینکه
      // بی‌سر و صدا کنارِ «نامعلوم»های عادی بنشیند.
      return {
        key, label, state: "failed",
        detail: `ستونِ \`${column}\` در جدولِ \`${table}\` وجود ندارد — این شاخص اشتباه پیکربندی شده`,
      };
    }
    const { state, age } = classifyFreshness(at, { okWithinMinutes, staleWithinMinutes }, now);
    return {
      key,
      label,
      state,
      detail: at ? `آخرین رخداد ${age} دقیقه پیش` : emptyDetail,
      lastAt: at,
      ageMinutes: age,
    };
  } catch {
    return { key, label, state: "unknown", detail: "پرس‌وجو مردود شد" };
  }
}

export async function GET() {
  // ── Auth: فقط admin ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  }

  const now = new Date();
  const signals: HealthSignal[] = [];

  // ── ۱) متغیرهای محیطی — فقط حضور ──
  const requiredPresence = presence(REQUIRED_ENV);
  const optionalPresence = presence(OPTIONAL_ENV);
  signals.push(classifyEnv(requiredPresence, optionalPresence));

  // ── ۲) اتصالِ Supabase (service-role) — ریشهٔ B-024 ──
  // این سیگنال حالا **دامنهٔ محدودتری** دارد: بقیهٔ نما با کلاینتِ نشست خوانده
  // می‌شود، پس شکستِ اینجا یعنی فقط کارهایی که ذاتاً بدونِ نشست‌اند از کار
  // افتاده‌اند — تأییدِ پرداخت، وبهوکِ تلگرام، وبهوکِ لید و cronها.
  let admin: Admin | null = null;
  try {
    admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    signals.push({
      key: "supabase",
      label: "اتصالِ Supabase (service-role)",
      state: "ok",
      detail: "کلاینتِ service-role ساخته شد و پرس‌وجوی آزمایشی موفق بود",
    });
  } catch (e) {
    admin = null;
    // پیامِ `lib/supabase/admin.ts` **نامِ** متغیر را دارد نه مقدارش؛ عمداً
    // همان‌طور منتقل می‌شود چون تشخیص را ممکن می‌کند و چیزی لو نمی‌دهد.
    signals.push({
      key: "supabase",
      label: "اتصالِ Supabase (service-role)",
      state: "failed",
      detail: `${e instanceof Error ? e.message : "خطای ناشناخته"} — تأییدِ پرداخت، وبهوکِ تلگرام، وبهوکِ لید و cronها بدونِ آن کار نمی‌کنند؛ بقیهٔ این نما از نشستِ خودِ شما خوانده شده`,
    });
  }

  let paymentCounts: { paidCount: number; paidWithoutEntitlement: number } | null = null;
  let leadsExists: boolean | null = null;

  // ── سیگنال‌های زیر با کلاینتِ نشست خوانده می‌شوند، نه service-role ──
  // هر کدام try/catch خودش را دارد؛ شکستِ یکی بقیه را نمی‌خواباند (`B-024`).
  {
    const admin: Admin = supabase;

    // ── ۳) تازگیِ رلهٔ بازارِ ایران ──
    signals.push(
      await freshnessSignal(
        admin, "relay", "تازگیِ رلهٔ بازارِ ایران",
        "ir_market_snapshots", "updated_at",
        60, 24 * 60, "هیچ اسنپ‌شاتی ثبت نشده", now
      )
    );

    // ── ۴) آخرین همگام‌سازیِ تلگرام (cron روزانه ۰۳:۰۰ → آستانهٔ ۲۶ ساعت) ──
    signals.push(
      await freshnessSignal(
        admin, "telegram_sync", "آخرین همگام‌سازیِ تلگرام",
        "content_hub", "created_at",
        26 * 60, 72 * 60, "هیچ محتوایی همگام نشده", now
      )
    );

    // ── ۵) آخرین رخدادِ ثبت‌شده (نزدیک‌ترین نشانهٔ اجرای cron) ──
    signals.push(
      await freshnessSignal(
        admin, "audit", "آخرین رخدادِ ثبت‌شده در audit_log",
        "audit_log", "created_at",
        26 * 60, 72 * 60, "هیچ رخدادی ثبت نشده", now
      )
    );

    // ── ۵′) آخرین اجرای واقعیِ هر cron — `P2-G2-012` ──
    // این جایگزینِ حدس‌زدن از روی ردیفِ محصول است. `audit_log` و `content_hub`
    // فقط می‌گویند «کاری انجام شد»؛ دفتر می‌گوید «job اجرا شد»، حتی اگر کاری
    // برای انجام نبوده باشد.
    for (const jobKey of CRON_JOB_KEYS) {
      const label = `آخرین اجرای cron: ${jobKey}`;
      try {
        const { data, error } = await admin
          .from("cron_runs")
          .select("status,started_at,finished_at,processed_count,error_code,duration_ms")
          .eq("job_key", jobKey)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          // جدول هنوز اجرا نشده (`phase21` وضعیتش NOT_APPLIED) → نامعلوم، نه خراب.
          const kind = classifyQueryError(error.code, error.message);
          signals.push({
            key: `cron:${jobKey}`,
            label,
            state: "unknown",
            detail:
              kind === "missing_table"
                ? "جدولِ `cron_runs` هنوز اجرا نشده — `sql/phase21_cron_runs.sql` آماده ولی NOT_APPLIED"
                : "پرس‌وجوی دفترِ اجرا مردود شد",
          });
          continue;
        }

        const row = data as {
          status: string; started_at: string; finished_at: string | null;
          processed_count: number | null; error_code: string | null; duration_ms: number | null;
        } | null;

        const lastRun: LastRun | null = row
          ? {
              status: row.status as LastRun["status"],
              startedAt: row.started_at,
              finishedAt: row.finished_at,
              processedCount: row.processed_count,
              errorCode: row.error_code,
              durationMs: row.duration_ms,
            }
          : null;

        signals.push(
          classifyCronRun(
            { jobKey, label, lastRun, okWithinMinutes: 26 * 60, staleWithinMinutes: 72 * 60, stuckAfterMinutes: 60 },
            now
          )
        );
      } catch {
        signals.push({ key: `cron:${jobKey}`, label, state: "unknown", detail: "پرس‌وجوی دفترِ اجرا مردود شد" });
      }
    }

    // ── ۶) سازگاریِ پرداخت ↔ دسترسی — فقط شمارش، بدونِ دادهٔ شخصی ──
    try {
      const { data: paid, error: pErr } = await admin
        .from("payments")
        .select("id,authority")
        .eq("status", "paid");
      if (pErr) throw new Error(pErr.message);
      const rows = (paid ?? []) as { id: string; authority: string | null }[];
      if (rows.length === 0) {
        paymentCounts = { paidCount: 0, paidWithoutEntitlement: 0 };
      } else {
        // ⚠️ قرارداد: `entitlements.source` شناسهٔ پرداخت **نیست** — رشته‌ای با
        // پیشوندِ محصول است، مثلِ `payment:{authority}` یا
        // `webinar_payment:{authority}`. تطبیقِ ساده با `id` هر پرداختِ موفق را
        // «بدونِ دسترسی» گزارش می‌کرد و کلِ این شاخص را به هشدارِ کاذب تبدیل
        // می‌کرد. پس هم پسوندِ authority و هم خودِ id پذیرفته می‌شود تا این
        // بررسی به قالبِ پیشوند وابسته نماند.
        const { data: ents, error: eErr } = await admin
          .from("entitlements")
          .select("source")
          .not("source", "is", null);
        if (eErr) throw new Error(eErr.message);
        const sources = (ents ?? []).map((r) => String(r.source));
        const exact = new Set(sources);
        const bySuffix = new Set(
          sources.map((s) => (s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : s))
        );
        const uncovered = rows.filter(
          (p) => !exact.has(p.id) && !(p.authority ? bySuffix.has(p.authority) : false)
        );
        paymentCounts = {
          paidCount: rows.length,
          paidWithoutEntitlement: uncovered.length,
        };
      }
    } catch {
      paymentCounts = null;
    }
    signals.push(classifyPaymentConsistency(paymentCounts));

    // ── ۷) آمادگیِ جدولِ لید ──
    try {
      const { error } = await admin.from("leads").select("id", { count: "exact", head: true });
      if (!error) {
        leadsExists = true;
      } else if (error.code === "42P01" || /does not exist/i.test(error.message)) {
        leadsExists = false;
      } else {
        leadsExists = null;
      }
    } catch {
      leadsExists = null;
    }
    signals.push(classifyLeadReadiness(leadsExists));
  }

  // ── ۸) وبهوکِ تلگرام — فقط سلامت، بدونِ URL ──
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const json = await res.json();
      if (json?.ok) {
        const lastErr: string | null = json.result?.last_error_message ?? null;
        const pending: number = json.result?.pending_update_count ?? 0;
        signals.push({
          key: "telegram_webhook",
          label: "وبهوکِ تلگرام",
          state: lastErr ? "failed" : pending > 50 ? "stale" : "ok",
          detail: lastErr
            ? `آخرین خطای تلگرام: ${lastErr}`
            : `تنظیم‌شده: ${json.result?.url ? "بله" : "خیر"} · صفِ در انتظار: ${pending}`,
        });
      } else {
        signals.push({
          key: "telegram_webhook", label: "وبهوکِ تلگرام",
          state: "failed", detail: "تلگرام پاسخِ ok نداد",
        });
      }
    } catch {
      signals.push({
        key: "telegram_webhook", label: "وبهوکِ تلگرام",
        state: "unknown", detail: "تماس با تلگرام ممکن نشد",
      });
    }
  } else {
    signals.push({
      key: "telegram_webhook", label: "وبهوکِ تلگرام",
      state: "unknown", detail: "`TELEGRAM_BOT_TOKEN` تنظیم نشده",
    });
  }

  // ── ۹) شناسهٔ استقرارِ در حالِ اجرا — عمومی است، سکرت نیست ──
  const deployment = {
    environment: process.env.VERCEL_ENV ?? "unknown",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  };
  signals.push({
    key: "deployment",
    label: "استقرارِ در حالِ اجرا",
    state: deployment.deploymentId || deployment.commitSha ? "ok" : "unknown",
    detail:
      deployment.deploymentId || deployment.commitSha
        ? `محیط: ${deployment.environment} · کامیت: ${(deployment.commitSha ?? "").slice(0, 7) || "—"}`
        : "شناسهٔ استقرار در دسترس نیست (اجرای غیرِ Vercel؟)",
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    overall: rollup(signals),
    signals,
    deployment,
    // فقط نام و حضور — هیچ مقداری.
    env: { required: requiredPresence, optional: optionalPresence },
  });
}
