import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestPayment, coursePriceToman } from "@/lib/zarinpal";
import { isPermissionDenied } from "@/lib/supabase/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payment/request — ساخت تراکنش زرین‌پال و برگرداندن URL درگاه.
// مبلغ فقط سمت سرور (از env) تعیین می‌شود؛ به بدنهٔ درخواست اعتماد نمی‌کنیم.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "برای پرداخت باید وارد شوید." }, { status: 401 });
  }

  const amount = coursePriceToman();
  if (amount <= 0) {
    return NextResponse.json(
      { error: "قیمت دوره پیکربندی نشده است." },
      { status: 503 }
    );
  }

  const zp = await requestPayment(amount, "دسترسی به دورهٔ وبینار و کانال اختصاصی");
  if (!zp.ok || !zp.authority || !zp.startPayUrl) {
    return NextResponse.json(
      { error: zp.message ?? "خطا در اتصال به درگاه پرداخت." },
      { status: 502 }
    );
  }

  // ثبت ردیفِ pending (append-only، از طریق تابع SECURITY DEFINER).
  const { error: dbErr } = await supabase.rpc("create_payment", {
    p_amount: amount,
    p_authority: zp.authority,
  });
  if (dbErr) {
    console.error("create_payment error:", dbErr.message);
    // `phase30` امتیازِ اجرای این تابع را از `authenticated` پس می‌گیرد، چون
    // مبلغ آرگومانِ کاربر است و پس از آمدنِ صدورِ دسترسی (#113) همین یک خط از
    // یک آلودگیِ دفتری به یک حفرهٔ واقعی تبدیل می‌شود.
    //
    // این شاخه عمداً اینجاست تا **ترتیبِ انتشار اجباری نباشد**: برنامه با
    // دیتابیسِ قبل و بعد از `phase30` هر دو درست کار می‌کند. پیش از آن این
    // شاخه هرگز اجرا نمی‌شود؛ پس از آن، کاربر به‌جای ۵۰۰ِ مبهم یک پیامِ صادق
    // می‌بیند و — مهم‌تر — **پولی از او گرفته نشده**: ردیفِ pending ساخته
    // نشده یعنی مسیرِ پرداخت اصلاً شروع نشده است.
    if (isPermissionDenied(dbErr)) {
      return NextResponse.json(
        { error: "پرداخت موقتاً در دسترس نیست. لطفاً بعداً تلاش کنید." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "خطا در ثبت پرداخت." }, { status: 500 });
  }

  return NextResponse.json({ url: zp.startPayUrl });
}
