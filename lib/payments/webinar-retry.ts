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
// ── سیاست ───────────────────────────────────────────────────────────────────
//
// پیش‌فرض **از سرگیری** است، نه ساختِ لینکِ تازه: تا وقتی پرداختِ قبلی ممکن
// است قابلِ پرداخت باشد، همان لینکِ اول برگردانده می‌شود. پس هرگز دو لینکِ
// زندهٔ هم‌زمان وجود ندارد و لینکِ اول یتیم نمی‌شود.
//
// جایگزینی فقط وقتی مجاز است که **هر دو** شرط برقرار باشد: کاربر صریحاً
// خواسته باشد، و پرداختِ قبلی از پنجرهٔ `webinar_retry_stale_minutes` قدیمی‌تر
// باشد. آن پنجره باید از اعتبارِ لینکِ درگاه بزرگ‌تر باشد، وگرنه دقیقاً همان
// حفره را از راهِ دیگری باز می‌کنیم.
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
  /** کاربر صریحاً خواسته و پرداختِ قبلی کهنه است — ابطال و جایگزینی. */
  | { action: "replace"; previousPaymentId: string }
  | {
      action: "reject";
      reason: "already_paid" | "not_stale_yet" | "broken_link";
      message: string;
      retryAfterMinutes?: number;
    };

export interface RetryInput {
  registrationPaymentStatus: string | null;
  existingPayment: ExistingPayment | null;
  replaceRequested: boolean;
  staleMinutes: number;
  now: Date;
}

export function decideWebinarRetry(input: RetryInput): RetryDecision {
  const { registrationPaymentStatus, existingPayment, replaceRequested, staleMinutes, now } =
    input;

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

  if (!replaceRequested) {
    return {
      action: "resume",
      paymentId: existingPayment.id,
      authority: existingPayment.authority,
    };
  }

  const ageMinutes = (now.getTime() - new Date(existingPayment.created_at).getTime()) / 60000;
  if (!Number.isFinite(ageMinutes) || ageMinutes < staleMinutes) {
    const remaining = Math.max(1, Math.ceil(staleMinutes - (Number.isFinite(ageMinutes) ? ageMinutes : 0)));
    return {
      action: "reject",
      reason: "not_stale_yet",
      message:
        "پرداختِ قبلی هنوز معتبر است. اگر صفحهٔ درگاه را بسته‌اید، از همان لینکِ قبلی ادامه دهید.",
      retryAfterMinutes: remaining,
    };
  }

  return { action: "replace", previousPaymentId: existingPayment.id };
}
