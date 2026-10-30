import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bindingId, existingWebinarPaymentUrl, readOwnedRegistration } from "@/lib/payments/webinar-binding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const unknown = () => json({ state: "unknown", error: "نتیجهٔ این درخواست هنوز قابل تأیید نیست؛ وضعیت همان ثبت‌نام را بررسی کنید." }, 409);

// Owner-scoped authoritative recovery. No registration/payment is created by GET.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return json({ state: "unknown" }, 503);
    if (!user) return json({ error: "ابتدا وارد شوید." }, 401);
    const webinarId = req.nextUrl.searchParams.get("webinar_id");
    if (req.nextUrl.searchParams.getAll("webinar_id").length !== 1 || !bindingId(webinarId)) return json({ error: "شناسه معتبر نیست." }, 400);
    const state = await readOwnedRegistration(supabase, user.id, webinarId, process.env.WEBINAR_PAYMENT_BINDING_WRITES === "1");
    return state ? json({ state, payment_url: existingWebinarPaymentUrl(state) }) : json({ state: "unknown" }, 503);
  } catch { return json({ state: "unknown" }, 503); }
}

// Choose one contract BEFORE one session-bound write. Never retry with the old RPC after an ambiguous ACK.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return json({ state: "unknown" }, 503);
    if (!user) return json({ error: "ابتدا وارد شوید." }, 401);
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "درخواست معتبر نیست." }, 400); }
    const webinarId = body && typeof body === "object" && !Array.isArray(body) && "webinar_id" in body ? body.webinar_id : null;
    if (!bindingId(webinarId)) return json({ error: "شناسه معتبر نیست." }, 400);
    const enabled = process.env.WEBINAR_PAYMENT_BINDING_WRITES === "1";
    const before = await readOwnedRegistration(supabase, user.id, webinarId, enabled);
    if (!before) return json({ state: "unknown" }, 503);
    if (before.state !== "absent") return json({ state: before, payment_url: existingWebinarPaymentUrl(before) });
    const selectedRpc = before.mode === "bound" ? "register_for_webinar_bound_v1" : "register_for_webinar";
    let ack: unknown;
    try {
      const result = await supabase.rpc(selectedRpc, { p_webinar_id: webinarId });
      if (result.error) return unknown();
      ack = result.data;
    } catch { return unknown(); }
    if (!ack || typeof ack !== "object" || Array.isArray(ack) || !("registration_id" in ack) || !bindingId(ack.registration_id)) return unknown();
    const after = await readOwnedRegistration(supabase, user.id, webinarId, enabled);
    if (!after || after.state !== "registered" || after.registrationId !== ack.registration_id) return unknown();
    return json({ state: after, registration: { registration_id: after.registrationId, needs_payment: after.paymentStatus === "pending" } });
  } catch { return unknown(); }
}
