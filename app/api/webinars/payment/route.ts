import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestPayment } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** callbackِ اختصاصیِ وبینار — جدا از جریانِ دوره/مشاوره. */
const WEBINAR_CALLBACK_PATH = "/api/webinars/payment/callback";

// POST /api/webinars/payment — شروع پرداخت برای ثبت‌نام وبینار.
//
// ترتیب عمداً این است: اول تراکنشِ زرین‌پال ساخته می‌شود تا `authority` به‌دست
// آید، بعد ردیفِ pending با همان authority درج می‌شود. جدولِ `payments` ستون
// `authority` را UNIQUE و تغییرناپذیر می‌داند و callback تنها از همین راه
// پرداخت را پیدا می‌کند؛ اگر authority ذخیره نشود، پرداخت هرگز نهایی نمی‌شود.
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

  // ثبت‌نام با بایندِ مالکیت خوانده می‌شود — قیمت از دیتابیس می‌آید، نه از کلاینت.
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

  const webinar = (reg as unknown as {
    webinars: { title: string; price_toman: number } | null;
  }).webinars;

  if (!webinar || webinar.price_toman <= 0) {
    return NextResponse.json(
      { error: "این وبینار رایگان است و نیاز به پرداخت ندارد." },
      { status: 400 }
    );
  }

  const description = `ثبت‌نام وبینار: ${webinar.title}`;

  // ۱) تراکنش زرین‌پال با callbackِ وبینار (نه callbackِ دوره).
  const result = await requestPayment(
    webinar.price_toman,
    description,
    WEBINAR_CALLBACK_PATH
  );

  if (!result.ok || !result.startPayUrl || !result.authority) {
    return NextResponse.json(
      { error: result.message || "خطا در اتصال به درگاه پرداخت." },
      { status: 502 }
    );
  }

  // ۲) ردیفِ pending از راه RPC ساخته می‌شود — با کلاینتِ **کاربر**، چون
  // `create_payment` به `auth.uid()` تکیه دارد و ممیزی را هم خودش می‌نویسد.
  const { data: paymentId, error: payErr } = await supabase.rpc("create_payment", {
    p_amount: webinar.price_toman,
    p_authority: result.authority,
  });

  if (payErr || !paymentId) {
    console.error("create_payment (webinar) failed:", payErr?.message);
    return NextResponse.json(
      { error: "خطا در ساخت رکورد پرداخت." },
      { status: 500 }
    );
  }

  // ۳) اتصالِ پرداخت به ثبت‌نام تا callback بتواند ثبت‌نام را پیدا کند.
  await admin
    .from("webinar_registrations")
    .update({ payment_id: paymentId })
    .eq("id", registration_id)
    .eq("user_id", user.id);

  return NextResponse.json({ payment_url: result.startPayUrl });
}
