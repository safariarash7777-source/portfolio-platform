import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/webinars/list — فهرستِ عمومیِ وبینارها.
 *
 * ── چرا این مسیر service-role نمی‌خواهد ───────────────────────────────
 * نسخهٔ اول با کلاینتِ service-role می‌خواند و بنابراین بدونِ
 * `SUPABASE_SERVICE_ROLE_KEY` **۵۰۰ با بدنهٔ خالی** می‌داد — یعنی یک صفحهٔ
 * کاملاً عمومی به سکرتِ سرور گره خورده بود. لازم نبود: سیاستِ
 * `webinars_public_read` روی خودِ جدول دقیقاً همین ردیف‌ها را به هر بازدیدکننده
 * می‌دهد (`status IN ('published','live','ended')`) — همان فیلترِ زیر. پس
 * خواندن با کلاینتِ معمولی انجام می‌شود و RLS گیتِ واقعی است، نه یک env.
 *
 * ── چرا شمارشِ ثبت‌نام فرق دارد ───────────────────────────────────────
 * `webinar_registrations` عمداً عمومی نیست (`wr_user_read` فقط ردیفِ خودِ
 * کاربر). پس شمارشِ کل یک **افزونهٔ اختیاری** است: اگر کلیدِ service-role
 * باشد عددِ واقعی می‌آید، وگرنه `null`. صفر برنمی‌گردانیم — «نشمردیم» و
 * «شمردیم و صفر بود» دو چیزند و نسخهٔ قبلی (`count ?? 0`) این دو را یکی
 * می‌کرد و یک عددِ ساختگی به UI می‌داد.
 */
const PUBLIC_STATUSES = ["published", "live", "ended"] as const;

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("webinars")
    .select(
      "id, title, description, starts_at, ends_at, registration_open, max_capacity, price_toman, platform, platform_url, status, created_at"
    )
    .in("status", PUBLIC_STATUSES as unknown as string[])
    .order("starts_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const webinars = data ?? [];

  // شمارش فقط وقتی سکرتِ سرور در دسترس است. نبودش فهرست را نمی‌خواباند.
  const admin = tryCreateAdminClient();
  if (!admin) {
    return NextResponse.json({
      webinars: webinars.map((w) => ({ ...w, registered_count: null })),
      countsAvailable: false,
    });
  }

  const withCounts = await Promise.all(
    webinars.map(async (w) => {
      const { count, error: countError } = await admin
        .from("webinar_registrations")
        .select("*", { count: "exact", head: true })
        .eq("webinar_id", w.id)
        .in("payment_status", ["paid", "free"]);
      // شکستِ شمارش هم `null` است، نه صفر — همان قاعده.
      return { ...w, registered_count: countError ? null : count ?? null };
    })
  );

  return NextResponse.json({ webinars: withCounts, countsAvailable: true });
}
