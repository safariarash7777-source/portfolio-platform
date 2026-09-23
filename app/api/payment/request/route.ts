import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  //
  // `p_purpose` الزامی است: نوعِ محصول در همان لحظه به ردیفِ پرداخت بسته
  // می‌شود و دیگر قابلِ تغییر نیست، پس callbackِ وبینار نمی‌تواند این پرداخت
  // را نهایی کند.
  //
  // ── چرا با کلاینتِ ادمین ────────────────────────────────────────────────
  //
  // `create_payment` دیگر برای `authenticated` قابلِ اجرا نیست. تا وقتی بود،
  // درست‌بودنِ این مسیر بی‌اثر بود: کاربر می‌توانست خودش RPC را با مبلغِ
  // دلخواه صدا بزند و `verify_payment` همان مبلغِ جعلی را تأیید می‌کرد.
  // مبلغ از env می‌آید (منبعِ واحدِ سمتِ سرور) و کاربر **صریح** پاس می‌شود،
  // چون زیرِ service_role مقدارِ `auth.uid()` تهی است.
  const admin = createAdminClient();
  const { error: dbErr } = await admin.rpc("create_payment", {
    p_user_id: user.id,
    p_amount: amount,
    p_authority: zp.authority,
    p_purpose: "consulting",
  });
  if (dbErr) {
    // ⚠️ **ترتیبِ این روت اهمیت دارد:** درخواستِ زرین‌پال *پیش از* نوشتن در
    // دیتابیس ساخته می‌شود. پس وقتی این شاخه اجرا شود، یک `authority` نزدِ
    // زرین‌پال ساخته شده که هیچ ردیفی در `payments` ندارد.
    //
    // اثرش چیست و چه چیزی نیست:
    //   • کاربر هرگز به درگاه نمی‌رسد — URL برگردانده نمی‌شود. **هیچ پولی
    //     جابه‌جا نمی‌شود.**
    //   • آن `authority` بی‌مصرف می‌ماند و نزدِ زرین‌پال منقضی می‌شود.
    //   • callback هم بی‌خطر است: بدونِ ردیفِ `payments` هیچ تأییدی رخ نمی‌دهد.
    //   • ولی **هر تلاشِ دوباره یک authorityِ بی‌رکوردِ تازه می‌سازد.** برای
    //     همین پیام عمداً «دوباره تلاش کن» نمی‌گوید.
    // ثبتش اینجاست تا در لاگ قابلِ ردیابی باشد، نه اینکه بی‌صدا بماند.
    if (isPermissionDenied(dbErr)) {
      console.error(
        `create_payment: permission denied — orphaned Zarinpal authority ${zp.authority} (no payments row)`,
      );
      return NextResponse.json(
        { error: "پرداخت موقتاً غیرفعال است. لطفاً با پشتیبانی تماس بگیرید." },
        { status: 503 },
      );
    }
    console.error("create_payment error:", dbErr.message);
    return NextResponse.json({ error: "خطا در ثبت پرداخت." }, { status: 500 });
  }

  return NextResponse.json({ url: zp.startPayUrl });
}
