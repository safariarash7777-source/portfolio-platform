import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { attachWebinarAuthority, bindingId, claimWebinarRequest, prepareWebinarBinding } from "@/lib/payments/webinar-binding";
import { requestPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disabled until installation, native acceptance and independent sales authorization.
export async function POST(req: NextRequest) {
  const unavailable = () => NextResponse.json({ state: "unavailable", error: "شروع پرداخت وبینار فعلاً فعال نیست." }, { status: 503 });
  const unknown = () => NextResponse.json({ state: "unknown", error: "وضعیت این درخواست هنوز مشخص نیست؛ پرداخت تازه‌ای آغاز نکنید." }, { status: 409 });
  if (process.env.WEBINAR_PAYMENT_BINDING_WRITES !== "1") return unavailable();
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return unavailable();
    if (!user) return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
    const registrationId = body && typeof body === "object" && !Array.isArray(body) && "registration_id" in body ? body.registration_id : null;
    const intentKey = req.headers.get("Idempotency-Key");
    if (!bindingId(registrationId) || !bindingId(intentKey)) return NextResponse.json({ error: "شناسهٔ ثبت‌نام و شناسهٔ ثابت درخواست الزامی است." }, { status: 400 });
    const admin = tryCreateAdminClient();
    if (!admin) return unavailable();
    const binding = await prepareWebinarBinding(supabase, user.id, registrationId, intentKey);
    if (!binding || !binding.issuanceEnabled) return unknown();
    if (binding.status !== "pending" || binding.providerState !== "prepared" || binding.registrationState !== "pending") return unknown();
    if (!await claimWebinarRequest(admin, binding)) return unknown();
    // Once claimed, every ambiguous outcome stays on this intent. Never call requestPayment twice.
    const requested = await requestPayment(binding.amountToman, "ثبت‌نام وبینار");
    if (!requested.ok || !requested.authority || !requested.startPayUrl) return unknown();
    const paymentUrl = new URL(requested.startPayUrl);
    if (paymentUrl.protocol !== "https:" || !["payment.zarinpal.com", "sandbox.zarinpal.com"].includes(paymentUrl.host)
      || paymentUrl.pathname !== `/pg/StartPay/${requested.authority}` || paymentUrl.search || paymentUrl.hash
      || paymentUrl.username || paymentUrl.password) return unknown();
    const attached = await attachWebinarAuthority(admin, binding, requested.authority);
    if (!attached) return unknown();
    return NextResponse.json({ payment_url: requested.startPayUrl });
  } catch { return unknown(); }
}
