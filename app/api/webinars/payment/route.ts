import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webinars/payment — شروع پرداخت برای ثبت‌نام وبینار
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  }

  const { registration_id } = await req.json();
  if (!registration_id) {
    return NextResponse.json(
      { error: "registration_id الزامی است." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // دریافت اطلاعات ثبت‌نام و وبینار
  const { data: reg, error: regErr } = await admin
    .from("webinar_registrations")
    .select("id, webinar_id, user_id, payment_status, webinars(title, price_toman)")
    .eq("id", registration_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (regErr || !reg) {
    return NextResponse.json(
      { error: "ثبت‌نام یافت نشد." },
      { status: 404 }
    );
  }

  if (reg.payment_status === "paid") {
    return NextResponse.json(
      { error: "این ثبت‌نام قبلاً پرداخت شده." },
      { status: 400 }
    );
  }

  const webinar = (reg as any).webinars;
  if (!webinar || webinar.price_toman <= 0) {
    return NextResponse.json(
      { error: "این وبینار رایگان است و نیاز به پرداخت ندارد." },
      { status: 400 }
    );
  }

  // ساخت رکورد پرداخت
  const { data: payment, error: payErr } = await admin
    .from("payments")
    .insert({
      user_id: user.id,
      amount_toman: webinar.price_toman,
      status: "pending",
      description: `ثبت‌نام وبینار: ${webinar.title}`,
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    return NextResponse.json(
      { error: "خطا در ساخت رکورد پرداخت." },
      { status: 500 }
    );
  }

  // لینک‌کردن پرداخت به ثبت‌نام
  await admin
    .from("webinar_registrations")
    .update({ payment_id: payment.id })
    .eq("id", registration_id);

  // درخواست پرداخت از زرین‌پال
  // requestPayment(amountToman, description) → ZarinpalRequestResult
  const result = await requestPayment(
    webinar.price_toman,
    `ثبت‌نام وبینار: ${webinar.title}`
  );

  if (!result.ok || !result.startPayUrl) {
    return NextResponse.json(
      { error: result.message || "خطا در اتصال به درگاه پرداخت." },
      { status: 502 }
    );
  }

  return NextResponse.json({ payment_url: result.startPayUrl });
}
