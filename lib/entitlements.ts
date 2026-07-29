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
 * قالبِ **قطعیِ** `entitlements.source`.
 *
 * این تنها جایی است که قالب ساخته و خوانده می‌شود. قبلاً هر فراخواننده رشته را
 * دستی می‌ساخت (`payment:${authority}`) و هر مصرف‌کننده‌ای که فرض می‌کرد `source`
 * برابرِ `payments.id` است، **هر پرداختِ موفق را «بدونِ دسترسی» می‌دید** — یک
 * هشدارِ کاذبِ دائمی. آشتی‌دهی و نمای سلامت باید از همین توابع بخوانند.
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

/**
 * شکستِ اعطا را **ماندگار** ثبت می‌کند.
 *
 * چرا لازم است: پول گرفته شده ولی دسترسی داده نشده. اگر این فقط
 * `console.error` بماند، در لاگی که یک ساعت بعد پاک می‌شود گم می‌شود و هیچ‌کس
 * نمی‌فهمد کدام مشتری پول داده و دسترسی نگرفته. `audit_log` جدولِ ماندگارِ
 * موجود است، پس رخداد همان‌جا با اکشنِ مخصوص ثبت می‌شود تا هم نمای سلامت
 * بتواند بشمارد و هم اپراتور بتواند مورد را پیدا کند.
 *
 * خودش هم هرگز throw نمی‌کند — این آخرین حلقهٔ زنجیره است.
 */
export async function recordGrantFailure(
  admin: SupabaseClient,
  input: GrantEntitlementInput,
  failure: { reason: string; message: string }
): Promise<void> {
  try {
    await admin.from("audit_log").insert({
      actor_id: input.userId,
      action: "entitlement.grant_failed",
      entity: "entitlement",
      target_user_id: input.userId,
      after: {
        kind: input.kind,
        source: input.source,
        reason: failure.reason,
        // پیامِ خطا از Supabase می‌آید و مقدارِ سکرت ندارد؛ برای تشخیص لازم است.
        message: failure.message.slice(0, 500),
      },
    });
  } catch {
    // اگر audit_log هم در دسترس نباشد کارِ دیگری از دست‌مان برنمی‌آید؛
    // فراخواننده جداگانه console.error می‌کند.
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
