/** Exact-webinar contracts. These do not create a global entitlement. */
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const amount = (value: unknown): value is number => typeof value === "number" &&
  Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 && Number.isSafeInteger(value * 10);
export const authority = (value: unknown): value is string => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,200}$/.test(value);
export const refId = (value: unknown): value is string => typeof value === "string" &&
  /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));

export function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const p = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!p) return null;
  const [year, month, day, hour, minute, second] = p.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
    hour > 23 || minute > 59 || second > 59 || /[1-9]/.test((p[7] ?? "").slice(3))) return null;
  if (p[8] !== "Z" && (Number(p[8].slice(1, 3)) > 23 || Number(p[8].slice(4, 6)) > 59)) return null;
  const n = Date.parse(value);
  if (!Number.isFinite(n)) return null;
  const date = new Date(n);
  return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999 ? date.toISOString() : null;
}
export function safeSessionUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}
export function paymentUrl(value: unknown, expectedAuthority: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["https://payment.zarinpal.com", "https://sandbox.zarinpal.com"].includes(url.origin) &&
      !url.username && !url.password && !url.search && !url.hash && url.pathname === `/pg/StartPay/${expectedAuthority}`;
  } catch { return false; }
}
export const webinarFields = ["title", "description", "starts_at", "ends_at", "registration_open",
  "max_capacity", "price_toman", "platform", "platform_url", "status", "access_enabled",
  "access_starts_at", "access_ends_at"] as const;

export function webinarInput(value: unknown): Record<string, unknown> | null {
  if (!record(value) || typeof value.title !== "string" || !value.title.trim() || !amount(value.price_toman)) return null;
  const starts = timestamp(value.starts_at), ends = value.ends_at == null || value.ends_at === "" ? null : timestamp(value.ends_at);
  if (!starts || (value.ends_at != null && value.ends_at !== "" && !ends) || (ends && ends <= starts)) return null;
  const enabled = value.access_enabled ?? false;
  if (typeof enabled !== "boolean") return null;
  let accessStarts = value.access_starts_at == null || value.access_starts_at === "" ? null : timestamp(value.access_starts_at);
  let accessEnds = value.access_ends_at == null || value.access_ends_at === "" ? null : timestamp(value.access_ends_at);
  if ((value.access_starts_at != null && value.access_starts_at !== "" && !accessStarts) ||
      (value.access_ends_at != null && value.access_ends_at !== "" && !accessEnds)) return null;
  if (enabled && !accessStarts && !accessEnds && ends) {
    accessStarts = new Date().toISOString();
    accessEnds = new Date(Date.parse(ends) + 90 * 24 * 60 * 60 * 1000).toISOString();
  }
  if ((enabled || accessStarts || accessEnds) && (!accessStarts || !accessEnds || accessEnds <= accessStarts)) return null;
  if (enabled && !safeSessionUrl(value.platform_url)) return null;
  if (value.platform_url != null && value.platform_url !== "" && !safeSessionUrl(value.platform_url)) return null;
  if (value.registration_open != null && typeof value.registration_open !== "boolean") return null;
  if (value.registration_open === true && !enabled) return null;
  if (value.max_capacity != null && (!Number.isSafeInteger(value.max_capacity) || Number(value.max_capacity) <= 0)) return null;
  const status = value.status ?? "draft", platform = value.platform ?? "link";
  if (!["draft", "published", "live", "ended", "cancelled"].includes(String(status)) ||
      !["link", "skyroom", "zoom", "google_meet"].includes(String(platform))) return null;
  if (value.description != null && typeof value.description !== "string") return null;
  return { title: value.title.trim(), description: value.description || null, starts_at: starts, ends_at: ends,
    registration_open: value.registration_open ?? false, max_capacity: value.max_capacity ?? null,
    price_toman: value.price_toman, platform, platform_url: value.platform_url || null, status,
    access_enabled: enabled, access_starts_at: accessStarts, access_ends_at: accessEnds };
}

export interface PaymentContext {
  registration_id: string; webinar_id: string; user_id: string; payment_id: string;
  amount: number; authority: string; payment_status: "pending" | "paid" | "failed";
  registration_payment_status: "pending" | "paid"; ref_id: string | null; verified_at: string | null;
  access_qualified: boolean; access_enabled: boolean; access_starts_at: string; access_ends_at: string;
  fulfillment_state?: "pending" | "confirmed" | "paid_pending_resolution";
  resolution_kind?: "refund_due" | null;
}
export function paymentContext(value: unknown, expectedAuthority: string, registrationId: string): PaymentContext | null {
  if (!record(value) || !uuid(value.registration_id) || value.registration_id !== registrationId ||
      !uuid(value.webinar_id) || !uuid(value.user_id) || !uuid(value.payment_id) || !amount(value.amount) || value.amount <= 0 ||
      !authority(value.authority) || value.authority !== expectedAuthority || typeof value.access_enabled !== "boolean") return null;
  const starts = timestamp(value.access_starts_at), ends = timestamp(value.access_ends_at);
  if (!starts || !ends || ends <= starts || !["pending", "paid", "failed"].includes(String(value.payment_status)) ||
      !["pending", "paid"].includes(String(value.registration_payment_status))) return null;
  if (value.registration_payment_status !== (value.payment_status === "failed" ? "pending" : value.payment_status)) return null;
  if (value.payment_status === "paid") {
    const pendingResolution = value.access_qualified === false && value.fulfillment_state === "paid_pending_resolution" &&
      value.resolution_kind === "refund_due" && value.confirmed_at == null;
    if ((!pendingResolution && value.access_qualified !== true) || !refId(value.ref_id) || !timestamp(value.verified_at)) return null;
    if (value.access_qualified === true && value.fulfillment_state != null &&
        (value.fulfillment_state !== "confirmed" || value.resolution_kind != null || !timestamp(value.confirmed_at))) return null;
  }
  if (value.payment_status !== "paid" && (value.access_qualified !== false || value.ref_id != null || value.verified_at != null)) return null;
  if (value.payment_status !== "paid" && value.fulfillment_state != null && value.fulfillment_state !== "pending") return null;
  return { ...value, access_starts_at: starts, access_ends_at: ends,
    verified_at: value.verified_at == null ? null : timestamp(value.verified_at) } as unknown as PaymentContext;
}
export function settledReceipt(value: unknown, expected: PaymentContext, reference: string): boolean {
  const receipt = paymentContext(value, expected.authority, expected.registration_id);
  return record(value) && value.settled === true && receipt !== null && receipt.payment_status === "paid" &&
    receipt.registration_payment_status === "paid" && receipt.ref_id === reference &&
    receipt.payment_id === expected.payment_id && receipt.user_id === expected.user_id &&
    receipt.webinar_id === expected.webinar_id && receipt.amount === expected.amount &&
    receipt.access_starts_at === expected.access_starts_at && receipt.access_ends_at === expected.access_ends_at;
}

export function rejectedReceipt(value: unknown, expected: PaymentContext): boolean {
  const receipt = paymentContext(value, expected.authority, expected.registration_id);
  return record(value) && value.rejected === true && value.settled === false && receipt !== null &&
    receipt.payment_status === "failed" && receipt.registration_payment_status === "pending" &&
    receipt.payment_id === expected.payment_id && receipt.user_id === expected.user_id &&
    receipt.webinar_id === expected.webinar_id && receipt.amount === expected.amount &&
    receipt.access_starts_at === expected.access_starts_at && receipt.access_ends_at === expected.access_ends_at;
}
