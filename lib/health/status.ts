/**
 * موتورِ طبقه‌بندیِ سلامت — `G2-003`.
 *
 * این فایل **هیچ I/O ندارد**: نه به Supabase وصل می‌شود، نه به شبکه. فقط
 * سیگنالِ خام می‌گیرد و وضعیت برمی‌گرداند. دلیلش قاعدهٔ «یک موتور، چند نما»
 * است — همان طبقه‌بندی هم در API و هم در UI و هم در تست استفاده می‌شود و
 * سه جا سه جور جواب نمی‌دهد.
 *
 * ⚠️ هیچ مقدارِ حساسی وارد این ماژول نمی‌شود. متغیرهای محیطی فقط به‌صورتِ
 * `present: boolean` منتقل می‌شوند، هرگز مقدارشان.
 */

/**
 * چهار حالت — و `unknown` عمداً از `failed` جداست.
 *
 * «نمی‌دانیم» با «خراب است» یکی نیست: جدولی که هنوز ساخته نشده، سیگنالی که
 * منبعش وجود ندارد، و کرونی که هرگز اجرا نشده، هیچ‌کدام «خرابی» نیستند ولی
 * «سالم» هم نیستند. یکی‌کردنشان یا هشدارِ کاذب می‌سازد یا خرابیِ واقعی را
 * زیرِ نویزِ «نامعلوم» پنهان می‌کند.
 */
export type HealthState = "ok" | "stale" | "failed" | "unknown";

export type HealthSignal = {
  /** کلیدِ ماشین‌خوان */
  key: string;
  /** برچسبِ فارسیِ نمایش */
  label: string;
  state: HealthState;
  /** چرا این وضعیت — همیشه پر است، حتی وقتی `ok` است */
  detail: string;
  /** آخرین رخدادِ موفق، اگر معنا داشته باشد */
  lastAt?: string | null;
  /** سنِ آخرین رخداد به دقیقه */
  ageMinutes?: number | null;
};

/** آستانه‌های تازگی برحسبِ دقیقه. */
export type FreshnessThresholds = {
  /** تا این سن `ok` */
  okWithinMinutes: number;
  /** تا این سن `stale`؛ بیشتر از آن `failed` */
  staleWithinMinutes: number;
};

export function ageMinutes(lastAt: string | Date | null | undefined, now: Date): number | null {
  if (!lastAt) return null;
  const t = lastAt instanceof Date ? lastAt : new Date(lastAt);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return null;
  // زمانِ آینده = ساعتِ ناهماهنگ؛ سنِ منفی بی‌معناست، صفر حساب می‌شود.
  return Math.max(0, Math.floor((now.getTime() - ms) / 60000));
}

/**
 * تازگی را به وضعیت تبدیل می‌کند.
 *
 * نبودِ timestamp → `unknown`، نه `failed`. «هرگز اجرا نشده» و «اجرا شد و
 * شکست» دو چیزِ متفاوتند و باید در UI هم متفاوت دیده شوند.
 */
export function classifyFreshness(
  lastAt: string | Date | null | undefined,
  thresholds: FreshnessThresholds,
  now: Date
): { state: HealthState; age: number | null } {
  const age = ageMinutes(lastAt, now);
  if (age === null) return { state: "unknown", age: null };
  if (age <= thresholds.okWithinMinutes) return { state: "ok", age };
  if (age <= thresholds.staleWithinMinutes) return { state: "stale", age };
  return { state: "failed", age };
}

/**
 * وضعیتِ کلی = بدترین وضعیتِ موجود.
 *
 * ترتیب عمدی است: `failed` از `unknown` بدتر است، ولی `unknown` از `stale`
 * بدتر است — چون دادهٔ بیاتِ **دیده‌شده** از سیگنالِ **نابینا** کم‌خطرتر است.
 * سیستمی که نمی‌داند چه خبر است، نمی‌تواند ادعای سلامت کند.
 */
const RANK: Record<HealthState, number> = { ok: 0, stale: 1, unknown: 2, failed: 3 };

export function rollup(signals: readonly HealthSignal[]): HealthState {
  if (signals.length === 0) return "unknown";
  return signals.reduce<HealthState>(
    (worst, s) => (RANK[s.state] > RANK[worst] ? s.state : worst),
    "ok"
  );
}

/** فقط نام و حضور — هرگز مقدار. */
export type EnvPresence = { key: string; present: boolean };

