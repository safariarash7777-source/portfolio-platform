// شناسه و نوعِ محصولِ دسترسیِ پولی — توابعِ **خالص**، بدونِ I/O.
//
// ⚠️ مدتِ دسترسی عمداً **اینجا نیست**. پیش از بازنگریِ Command Center، عددِ
// «۳ ماه برای همه» در همین فایل هاردکد بود و به SQL پاس داده می‌شد. آن یک
// پیش‌فرضِ فنی بود که خودش را جای تصمیمِ محصول جا زده بود.
//
// حالا مدت در جدولِ `public.entitlement_durations` است: سمتِ سرور، به ازای هر
// محصول، و قابلِ تغییر توسطِ ادمین بدونِ استقرارِ کد. هیچ کلاینتی — و هیچ
// callbackی — نمی‌تواند آن را تعیین کند.

/** محصولاتی که دسترسیِ پولی تولید می‌کنند. هم‌راستا با CHECK جدولِ payments. */
export const PAID_PRODUCTS = ["consulting", "webinar"] as const;

export type PaidProduct = (typeof PAID_PRODUCTS)[number];

/** انواعِ دسترسی در جدولِ entitlements — شاملِ اعطای دستیِ ادمین. */
export type EntitlementKind = PaidProduct | "manual";

export function isPaidProduct(value: unknown): value is PaidProduct {
  return typeof value === "string" && (PAID_PRODUCTS as readonly string[]).includes(value);
}

export function isEntitlementKind(value: unknown): value is EntitlementKind {
  return isPaidProduct(value) || value === "manual";
}

/**
 * قالبِ `entitlements.source` — فقط برای **خوانایی و ممیزی**.
 *
 * ⚠️ این رشته دیگر کلیدِ idempotency نیست. یکتاییِ واقعی روی
 * `entitlements.payment_id` بسته شده (`uq_entitlements_payment`). دلیلش یک
 * نقصِ واقعی بود: وقتی هر محصول پیشوندِ خودش را داشت، یک authorityِ
 * پرداخت‌شده می‌توانست هم `consulting:` و هم `webinar:` بسازد و قیدِ
 * `(user_id, source)` جلویش را نمی‌گرفت، چون دو رشتهٔ متفاوت بودند.
 *
 * خودِ رشته را هم SQL می‌سازد؛ این تابع برای تست و نمایش است.
 */
export function entitlementSource(product: PaidProduct, authority: string): string {
  return `${product}:${authority}`;
}

/** authorityِ درونِ یک `source`، یا `null` اگر قالب نخورد. */
export function authorityFromSource(source: string | null | undefined): string | null {
  if (!source) return null;
  const i = source.lastIndexOf(":");
  return i === -1 ? null : source.slice(i + 1) || null;
}

/** محصولِ درونِ یک `source`، یا `null`. */
export function productFromSource(source: string | null | undefined): PaidProduct | null {
  if (!source) return null;
  const i = source.indexOf(":");
  if (i === -1) return null;
  const head = source.slice(0, i);
  return isPaidProduct(head) ? head : null;
}
