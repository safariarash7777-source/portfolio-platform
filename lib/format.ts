// Persian / Iranian financial formatting — pure, dependency-free, deterministic.
// Safe to import in both server and client components. Money is handled as
// integer Toman. Dates use the Persian (Jalali) calendar via Intl so the output
// is the same on server and client (no hydration mismatch).

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert all Latin digits in a string/number to Persian digits. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

function groupThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
}

/** Full Toman amount, e.g. 1250000 → "۱٬۲۵۰٬۰۰۰ تومان". */
export function formatToman(value: number): string {
  return `${toPersianDigits(groupThousands(value))} تومان`;
}

/** Abbreviated Toman, e.g. 3_500_000_000 → "۳٫۵ میلیارد تومان". */
export function formatTomanShort(value: number): string {
  const abs = Math.abs(value);
  let num = value;
  let unit = "";
  if (abs >= 1_000_000_000) {
    num = value / 1_000_000_000;
    unit = " میلیارد";
  } else if (abs >= 1_000_000) {
    num = value / 1_000_000;
    unit = " میلیون";
  } else if (abs >= 1_000) {
    num = value / 1_000;
    unit = " هزار";
  }
  const body = unit ? num.toFixed(num % 1 === 0 ? 0 : 1) : groupThousands(num);
  return `${toPersianDigits(body).replace(".", "٫")}${unit} تومان`;
}

/** Percent with Persian decimal/sign, e.g. 12.5 → "٪۱۲٫۵", -3.2 → "−٪۳٫۲". */
export function formatPercent(value: number, digits = 1): string {
  const sign = value < 0 ? "−" : "";
  const body = toPersianDigits(Math.abs(value).toFixed(digits)).replace(".", "٫");
  return `${sign}٪${body}`;
}

/** Signed change with arrow, e.g. 2.4 → "▲ ٪۲٫۴". */
export function formatSignedPercent(value: number, digits = 1): string {
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "•";
  return `${arrow} ${formatPercent(Math.abs(value), digits)}`;
}

/** Screen-reader phrasing for a delta, e.g. "افزایش ۲٫۴ درصدی". */
export function describeDelta(value: number): string {
  if (value > 0) return `افزایش ${toPersianDigits(Math.abs(value).toFixed(1))} درصدی`;
  if (value < 0) return `کاهش ${toPersianDigits(Math.abs(value).toFixed(1))} درصدی`;
  return "بدون تغییر";
}

/** CSS-variable color for a financial delta (matches the project's tokens). */
export function deltaColor(value: number): string {
  if (value > 0) return "var(--success)";
  if (value < 0) return "var(--danger)";
  return "var(--text-3)";
}

const FA_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

const jalaliParts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** Jalali date. long=true (default) → "۱ فروردین ۱۴۰۴", false → "۱۴۰۴/۰۱/۰۱". */
export function formatJalali(date: string | number | Date, long = true): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const parts = jalaliParts.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const day = Number(get("day"));
  if (long) {
    return `${toPersianDigits(day)} ${FA_MONTHS[m - 1]} ${toPersianDigits(y)}`;
  }
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return toPersianDigits(`${y}/${mm}/${dd}`);
}

/** Short Jalali for chart axes, e.g. "۱ فروردین". */
export function formatJalaliShort(date: string | number | Date): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const parts = jalaliParts.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${toPersianDigits(Number(get("day")))} ${FA_MONTHS[Number(get("month")) - 1]}`;
}
