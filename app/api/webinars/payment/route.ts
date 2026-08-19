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
// ── ترتیب و دلیلش ───────────────────────────────────────────────────────────
//
// اول تراکنشِ زرین‌پال ساخته می‌شود تا `authority` به‌دست آید، بعد رکوردِ pending
// با همان authority ثبت **و در همان تراکنش به ثبت‌نام وصل** می‌شود.
//
// نسخهٔ قبل، پرداخت را می‌ساخت و بعد در یک دستورِ جدا `payment_id` را روی
// ثبت‌نام می‌نوشت و **نتیجه‌اش را نمی‌خواند**. اگر آن نوشتن شکست می‌خورد، کاربر
// باز هم به درگاه می‌رفت و پولش را می‌داد، ولی پرداخت به هیچ ثبت‌نامی وصل نبود و
// callback نمی‌توانست نهایی‌اش کند. حالا هر دو داخلِ `create_webinar_payment`
// اتفاق می‌افتند — یک تراکنش، یا هر دو یا هیچ‌کدام — و **تا وقتی این تابع موفق
// نشود، هیچ URLی به کاربر برنمی‌گردد.**
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

  // ۱) تراکنش زرین‌پال با callbackِ وبینار (نه callbackِ دوره).
  const result = await requestPayment(
    webinar.price_toman,
    `ثبت‌نام وبینار: ${webinar.title}`,
    WEBINAR_CALLBACK_PATH
  );

  if (!result.ok || !result.startPayUrl || !result.authority) {
    return NextResponse.json(
      { error: result.message || "خطا در اتصال به درگاه پرداخت." },
      { status: 502 }
    );
  }

  // ۲) ساختِ پرداخت **و** اتصالش به ثبت‌نام، اتمیک، با کلاینتِ کاربر چون تابع
  //    به `auth.uid()` تکیه دارد و مالکیت را خودش بررسی می‌کند.
  const { data: paymentId, error: payErr } = await supabase.rpc(
    "create_webinar_payment",
    {
      p_registration_id: reg.id,
      p_amount: webinar.price_toman,
      p_authority: result.authority,
    }
  );

  if (payErr || !paymentId) {
    // ثبتِ ماندگار: یک authorityِ زرین‌پال ساخته شده که هرگز استفاده نخواهد شد.
    // بدونِ این رد، تنها نشانه یک خطای گذرا در لاگ بود.
    console.error("create_webinar_payment failed:", payErr?.message);
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "payment.link_failed",
      entity: "payment",
      target_user_id: user.id,
      after: {
        registration_id: reg.id,
        webinar_id: reg.webinar_id,
        authority: result.authority,
        reason: payErr?.message?.slice(0, 500) ?? "unknown",
      },
    });

    // ⚠️ هیچ URLی برنمی‌گردد. اگر برمی‌گشت، کاربر پول می‌داد و پرداختش به
    // هیچ ثبت‌نامی وصل نبود.
    return NextResponse.json(
      { error: "خطا در ثبت پرداخت. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }

  return NextResponse.json({ payment_url: result.startPayUrl });
}
