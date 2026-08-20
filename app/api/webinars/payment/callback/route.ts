import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/webinars/payment/callback — بازگشت از زرین‌پال برای ثبت‌نامِ وبینار.
// امنیت (هم‌الگو با /api/payment/callback): به پارامترهای query اعتماد نمی‌کنیم؛
// پرداخت را با authority در رکوردِ خودمان پیدا می‌کنیم، مبلغ را از همان رکورد
// می‌خوانیم (نه قیمتِ متغیرِ وبینار)، و با گاردِ status==pending نهایی‌سازی
// idempotent است (verifyPayment روی کد ۱۰۱ هم ok می‌دهد → بدون این گاردها
// امکانِ replay بود).
function webinarsUrl(base: string, params: Record<string, string>): string {
  const url = new URL("/webinars", base);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("Authority") ?? "";
  const status = req.nextUrl.searchParams.get("Status") ?? "";
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    req.nextUrl.origin
  ).replace(/\/$/, "");

  if (!authority) {
    return NextResponse.redirect(webinarsUrl(base, { status: "failed" }));
  }

  const admin = createAdminClient();

  // رکوردِ pending خودمان — مرجعِ معتبرِ مبلغ و کاربر (بایندِ authority).
  const { data: payment } = await admin
    .from("payments")
    .select("id, user_id, amount, status")
    .eq("authority", authority)
    .maybeSingle();

  if (!payment) {
    return NextResponse.redirect(webinarsUrl(base, { status: "failed" }));
  }

  // ثبت‌نامِ متصل به این پرداخت (از طریقِ payment_id که هنگامِ شروعِ پرداخت ست شد).
  const { data: reg } = await admin
    .from("webinar_registrations")
    .select("id, webinar_id")
    .eq("payment_id", payment.id)
    .maybeSingle();
  const webinarId = reg?.webinar_id ?? "";

  // قبلاً تأیید شده → idempotent، دوباره پردازش نمی‌کنیم.
  if (payment.status === "paid") {
    return NextResponse.redirect(
      webinarsUrl(base, { status: "success", webinar_id: webinarId })
    );
  }

  // کاربر لغو کرد یا زرین‌پال ناموفق برگشت. گاردِ status==pending تا تریگر نشکند.
  if (status !== "OK") {
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id)
      .eq("status", "pending");
    return NextResponse.redirect(
      webinarsUrl(base, { status: "failed", webinar_id: webinarId })
    );
  }

  // verify با مبلغِ رکوردِ خودمان (نه قیمتِ وبینار که ممکن است تغییر کرده باشد).
  const verify = await verifyPayment(authority, payment.amount);
  if (!verify.ok) {
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id)
      .eq("status", "pending");
    return NextResponse.redirect(
      webinarsUrl(base, { status: "failed", webinar_id: webinarId })
    );
  }

  // نهایی‌سازیِ پرداخت — گاردِ status==pending → فقط یک‌بار موفق می‌شود (idempotent).
  await admin
    .from("payments")
    .update({
      status: "paid",
      ref_id: verify.refId ?? "",
      verified_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("status", "pending");

  if (reg) {
    await admin
      .from("webinar_registrations")
      .update({ payment_status: "paid" })
      .eq("id", reg.id);

    await admin.from("audit_log").insert({
      actor_id: payment.user_id,
      action: "webinar.payment_success",
      entity: "webinar_registration",
      target_user_id: payment.user_id,
      after: {
        webinar_id: reg.webinar_id,
        registration_id: reg.id,
        ref_id: verify.refId,
        amount: payment.amount,
      },
    });
  }

  return NextResponse.redirect(
    webinarsUrl(base, { status: "success", webinar_id: webinarId })
  );
}
