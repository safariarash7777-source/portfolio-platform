// Persian / Iranian financial formatting — pure, dependency-free, deterministic.
// Safe to import in both server and client components. Money is handled as
// integer Toman. Dates use the Persian (Jalali) calendar via Intl so the output
// is the same on server and client (no hydration mismatch).

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert all Latin digits in a string/number to Persian digits. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

const FA_AR_DIGITS = /[۰-۹٠-٩]/g;
const TO_LATIN: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** Convert Persian/Arabic digits to Latin — use before parsing or validating user input. */
export function toLatinDigits(input: string): string {
  return input.replace(FA_AR_DIGITS, (d) => TO_LATIN[d] ?? d);
}

function groupThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
}

/** Full Toman amount, e.g. 1250000 → "۱٬۲۵۰٬۰۰۰ تومان". */
export function formatToman(value: number): string {
  return `${toPersianDigits(groupThousands(value))} تومان`;
}

/**
 * Abbreviated Toman, e.g. 3_500_000_000 → "۳٫۵ میلیارد تومان".
 *
 * ── چرا پلهٔ «همت» اضافه شد ───────────────────────────────────────────────
 * بالاترین پلهٔ قبلی «میلیارد» بود، پس جمع‌های سطحِ بازار — ارزشِ معاملاتِ کل و
 * خالصِ پولِ حقیقی — به شکلِ «۳۳۲٬۹۲۸٬۱۴۶٫۲ میلیارد تومان» درمی‌آمدند: عددی که
 * نه خوانده می‌شود، نه در کارتِ سنجه جا می‌شود. «همت» (هزار میلیارد تومان)
 * واحدِ متعارفِ همین بازار است و در `TodayDashboard` هم به‌صورتِ محلی ساخته
 * شده بود؛ حالا یک بار اینجاست و همه از همین می‌خوانند.
 */
