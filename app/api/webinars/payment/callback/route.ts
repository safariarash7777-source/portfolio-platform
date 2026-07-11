import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/webinars/payment/callback — بازگشت از درگاه زرین‌پال
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const authority = searchParams.get("Authority");
  const status = searchParams.get("Status");
  const registrationId = searchParams.get("registration_id");
  const paymentId = searchParams.get("payment_id");

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://portfolio-platform-fawn.vercel.app";

  if (!authority || !registrationId || !paymentId) {
    return NextResponse.redirect(`${baseUrl}/webinars?error=invalid_callback`);
  }

  const admin = createAdminClient();

  // دریافت اطلاعات ثبت‌نام و وبینار
  const { data: reg } = await admin
    .from("webinar_registrations")
    .select("id, webinar_id, user_id, webinars(price_toman, title)")
    .eq("id", registrationId)
    .maybeSingle();

  if (!reg) {
    return NextResponse.redirect(`${baseUrl}/webinars?error=not_found`);
  }

  const webinar = (reg as any).webinars;
  const amount = webinar?.price_toman ?? 0;

  if (status !== "OK") {
    // پرداخت ناموفق
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", paymentId);

    await admin
      .from("audit_log")
      .insert({
        actor_id: reg.user_id,
        action: "webinar.payment_failed",
        entity: "webinar_registration",
        target_user_id: reg.user_id,
        after: { webinar_id: reg.webinar_id, registration_id: registrationId },
      });

    return NextResponse.redirect(
      `${baseUrl}/webinars?status=failed&webinar_id=${reg.webinar_id}`
    );
  }

  // تأیید پرداخت با زرین‌پال
  const verification = await verifyPayment(authority, amount);

  if (!verification.ok) {
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", paymentId);

    return NextResponse.redirect(
      `${baseUrl}/webinars?status=failed&webinar_id=${reg.webinar_id}`
    );
  }

  // پرداخت موفق → آپدیت payment + registration
  await admin
    .from("payments")
    .update({
      status: "verified",
      ref_id: String(verification.refId),
      verified_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  await admin
    .from("webinar_registrations")
    .update({ payment_status: "paid" })
    .eq("id", registrationId);

  // audit log
  await admin.from("audit_log").insert({
    actor_id: reg.user_id,
    action: "webinar.payment_success",
    entity: "webinar_registration",
    target_user_id: reg.user_id,
    after: {
      webinar_id: reg.webinar_id,
      registration_id: registrationId,
      ref_id: verification.refId,
      amount_toman: amount,
    },
  });

  return NextResponse.redirect(
    `${baseUrl}/webinars?status=success&webinar_id=${reg.webinar_id}`
  );
}
