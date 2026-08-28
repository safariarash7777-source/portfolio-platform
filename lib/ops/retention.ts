/**
 * سیاستِ نگهداشت و طبقه‌بندیِ وضعیتش — `P2-DATA-QUOTA-RECOVERY-001`.
 *
 * ── چرا این فایل جدا از رله و از Health است ────────────────────────────
 * نگهداشت امروز فقط داخلِ `relay/server.mjs` زندگی می‌کند و وضعیتش فقط در
 * endpointِ خودِ رله دیده می‌شود. یعنی اگر prune خاموش شود یا پنجره‌اش اشتباه
 * باشد، سایت هیچ‌وقت نمی‌فهمد — تا روزی که سهمیه تمام شود. همان اتفاقی که
 * افتاد: پنجرهٔ ۱۸۰ روزه برای جدولی که روزی ۷.۷ MB می‌نویسد یعنی ۱.۴ GB،
 * حدود سه برابرِ کلِ سهمیهٔ رایگان.
 *
 * پس قاعده اینجاست، بدونِ شبکه و بدونِ HTTP، تا هم رله و هم نمای سلامت از یک
 * منبع بخوانند و تست بتواند واقعاً اجرایش کند.
 *
 * ── تلهٔ اصلی: «کوچک» با «سالم» یکی نیست ───────────────────────────────
 * یک جدولِ کوچک دو علتِ کاملاً متفاوت دارد: یا نگهداشت درست کار می‌کند، یا
 * **فید مرده است**. اگر طبقه‌بندی این دو را یکی کند، قطعِ رله پشتِ یک تیکِ
 * سبز پنهان می‌شود — دقیقاً همان چیزی که گیتِ میز ممنوع کرده. برای همین
 * `classifyRetention` تازگیِ داده را جدا از حجم می‌سنجد و تازگی حقِ وتو دارد.
 */

/** بخش‌هایی از `ir_market_history` که واقعاً خوانده می‌شوند. */
export const CONSUMED_IR_SECTIONS = ["gold", "currency"] as const;

/**
 * بخش‌هایی که رله می‌نوشت ولی هیچ‌کس نمی‌خواند.
 * `stocks` ≈۱۱۹ kB و `funds` ≈۵۵ kB در هر نمونه، ۴۲ نمونه در روز.
 * تنها خواننده `lib/core/trend.ts` است که `in.(gold,currency)` می‌گیرد.
 */
export const UNREAD_IR_SECTIONS = ["stocks", "funds"] as const;

export interface RetentionPolicy {
  table: string;
  label: string;
  /** سقفِ سنِ داده در Postgres. `null` یعنی نگهداشتِ خودکار ندارد. */
  hotDays: number | null;
  /**
   * بیشترین فاصلهٔ مجاز تا آخرین داده. از این بیشتر یعنی فید ایستاده —
   * مستقل از اینکه جدول چقدر بزرگ یا کوچک است.
   */
  freshWithinMinutes: number;
  /** بودجهٔ حجمی به مگابایت. عبور از آن هشدار است، نه خطا. */
  budgetMb: number;
  /** چرا این عددها. بدونِ شاهد، هر عددی می‌تواند وانمود کند اندازه‌گیری است. */
  basis: string;
}

