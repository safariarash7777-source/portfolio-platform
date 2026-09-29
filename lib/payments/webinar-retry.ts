// سیاستِ تلاشِ دوباره برای پرداختِ وبینار.
//
// ── مسئله ───────────────────────────────────────────────────────────────────
//
// نسخهٔ قبل، هر درخواستِ پرداخت یک authorityِ تازه می‌ساخت و `payment_id`ِ
// ثبت‌نام را **خاموش** رویش می‌نوشت. سناریوی خرابی:
//
//   ۱. درخواستِ اول authorityِ A را می‌گیرد و پرداختِ A را به ثبت‌نام وصل می‌کند.
//   ۲. کاربر پیش از پرداخت، دوباره دکمه را می‌زند.
//   ۳. درخواستِ دوم authorityِ B را می‌سازد و جای A را می‌گیرد.
//   ۴. کاربر لینکِ A را که هنوز باز است پرداخت می‌کند.
//   ۵. callback ثبت‌نامی متصل به پرداختِ A پیدا نمی‌کند → پول رفته، دسترسی نه.
//
// `FOR UPDATE` جلوی این را نمی‌گیرد؛ مسئله هم‌زمانی نیست، ترتیب است.
//
// ── سیاست (پس از بازبینیِ Command Center) ───────────────────────────────────
//
// **پرداختِ در جریان همیشه از سر گرفته می‌شود.** هیچ authorityِ تازه‌ای ساخته
// نمی‌شود تا وقتی پرداختِ قبلی به وضعیتِ نهایی برسد.
//
// نسخهٔ قبل اجازه می‌داد کاربر پس از یک پنجرهٔ زمانی، پرداختِ قبلی را عمداً
// جایگزین کند. آن طراحی رد شد و درست هم رد شد: پنجره بر پایهٔ فرضی دربارهٔ
// انقضای لینکِ درگاه بود که **هیچ سندی برایش نداریم**. اگر فرض غلط باشد،
// کاربری که لینکِ قدیمی را پرداخت می‌کند پولش به هیچ ثبت‌نامی نمی‌رسد — یعنی
// همان حفره‌ای که قرار بود بسته شود، از راهِ دیگری باز می‌ماند.
//
// حالا فقط دو راهِ خروج از حالتِ pending وجود دارد و هر دو نهایی‌اند:
//   • callbackِ درگاه پرداخت را `paid` یا `failed` می‌کند؛
//   • ادمین با `admin_cancel_pending_payment` بازیابیِ حاکمیتی انجام می‌دهد.
//
// چون هیچ لینکِ دومی ساخته نمی‌شود، هر پولی که پرداخت شود روی پرداختی می‌نشیند
// که هنوز pending است و callback می‌تواند نهایی‌اش کند.
//
// این ماژول تصمیم را می‌گیرد؛ **اجرایش** را دیتابیس مستقلاً دوباره بررسی
// می‌کند (`create_webinar_payment`). دو لایه، چون مسیرِ API مرزِ امنیتی نیست.

export interface ExistingPayment {
  id: string;
  status: "pending" | "paid" | "failed";
  authority: string | null;
  created_at: string;
}

export type RetryDecision =
  /** هیچ پرداختِ زنده‌ای نیست — authorityِ تازه بساز. */
  | { action: "create" }
  /** پرداختِ در جریان هست — همان لینک را برگردان، لینکِ تازه نساز. */
  | { action: "resume"; paymentId: string; authority: string }
  | {
      action: "reject";
      reason: "already_paid" | "broken_link";
      message: string;
    };

export interface RetryInput {
  registrationPaymentStatus: string | null;
  existingPayment: ExistingPayment | null;
  /**
   * فقط برای **رابط کاربری**: بعد از این چند دقیقه، گزینهٔ «کمک می‌خواهم» به
   * کاربر نشان داده می‌شود. هیچ تصمیمی اینجا بر اساسش گرفته نمی‌شود و هیچ
   * ادعایی دربارهٔ اعتبارِ لینکِ درگاه نمی‌کند.
   */
  resumeHintMinutes?: number;
  now?: Date;
}

export function decideWebinarRetry(input: RetryInput): RetryDecision {
  const { registrationPaymentStatus, existingPayment } = input;

  if (registrationPaymentStatus === "paid") {
    return {
      action: "reject",
      reason: "already_paid",
      message: "این ثبت‌نام قبلاً پرداخت شده است.",
    };
  }

  if (!existingPayment) return { action: "create" };

  if (existingPayment.status === "paid") {
    return {
      action: "reject",
      reason: "already_paid",
      message: "این ثبت‌نام قبلاً پرداخت شده است.",
    };
  }

  // پرداختِ نهایی‌شده‌ٔ ناموفق: لینکش دیگر قابلِ پرداخت نیست، چون تریگرِ
  // `payments_guard` گذارِ failed→paid را رد می‌کند. جایگزینی بی‌خطر است.
  if (existingPayment.status === "failed") return { action: "create" };

  // از اینجا به بعد status === "pending".
  if (!existingPayment.authority) {
    // ردیفِ pending بدونِ authority قابلِ از سرگیری نیست و نباید هم ساخته
    // می‌شد. خاموش جایگزینش نمی‌کنیم — باید دیده شود.
    return {
      action: "reject",
      reason: "broken_link",
      message: "پرداختِ ناتمامِ این ثبت‌نام معتبر نیست. لطفاً با پشتیبانی تماس بگیرید.",
    };
  }

  // ⚠️ بدونِ شرط. این تنها خروجیِ ممکن برای پرداختِ pending است.
  return {
    action: "resume",
    paymentId: existingPayment.id,
    authority: existingPayment.authority,
  };
}

/**
 * آیا زمانِ نشان‌دادنِ گزینهٔ کمک رسیده؟ **فقط تزئینِ رابط**؛ روی هیچ تصمیمی
 * اثر ندارد و هیچ ادعایی دربارهٔ منقضی‌شدنِ لینک نمی‌کند.
 */
export function shouldOfferHelp(
  payment: ExistingPayment,
  hintMinutes: number,
  now: Date = new Date()
): boolean {
  const age = (now.getTime() - new Date(payment.created_at).getTime()) / 60000;
  return Number.isFinite(age) && age >= hintMinutes;
}
