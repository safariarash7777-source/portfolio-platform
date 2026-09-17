/**
 * آداپتورِ قراردادِ سبدِ هدف — از شکلِ ذخیره‌شده به قراردادِ محاسبه.
 *
 * ── چرا لازم است ───────────────────────────────────────────────────────────
 * `portfolio_versions.allocations` روی Production شکلِ `{asset, pct, note}`
 * دارد، نه `{assetClass, weightPct}`. اندازه‌گیریِ فقط‌خواندنیِ ۱۴۰۵/۰۶/۲۶:
 * کلیدهای موجود دقیقاً `asset`, `pct`, `note`، و برچسب‌ها متنِ آزادِ فارسی‌اند
 * («سهام»، «درامد ثابت» — با املای بدونِ همزه — و یک ورودیِ آزمایشیِ «dsf»).
 *
 * خواننده‌های موجود (`UserDetailDrawer`، وبهوکِ بات، `save_portfolio`) همین
 * شکل را می‌نویسند و می‌خوانند. پس **مدلِ موازی ساخته نمی‌شود**؛ این فایل فقط
 * ترجمه می‌کند.
 *
 * ── دو قاعدهٔ سخت ──────────────────────────────────────────────────────────
 * ۱. دستهٔ ناشناخته **حدس زده نمی‌شود**. «dsf» به هیچ دسته‌ای نگاشت نمی‌شود و
 *    در `unmapped` برمی‌گردد تا UI صریح بگوید این قلم شناخته نشد.
 * ۲. دادهٔ نامعتبر **مخفی نمی‌شود**. `pct` غیرعددی یا نامثبت در `invalid`
 *    می‌آید، نه اینکه بی‌صدا حذف شود یا صفر فرض شود.
 *
 * هر دو حالت باعث می‌شوند سبدِ هدف «قابلِ محاسبه» نباشد — که درست است: سبدی
 * که نمی‌دانیم یک قلمش چیست، نباید عددِ قطعیِ بازتوازن بسازد.
 */
import type { TargetWeight } from "./contracts";

/** شکلی که واقعاً در دیتابیس است. */
export interface StoredAllocation {
  asset?: unknown;
  pct?: unknown;
  note?: unknown;
}

export interface TargetParseResult {
  weights: TargetWeight[];
  /** برچسب‌هایی که به هیچ دستهٔ معتبری نگاشت نشدند. */
  unmapped: { label: string; pct: number | null }[];
  /** قلم‌هایی که خودِ داده‌شان خراب بود. */
  invalid: { label: string; reason: string }[];
}

/**
 * نگاشتِ برچسبِ فارسی به دستهٔ معتبر.
 *
 * کلیدها **نرمال‌شده**اند: بدونِ نیم‌فاصله، با «ی» و «ک» فارسی، و بدونِ همزه‌های
 * اختیاری. همین است که «درآمد ثابت» و «درامد ثابت» هر دو را می‌گیرد — چون
 * املای دوم واقعاً در دیتابیس هست.
 */
const LABEL_TO_CLASS: Record<string, string> = {
  "طلا": "gold",
  "سکه": "gold",
  "صندوق طلا": "gold",
  "درامد ثابت": "fixed_income",
  "اوراق": "fixed_income",
  "صندوق درامد ثابت": "fixed_income",
  "سهام": "equity_ir",
  "سهام ایران": "equity_ir",
  "صندوق سهامی": "equity_ir",
  "ارز": "fx",
  "دلار": "fx",
  "نقد": "cash",
  "وجه نقد": "cash",
};

/**
 * نرمال‌سازیِ متنِ فارسی پیش از نگاشت.
 *
 * ⚠️ «ي» و «ك» عربی با «ی» و «ک» فارسی یکی می‌شوند، نیم‌فاصله و فاصله‌های
 * تکراری جمع می‌شوند، و «آ» به «ا» می‌رود. بدونِ این، «درآمد ثابت» و
 * «درامد ثابت» دو چیزِ متفاوت به حساب می‌آیند و یکی‌شان بی‌دلیل ناشناخته
 * می‌ماند — در حالی که هر دو در دادهٔ واقعی وجود دارند.
 */
export function normaliseLabel(raw: string): string {
  return raw
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[آأإ]/g, "ا")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapAssetLabel(label: string): string | null {
  return LABEL_TO_CLASS[normaliseLabel(label)] ?? null;
}

/** همهٔ دسته‌های معتبر — برای نمایش در UI و آزمون. */
export const KNOWN_ASSET_CLASSES = [...new Set(Object.values(LABEL_TO_CLASS))];

export function parseStoredAllocations(raw: unknown): TargetParseResult {
  const out: TargetParseResult = { weights: [], unmapped: [], invalid: [] };
  if (!Array.isArray(raw)) return out;

  const seen = new Map<string, number>();

  for (const entry of raw as StoredAllocation[]) {
    const label = typeof entry?.asset === "string" ? entry.asset.trim() : "";
    if (label === "") {
      out.invalid.push({ label: "(بدون نام)", reason: "نام دسته خالی است." });
      continue;
    }

    const pctRaw = entry?.pct;
    const pct = typeof pctRaw === "number" ? pctRaw : Number(String(pctRaw ?? "").trim());
    const pctOk = Number.isFinite(pct) && pct > 0;

    const cls = mapAssetLabel(label);
    if (cls === null) {
      // ⚠️ حدس ممنوع. برچسب ناشناخته برمی‌گردد تا دیده شود، نه دور ریخته شود.
      out.unmapped.push({ label, pct: pctOk ? pct : null });
      continue;
    }
    if (!pctOk) {
      out.invalid.push({ label, reason: "درصد عددی و بزرگ‌تر از صفر نیست." });
      continue;
    }

    // دو برچسبِ متفاوت می‌توانند به یک دسته برسند («سهام» و «سهام ایران»)؛
    // جمع می‌شوند، نه اینکه دومی اولی را پاک کند.
    seen.set(cls, (seen.get(cls) ?? 0) + pct);
  }

  out.weights = [...seen.entries()].map(([assetClass, weightPct]) => ({ assetClass, weightPct }));
  return out;
}

/** خلاصهٔ فارسیِ اینکه چرا هدف قابلِ محاسبه نیست. خالی = مشکلی نیست. */
export function describeTargetProblems(result: TargetParseResult): string[] {
  const notes: string[] = [];
  if (result.unmapped.length > 0) {
    notes.push(
      `دستهٔ «${result.unmapped.map((u) => u.label).join("»، «")}» در سبد هدف شناخته نشد. ` +
        "تا مشخص‌شدن دسته، مقدار قطعی بازتوازن محاسبه نمی‌شود — حدس زده نمی‌شود."
    );
  }
  if (result.invalid.length > 0) {
    notes.push(
      `قلم‌های نامعتبر در سبد هدف: ${result.invalid.map((i) => `«${i.label}» (${i.reason})`).join("، ")}`
    );
  }
  return notes;
}
