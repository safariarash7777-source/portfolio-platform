// اعطای دسترسی پس از پرداخت موفق — پلِ بین `payments` و `entitlements`.
//
// پیش از این، callbackهای پرداخت فقط ردیفِ `payments` را نهایی می‌کردند و هیچ
// ردیفی در `entitlements` نمی‌ساختند؛ در حالی که `lib/access.ts` سطحِ دسترسی را
// دقیقاً از همان جدول می‌خواند. نتیجه: کاربری که پول داده بود `registered` می‌ماند
// تا ادمین دستی دسترسی بدهد. این ماژول همان شکاف را می‌بندد.
//
// طراحی:
//   • توابعِ محاسباتی خالص‌اند (بدون I/O) تا تست‌پذیر بمانند.
//   • `grantEntitlement` کلاینت را پارامتر می‌گیرد (تزریق وابستگی) و باید با
//     کلاینتِ service-role صدا زده شود؛ سیاستِ INSERT جدول فقط ادمین را می‌پذیرد.
//   • جدول append-only است؛ اینجا فقط INSERT انجام می‌شود، هرگز UPDATE/DELETE.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * مدتِ دسترسیِ `full` به ازای هر محصول، برحسب ماه.
 *
 * منبعِ واحدِ حقیقت — برای تغییرِ مدت فقط همین عدد را عوض کن. مقادیر با کامنتِ
 * طراحیِ `sql/phase11_access_tiers.sql` هم‌خوان‌اند (مشاوره ۳ ماه · وبینار تا
 * وبینار فصلیِ بعدی ≈ ۳ ماه).
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
 * افزودنِ ماه با کلمپِ روزِ ماه.
 *
 * `Date.prototype.setMonth` روزِ سرریز را به ماهِ بعد می‌برد (۳۱ فروردین + ۱ ماه
 * → ۳ خرداد). برای دسترسیِ پولی این سرریز یعنی چند روز دسترسیِ اضافه یا کم؛
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

export interface GrantEntitlementInput {
  userId: string;
  kind: EntitlementKind;
  /** شناسهٔ منبعِ اعطا — برای ممیزی و جلوگیری از اعطای تکراری. */
  source: string;
  note?: string | null;
}

export type GrantEntitlementResult =
  | { ok: true; created: boolean; expiresAt: string }
  | { ok: false; reason: "table_missing" | "error"; message: string };

/**
 * یک ردیفِ دسترسی برای کاربر درج می‌کند.
 *
 * idempotent نسبت به `source`: اگر قبلاً برای همان منبع (مثلاً همان authorityِ
 * زرین‌پال) دسترسی اعطا شده باشد، دوباره درج نمی‌شود. این مهم است چون کاربر
 * ممکن است URLِ callback را چند بار باز کند.
 *
 * هرگز throw نمی‌کند — فراخواننده در مسیرِ callbackِ پرداخت است و پول از قبل
 * گرفته شده؛ شکستِ اعطا نباید redirect را بشکند. خطا برگردانده می‌شود تا
 * فراخواننده لاگ کند.
 */
export async function grantEntitlement(
  admin: SupabaseClient,
  input: GrantEntitlementInput
): Promise<GrantEntitlementResult> {
  const expiresAt = entitlementExpiry(input.kind).toISOString();

  try {
    const { data: existing, error: lookupErr } = await admin
      .from("entitlements")
      .select("id,expires_at")
      .eq("user_id", input.userId)
      .eq("source", input.source)
      .limit(1);

    if (lookupErr) return classifyError(lookupErr.message);
    if (existing && existing.length > 0) {
      return { ok: true, created: false, expiresAt: existing[0].expires_at };
    }

    const { error: insertErr } = await admin.from("entitlements").insert({
      user_id: input.userId,
      kind: input.kind,
      source: input.source,
      expires_at: expiresAt,
      note: input.note ?? null,
    });

    if (insertErr) return classifyError(insertErr.message);
    return { ok: true, created: true, expiresAt };
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

function classifyError(message: string): GrantEntitlementResult {
  // جدول هنوز ساخته نشده (مایگریشن phase11 اجرا نشده) — هم‌الگو با
  // `app/api/admin/entitlements/route.ts`.
  const missing =
    message.includes("entitlements") &&
    (message.includes("does not exist") || message.includes("schema cache"));
  return { ok: false, reason: missing ? "table_missing" : "error", message };
}
