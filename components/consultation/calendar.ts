import { formatJalali, toLatinDigits } from "@/lib/format";
import { jalaliYmdToGregorian } from "@/lib/core/jalali";

/** Editing uses a Persian civil day. The API and version fingerprints always keep Gregorian ISO days. */
export function jalaliInput(iso: string) {
  return iso ? formatJalali(iso, false) : "";
}

export function consultationDay(value: string) {
  const date = toLatinDigits(value.trim()).match(/^(\d{4})([/-])(\d{1,2})\2(\d{1,2})$/);
  if (date) {
    const target = [date[1], date[3].padStart(2, "0"), date[4].padStart(2, "0")].join("/");
    const candidate = jalaliYmdToGregorian(target);
    if (candidate && toLatinDigits(jalaliInput(candidate)) === target) return candidate;
    // Use the same Intl calendar as the visible date for boundary years outside
    // the core helper's limited range. Never let an invalid Esfand roll forward.
    const y = Number(date[1]);
    if (y >= 1000 && y < 9378) {
      let lo = Date.UTC(y + 621, 0, 1) / 86400000, hi = Date.UTC(y + 622, 11, 31) / 86400000;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const iso = new Date(mid * 86400000).toISOString().slice(0, 10);
        const displayed = toLatinDigits(jalaliInput(iso));
        if (displayed === target) return iso;
        if (displayed < target) lo = mid + 1; else hi = mid - 1;
      }
    }
  }
  throw new Error("تاریخ شمسی معتبر وارد کنید؛ مانند ۱۴۰۵/۰۸/۲۹.");
}

export function tehranDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).formatToParts(now);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
}
