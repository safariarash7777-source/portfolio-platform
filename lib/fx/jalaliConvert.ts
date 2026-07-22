// میلادی ← شمسی — معکوس دقیق الگوریتم کانونی lib/core/jalali.ts.
// ماژول خالص (بدون وابستگی سروری) تا هم در تست‌ها و هم در کلاینت قابل استفاده باشد.
// محافظ: تست تطبیق رفت‌وبرگشتی در lib/fx/engine.test.ts روزبه‌روز کل بازهٔ ۱۴۰۰..۱۴۱۰
// را با jalaliYmdToGregorian کانونی چک می‌کند تا دو نسخه هرگز واگرا نشوند.

export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/** «2026-07-22» → «1405/04/31»؛ ورودی نامعتبر → null. */
export function gregorianYmdToJalali(ymd: string | null | undefined): string | null {
  const m = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [jy, jm, jd] = gregorianToJalali(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}
