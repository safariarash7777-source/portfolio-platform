import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/zarinpal";
import { grantEntitlement, entitlementSource, recordGrantFailure } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/webinars/payment/callback — بازگشت از درگاه زرین‌پال.
//
// هم‌الگو با `/api/payment/callback`: پرداخت **فقط** با `authority` پیدا می‌شود
// (نه با شناسهٔ داخلِ query که کاربر می‌تواند دست‌کاری کند)، مبلغ از ردیفِ خودمان
// خوانده می‌شود نه از قیمتِ متغیرِ وبینار، و گذارِ وضعیت از راهِ RPCهای
// `verify_payment`/`fail_payment` انجام می‌شود که تریگرِ append-only را رعایت
// می‌کنند. کدِ ۱۰۱ زرین‌پال («قبلاً تأیید شده») هم `ok` است، پس بدونِ کوتاه‌مدارِ
// `status==='paid'` امکانِ replay وجود داشت.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const authority = searchParams.get("Authority") ?? "";
  const status = searchParams.get("Status") ?? "";

  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    req.nextUrl.origin
  ).replace(/\/$/, "");

  if (!authority) {
    return NextResponse.redirect(`${baseUrl}/webinars?error=invalid_callback`);
  }

  const admin = createAdminClient();

  // ردیفِ pending خودمان — مرجعِ معتبرِ مبلغ و کاربر.
  const { data: payment } = await admin
    .from("payments")
    .select("id, user_id, amount, status")
    .eq("authority", authority)
    .maybeSingle();

  if (!payment) {
    return NextResponse.redirect(`${baseUrl}/webinars?error=not_found`);
  }

  // ثبت‌نامِ متصل به این پرداخت.
  const { data: reg } = await admin
    .from("webinar_registrations")
    .select("id, webinar_id, user_id")
    .eq("payment_id", payment.id)
    .maybeSingle();

  const webinarQuery = reg?.webinar_id ? `&webinar_id=${reg.webinar_id}` : "";

  // قبلاً تأیید شده → idempotent.
  if (payment.status === "paid") {
    return NextResponse.redirect(
      `${baseUrl}/webinars?status=success${webinarQuery}`
    );
  }

  // کاربر لغو کرد یا زرین‌پال ناموفق برگشت.
  if (status !== "OK") {
    await admin.rpc("fail_payment", { p_authority: authority });
    await admin.from("audit_log").insert({
      actor_id: payment.user_id,
      action: "webinar.payment_failed",
      entity: "webinar_registration",
      target_user_id: payment.user_id,
      after: { webinar_id: reg?.webinar_id ?? null, registration_id: reg?.id ?? null },
    });
    return NextResponse.redirect(
      `${baseUrl}/webinars?status=failed${webinarQuery}`
    );
  }

  // مبلغ از ردیفِ خودمان — نه از قیمتِ فعلیِ وبینار که ممکن است تغییر کرده باشد.
  const verification = await verifyPayment(authority, payment.amount);
  if (!verification.ok) {
    await admin.rpc("fail_payment", { p_authority: authority });
    return NextResponse.redirect(
      `${baseUrl}/webinars?status=failed${webinarQuery}`
    );
  }

  const { error: verifyErr } = await admin.rpc("verify_payment", {
    p_authority: authority,
    p_ref_id: verification.refId ?? "",
    p_amount: payment.amount,
  });
  if (verifyErr) {
    console.error("verify_payment (webinar) error:", verifyErr.message);
    return NextResponse.redirect(
      `${baseUrl}/webinars?status=failed${webinarQuery}`
    );
  }

  if (reg) {
    await admin
      .from("webinar_registrations")
      .update({ payment_status: "paid" })
      .eq("id", reg.id);
  }

  // اعطای دسترسی — بدونِ این، شرکت‌کنندهٔ وبینار پس از پرداخت `registered` می‌ماند.
  const grantInput = {
    userId: payment.user_id as string,
    kind: "webinar" as const,
    source: entitlementSource("webinar", authority),
    note: reg?.webinar_id ? `webinar:${reg.webinar_id}` : null,
  };
  const grant = await grantEntitlement(admin, grantInput);
  if (!grant.ok) {
    console.error("grantEntitlement (webinar) failed:", grant.reason, grant.message);
    await recordGrantFailure(admin, grantInput, grant);
  }

  await admin.from("audit_log").insert({
    actor_id: payment.user_id,
    action: "webinar.payment_success",
    entity: "webinar_registration",
    target_user_id: payment.user_id,
    after: {
      webinar_id: reg?.webinar_id ?? null,
      registration_id: reg?.id ?? null,
      ref_id: verification.refId,
      amount_toman: payment.amount,
    },
  });

  return NextResponse.redirect(
    `${baseUrl}/webinars?status=success${webinarQuery}${grant.ok ? "" : "&access=pending"}`
  );
}
