import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleLegacyFinancialCallback, handleWebinarCallback } from "@/lib/payments/webinar-binding";
import { verifyPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dispatch requires stored, versioned purpose. Legacy/unknown intent is not a service purchase.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const fallback = new URL("/payment/result", base);
  fallback.searchParams.set("status", "unknown");
  if (params.getAll("Authority").length === 1) fallback.searchParams.set("authority", params.get("Authority") ?? "");
  try {
    const admin = createAdminClient();
    const result = await handleWebinarCallback(admin, params, verifyPayment,
      process.env.WEBINAR_PAYMENT_BINDING_WRITES === "1");
    if (!result.binding) {
      const financial = await handleLegacyFinancialCallback(admin, params, verifyPayment);
      fallback.searchParams.set("status", financial.status);
      fallback.searchParams.set("service", "unverified");
      if (financial.receipt?.status === "paid" && financial.receipt.refId) fallback.searchParams.set("ref", financial.receipt.refId);
      return NextResponse.redirect(fallback);
    }
    const url = new URL("/webinars", base);
    url.searchParams.set("status", result.status);
    url.searchParams.set("webinar_id", result.binding.webinarId);
    if (result.status === "unknown") {
      url.searchParams.set("authority", result.binding.authority ?? "");
      url.searchParams.set("registration_id", result.binding.registrationId);
      url.searchParams.set("payment_id", result.binding.paymentId);
    }
    return NextResponse.redirect(url);
  } catch { return NextResponse.redirect(fallback); }
}
