import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payment = {
  id: string; user_id: string; authority: string; amount: number;
  status: "pending" | "paid" | "failed"; ref_id: string | null; verified_at: string | null;
};
type Registration = {
  id: string; webinar_id: string; user_id: string; payment_id: string;
  payment_status: "pending" | "paid" | "free" | "refunded";
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function paymentRow(value: unknown): Payment | null {
  if (!object(value) || !text(value.id) || !text(value.user_id) || !text(value.authority)
    || typeof value.amount !== "number" || !Number.isSafeInteger(value.amount) || value.amount <= 0 || !Number.isSafeInteger(value.amount * 10)
    || typeof value.status !== "string" || !["pending", "paid", "failed"].includes(value.status)
    || value.ref_id !== null && !text(value.ref_id) || value.verified_at !== null && !text(value.verified_at)) return null;
  return value as Payment;
}
function registrationRow(value: unknown): Registration | null {
  if (!object(value) || ![value.id, value.webinar_id, value.user_id, value.payment_id].every(text)
    || typeof value.payment_status !== "string" || !["pending", "paid", "free", "refunded"].includes(value.payment_status)) return null;
  return value as Registration;
}
function paid(payment: Payment): boolean {
  return payment.status === "paid" && payment.ref_id !== null && /^[1-9]\d*$/.test(payment.ref_id)
    && Number.isSafeInteger(Number(payment.ref_id)) && payment.verified_at !== null
    && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(payment.verified_at) && Number.isFinite(Date.parse(payment.verified_at));
}
function samePayment(value: Payment | null, expected: Payment): value is Payment {
  return !!value && value.id === expected.id && value.user_id === expected.user_id
    && value.authority === expected.authority && value.amount === expected.amount;
}

// Settlement evidence only: no entitlement, invitation, price or service-policy changes.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const authority = params.get("Authority") ?? "", status = params.get("Status") ?? "";
  const registrationId = params.get("registration_id") ?? "", paymentId = params.get("payment_id") ?? "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://portfolio-platform-fawn.vercel.app";
  let webinarId: string | null = null;
  const result = (state: "unknown" | "failed" | "success") => {
    const url = new URL("/webinars", baseUrl);
    url.searchParams.set("status", state);
    if (webinarId) url.searchParams.set("webinar_id", webinarId);
    if (state === "unknown") {
      for (const [key, value] of Object.entries({ authority, registration_id: registrationId, payment_id: paymentId })) url.searchParams.set(key, value);
    }
    return NextResponse.redirect(url);
  };
  if (!["Authority", "Status", "registration_id", "payment_id"].every(key => params.getAll(key).length === 1)
    || ![authority, status, registrationId, paymentId].every(text)) return result("unknown");

  try {
    const admin = createAdminClient();
    async function readPayment(): Promise<Payment | null> {
      const { data, error } = await admin.from("payments")
        .select("id,user_id,authority,amount,status,ref_id,verified_at").eq("authority", authority).maybeSingle();
      const payment = error ? null : paymentRow(data);
      return payment?.id === paymentId && payment.authority === authority ? payment : null;
    }
    async function readRegistration(payment: Payment): Promise<Registration | null> {
      let query = admin.from("webinar_registrations")
        .select("id,webinar_id,user_id,payment_id,payment_status")
        .eq("id", registrationId).eq("payment_id", payment.id).eq("user_id", payment.user_id);
      if (webinarId !== null) query = query.eq("webinar_id", webinarId);
      const { data, error } = await query.maybeSingle();
      const reg = error ? null : registrationRow(data);
      return reg?.id === registrationId && reg.payment_id === payment.id && reg.user_id === payment.user_id
        && (webinarId === null || reg.webinar_id === webinarId) ? reg : null;
    }
    async function completePaid(payment: Payment) {
      const current = await readRegistration(payment);
      if (current?.payment_status === "paid") return result("success");
      if (current?.payment_status !== "pending") return result("unknown");
      let changed = false;
      try {
        const { data, error } = await admin.from("webinar_registrations").update({ payment_status: "paid" })
          .eq("id", registrationId).eq("payment_id", payment.id).eq("user_id", payment.user_id)
          .eq("webinar_id", current.webinar_id)
          .eq("payment_status", "pending").select("id").maybeSingle();
        changed = !error && data?.id === registrationId;
      } catch { /* Unknown acknowledgement: read back, never replay this write. */ }
      const confirmed = await readRegistration(payment);
      if (confirmed?.payment_status !== "paid") return result("unknown");
      if (changed) {
        // The existing settlement RPC owns the financial audit. This extra event is best-effort.
        try {
          await admin.from("audit_log").insert({ actor_id: payment.user_id, action: "webinar.payment_success",
            entity: "webinar_registration", target_user_id: payment.user_id,
            after: { webinar_id: confirmed.webinar_id, registration_id: registrationId, ref_id: payment.ref_id, amount_toman: payment.amount } });
        } catch { /* Do not turn a confirmed payment into a new payment attempt. */ }
      }
      return result("success");
    }

    const payment = await readPayment();
    if (!payment) return result("unknown");
    const reg = await readRegistration(payment);
    if (!reg || !["pending", "paid"].includes(reg.payment_status)) return result("unknown");
    webinarId = reg.webinar_id;
    if (payment.status === "paid") {
      if (!paid(payment)) return result("unknown");
      return reg.payment_status === "paid" ? result("success") : await completePaid(payment);
    }
    if (reg.payment_status !== "pending") return result("unknown");
    if (payment.status === "failed") return result("failed");
    // Callback flags are not authenticated evidence of non-payment.
    if (status !== "OK") return result("unknown");

    const verification = await verifyPayment(authority, payment.amount);
    if (verification.outcome === "unknown") return result("unknown");
    if (verification.outcome === "rejected") {
      try { await admin.rpc("fail_payment", { p_authority: authority }); }
      catch { /* Resolve the single attempted write from its canonical row. */ }
      const confirmed = await readPayment();
      if (!samePayment(confirmed, payment) || confirmed.status !== "failed") return result("unknown");
      const related = await readRegistration(confirmed);
      return related?.payment_status === "pending" ? result("failed") : result("unknown");
    }

    try {
      await admin.rpc("verify_payment", { p_authority: authority, p_ref_id: verification.refId, p_amount: payment.amount, p_invite_link: null });
    } catch { /* Lost response is not permission to issue a second settlement request. */ }
    const confirmed = await readPayment();
    if (!samePayment(confirmed, payment) || !paid(confirmed) || confirmed.ref_id !== verification.refId) return result("unknown");
    return await completePaid(confirmed);
  } catch {
    return result("unknown");
  }
}
