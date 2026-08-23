/**
 * تازگیِ دادهٔ بازار — بر اساسِ زمانِ خودِ داده، نه زمانِ درخواستِ مرورگر.
 *
 * ── باگی که این فایل می‌بندد ────────────────────────────────────────────────
 *
 * پاسخِ `/api/market` دو مهرِ زمانیِ **متفاوت** دارد:
 *
 *   `fetchedAt`      → زمانی که سرور از CoinGecko گرفت (کریپتو و انسِ جهانی)
 *   `ir.fetchedAt`   → زمانی که **رله** دادهٔ ایران را گرفت (طلا، ارز، صندوق، سهام)
 *
 * سطحِ عمومی فقط `fetchedAt` را می‌خواند و همان را کنارِ قیمتِ دلار و سکه
 * می‌نوشت — یعنی سنِ دادهٔ CoinGecko را به‌جای سنِ دادهٔ ایران گزارش می‌کرد.
 * اگر رله می‌خوابید ولی CoinGecko جواب می‌داد، برچسب «هم‌اکنون» می‌ماند در
 * حالی که قیمتِ دلار ساعت‌ها کهنه بود. این دقیقاً همان ادعای اثبات‌نشده‌ای است
 * که نباید باقی بماند.
 *
 * راه‌حل: فقط مهرِ زمانیِ منابعی که **واقعاً رندر شده‌اند** حساب می‌شود، و
 * **قدیمی‌ترین**شان گزارش می‌شود. محافظه‌کارانه‌ترین گزارهٔ صادق.
 */
import { toPersianDigits } from "./format";

/** بعد از این مدت، داده «کهنه» علامت می‌خورد. */
export const STALE_AFTER_MIN = 30;

/** بیش از این اختلاف به آینده = ساعتِ نامعتبر (ساعتِ مرورگر عقب/جلو). */
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

export type FreshnessState = "fresh" | "stale" | "unknown";

export interface Freshness {
  state: FreshnessState;
  /** سنِ قدیمی‌ترین منبعِ رندرشده، به دقیقه. `null` وقتی مهرِ زمانیِ معتبری نیست. */
  ageMin: number | null;
  /** متنِ آمادهٔ نمایش (ارقامِ فارسی). */
  label: string;
  /** فقط روی دادهٔ تازه true — نقطهٔ «زنده» نباید روی دادهٔ کهنه بتپد. */
  showLiveDot: boolean;
}

export interface FreshnessInput {
  /** مهرِ زمانیِ فیدِ ایران؛ فقط وقتی حساب می‌شود که ردیفی از ایران رندر شده باشد. */
  irFetchedAt?: number | null;
  /** مهرِ زمانیِ فیدِ جهانی؛ فقط وقتی ردیفی از جهانی رندر شده باشد. */
  globalFetchedAt?: number | null;
  usesIr: boolean;
  usesGlobal: boolean;
  now: number;
}

function validAge(at: number | null | undefined, now: number): number | null {
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return null;
  const diff = now - at;
  if (diff < -MAX_FUTURE_SKEW_MS) return null; // مهرِ زمانیِ آینده ⇒ بی‌اعتماد
  return Math.max(0, diff);
}

/**
 * تابعِ خالص. `now` تزریق می‌شود تا تست به ساعتِ سیستم وابسته نباشد.
 *
 * اگر هیچ مهرِ زمانیِ معتبری نباشد، حالت `unknown` است — نه «تازه». نبودِ
 * شواهد، شاهدِ تازگی نیست.
 */
export function computeFreshness(input: FreshnessInput): Freshness {
  const ages: number[] = [];
  if (input.usesIr) {
    const a = validAge(input.irFetchedAt, input.now);
    if (a != null) ages.push(a);
  }
  if (input.usesGlobal) {
    const a = validAge(input.globalFetchedAt, input.now);
    if (a != null) ages.push(a);
  }

  if (ages.length === 0) {
    return { state: "unknown", ageMin: null, label: "زمانِ داده نامشخص", showLiveDot: false };
  }

  // قدیمی‌ترین منبع تعیین‌کننده است: نوار به‌اندازهٔ کهنه‌ترین چیزی که نشان می‌دهد کهنه است.
  const ageMin = Math.max(0, Math.round(Math.max(...ages) / 60000));
  const stale = ageMin >= STALE_AFTER_MIN;

  if (stale) {
    return {
      state: "stale",
      ageMin,
      label: `دادهٔ کهنه · ${toPersianDigits(ageMin)} دقیقه پیش`,
      showLiveDot: false,
    };
  }
  return {
    state: "fresh",
    ageMin,
    label: ageMin === 0 ? "به‌روزرسانی: هم‌اکنون" : `به‌روزرسانی: ${toPersianDigits(ageMin)} دقیقه پیش`,
    showLiveDot: true,
  };
}