/**
 * متغیرهای محیطیِ اجباری را بررسی می‌کند.
 *
 * ورودی فقط `{key, present}` است؛ این تابع عمداً به `process.env` دست
 * نمی‌زند تا تستِ خالص بماند و تصادفاً مقداری از آن عبور نکند.
 */
export function classifyEnv(
  required: readonly EnvPresence[],
  optional: readonly EnvPresence[] = []
): HealthSignal {
  const missing = required.filter((e) => !e.present).map((e) => e.key);
  const missingOptional = optional.filter((e) => !e.present).map((e) => e.key);

  if (missing.length > 0) {
    return {
      key: "env",
      label: "متغیرهای محیطی",
      state: "failed",
      detail: `${missing.length} متغیرِ اجباری تنظیم نشده: ${missing.join("، ")}`,
    };
  }
  if (missingOptional.length > 0) {
    return {
      key: "env",
      label: "متغیرهای محیطی",
      state: "stale",
      detail: `همهٔ متغیرهای اجباری هست؛ اختیاری‌های تنظیم‌نشده: ${missingOptional.join("، ")}`,
    };
  }
  return {
    key: "env",
    label: "متغیرهای محیطی",
    state: "ok",
    detail: `هر ${required.length} متغیرِ اجباری تنظیم شده است`,
  };
}

export type PaymentConsistency = {
  paidCount: number;
  /** پرداختِ موفقی که هیچ entitlementی برایش صادر نشده */
  paidWithoutEntitlement: number;
};

/**
 * سازگاریِ پرداخت ↔ دسترسی.
 *
 * **هر** پرداختِ موفقِ بدونِ دسترسی یک مشتریِ پول‌داده و دسترسی‌نگرفته است؛
 * پس آستانه ندارد و «کمی خراب» وجود ندارد — یکی هم `failed` است.
 */
export function classifyPaymentConsistency(c: PaymentConsistency | null): HealthSignal {
  if (c === null) {
    return {
      key: "payment_entitlement",
      label: "سازگاریِ پرداخت ↔ دسترسی",
      state: "unknown",
      detail: "شمارش انجام نشد — پرس‌وجو مردود شد یا دسترسی نبود",
    };
  }
  if (c.paidWithoutEntitlement > 0) {
    return {
      key: "payment_entitlement",
      label: "سازگاریِ پرداخت ↔ دسترسی",
      state: "failed",
      detail: `${c.paidWithoutEntitlement} پرداختِ موفق بدونِ دسترسیِ صادرشده (از ${c.paidCount} پرداختِ موفق) — نیازمندِ آشتی‌دهی`,
    };
  }
  return {
    key: "payment_entitlement",
    label: "سازگاریِ پرداخت ↔ دسترسی",
    state: "ok",
    detail: `هر ${c.paidCount} پرداختِ موفق دسترسیِ متناظر دارد`,
  };
}

/**
 * آمادگیِ جدولِ `leads`.
 *
 * نبودِ جدول `failed` نیست — `unknown` هم نیست. یک واقعیتِ **شناخته‌شده** است:
 * migration عمداً اجرا نشده (`D-001` باز است). پس `stale` با متنِ صریح، تا
 * نه هشدارِ کاذب بدهد نه وانمود کند مسیرِ لید کار می‌کند.
 */
export function classifyLeadReadiness(tableExists: boolean | null): HealthSignal {
  if (tableExists === null) {
    return {
      key: "leads",
      label: "آمادگیِ جدولِ لید",
      state: "unknown",
      detail: "وجودِ جدول بررسی نشد",
    };
  }
  if (!tableExists) {
    return {
      key: "leads",
      label: "آمادگیِ جدولِ لید",
      state: "stale",
      detail:
        "جدولِ `leads` وجود ندارد — `sql/phase8b_leads.sql` آماده ولی اجرا نشده (`D-001` باز است). مسیرِ لید عملیاتی نیست",
    };
  }
  return {
    key: "leads",
    label: "آمادگیِ جدولِ لید",
    state: "ok",
    detail: "جدولِ `leads` موجود است",
  };
}

/** توضیحِ فارسیِ هر حالت — یک جا، تا UI و API یک زبان داشته باشند. */
export const STATE_LABEL: Record<HealthState, string> = {
  ok: "سالم",
  stale: "بیات",
  failed: "خراب",
  unknown: "نامعلوم",
};
