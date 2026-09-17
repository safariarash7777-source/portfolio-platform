/**
 * هشدارِ انحراف — تصمیمِ «آیا این بار پیام بفرستیم؟»، خالص و آزمون‌پذیر.
 *
 * ── چرا این تابع وجود دارد ──────────────────────────────────────────────────
 * صفحهٔ سبد در هر `refresh` دوباره محاسبه می‌شود. بدونِ یک قاعدهٔ صریح، هر
 * بارگذاری یک هشدار می‌فرستد و کاربر را در چند دقیقه خسته می‌کند. پس ارسال
 * سه شرطِ هم‌زمان دارد و هر سه اینجا جمع‌اند، نه پراکنده در UI.
 *
 * ── واژگان (قاعدهٔ L1) ─────────────────────────────────────────────────────
 * خروجی «نیاز به بررسیِ بازتوازن» است، نه توصیه یا سفارشِ معامله. هیچ واژهٔ
 * سیگنال/خرید/فروش/توصیه/پیشنهاد تولید نمی‌شود.
 */
import type { RebalanceResult } from "./contracts";

export interface AlertState {
  /** اثرِ انگشتِ آخرین هشداری که واقعاً فرستاده شد. */
  lastKey: string | null;
  /** زمانِ همان ارسال. */
  lastSentAt: string | null;
}

export interface AlertDecision {
  send: boolean;
  /** کلیدِ ایده‌مپوتنسی — با همین کلید، ارسالِ دوباره جلو گرفته می‌شود. */
  key: string | null;
  reason:
    | "not_definitive"
    | "below_threshold"
    | "duplicate"
    | "cooling_down"
    | "send";
  /** متنِ فارسی برای کاربر. `null` وقتی چیزی فرستاده نمی‌شود. */
  message: string | null;
}

export interface AlertOptions {
  /** انحراف از چند واحدِ درصد به بعد ارزشِ اطلاع‌دادن دارد. */
  thresholdPoints: number;
  /** حداقل فاصله تا ارسالِ بعدی، به ساعت. */
  cooldownHours: number;
  now: Date;
}

const HOUR_MS = 3_600_000;

/**
 * کلیدِ ایده‌مپوتنسی.
 *
 * ⚠️ نسخهٔ نسخه‌ها و **دسته‌های عبورکرده** داخلِ کلیدند، ولی خودِ عددِ انحراف
 * نیست. دلیلش: اگر عدد داخلِ کلید باشد، هر نوسانِ کوچکِ قیمت کلید را عوض
 * می‌کند و همان هشدار بارها می‌رود — یعنی دقیقاً همان اسپمی که قرار بود
 * جلویش گرفته شود. با تغییرِ نسخهٔ دارایی یا هدف، کلید عوض می‌شود چون آن
 * واقعاً یک وضعیتِ تازه است.
 */
export function alertKey(result: RebalanceResult, breached: readonly string[]): string {
  return [
    result.identity.holdingVersionId,
    result.identity.targetVersionId,
    [...breached].sort().join(","),
  ].join("|");
}

export function decideDeviationAlert(
  result: RebalanceResult,
  state: AlertState,
  options: AlertOptions
): AlertDecision {
  // نتیجهٔ غیرقطعی هرگز هشدار نمی‌سازد: قیمتِ ناقص یا کهنه یعنی نمی‌دانیم
  // انحرافی هست یا نه، و «نمی‌دانم» دلیلِ پیام‌دادن نیست.
  if (!result.definitive) {
    return { send: false, key: null, reason: "not_definitive", message: null };
  }

  const breached = result.rows
    .filter(
      (r) =>
        r.deltaPercentagePoints !== null &&
        Math.abs(r.deltaPercentagePoints) >= options.thresholdPoints
    )
    .map((r) => r.assetClass);

  if (breached.length === 0) {
    return { send: false, key: null, reason: "below_threshold", message: null };
  }

  const key = alertKey(result, breached);

  if (state.lastKey === key) {
    return { send: false, key, reason: "duplicate", message: null };
  }

  if (state.lastSentAt !== null) {
    const elapsed = (options.now.getTime() - new Date(state.lastSentAt).getTime()) / HOUR_MS;
    if (Number.isFinite(elapsed) && elapsed < options.cooldownHours) {
      return { send: false, key, reason: "cooling_down", message: null };
    }
  }

  return {
    send: true,
    key,
    reason: "send",
    message:
      `ترکیب سبد شما از سبد هدف فاصله گرفته است (${breached.length} دسته). ` +
      "نیاز به بررسی بازتوازن دارد.",
  };
}
