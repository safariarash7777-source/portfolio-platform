import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSingleUseInvite, sendMessage } from "@/lib/telegram";
import { sendAnnouncementEmail } from "@/lib/resend";
import { finalizePaidAccess } from "@/lib/payments/finalize";
import { createSupabaseFinalizePorts } from "@/lib/payments/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resultUrl(req: NextRequest, params: Record<string, string>): URL {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const url = new URL("/payment/result", base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

// GET /api/payment/callback — بازگشت از زرین‌پال برای خریدِ دوره/مشاوره.
//
// گذارِ وضعیت و اعطای دسترسی همگی در `finalizePaidAccess` انجام می‌شود — همان
// تابعی که callbackِ وبینار هم صدا می‌زند. اینجا فقط اثرهای جانبیِ مخصوصِ این
// محصول می‌ماند: دعوتِ تلگرام و ایمیلِ تأیید (هر دو best-effort).
export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("Authority") ?? "";
  const gatewayStatus = req.nextUrl.searchParams.get("Status") ?? "";

  const admin = createAdminClient();
  const ports = createSupabaseFinalizePorts(admin, {
    createInviteLink: () => createSingleUseInvite(),
  });

  const outcome = await finalizePaidAccess({
    authority,
    gatewayStatus,
    product: "consulting",
    ports,
  });

  if (outcome.status === "failed") {
    return NextResponse.redirect(resultUrl(req, { status: "failed" }));
  }

  // پول گرفته شده ولی سمتِ ما نهایی نشده. مشتری نباید صفحهٔ «خریدِ موفق» ببیند،
  // بعد وارد شود و بفهمد دسترسی ندارد.
  if (outcome.status === "access_pending") {
    return NextResponse.redirect(
      resultUrl(req, { status: "success", ref: outcome.refId, access: "pending" })
    );
  }

  // ── از اینجا به بعد: پرداخت نهایی و دسترسی ساخته شده ─────────────────────
  // اثرهای جانبی فقط بارِ اول؛ replay نباید دعوت و ایمیلِ دوباره بفرستد.
  if (!outcome.alreadyFinalized) {
    await deliverInviteAndEmail(admin, outcome.userId, outcome.refId);
  }

  return NextResponse.redirect(
    resultUrl(req, { status: "success", ref: outcome.refId })
  );
}

/**
 * دعوتِ تلگرام و ایمیلِ تأیید.
 *
 * عمداً هیچ‌کدام مسیرِ کاربر را نمی‌شکنند: پرداخت و دسترسی از قبل کامیت شده‌اند
 * و شکستِ یک پیام نباید مشتری را به صفحهٔ خطا ببرد. لینکِ دعوت در `payments`
 * ذخیره شده و در داشبورد هم قابلِ دیدن است.
 */
async function deliverInviteAndEmail(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  refId: string
): Promise<void> {
  const { data: payment } = await admin
    .from("payments")
    .select("amount, invite_link")
    .eq("user_id", userId)
    .eq("ref_id", refId)
    .maybeSingle();

  const inviteLink = payment?.invite_link ?? null;

  const { data: link } = await admin
    .from("telegram_links")
    .select("telegram_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (link?.telegram_user_id && inviteLink) {
    const sent = await sendMessage(
      link.telegram_user_id,
      `✅ پرداخت شما با موفقیت تأیید شد.\n\nاین لینکِ دعوتِ اختصاصی و یک‌بارمصرفِ شما به کانال خصوصی است:\n${inviteLink}\n\nبرای دیدن آخرین نسخهٔ پرتفوی خود دستور /portfolio را بفرستید.`
    );
    if (sent) {
      await admin.from("audit_log").insert({
        actor_id: userId,
        action: "telegram.invite",
        entity: "telegram",
        target_user_id: userId,
        after: { delivered: true },
      });
    }
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.email) {
    const amount = payment?.amount ?? 0;
    await sendAnnouncementEmail(
      profile.email,
      "پرداخت شما با موفقیت تأیید شد",
      `با سلام،\n\nپرداخت شما به مبلغ **${amount.toLocaleString("fa-IR")} تومان** با موفقیت تأیید شد.\n\nکد پیگیری: \`${refId || "—"}\`\n\n${inviteLink ? "لینک دعوت کانال خصوصی نیز از طریق تلگرام برای شما ارسال شده است." : "برای دریافت لینک دعوت کانال، ابتدا حساب تلگرام خود را از داشبورد متصل کنید."}\n\nبا تشکر،\nتیم آرش صفری`
    );
  }
}