export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    table: "ir_market_history",
    label: "روندِ طلا و ارز",
    hotDays: 180,
    // رله هر ۳۰ دقیقه یک نمونه می‌نویسد (`HISTORY_INTERVAL_MS`)؛ ۳ ساعت یعنی
    // شش نوبتِ ازدست‌رفته — به‌اندازهٔ کافی بد که گفته شود، به‌اندازهٔ کافی
    // بزرگ که یک خطای گذرا هشدار نسازد.
    freshWithinMinutes: 180,
    // با فقط `gold`+`currency` هر نمونه ≈۲.۶ kB است ⇒ ۱۸۰ روز ≈ ۲۰ MB.
    // همان ۱۸۰ روز با `stocks`+`funds` ≈۱.۴ GB می‌شد.
    budgetMb: 40,
    basis:
      "۴۲ نمونه در روز × ≈۲.۶ kB برای دو بخشِ مصرف‌شونده. اندازه‌گیریِ ۲۸ اوت ۲۰۲۶: gold 2.7 MB + currency 2.3 MB در ۴۵ روز.",
  },
  {
    table: "symbol_history",
    label: "تاریخچهٔ روزانهٔ نمادها",
    // نگهداشتِ خودکار **ندارد** و نباید داشته باشد: تریگرِ
    // `trg_symbol_history_immutable` حذف را می‌بندد و هر کوتاه‌سازی باید
    // migrationِ مصوب و آرشیوِ اثبات‌شده داشته باشد (قاعدهٔ D1).
    hotDays: null,
    // رله روزی یک‌بار بعد از بستنِ بازار می‌نویسد (`EOD_AFTER_HOUR`)، شنبه تا
    // چهارشنبه. ۲۶ ساعت = یک نوبت + ۲ ساعت تحمل؛ پنجشنبه و جمعه بازار بسته
    // است و نبودِ داده در آن دو روز خطا نیست.
    freshWithinMinutes: 26 * 60,
    budgetMb: 500,
    basis:
      "≈۱٬۰۳۰ ردیف در هر روزِ معاملاتی ≈ ۱۳۹ MB در سال. اندازه‌گیریِ ۲۸ اوت ۲۰۲۶: ۷۴۲ MB برای ۲۵ سال.",
  },
];

export type RetentionState =
  /** حجم زیرِ بودجه و داده تازه. */
  | "ok"
  /** داده تازه است ولی حجم از بودجه گذشته — نگهداشت جواب نمی‌دهد. */
  | "over_budget"
  /** داده کهنه است. حجم هرچه باشد بی‌معنی است تا این حل شود. */
  | "feed_stalled"
  /** سنِ قدیمی‌ترین ردیف از پنجرهٔ نگهداشت گذشته — prune اجرا نشده. */
  | "retention_stalled"
  /** اندازه‌گیری نشد. «نمی‌دانیم» هرگز «سالم» نیست. */
  | "unknown";

export interface RetentionObservation {
  table: string;
  /** حجمِ کلِ جدول (heap+toast+index) به مگابایت. `null` = خوانده نشد. */
  sizeMb: number | null;
  /** فاصلهٔ آخرین ردیف تا حالا، به دقیقه. `null` = خوانده نشد. */
  ageMinutes: number | null;
  /** سنِ قدیمی‌ترین ردیف به روز. `null` = خوانده نشد یا بی‌ربط. */
  oldestDays: number | null;
}

export interface RetentionVerdict {
  table: string;
  label: string;
  state: RetentionState;
  detail: string;
  sizeMb: number | null;
  budgetMb: number;
  hotDays: number | null;
}

const fa = (n: number) => n.toLocaleString("en-US");

/**
 * ترتیبِ سنجش عمدی است: **اول تازگی، بعد حجم.**
 *
 * جدولی که کوچک شده چون رله قطع است، از هر جدولِ بزرگی بدتر است. اگر اول
 * حجم سنجیده شود، آن حالت «زیرِ بودجه ✓» می‌گیرد و قطعیِ فید پشتِ سبز پنهان
 * می‌ماند.
 */
