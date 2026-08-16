// مدت و شناسهٔ دسترسیِ پولی — توابعِ **خالص**، بدونِ I/O.
//
// نوشتنِ واقعیِ ردیفِ `entitlements` اینجا انجام نمی‌شود؛ کارِ
// `public.finalize_paid_access` است (`sql/phase24_payment_entitlement.sql`) تا
// نهایی‌سازیِ پرداخت و اعطای دسترسی در **یک تراکنش** بمانند. این فایل فقط
// مقادیری را می‌سازد که آن تابع مصرف می‌کند.
//
// چرا مدت اینجاست و در SQL نیست: اگر در هر دو جا تعریف می‌شد، روزی یکی عوض
// می‌شد و دیگری نه. یک عدد، یک جا.

/**
 * مدتِ دسترسیِ `full` به ازای هر محصول، برحسب ماه.
 *
 * هم‌خوان با کامنتِ طراحیِ `sql/phase11_access_tiers.sql`:
 * مشاوره ۳ ماه · وبینار تا وبینارِ فصلیِ بعدی ≈ ۳ ماه.
 */
export const ENTITLEMENT_MONTHS = {
  consulting: 3,
  webinar: 3,
  manual: 3,
} as const;

export type EntitlementKind = keyof typeof ENTITLEMENT_MONTHS;

/** آیا این رشته یک نوعِ دسترسیِ معتبر است؟ (هم‌راستا با CHECK جدول) */
export function isEntitlementKind(value: unknown): value is EntitlementKind {
  return typeof value === "string" && value in ENTITLEMENT_MONTHS;
}

/**
 * قالبِ **قطعیِ** `entitlements.source`.
 *
 * این تنها جایی است که قالب ساخته و خوانده می‌شود. اگر هر فراخواننده رشته را
 * دستی بسازد، مصرف‌کننده‌ای که فرض می‌کند `source` برابرِ `payments.id` است هر
 * پرداختِ موفق را «بدونِ دسترسی» می‌بیند — یک هشدارِ کاذبِ دائمی.
 *
 * ⚠️ این قالب کلیدِ idempotency است: ایندکسِ یکتای
 * `uq_entitlements_user_source` روی `(user_id, source)` بسته شده. تغییرِ قالب
 * یعنی replayهای قدیمی دیگر تشخیص داده نمی‌شوند.
 */
export const SOURCE_PREFIX: Record<EntitlementKind, string> = {
  consulting: "payment",
  webinar: "webinar_payment",
  manual: "manual",
};

export function entitlementSource(kind: EntitlementKind, authority: string): string {
  return `${SOURCE_PREFIX[kind]}:${authority}`;
}

/** authorityِ درونِ یک `source`، یا `null` اگر قالب نخورد. */
export function authorityFromSource(source: string | null | undefined): string | null {
  if (!source) return null;
  const i = source.lastIndexOf(":");
  return i === -1 ? null : source.slice(i + 1) || null;
}

/**
 * افزودنِ ماه با کلمپِ روزِ ماه.
 *
 * `Date.prototype.setMonth` روزِ سرریز را به ماهِ بعد می‌برد (۳۱ ژانویه + ۱ ماه
 * → ۳ مارس). برای دسترسیِ پولی این سرریز یعنی چند روز دسترسیِ اضافه یا کم؛
 * پس روز را به آخرین روزِ ماهِ مقصد کلمپ می‌کنیم.
 */
export function addMonthsClamped(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** تاریخِ انقضای دسترسی برای یک محصول، از لحظهٔ `from`. */
export function entitlementExpiry(kind: EntitlementKind, from: Date = new Date()): Date {
  return addMonthsClamped(from, ENTITLEMENT_MONTHS[kind]);
}
