import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// callbackِ اختصاصیِ وبینار (نه callbackِ خریدِ دوره). زرین‌پال Authority/Status
// را به این نشانی برمی‌گرداند و ما ثبت‌نام را از روی همان authority پیدا می‌کنیم.
function webinarCallbackUrl(): string {
  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  return `${site}/api/webinars/payment/callback`;
}

// POST /api/webinars/payment — شروع پرداخت برای ثبت‌نام وبینار.
// مبلغ فقط سمت سرور (از قیمتِ وبینار) تعیین می‌شود؛ به بدنهٔ درخواست اعتماد نمی‌کنیم.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  }

  const { registration_id } = await req.json().catch(() => ({}));
  if (!registration_id) {
    return NextResponse.json(
      { error: "registration_id الزامی است." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // ثبت‌نام باید متعلقِ همین کاربر باشد (بایندِ مالکیت).
  const { data: reg, error: regErr } = await admin
    .from("webinar_registrations")
    .select("id, webinar_id, user_id, payment_status, webinars(title, price_toman)")
    .eq("id", registration_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (regErr || !reg) {
    return NextResponse.json({ error: "ثبت‌نام یافت نشد." }, { status: 404 });
  }
  if (reg.payment_status === "paid") {
    return NextResponse.json(
      { error: "این ثبت‌نام قبلاً پرداخت شده." },
      { status: 400 }
    );
  }

  const webinar = (reg as { webinars?: { title?: string; price_toman?: number } }).webinars;
  const price = webinar?.price_toman ?? 0;
  if (!webinar || price <= 0) {
    return NextResponse.json(
      { error: "این وبینار رایگان است و نیاز به پرداخت ندارد." },
      { status: 400 }
    );
  }

  // authority را پیش از ثبتِ رکورد می‌گیریم تا در همان رکورد ذخیره شود
  // (بایندِ authority ↔ payment ↔ کاربر؛ الگوی امنِ callbackِ اصلی).
  const zp = await requestPayment(
    price,
    `ثبت‌نام وبینار: ${webinar.title ?? ""}`,
    webinarCallbackUrl()
  );
  if (!zp.ok || !zp.authority || !zp.startPayUrl) {
    return NextResponse.json(
      { error: zp.message || "خطا در اتصال به درگاه پرداخت." },
      { status: 502 }
    );
  }

  // ردیفِ pending از طریقِ تابعِ SECURITY DEFINER (append-only + auth.uid + audit).
  const { data: paymentId, error: payErr } = await supabase.rpc("create_payment", {
    p_amount: price,
    p_authority: zp.authority,
  });
  if (payErr || !paymentId) {
    console.error("create_payment (webinar) error:", payErr?.message);
    return NextResponse.json(
      { error: "خطا در ساخت رکورد پرداخت." },
      { status: 500 }
    );
  }

  // اتصالِ پرداخت به ثبت‌نام تا callback بتواند از روی authority→payment→registration
  // ثبت‌نامِ درست را بیابد. (نوشتنِ registrations فقط از سرویس‌رول/تابع مجاز است.)
  await admin
    .from("webinar_registrations")
    .update({ payment_id: paymentId })
    .eq("id", reg.id)
    .eq("user_id", user.id);

  return NextResponse.json({ payment_url: zp.startPayUrl });
}
