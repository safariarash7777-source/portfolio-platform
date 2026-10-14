import { NextRequest, NextResponse } from "next/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/zarinpal";
import { uuid, authority as validAuthority, refId, paymentContext, settledReceipt, rejectedReceipt } from "@/lib/webinars/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("Authority") ?? "";
  const registrationId = req.nextUrl.searchParams.get("registration_id") ?? "";
  const result = (status: string, webinarId?: string) => {
    const url = new URL("/webinars", process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin);
    url.searchParams.set("status", status);
    if (validAuthority(authority)) url.searchParams.set("authority", authority);
    if (uuid(registrationId)) url.searchParams.set("registration_id", registrationId);
    if (webinarId) url.searchParams.set("webinar_id", webinarId);
    return NextResponse.redirect(url);
  };
  if (!validAuthority(authority) || !uuid(registrationId) || req.nextUrl.searchParams.get("Status") !== "OK") return result("unknown");
  const admin = tryCreateAdminClient();
  if (!admin) return result("unknown");
  try {
    const { data, error } = await admin.rpc("read_webinar_payment_context", { p_authority: authority, p_registration_id: registrationId });
    const context = error ? null : paymentContext(data, authority, registrationId);
    if (!context) return result("unknown");
    if (context.payment_status === "paid") return result("success", context.webinar_id);
    if (context.payment_status === "failed") return result("failed", context.webinar_id);
    const proof = await verifyPayment(authority, context.amount);
    if (proof.outcome === "unknown") return result("unknown", context.webinar_id);
    const binding = { p_authority: authority, p_registration_id: registrationId, p_payment_id: context.payment_id, p_amount: context.amount };
    if (proof.outcome === "rejected") {
      const { data: receipt, error: rejectionError } = await admin.rpc("reject_webinar_payment", binding);
      return result(!rejectionError && rejectedReceipt(receipt, context) ? "failed" : "unknown", context.webinar_id);
    }
    if (proof.outcome !== "verified" || ![100, 101].includes(proof.code) || !refId(proof.refId)) return result("unknown", context.webinar_id);
    const { data: receipt, error: settleError } = await admin.rpc("settle_webinar_payment", { ...binding, p_ref_id: proof.refId });
    return result(!settleError && settledReceipt(receipt, context, proof.refId) ? "success" : "unknown", context.webinar_id);
  } catch {
    return result("unknown");
  }
}
