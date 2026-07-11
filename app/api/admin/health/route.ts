import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health — بررسی سلامت سیستم (فقط ادمین).
 * هرگز مقدار env var را برنمی‌گرداند — فقط present/absent.
 */
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

  // ── Env vars check ──
  const envVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHANNEL_ID",
    "TELEGRAM_WEBHOOK_SECRET",
    "ZARINPAL_MERCHANT_ID",
    "ZARINPAL_SANDBOX",
    "RESEND_API_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ];
  const env: Record<string, { present: boolean; note?: string }> = {};
  for (const key of envVars) {
    const val = process.env[key];
    const entry: { present: boolean; note?: string } = { present: Boolean(val) };
    if (key === "ZARINPAL_SANDBOX" && val) {
      entry.note = val === "true" || val === "1" ? "sandbox_mode" : "production_mode";
    }
    env[key] = entry;
  }

  // ── DB row counts ──
  const admin = createAdminClient();
  const tables = ["payments", "audit_log", "telegram_links"] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count } = await admin
      .from(table)
      .select("*", { count: "exact", head: true });
    counts[table] = count ?? 0;
  }

  // ── Telegram webhook info ──
  let webhookInfo: Record<string, unknown> | null = null;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
        { method: "GET" }
      );
      const json = await res.json();
      if (json?.ok) {
        webhookInfo = {
          url: json.result?.url ?? "",
          has_custom_certificate: json.result?.has_custom_certificate ?? false,
          pending_update_count: json.result?.pending_update_count ?? 0,
          last_error_date: json.result?.last_error_date ?? null,
          last_error_message: json.result?.last_error_message ?? null,
        };
      }
    } catch {
      webhookInfo = { error: "failed to fetch webhook info" };
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env,
    db_counts: counts,
    telegram_webhook: webhookInfo,
  });
}
