/**
 * واحدِ مقدار — و اینکه چرا فقط «ریال به تومان» کافی نبود.
 *
 * تبدیلِ ریال↔تومان واحدِ **پول** را درست می‌کند. ولی مقدارِ دارایی هم واحد
 * دارد: «۱ سهم» و «۱ هزار سهم» دو چیزِ متفاوت‌اند و اگر هر دو در قیمتِ
 * هر سهم ضرب شوند، دومی هزار برابر کم‌ارزش گزارش می‌شود.
 *
 * ── قاعده ──────────────────────────────────────────────────────────────────
 * قیمت واحدِ خودش را حمل می‌کند. مقدار هم واحدِ خودش را دارد. ضرب فقط وقتی
 * مجاز است که این دو **هم‌خانواده** باشند و ضریبِ تبدیل **معلوم و مستند**
 * باشد. واحدِ ناشناخته یا ناسازگار ⇒ پوششِ ناقص، نه عددِ حدسی.
 *
 * ضریب‌ها اینجا صریح نوشته شده‌اند تا قابلِ بازبینی باشند؛ هیچ ضریبی از روی
 * شباهتِ نام حدس زده نمی‌شود.
 */

/** خانوادهٔ واحد — فقط واحدهای یک خانواده به هم تبدیل می‌شوند. */
export type UnitFamily = "tradable" | "mass";

interface UnitSpec {
  family: UnitFamily;
  /** چند واحدِ پایه در یک واحدِ این نام. پایهٔ هر خانواده ضریب ۱ دارد. */
  perBase: number;
}

/**
 * ⚠️ این جدول قرارداد است، نه حدس. افزودنِ واحد تازه یعنی تصمیم دربارهٔ
 * ضریبش — و آن تصمیم باید همین‌جا نوشته شود تا دیده شود.
 *
 * دو خانواده بیشتر نداریم و این عمدی است:
 *
 * - **`tradable`** — یک واحدِ قابلِ معاملهٔ ابزارِ فهرست‌شده. «سهم» برای سهام،
 *   «واحد» برای صندوق، «برگه» برای اوراق؛ این‌ها نامِ متفاوتِ یک چیزند و
 *   `symbol_history` قیمتِ دقیقاً همین را می‌دهد. جداکردنشان فقط باعث می‌شد
 *   داراییِ «۱۰ واحد صندوق طلا» با قیمتِ همان صندوق ناسازگار اعلام شود، که
 *   غلط است. تنها تفاوتِ واقعی در این خانواده، ضریبِ هزار و میلیون است.
 *
 * - **`mass`** — طلای فیزیکی. «۵ گرم طلا» با قیمتِ «هر سهمِ صندوق طلا»
 *   قابلِ ضرب نیست و باید ناسازگار بماند.
 *
 * پایه‌ها: `tradable` → «سهم» · `mass` → «گرم».
 */
const UNITS: Record<string, UnitSpec> = {
  // یک واحدِ قابلِ معامله — همان چیزی که تابلو قیمتش را می‌دهد
  "سهم": { family: "tradable", perBase: 1 },
  "برگه": { family: "tradable", perBase: 1 },
  "واحد": { family: "tradable", perBase: 1 },
  "عدد": { family: "tradable", perBase: 1 },
  "قطعه": { family: "tradable", perBase: 1 },
  "هزار سهم": { family: "tradable", perBase: 1_000 },
  "میلیون سهم": { family: "tradable", perBase: 1_000_000 },
  // وزنِ فیزیکی
  "گرم": { family: "mass", perBase: 1 },
  "مثقال": { family: "mass", perBase: 4.6083 },
  "کیلوگرم": { family: "mass", perBase: 1_000 },
};

/** نرمال‌سازیِ نامِ واحد — همان قواعدِ متنِ فارسی که در برچسبِ دسته هم هست. */
export function normaliseUnit(raw: string): string {
  return raw
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[آأإ]/g, "ا")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupUnit(raw: string): UnitSpec | null {
  return UNITS[normaliseUnit(raw)] ?? null;
}

export const KNOWN_UNITS = Object.keys(UNITS);

export type UnitConversion =
  | { ok: true; factor: number }
  | { ok: false; reason: "unknown_quantity_unit" | "unknown_price_unit" | "incompatible" };

/**
 * ضریبی که مقدارِ `quantityUnit` را به تعدادِ واحدهای `priceUnit` تبدیل می‌کند.
 *
 * مثال: مقدار «۱ هزار سهم» با قیمتِ «هر سهم» ⇒ ضریب ۱۰۰۰.
 */
export function conversionFactor(quantityUnit: string, priceUnit: string): UnitConversion {
  const q = lookupUnit(quantityUnit);
  if (!q) return { ok: false, reason: "unknown_quantity_unit" };

  const p = lookupUnit(priceUnit);
  if (!p) return { ok: false, reason: "unknown_price_unit" };

  // ⚠️ طلای فیزیکی (گرم) با واحدِ ابزارِ فهرست‌شده ضرب نمی‌شود — قیمتِ هر
  // سهمِ صندوق، قیمتِ هر گرمِ طلا نیست. خانوادهٔ متفاوت ⇒ ضرب ممنوع.
  if (q.family !== p.family) return { ok: false, reason: "incompatible" };

  const factor = q.perBase / p.perBase;
  if (!Number.isFinite(factor) || factor <= 0) return { ok: false, reason: "incompatible" };
  return { ok: true, factor };
}

export function describeUnitProblem(reason: Exclude<UnitConversion, { ok: true }>["reason"]): string {
  switch (reason) {
    case "unknown_quantity_unit":
      return "واحد مقدار شناخته نشد؛ ضریب تبدیل حدس زده نمی‌شود.";
    case "unknown_price_unit":
      return "واحد قیمت شناخته نشد؛ ضریب تبدیل حدس زده نمی‌شود.";
    case "incompatible":
      return "واحد مقدار و واحد قیمت هم‌خانواده نیستند.";
  }
}
