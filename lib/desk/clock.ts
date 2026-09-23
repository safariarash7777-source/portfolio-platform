/**
 * میزِ آرش — خواندنِ ساعتِ هر منبع (`P2-G3-MEGA-008`).
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────
 * Wave 2 دو زمانِ متفاوت به هر منبع داد — `observedAt` (جدیدترین لحظه‌ای که
 * خودِ داده دربارهٔ جهان ادعا می‌کند) و `fetchedAt` (لحظه‌ای که ما پرسیدیم) —
 * ولی هیچ‌کدام **رندر نمی‌شد**. تنها زمانی که روی میز دیده می‌شد
 * `generatedAt` بود: یک مهرِ زمانیِ سراسری، پایینِ صفحه، زیرِ هجده منبع.
 *
 * این همان الگویی است که کلِ قرارداد علیه‌اش نوشته شده، فقط در لایهٔ نمایش:
 * یک ساعتِ **تازه** که کنارِ هجده فید می‌نشیند و ناخواسته برچسبِ همه‌شان
 * می‌شود. کاربر «۱۴:۳۲» را می‌بیند و می‌خوانَد «داده‌ها تا ۱۴:۳۲»، در حالی
 * که ۱۴:۳۲ فقط زمانی است که ما **پرسیدیم**.
 *
 * پس هر منبع ساعتِ خودش را نشان می‌دهد، و دو قاعدهٔ سخت:
 *
 *   ۱. `observedAt = null` یعنی **نمی‌دانیم**. هرگز با `fetchedAt` یا با
 *      زمانِ تولیدِ نما پر نمی‌شود — نبودِ زمان خودش یک واقعیت است.
 *   ۲. دو زمان هرگز در یک عبارت ادغام نمی‌شوند. هر کدام برچسبِ خودش را
 *      دارد، وگرنه دوباره یکی جای دیگری را می‌گیرد.
 */

import { toPersianDigits } from "@/lib/format";
import type { DeskSource } from "@/lib/desk/contracts";

/** وقتی زمانی در کار نیست. یک رشتهٔ ثابت تا هیچ‌جا صفر یا «اکنون» ننشیند. */
export const UNKNOWN_TIME = "نامعلوم";

/**
 * سن به زبانِ آدم. `null` → «نامعلوم»، نه «۰ دقیقه».
 *
 * مرزها عمداً درشت‌اند: برای قضاوت دربارهٔ یک فید، «۳ روز پیش» به‌اندازهٔ
 * «۴۳۲۰ دقیقه پیش» گویاست و خیلی زودتر خوانده می‌شود.
 */
export function relativeAge(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return UNKNOWN_TIME;
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return "همین حالا";
  if (m < 60) return `${toPersianDigits(m)} دقیقه پیش`;
  const hours = Math.floor(m / 60);
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  return `${toPersianDigits(Math.floor(hours / 24))} روز پیش`;
}

/** ساعتِ دیواریِ تهران — `HH:MM`. زمانِ نامعتبر «نامعلوم» می‌شود. */
const tehranClock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Tehran",
});

export function clockTime(iso: string | null): string {
  if (!iso) return UNKNOWN_TIME;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return UNKNOWN_TIME;
  return toPersianDigits(tehranClock.format(d));
}

export interface SourceClocks {
  /** چه زمانی را خودِ داده ادعا می‌کند. */
  observedLabel: string;
  observedValue: string;
  /** ما کِی پرسیدیم. */
  fetchedLabel: string;
  fetchedValue: string;
}

/**
 * دو ساعتِ یک منبع، آمادهٔ نمایش و **جدا از هم**.
 *
 * `observedValue` از `ageMinutes` می‌آید و نه از `fetchedAt`: اگر منبع زمانی
 * نداده باشد، این تابع چیزی از جای دیگر قرض نمی‌گیرد.
 */
export function sourceClocks(source: DeskSource): SourceClocks {
  return {
    observedLabel: "دادهٔ منبع",
    observedValue: source.observedAt === null ? UNKNOWN_TIME : relativeAge(source.ageMinutes),
    fetchedLabel: "خوانده‌شده",
    fetchedValue: clockTime(source.fetchedAt),
  };
}
