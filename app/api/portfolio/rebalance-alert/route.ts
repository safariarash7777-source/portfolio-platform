import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { serviceRoleGap, SERVICE_ROLE_GAP_STATUS } from "@/lib/supabase/service-role";
import { loadPortfolioSnapshot, loadPriceRows } from "@/lib/portfolio/service";
import { buildHoldingsView } from "@/lib/portfolio/view";
import { dispatchRebalanceAlert } from "@/lib/portfolio/alertDispatch";
import { SupabaseAlertStore } from "@/lib/portfolio/alertStore";
import { buildSinks } from "@/lib/portfolio/alertSinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/portfolio/rebalance-alert — ارزیابیِ هشدارِ بازتوازنِ **کاربرِ نشست**.
 *
 * ── چرا POST و نه محاسبه هنگام رندرِ صفحه ───────────────────────────────────
 * ارسالِ پیام یک اثرِ جانبی است. اگر به رندرِ GET گره می‌خورد، هر بارگذاری،
 * هر prefetch و هر خزندهٔ لینک می‌توانست پیام تولید کند. مرزِ صریح یعنی
 * اثرِ جانبی فقط وقتی رخ می‌دهد که کسی صریح خواسته باشد.
 *
 * ── هویت از نشست، نه از بدنه ────────────────────────────────────────────────
 * `user_id` هرگز از بدنهٔ درخواست خوانده نمی‌شود. اگر خوانده می‌شد، هر عضو
 * می‌توانست ارزیابیِ عضوِ دیگری را راه بیندازد و از نتیجه‌اش وضعیتِ سبدِ او را
 * استنتاج کند.
 *
 * ── آستانه و فاصله از محیط، با پیش‌فرضِ محافظه‌کارانه ────────────────────────
 * پیش‌فرضِ کانال `log` است (گیرندهٔ آزمایشیِ محلی). تا وقتی
 * `REBALANCE_ALERT_CHANNELS` صریح تنظیم نشده، هیچ پیامی به عضوِ واقعی نمی‌رود.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 401 });

  const admin = tryCreateAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: serviceRoleGap("ارزیابی هشدار بازتوازن") },
      { status: SERVICE_ROLE_GAP_STATUS }
    );
  }

  const snapshot = await loadPortfolioSnapshot();
  if (!snapshot.ready) {
    return NextResponse.json(
      { error: "جدول‌های این قابلیت روی این محیط اجرا نشده‌اند." },
      { status: 503 }
    );
  }

  const priceRows = await loadPriceRows(snapshot.holdings?.positions ?? []);
  const now = new Date();

  // ⚠️ همان محاسبه‌ای که صفحه نشان می‌دهد — نه یک محاسبهٔ دوباره.
  const view = buildHoldingsView({
    holdings: snapshot.holdings,
    storedTarget: snapshot.storedTarget,
    priceRows,
    maxPriceAgeDays: 3,
    maxPriceFutureDays: 1,
    now,
  });

  if (!view.result) {
    return NextResponse.json({
      sent: false,
      reason: "no_comparison",
      notes: view.notes,
    });
  }

  // گیرنده‌ها: ایمیلِ حساب و کدِ اتصالِ تلگرام — فقط وقتی کانالشان صریح روشن باشد.
  const { data: link } = await admin
    .from("telegram_links")
    .select("telegram_user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const outcome = await dispatchRebalanceAlert(
    { userId: user.id, result: view.result },
    {
      store: new SupabaseAlertStore(admin),
      sinks: buildSinks({
        email: user.email ?? null,
        telegramChatId: (link as { telegram_user_id?: number } | null)?.telegram_user_id ?? null,
      }),
      options: {
        thresholdPoints: Number(process.env.REBALANCE_ALERT_THRESHOLD_POINTS ?? 5),
        cooldownHours: Number(process.env.REBALANCE_ALERT_COOLDOWN_HOURS ?? 24),
        maxAttempts: Number(process.env.REBALANCE_ALERT_MAX_ATTEMPTS ?? 2),
        now,
      },
    }
  );

  return NextResponse.json({
    sent: outcome.sent,
    reason: outcome.reason,
    event_id: outcome.eventId,
    attempts: outcome.attempts,
  });
}
