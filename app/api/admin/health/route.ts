import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyEnv,
  classifyFreshness,
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

type Admin = ReturnType<typeof createAdminClient>;

/** آخرین مقدارِ یک ستونِ زمانی، با تفکیکِ «جدول نیست» از «خالی است». */
async function latestTimestamp(
  admin: Admin,
  table: string,
  column: string
): Promise<{ at: string | null; missing: boolean }> {
  const { data, error } = await admin
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // 42P01 = undefined_table. «جدول نیست» با «پرس‌وجو شکست خورد» فرق دارد.
    const missing = error.code === "42P01" || /does not exist/i.test(error.message);
    return { at: null, missing };
  }
  const row = data as Record<string, unknown> | null;
  const v = row?.[column];
  return { at: typeof v === "string" ? v : null, missing: false };
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
    const { at, missing } = await latestTimestamp(admin, table, column);
    if (missing) {
      return { key, label, state: "unknown", detail: `جدولِ \`${table}\` پیدا نشد` };
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
      detail: e instanceof Error ? e.message : "خطای ناشناخته",
    });
  }

  let paymentCounts: { paidCount: number; paidWithoutEntitlement: number } | null = null;
  let leadsExists: boolean | null = null;

  if (admin) {
    // ── ۳) تازگیِ رلهٔ بازارِ ایران ──
    signals.push(
      await freshnessSignal(
        admin, "relay", "تازگیِ رلهٔ بازارِ ایران",
        "ir_market_snapshots", "created_at",
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

    // ── ۶) سازگاریِ پرداخت ↔ دسترسی — فقط شمارش، بدونِ دادهٔ شخصی ──
    try {
      const { data: paid, error: pErr } = await admin
        .from("payments")
        .select("id")
        .eq("status", "paid");
      if (pErr) throw new Error(pErr.message);
      const ids = (paid ?? []).map((r) => r.id as string);
      if (ids.length === 0) {
        paymentCounts = { paidCount: 0, paidWithoutEntitlement: 0 };
      } else {
        // `entitlements.source` شناسهٔ پرداخت را نگه می‌دارد (phase11).
        const { data: ents, error: eErr } = await admin
          .from("entitlements")
          .select("source")
          .in("source", ids);
        if (eErr) throw new Error(eErr.message);
        const covered = new Set((ents ?? []).map((r) => r.source as string));
        paymentCounts = {
          paidCount: ids.length,
          paidWithoutEntitlement: ids.filter((id) => !covered.has(id)).length,
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
  } else {
    // بدونِ کلاینتِ ادمین همهٔ این‌ها **نامعلوم**اند، نه خراب.
    for (const [key, label] of [
      ["relay", "تازگیِ رلهٔ بازارِ ایران"],
      ["telegram_sync", "آخرین همگام‌سازیِ تلگرام"],
      ["audit", "آخرین رخدادِ ثبت‌شده در audit_log"],
    ] as const) {
      signals.push({ key, label, state: "unknown", detail: "بدونِ اتصالِ service-role قابلِ بررسی نیست" });
    }
    signals.push(classifyPaymentConsistency(null));
    signals.push(classifyLeadReadiness(null));
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
