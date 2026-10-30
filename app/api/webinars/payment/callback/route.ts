import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleWebinarCallback } from "@/lib/payments/webinar-binding";
import { verifyPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility endpoint: query IDs are hints, never evidence of purchase purpose.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const url = new URL("/webinars", base);
  url.searchParams.set("status", "unknown");
  try {
    const result = await handleWebinarCallback(createAdminClient(), params, verifyPayment,
      process.env.WEBINAR_PAYMENT_BINDING_WRITES === "1", true);
    url.searchParams.set("status", result.status);
    if (result.binding) url.searchParams.set("webinar_id", result.binding.webinarId);
    if (result.status === "unknown") {
      for (const key of ["Authority", "registration_id", "payment_id"]) {
        if (params.getAll(key).length === 1) url.searchParams.set(key === "Authority" ? "authority" : key, params.get(key) ?? "");
      }
    }
  } catch { /* Unavailable service/schema is unknown, never a payment failure. */ }
  return NextResponse.redirect(url);
}