export function formatTomanShort(value: number): string {
  const abs = Math.abs(value);
  let num = value;
  let unit = "";
  if (abs >= 1_000_000_000_000) {
    num = value / 1_000_000_000_000;
    unit = " همت";
  } else if (abs >= 1_000_000_000) {
    num = value / 1_000_000_000;
    unit = " میلیارد";
  } else if (abs >= 1_000_000) {
    num = value / 1_000_000;
    unit = " میلیون";
  } else if (abs >= 1_000) {
    num = value / 1_000;
    unit = " هزار";
  }
  // علامتِ منفی: همان «−» (U+2212) که `formatPercent` می‌گذارد، نه خطِ تیرهٔ
  // اسکی. دو علامتِ متفاوت برای یک معنا در یک صفحه، و در RTL خطِ تیرهٔ اسکی
  // کنارِ رقمِ فارسی جهتش مبهم می‌شود.
  const sign = num < 0 ? "−" : "";
  const mag = Math.abs(num);
  const body = unit ? mag.toFixed(mag % 1 === 0 ? 0 : 1) : groupThousands(mag);
  // «همت» خودش مخفّفِ «هزار میلیارد تومان» است، پس «۴۱۵٫۴ همت تومان» یعنی
  // «…تومان تومان». واحد یک بار نوشته می‌شود؛ بقیهٔ پله‌ها («میلیارد»،
  // «میلیون»، …) عدد خالص‌اند و «تومان» را لازم دارند.
  const currency = unit === " همت" ? "" : " تومان";
  return `${sign}${toPersianDigits(body).replace(".", "٫")}${unit}${currency}`;
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

/** Dollar price with Persian digits, e.g. 67250.3 → "۶۷٬۲۵۰ دلار"; sub-1 keeps 3 significant digits. */
export function formatUsd(value: number): string {
  const s = value >= 1 ? Math.round(value).toLocaleString("en-US") : value.toPrecision(3);
  return `${toPersianDigits(s).replace(/,/g, "٬").replace(".", "٫")} دلار`;
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

/* ── تفکیک‌هایی که نبودشان باگِ عددی می‌سازد ─────────────────────────────── */

/**
 * **واحدِ درصد** (percentage point) — نه درصد.
 *
 * ── چرا تابعِ جداست ──────────────────────────────────────────────────────
 * «حبابِ این صندوق ۲ واحدِ درصد از میانه بالاتر است» و «حباب ۲٪ بالاتر است»
 * دو گزارهٔ متفاوت‌اند و با هم اشتباه گرفتن‌شان عددِ خروجی را عوض می‌کند.
 * وقتی هر دو با `formatPercent` نوشته شوند، هیچ‌کس در UI نمی‌تواند تشخیص
 * بدهد کدام است. این تابع تفاوت را **در خودِ متن** می‌گذارد.
 */
export function formatPercentPoints(value: number, digits = 1): string {
  const sign = value < 0 ? "−" : "";
  const body = toPersianDigits(Math.abs(value).toFixed(digits)).replace(".", "٫");
  return `${sign}${body} واحدِ درصد`;
}

/** شمارش با ارقامِ فارسی و جداکنندهٔ هزارگان، e.g. 1234 → "۱٬۲۳۴". */
export function formatCount(value: number): string {
  return toPersianDigits(groupThousands(value));
}

/**
 * ساعتِ تهران از یک مهرِ زمانی.
 *
 * `Intl` با `timeZone: "Asia/Tehran"` استفاده می‌شود تا خروجیِ سرور (UTC) و
 * مرورگرِ کاربر (هر منطقه‌ای) یکسان باشد — وگرنه hydration ناهماهنگ می‌شود.
 */
const tehranClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tehran",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTehranClock(date: string | number | Date): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return toPersianDigits(tehranClock.format(d));
}

/**
 * حالتِ یک عدد در نما. **«صفرِ واقعی» و «ناموجود» یک چیز نیستند** و این نوع
 * وادار می‌کند هر مصرف‌کننده تکلیفش را روشن کند.
 */
export type ValueState = "value" | "missing";

/**
 * عددِ اختیاری → متن. `null`/`undefined`/غیرعدد → «—» (نه صفر).
 *
 * هرجا این تابع به‌کار برود، باگِ «دادهٔ ناموجود صفر نشود» دیگر ممکن نیست.
 */
export function formatOrDash(value: number | null | undefined, fmt: (n: number) => string): string {
  if (typeof value !== "number" || !isFinite(value)) return "—";
  return fmt(value);
}

/**
 * جمعِ یک ستونِ اختیاری با **پوششِ صریح**.
 *
 * ── باگی که این تابع می‌بندد ──────────────────────────────────────────────
 * الگوی `rows.reduce((s, r) => s + (r.x ?? 0), 0)` وقتی هیچ ردیفی `x` ندارد
 * عددِ `0` می‌دهد — و نما آن را «جمعِ کل: صفر» نشان می‌دهد. یعنی «نمی‌دانیم»
 * به «صفر است» ترجمه می‌شود. اینجا جمع همراهِ `covered` برمی‌گردد و اگر هیچ
 * ردیفی داده نداشت، `total` عمداً `null` است.
 */
export function sumCovered<T>(rows: readonly T[], pick: (row: T) => number | null | undefined): {
  total: number | null;
  covered: number;
  population: number;
} {
  let total = 0;
  let covered = 0;
  for (const r of rows) {
    const v = pick(r);
    if (typeof v === "number" && isFinite(v)) {
      total += v;
      covered += 1;
    }
  }
  return { total: covered > 0 ? total : null, covered, population: rows.length };
}

/**
 * ریال → تومان.
 *
 * ── چرا یک تابعِ نام‌دار، نه `/ 10` پراکنده ───────────────────────────────
 * فیدِ tsetmc ارزشِ معاملات و ارزشِ بازار را به **ریال** می‌دهد و قیمت را به
 * تومان. هر مصرف‌کننده‌ای که این را نداند عددِ ده‌برابر نشان می‌دهد — و چون
 * خروجی همچنان «معقول» به نظر می‌رسد، کسی متوجه نمی‌شود.
 *
 * شاهد (اسنپ‌شاتِ ۱۴۰۵/۰۶/۲۴): `marketValue` فملی ÷ قیمتِ تومانی ۱٫۴۳×۱۰¹³
 * سهم می‌دهد، در حالی که تعدادِ سهامِ واقعیِ فملی ۱٫۴۳×۱۰¹² است. یعنی
 * `marketValue` ریال است، نه تومان.
 */
export function rialToToman(rial: number): number {
  return rial / 10;
}

/** ارزشِ ریالیِ فید → متنِ تومانیِ خلاصه. نقطهٔ واحدِ تبدیل برای نماها. */
export function formatRialAsToman(rial: number | null | undefined): string {
  if (typeof rial !== "number" || !isFinite(rial)) return "—";
  return formatTomanShort(rialToToman(rial));
}
