import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { requestPayment } from "@/lib/zarinpal";
import { record, uuid, amount, authority, paymentUrl } from "@/lib/webinars/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const unknown = (status = 503) => NextResponse.json({ error: "نتیجهٔ درخواست پرداخت مشخص نیست. برای بررسی همان ثبت‌نام با پشتیبانی پیگیری کنید.",
  paymentOutcome: "unknown", recovery: "reconcile_same_registration" }, { status });

export async function POST(req: NextRequest) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  const registrationId = record(body) ? body.registration_id : null;
  if (!uuid(registrationId)) return NextResponse.json({ error: "ثبت‌نام نامعتبر است." }, { status: 400 });
  const admin = tryCreateAdminClient();
  if (!admin) return unknown();

  // Atomic, durable reservation BEFORE requesting an authority. Missing proposal RPC fails closed.
  const { data: prepared, error } = await session.rpc("prepare_webinar_payment", { p_registration_id: registrationId });
  if (error || !record(prepared) || prepared.registration_id !== registrationId || prepared.user_id !== user.id ||
      !uuid(prepared.webinar_id) || !amount(prepared.amount) || prepared.amount <= 0) return unknown();
  if (prepared.state === "ready" && uuid(prepared.payment_id) && authority(prepared.authority) && paymentUrl(prepared.payment_url, prepared.authority)) {
    return NextResponse.json({ payment_url: prepared.payment_url });
  }
  if (prepared.started !== true) return unknown(409);
  const markUnknown = async () => { await admin.rpc("mark_webinar_payment_unknown", { p_registration_id: registrationId }); };
  if (prepared.state !== "requesting" || !uuid(prepared.webinar_id) || !amount(prepared.amount) || prepared.amount <= 0 ||
      typeof prepared.title !== "string" || !prepared.title.trim()) {
    await markUnknown(); return unknown();
  }
  try {
    const returnUrl = new URL("/api/webinars/payment/callback", process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin);
    returnUrl.searchParams.set("registration_id", registrationId);
    const requested = await requestPayment(prepared.amount, `ثبت‌نام وبینار: ${prepared.title}`, returnUrl.href);
    if (!requested.ok || !authority(requested.authority) || !paymentUrl(requested.startPayUrl, requested.authority)) {
      await markUnknown(); return unknown();
    }
    const { data: bound, error: bindError } = await admin.rpc("attach_webinar_payment", {
      p_registration_id: registrationId, p_authority: requested.authority,
      p_payment_url: requested.startPayUrl, p_amount: prepared.amount,
    });
    if (bindError || !record(bound) || bound.state !== "ready" || bound.registration_id !== registrationId ||
        bound.user_id !== user.id || bound.webinar_id !== prepared.webinar_id || bound.amount !== prepared.amount ||
        !uuid(bound.payment_id) || bound.authority !== requested.authority || bound.payment_url !== requested.startPayUrl) {
      await markUnknown(); return unknown();
    }
    return NextResponse.json({ payment_url: bound.payment_url });
  } catch {
    // This does not cancel/reverse a provider request or authorize a new charge.
    await markUnknown().catch(() => undefined); return unknown();
  }
}
