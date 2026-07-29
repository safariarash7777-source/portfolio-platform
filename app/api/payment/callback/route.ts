import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/zarinpal";
import { createSingleUseInvite, sendMessage } from "@/lib/telegram";
import { sendAnnouncementEmail } from "@/lib/resend";
import { grantEntitlement, entitlementSource, recordGrantFailure } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resultUrl(req: NextRequest, params: Record<string, string>): URL {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const url = new URL("/payment/result", base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

// GET /api/payment/callback — بازگشت از زرین‌پال. verify سمت سرور، سپس
// (در صورت لینک‌بودنِ تلگرام) دعوت تک‌نفرهٔ کانال. به پارامترهای query
// اعتماد نمی‌کنیم؛ مبلغ را با ردیفِ pending خودمان تطبیق می‌دهیم.
export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("Authority") ?? "";
  const status = req.nextUrl.searchParams.get("Status") ?? "";

  if (!authority) {
    return NextResponse.redirect(resultUrl(req, { status: "failed" }));
  }

  const admin = createAdminClient();

  // ردیفِ pending خودمان — مرجعِ معتبرِ مبلغ و کاربر.
  const { data: payment } = await admin
    .from("payments")
    .select("user_id, amount, status")
    .eq("authority", authority)
    .maybeSingle();

  if (!payment) {
    return NextResponse.redirect(resultUrl(req, { status: "failed" }));
  }

  // قبلاً تأیید شده → idempotent، دعوتِ دوباره نمی‌فرستیم.
  if (payment.status === "paid") {
    return NextResponse.redirect(resultUrl(req, { status: "success" }));
  }

  // کاربر پرداخت را لغو کرد یا زرین‌پال ناموفق برگشت.
  if (status !== "OK") {
    await admin.rpc("fail_payment", { p_authority: authority });
    return NextResponse.redirect(resultUrl(req, { status: "failed" }));
  }

  const verify = await verifyPayment(authority, payment.amount);
  if (!verify.ok) {
    await admin.rpc("fail_payment", { p_authority: authority });
    return NextResponse.redirect(resultUrl(req, { status: "failed" }));
  }

  // اگر تلگرام لینک شده، پیش از نهایی‌سازی لینک دعوت بساز تا در همان
  // به‌روزرسانیِ نهایی ذخیره شود (payments پس از paid دیگر قابل ویرایش نیست).
  const { data: link } = await admin
    .from("telegram_links")
    .select("telegram_user_id")
    .eq("user_id", payment.user_id)
    .maybeSingle();

  const inviteLink = await createSingleUseInvite();

  const { error: verifyErr } = await admin.rpc("verify_payment", {
    p_authority: authority,
    p_ref_id: verify.refId ?? "",
    p_amount: payment.amount,
    p_invite_link: inviteLink,
  });
  if (verifyErr) {
    console.error("verify_payment error:", verifyErr.message);
    return NextResponse.redirect(resultUrl(req, { status: "failed" }));
  }

  // اعطای دسترسی — بدونِ این، کاربرِ پرداخت‌کرده `registered` می‌ماند چون
  // `lib/access.ts` سطح را از `entitlements` می‌خواند نه از `payments`.
  // idempotent نسبت به authority، و شکستش redirect را نمی‌شکند (پول گرفته شده).
  const grantInput = {
    userId: payment.user_id as string,
    kind: "consulting" as const,
    source: entitlementSource("consulting", authority),
  };
  const grant = await grantEntitlement(admin, grantInput);
  if (!grant.ok) {
    // پول گرفته شده ولی دسترسی داده نشده. این نباید در لاگ گم شود.
    console.error("grantEntitlement (consulting) failed:", grant.reason, grant.message);
    await recordGrantFailure(admin, grantInput, grant);
  }

  // تلگرام لینک شده → DM دعوت. در غیر این صورت لینک در داشبورد نشان داده می‌شود.
  if (link?.telegram_user_id && inviteLink) {
    const sent = await sendMessage(
      link.telegram_user_id,
      `✅ پرداخت شما با موفقیت تأیید شد.\n\nاین لینکِ دعوتِ اختصاصی و یک‌بارمصرفِ شما به کانال خصوصی است:\n${inviteLink}\n\nبرای دیدن آخرین نسخهٔ پرتفوی خود دستور /portfolio را بفرستید.`
    );
    if (sent) {
      await admin.from("audit_log").insert({
        actor_id: payment.user_id,
        action: "telegram.invite",
        entity: "telegram",
        target_user_id: payment.user_id,
        after: { delivered: true },
      });
    }
  }

  // ایمیل تأیید پرداخت — best-effort (شکست ایمیل مانع redirect نمی‌شود).
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", payment.user_id)
    .maybeSingle();
  if (profile?.email) {
    await sendAnnouncementEmail(
      profile.email,
      "پرداخت شما با موفقیت تأیید شد",
      `با سلام،\n\nپرداخت شما به مبلغ **${payment.amount.toLocaleString("fa-IR")} تومان** با موفقیت تأیید شد.\n\nکد پیگیری: \`${verify.refId ?? "—"}\`\n\n${inviteLink ? "لینک دعوت کانال خصوصی نیز از طریق تلگرام برای شما ارسال شده است." : "برای دریافت لینک دعوت کانال، ابتدا حساب تلگرام خود را از داشبورد متصل کنید."}\n\nبا تشکر،\nتیم آرش صفری`
    );
  }

  // اگر اعطای دسترسی نشد، مشتری باید بداند دسترسی «در حالِ فعال‌سازی» است —
  // نه اینکه صفحهٔ موفقیت ببیند، بعد وارد شود و بفهمد هنوز دسترسی ندارد.
  return NextResponse.redirect(
    resultUrl(req, {
      status: "success",
      ref: verify.refId ?? "",
      ...(grant.ok ? {} : { access: "pending" }),
    })
  );
}
