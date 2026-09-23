import { toLatinDigits } from "@/lib/format";

/**
 * خواندنِ عددی که کاربرِ فارسی‌زبان تایپ می‌کند — و **فقط** همین.
 *
 * این ماژول حسابِ سبد نمی‌کند؛ آن کارِ `portfolioScenario.ts` است و موتور دوم
 * ساخته نمی‌شود. کارِ اینجا یک تفکیکِ سه‌حالته است که موتور نمی‌تواند انجامش
 * دهد چون ورودیِ خام را نمی‌بیند:
 *
 *   خالی  — کاربر هنوز چیزی نگفته. **با صفر یکی نیست.**
 *   نامعتبر — چیزی نوشته که عدد نیست. با «خالی» هم یکی نیست.
 *   عدد   — مقدارِ خوانده‌شده.
 *
 * چرا مهم است: «بازدهٔ این دارایی صفر است» یک فرضِ صریح است، ولی «هنوز فرضی
 * ندارم» یعنی کلِ سبد نتیجه ندارد. اگر این دو یکی شوند، ابزار عددی می‌سازد که
 * کاربر هرگز نگفته.
 */
export type NumericField =
  | { state: "blank" }
  | { state: "invalid"; raw: string }
  | { state: "ok"; value: number };

/** جداکننده‌های هزارگان که فارسی‌زبان‌ها واقعاً تایپ یا paste می‌کنند. */
const GROUPING = /[,٬،  ‌‏‎\s']/g;
/** `٫` جداکنندهٔ اعشارِ عربی-فارسی است و `/` عادتِ رایجِ صفحه‌کلیدِ فارسی. */
const DECIMAL = /[٫/]/g;
/** `٪` و `%` اگر کاربر خودش هم بنویسد، معنا را عوض نمی‌کنند. */
const PERCENT = /[%٪]/g;
/** منهای ریاضی و خط تیره‌های یونیکد، نه فقط ASCII. */
const MINUS = /[−‒–—‑]/g;

export function parseNumericField(raw: string): NumericField {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return { state: "blank" };

  const normalised = toLatinDigits(trimmed)
    .replace(MINUS, "-")
    .replace(PERCENT, "")
    .replace(DECIMAL, ".")
    .replace(GROUPING, "")
    .trim();

  // یک علامت در ابتدا، رقم‌ها، حداکثر یک نقطه. `1.2.3` و `--1` و `1-` رد می‌شوند.
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalised)) return { state: "invalid", raw: trimmed };

  const value = Number(normalised);
  if (!Number.isFinite(value)) return { state: "invalid", raw: trimmed };
  return { state: "ok", value };
}

/** برای جاهایی که «خالی» خودش یک پاسخِ معتبر است (تورمِ اختیاری). */
export function optionalNumeric(raw: string): NumericField {
  return parseNumericField(raw);
}

/**
 * جمعِ وزن‌ها برای نمایش. موتور خودش هم جمع می‌زند و **او** تصمیم می‌گیرد؛
 * این فقط همان عدد را برای بازخوردِ زندهٔ فرم حساب می‌کند تا کاربر پیش از
 * زدنِ دکمه بفهمد کجاست. نرمال‌سازی نمی‌کند.
 */
export function sumWeights(fields: readonly NumericField[]): number | null {
  let sum = 0;
  for (const f of fields) {
    if (f.state === "invalid") return null;
    if (f.state === "ok") sum += f.value;
  }
  return sum;
}
