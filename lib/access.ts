// طبقه‌بندی دسترسی «قطب‌نمای بازار» — سند مانیتایز (فاز ۱۱)
//
// چهار لایه:
//   visitor    → بدون لاگین (صفحات عمومی + بانک داده)
//   registered → لاگین‌کرده (داشبورد، واچ‌لیست، هشدار)
//   full       → مشاوره (۳ ماه) یا وبینار فصلی یا ادمین — همهٔ امکانات تحلیلی
//
// منبع حقیقت: جدول entitlements (sql/phase11_access_tiers.sql).
// مقاوم در برابر نبود جدول: اگر جدول هنوز ساخته نشده باشد (مایگریشن اجرا نشده)،
// فقط ادمین full می‌گیرد و بقیه registered — سایت هرگز نمی‌شکند.

import { createClient } from "@/lib/supabase/server";
import { activeEntitlementFilter } from "@/lib/entitlement-filter";

export type AccessLevel = "visitor" | "registered" | "full";

export interface AccessInfo {
  level: AccessLevel;
  /** نوع دسترسی full: admin | consulting | webinar | manual */
  via: string | null;
  /** پایان دسترسی full (null = بدون انقضا مثل ادمین) */
  expiresAt: string | null;
  userId: string | null;
  email: string | null;
}

const VISITOR: AccessInfo = {
  level: "visitor",
  via: null,
  expiresAt: null,
  userId: null,
  email: null,
};

/** سطح دسترسی کاربر جاری را از سشن + profiles + entitlements برمی‌گرداند. */
export async function getAccess(): Promise<AccessInfo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return VISITOR;

  const base: AccessInfo = {
    level: "registered",
    via: null,
    expiresAt: null,
    userId: user.id,
    email: user.email ?? null,
  };

  // ادمین همیشه full
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "admin") {
      return { ...base, level: "full", via: "admin" };
    }
  } catch {
    /* profiles همیشه هست؛ محض احتیاط */
  }

  // دسترسی اعطاشده (مشاوره/وبینار) — جدول ممکن است هنوز ساخته نشده باشد
  try {
    const nowIso = new Date().toISOString();
    const { data: ents, error } = await supabase
      .from("entitlements")
      .select("kind,expires_at,revoked_at,starts_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .lte("starts_at", nowIso)
      .or(activeEntitlementFilter(nowIso))
      // `nullsFirst` لازم است: دسترسیِ همیشگی باید بر دسترسیِ موقت مقدم شود،
      // وگرنه یک اشتراکِ کوتاهِ هم‌زمان، «همیشگی» را از گزارش پنهان می‌کرد.
      .order("expires_at", { ascending: false, nullsFirst: true })
      .limit(1);
    if (!error && ents && ents.length > 0) {
      return {
        ...base,
        level: "full",
        via: ents[0].kind,
        expiresAt: ents[0].expires_at,
      };
    }
  } catch {
    /* جدول نیست → registered */
  }

  return base;
}

/** آیا کاربر به امکانات کامل (ترمینال، بک‌تست، واچ‌لیست امتیازی) دسترسی دارد؟ */
export async function hasFullAccess(): Promise<boolean> {
  const a = await getAccess();
  return a.level === "full";
}
