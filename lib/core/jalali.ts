// تبدیل تاریخ جلالی به میلادی — همان الگوریتم استاندارد jalaali که در
// relay/codal.mjs استفاده و با jdatetime پایتون راستی‌آزمایی شده است
// (1404/04/25→2025-07-16، 1403/12/30→2025-03-20، 1404/06/31→2025-09-22).

function jalaliToGregorian(jy: number, jm: number, jd: number): string {
  const jyd = jy + 1595;
  let days =
    -355668 +
    365 * jyd +
    Math.floor(jyd / 33) * 8 +
    Math.floor(((jyd % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const gdm = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  for (; gm <= 12 && gd > gdm[gm]; gm++) gd -= gdm[gm];
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/** «1404-06-31» یا «1404/06/31» → «2025-09-22»؛ ورودی نامعتبر → null. */
export function jalaliYmdToGregorian(jymd: string): string | null {
  const m = String(jymd).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  return jalaliToGregorian(jy, jm, jd);
}
