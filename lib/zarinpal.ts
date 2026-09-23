// زرین‌پال — درگاه پرداخت (API v4). فقط سمت سرور استفاده شود.
// حالت sandbox با فلگِ ZARINPAL_SANDBOX کنترل می‌شود تا آرش قبل از پول واقعی
// تست کند. verify همیشه سمت سرور و با تطبیقِ مبلغ/authority انجام می‌شود.

const SANDBOX = process.env.ZARINPAL_SANDBOX === "1" || process.env.ZARINPAL_SANDBOX === "true";

const BASE = SANDBOX
  ? "https://sandbox.zarinpal.com"
  : "https://payment.zarinpal.com";

/** قیمتِ خریدِ دسترسی به دوره/کانال، به تومان (مرجعِ معتبر سمت سرور). */
export function coursePriceToman(): number {
  const raw = process.env.NEXT_PUBLIC_COURSE_PRICE_TOMAN;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * آدرس بازگشت (callback) برای زرین‌پال.
 *
 * `path` برای جریان‌هایی است که callbackِ اختصاصی دارند (مثلاً وبینار). پیش‌فرض
 * همان جریانِ دوره/مشاوره است تا فراخوانی‌های قبلی بی‌تغییر بمانند.
 */
export function callbackUrl(path: string = "/api/payment/callback"): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${site}${path}`;
}

/**
 * آدرسِ صفحهٔ پرداختِ یک authorityِ موجود.
 *
 * برای **از سرگیریِ** یک پرداختِ در جریان لازم است: به‌جای ساختنِ تراکنشِ
 * تازه (که لینکِ قبلی را یتیم می‌کند) همان لینک دوباره داده می‌شود.
 */
export function startPayUrl(authority: string): string {
  return `${BASE}/pg/StartPay/${authority}`;
}

export interface ZarinpalRequestResult {
  ok: boolean;
  authority?: string;
  startPayUrl?: string;
  code?: number;
  message?: string;
}

/**
 * ساخت تراکنش. amount به تومان؛ زرین‌پال به ریال می‌گیرد (×۱۰).
 *
 * `callbackPath` اختیاری است؛ اگر داده نشود جریانِ پیش‌فرضِ دوره/مشاوره استفاده
 * می‌شود. بدونِ این پارامتر، پرداختِ وبینار هم به callbackِ دوره برمی‌گشت و
 * هرگز نهایی نمی‌شد.
 */
export async function requestPayment(
  amountToman: number,
  description: string,
  callbackPath?: string
): Promise<ZarinpalRequestResult> {
  const merchant_id = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchant_id) return { ok: false, message: "درگاه پرداخت پیکربندی نشده است." };

  const res = await fetch(`${BASE}/pg/v4/payment/request.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchant_id,
      amount: amountToman * 10,
      callback_url: callbackUrl(callbackPath),
      description,
    }),
  });

  const json = await res.json().catch(() => null);
  const code = json?.data?.code;
  const authority = json?.data?.authority;
  if (code === 100 && authority) {
    return { ok: true, authority, startPayUrl: startPayUrl(authority), code };
  }
  const errMsg = Array.isArray(json?.errors) ? undefined : json?.errors?.message;
  return { ok: false, code, message: errMsg ?? "خطا در ایجاد تراکنش." };
}

export interface ZarinpalVerifyResult {
  ok: boolean;
  refId?: string;
  code?: number;
  message?: string;
}

/** تأیید تراکنش. amount باید همان مبلغِ ردیفِ pending خودمان باشد. */
export async function verifyPayment(
  authority: string,
  amountToman: number
): Promise<ZarinpalVerifyResult> {
  const merchant_id = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchant_id) return { ok: false, message: "درگاه پرداخت پیکربندی نشده است." };

  const res = await fetch(`${BASE}/pg/v4/payment/verify.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ merchant_id, amount: amountToman * 10, authority }),
  });

  const json = await res.json().catch(() => null);
  const code = json?.data?.code;
  // 100 = تأیید موفق، 101 = قبلاً تأیید شده
  if (code === 100 || code === 101) {
    return { ok: true, refId: String(json?.data?.ref_id ?? ""), code };
  }
  return { ok: false, code, message: "تأیید پرداخت ناموفق بود." };
}
