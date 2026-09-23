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

/**
 * چرا کاربر دسترسیِ کامل **ندارد** — یا دارد.
 *
 * ── مسئله‌ای که حل می‌کند ──────────────────────────────────────────────────
 * `level` تنها سه حالت دارد و «منقضی شده» را از «هیچ‌وقت نداشته» جدا نمی‌کند:
 * هر دو `registered` می‌شوند با `via: null` و `expiresAt: null`. یعنی UI
 * **نمی‌تواند** بفهمد با کدام‌یک طرف است — و وقتی نمی‌تواند بفهمد، یا حدس
 * می‌زند یا به هر دو یک پیامِ غلط می‌دهد. کسی که دسترسی‌اش دیروز تمام شده
 * نباید پیامِ «با حساب، این صفحه‌ها به هم وصل می‌شوند» ببیند.
 *
 * ── چرا سمتِ سرور ─────────────────────────────────────────────────────────
 * این تمایز از ردیف‌های `entitlements` خودِ کاربر می‌آید، زیرِ سیاستِ موجودِ
 * `entitlements_select_own` (`auth.uid() = user_id`). هیچ جدولِ تازه، هیچ
 * migration و هیچ کلیدِ service-role لازم نیست — و UI هم چیزی حدس نمی‌زند.
 */
export type AccessStanding =
  /** هیچ ردیفِ دسترسی‌ای برای این کاربر وجود ندارد. */
  | "never"
  /** داشته و تاریخش گذشته. */
  | "expired"
  /** داشته و لغو شده — با «منقضی» یکی نیست: یکی زمان است، یکی تصمیم. */
  | "revoked"
  /** ثبت شده ولی هنوز شروع نشده. */
  | "scheduled"
  /** همین حالا فعال است. */
  | "active";

export interface AccessInfo {
  level: AccessLevel;
  /** نوع دسترسی full: admin | consulting | webinar | manual */
  via: string | null;
  /** پایان دسترسی full (null = بدون انقضا مثل ادمین) */
  expiresAt: string | null;
  /**
   * چرا در این وضعیت هستیم. `null` یعنی **نتوانستیم بفهمیم** (خطای خواندن) —
   * که با «هیچ‌وقت نداشته» یکی نیست و UI نباید یکی‌شان بگیرد.
   */
  standing: AccessStanding | null;
  /** اگر `expired` یا `revoked`، آخرین تاریخِ مربوطه — برای پیامِ دقیق. */
  standingSince: string | null;
  userId: string | null;
  email: string | null;
}

const VISITOR: AccessInfo = {
  level: "visitor",
  via: null,
  expiresAt: null,
  standing: null,       // کاربرِ ناشناس وضعیتِ دسترسی ندارد، نه اینکه «هیچ‌وقت نداشته»
  standingSince: null,
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
    standing: null,
    standingSince: null,
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
      return { ...base, level: "full", via: "admin", standing: "active" };
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
        standing: "active",
      };
    }
    if (error) return base;   // نتوانستیم بخوانیم → `standing` همان `null` می‌ماند

    // دسترسیِ فعالی نیست. حالا باید بفهمیم **چرا** — و این همان چیزی است که
    // پرس‌وجوی بالا عمداً فیلترش کرده بود.
    return { ...base, ...(await standingOf(supabase, user.id, nowIso)) };
  } catch {
    /* جدول نیست → registered با standing نامعلوم */
  }

  return base;
}

/**
 * وضعیتِ دسترسیِ کاربر وقتی چیزی فعال نیست.
 *
 * ترتیبِ بررسی عمدی است: **لغو** پیش از **انقضا** می‌آید، چون ردیفی که هم
 * لغو شده و هم تاریخش گذشته، یک تصمیم است نه یک اتفاقِ تقویمی — و پیامی که
 * به کاربر می‌دهیم باید همان را بگوید.
 */
export async function standingOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  nowIso: string,
): Promise<Pick<AccessInfo, "standing" | "standingSince">> {
  const { data, error } = await supabase
    .from("entitlements")
    .select("expires_at,revoked_at,starts_at")
    .eq("user_id", userId)
    .order("expires_at", { ascending: false })
    .limit(50);

  // خطا یعنی **ندیدیم**، نه «نبود». این دو را یکی گرفتن یعنی روزی که خواندن
  // می‌شکند، به هر مشترکِ واقعی می‌گوییم «شما هیچ‌وقت دسترسی نداشتید».
  if (error || !data) return { standing: null, standingSince: null };
  if (data.length === 0) return { standing: "never", standingSince: null };

  const revoked = data.filter((r) => r.revoked_at);
  if (revoked.length === data.length) {
    const latest = revoked
      .map((r) => r.revoked_at as string)
      .sort()
      .at(-1) ?? null;
    return { standing: "revoked", standingSince: latest };
  }

  const live = data.filter((r) => !r.revoked_at);
  const future = live.filter((r) => r.starts_at > nowIso);
  if (future.length > 0) {
    const soonest = future.map((r) => r.starts_at).sort()[0];
    return { standing: "scheduled", standingSince: soonest };
  }

  const past = live.map((r) => r.expires_at).sort().at(-1) ?? null;
  return { standing: "expired", standingSince: past };
}

/** آیا کاربر به امکانات کامل (ترمینال، بک‌تست، واچ‌لیست امتیازی) دسترسی دارد؟ */
export async function hasFullAccess(): Promise<boolean> {
  const a = await getAccess();
  return a.level === "full";
}

/** فقط برای تست — تا منطقِ تفکیک قابلِ آزمون باشد بدونِ نشستِ واقعی. */
export { standingOf as __standingOf };
