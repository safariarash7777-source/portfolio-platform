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

/** آدرس بازگشت (callback) برای زرین‌پال. */
export function callbackUrl(): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${site}/api/payment/callback`;
}

export interface ZarinpalRequestResult {
  ok: boolean;
  authority?: string;
  startPayUrl?: string;
  code?: number;
  message?: string;
}

/** ساخت تراکنش. amount به تومان؛ زرین‌پال به ریال می‌گیرد (×۱۰). */
export async function requestPayment(
  amountToman: number,
  description: string
): Promise<ZarinpalRequestResult> {
  const merchant_id = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchant_id) return { ok: false, message: "درگاه پرداخت پیکربندی نشده است." };

  const res = await fetch(`${BASE}/pg/v4/payment/request.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchant_id,
      amount: amountToman * 10,
      callback_url: callbackUrl(),
      description,
    }),
  });

  const json = await res.json().catch(() => null);
  const code = json?.data?.code;
  const authority = json?.data?.authority;
  if (code === 100 && authority) {
    return { ok: true, authority, startPayUrl: `${BASE}/pg/StartPay/${authority}`, code };
  }
  const errMsg = Array.isArray(json?.errors) ? undefined : json?.errors?.message;
  return { ok: false, code, message: errMsg ?? "خطا در ایجاد تراکنش." };
}

export type ZarinpalVerifyResult =
  | { outcome: "verified"; refId: string; code: 100 | 101 }
  | { outcome: "rejected"; code: -51 }
  | { outcome: "unknown"; reason: "configuration" | "input" | "transport" | "http" | "body" | "response" };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** تأیید تراکنش. amount باید همان مبلغِ ردیفِ pending خودمان باشد. */
export async function verifyPayment(
  authority: string,
  amountToman: number
): Promise<ZarinpalVerifyResult> {
  const merchant_id = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchant_id?.trim()) return { outcome: "unknown", reason: "configuration" };
  if (!authority.trim() || !Number.isSafeInteger(amountToman) || amountToman <= 0 ||
      !Number.isSafeInteger(amountToman * 10)) {
    return { outcome: "unknown", reason: "input" };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/pg/v4/payment/verify.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ merchant_id, amount: amountToman * 10, authority }),
    });
  } catch {
    return { outcome: "unknown", reason: "transport" };
  }
  if (!res.ok) return { outcome: "unknown", reason: "http" };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { outcome: "unknown", reason: "body" };
  }
  if (!record(json)) return { outcome: "unknown", reason: "response" };
  const { data, errors } = json;
  // Official v4 contract: ref_id is an integer; 101 is a previously verified payment.
  // https://www.zarinpal.com/docs/paymentGateway/connectToGateway
  if (record(data) && Array.isArray(errors) && errors.length === 0 &&
      (data.code === 100 || data.code === 101) && typeof data.ref_id === "number" &&
      Number.isSafeInteger(data.ref_id) && data.ref_id > 0) {
    return { outcome: "verified", refId: String(data.ref_id), code: data.code };
  }
  // Only -51 denotes unsuccessful PaymentVerify in the documented error list.
  // Amount/merchant/configuration errors and unknown codes do not establish non-payment.
  // Require a consistent error envelope; never infer rejection from the callback query.
  // https://www.zarinpal.com/docs/paymentGateway/errorList
  if (Array.isArray(data) && data.length === 0 && record(errors) && errors.code === -51 &&
      typeof errors.message === "string" && errors.message.trim().length > 0) {
    return { outcome: "rejected", code: -51 };
  }
  return { outcome: "unknown", reason: "response" };
}