export function classifyRetention(
  policy: RetentionPolicy,
  obs: RetentionObservation
): RetentionVerdict {
  const base = {
    table: policy.table,
    label: policy.label,
    sizeMb: obs.sizeMb,
    budgetMb: policy.budgetMb,
    hotDays: policy.hotDays,
  };

  if (obs.ageMinutes === null && obs.sizeMb === null) {
    return { ...base, state: "unknown", detail: "هیچ‌کدام از دو سنجه خوانده نشد" };
  }

  if (obs.ageMinutes === null) {
    return { ...base, state: "unknown", detail: "تازگیِ داده خوانده نشد؛ دربارهٔ حجم قضاوت نمی‌کنیم" };
  }

  if (obs.ageMinutes > policy.freshWithinMinutes) {
    const hours = Math.floor(obs.ageMinutes / 60);
    return {
      ...base,
      state: "feed_stalled",
      detail: `آخرین ردیف ${fa(hours)} ساعت پیش است (آستانه ${fa(Math.floor(policy.freshWithinMinutes / 60))} ساعت) — تا این حل نشود، کوچک‌بودنِ جدول نشانهٔ سلامت نیست`,
    };
  }

  if (
    policy.hotDays !== null &&
    obs.oldestDays !== null &&
    obs.oldestDays > policy.hotDays * 1.1
  ) {
    return {
      ...base,
      state: "retention_stalled",
      detail: `قدیمی‌ترین ردیف ${fa(Math.floor(obs.oldestDays))} روزه است ولی پنجرهٔ نگهداشت ${fa(policy.hotDays)} روز — prune اجرا نشده`,
    };
  }

  if (obs.sizeMb === null) {
    // این «نامعلوم» یک نقصِ گذرا نیست، یک قابلیتِ غایب است: حجمِ بایتیِ جدول
    // از سمتِ سایت خواندنی نیست، چون `pg_total_relation_size` از PostgREST
    // در دسترس نیست و تابعِ SECURITY DEFINERِ متناظرش هنوز ساخته نشده.
    // «سالم» گفتن در این حالت یعنی ادعای چیزی که نسنجیده‌ایم — همان
    // سبزِ ناروا. پس صریح می‌گوییم چه چیزی سنجیده شد و چه چیزی نه.
    return {
      ...base,
      state: "unknown",
      detail:
        "تازگی و پنجرهٔ نگهداشت سالم‌اند، ولی حجم سنجیده نشد: خواندنش تابعِ سمتِ دیتابیس می‌خواهد که هنوز وجود ندارد",
    };
  }

  if (obs.sizeMb > policy.budgetMb) {
    return {
      ...base,
      state: "over_budget",
      detail: `${fa(Math.round(obs.sizeMb))} MB در برابر بودجهٔ ${fa(policy.budgetMb)} MB — نگهداشت هست ولی کافی نیست`,
    };
  }

  return {
    ...base,
    state: "ok",
    detail: `${fa(Math.round(obs.sizeMb))} MB زیرِ بودجهٔ ${fa(policy.budgetMb)} MB و داده تازه است`,
  };
}

/** بدترین حالت برنده است — همان قاعدهٔ میز. */
const RANK: Record<RetentionState, number> = {
  ok: 0,
  over_budget: 1,
  retention_stalled: 2,
  unknown: 3,
  feed_stalled: 4,
};

export function rollupRetention(verdicts: readonly RetentionVerdict[]): RetentionState {
  if (verdicts.length === 0) return "unknown";
  return verdicts.reduce<RetentionState>(
    (worst, v) => (RANK[v.state] > RANK[worst] ? v.state : worst),
    "ok"
  );
}

/**
 * نگاشتِ وضعیتِ نگهداشت به واژگانِ نمای سلامت.
 *
 * `over_budget` عمداً `stale` است نه `failed`: داده سالم و تازه است، فقط
 * بیش از بودجه جا گرفته — یک هشدارِ ظرفیتی، نه یک خرابی. `feed_stalled`
 * برعکس `failed` است، چون آنجا داده‌ای نمی‌آید.
 */
export function retentionHealthState(
  s: RetentionState
): "ok" | "stale" | "failed" | "unknown" {
  switch (s) {
    case "ok":
      return "ok";
    case "over_budget":
    case "retention_stalled":
      return "stale";
    case "feed_stalled":
      return "failed";
    case "unknown":
      return "unknown";
  }
}
