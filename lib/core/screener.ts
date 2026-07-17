// فیلترهای تابلوخوانی — M7 رصد بازار.
//
// هر فیلتر: تابع خالص + تعریف عمومی شفاف (برای نمایش زیر فیلتر در UI).
// اصل صداقت داده: نماد بدون فیلدهای لازم از نتیجه حذف می‌شود — هیچ عدد ساختگی.
// نام‌ها فقط توصیفی/خبری‌اند؛ هیچ واژهٔ تجویزی (خرید/فروش/سیگنال) به کار نمی‌رود.
//
// واحدها: قیمت‌ها تومان (خروجی رله)، حجم‌ها سهم. ارزش = تومان.

import type { IrStockRow } from "@/lib/market-ir";

export interface ScreenerFilter {
  key: string;
  /** نام کوتاه فارسی — بدون واژهٔ ممنوع */
  label: string;
  /** تعریف عمومی شفاف که زیر فیلتر نمایش داده می‌شود */
  definition: string;
  /** آیا به تاریخچهٔ ۳۰روزه نیاز دارد؟ (برچسب پوشش) */
  needsHistory: boolean;
  fn: (r: IrStockRow, ctx: ScreenerContext) => boolean;
}

/** دادهٔ کمکی فیلترها — تزریق‌پذیر برای تست. */
export interface ScreenerContext {
  /** میانگین حجم ۳۰ روزهٔ هر نماد (از symbol_history) — نماد بدون تاریخچه غایب */
  avgVolume30?: Map<string, number>;
}

function num(x: unknown): number | null {
  if (typeof x !== "number" || !isFinite(x)) return null;
  return x;
}

/** خالص ورود پول حقیقی (تومان) = (حجم خرید حقیقی − حجم فروش حقیقی) × قیمت پایانی */
export function realMoneyFlow(r: IrStockRow): number | null {
  const b = num(r.buyI);
  const s = num(r.sellI);
  const p = num(r.closingPrice) ?? num(r.price);
  if (b == null || s == null || p == null) return null;
  return (b - s) * p;
}

/** سرانهٔ خرید حقیقی (تومان بر نفر) = ارزش خرید حقیقی ÷ تعداد خریداران حقیقی */
export function perCapitaBuy(r: IrStockRow): number | null {
  const vol = num(r.buyI);
  const cnt = num(r.buyCountI);
  const p = num(r.closingPrice) ?? num(r.price);
  if (vol == null || cnt == null || cnt <= 0 || p == null) return null;
  return (vol * p) / cnt;
}

/** سرانهٔ فروش حقیقی (تومان بر نفر) */
export function perCapitaSell(r: IrStockRow): number | null {
  const vol = num(r.sellI);
  const cnt = num(r.sellCountI);
  const p = num(r.closingPrice) ?? num(r.price);
  if (vol == null || cnt == null || cnt <= 0 || p == null) return null;
  return (vol * p) / cnt;
}

/** قدرت خریدار حقیقی = سرانهٔ خرید ÷ سرانهٔ فروش — null اگر هرکدام نبود */
export function buyerPower(r: IrStockRow): number | null {
  const b = perCapitaBuy(r);
  const s = perCapitaSell(r);
  if (b == null || s == null || s <= 0) return null;
  return b / s;
}

/** فاصله تا سقف روز (٪) = (سقف روز − آخرین قیمت) ÷ سقف روز × ۱۰۰ */
export function distanceToDayHigh(r: IrStockRow): number | null {
  const hi = num(r.dayHigh);
  const p = num(r.price);
  if (hi == null || hi <= 0 || p == null) return null;
  return ((hi - p) / hi) * 100;
}

/** نسبت حجم امروز به میانگین ۳۰ روزه — null اگر تاریخچه نباشد */
export function volumeRatio(r: IrStockRow, ctx: ScreenerContext): number | null {
  const v = num(r.volume);
  const avg = ctx.avgVolume30?.get(r.id);
  if (v == null || avg == null || avg <= 0) return null;
  return v / avg;
}

// ── آستانه‌های فیلترها (صریح و قابل ممیزی — در تعریف عمومی هم آمده) ──────────
export const THRESHOLDS = {
  /** حداقل خالص ورود پول حقیقی (تومان) — ۱ میلیارد تومان */
  strongInflowToman: 1_000_000_000,
  /** حداقل نسبت قدرت خریدار */
  buyerPowerMin: 2,
  /** حداکثر فاصله تا سقف روز (٪) */
  nearHighMaxDistance: 1,
  /** حداقل نسبت حجم به میانگین ۳۰روزه */
  suspiciousVolumeRatio: 3,
} as const;

export const SCREENER_FILTERS: ScreenerFilter[] = [
  {
    key: "strong_inflow",
    label: "ورود پول حقیقی قوی",
    definition:
      "خالص ورود پول حقیقی = (حجم خرید حقیقی − حجم فروش حقیقی) × قیمت پایانی. این فیلتر نمادهایی را نشان می‌دهد که این عدد امروز بیش از ۱ میلیارد تومان است.",
    needsHistory: false,
    fn: (r) => {
      const f = realMoneyFlow(r);
      return f != null && f > THRESHOLDS.strongInflowToman;
    },
  },
  {
    key: "buyer_power",
    label: "قدرت خریدار بالا",
    definition:
      "قدرت خریدار = سرانهٔ خرید حقیقی (ارزش خرید ÷ تعداد خریدار) تقسیم بر سرانهٔ فروش حقیقی. مقدار بیش از ۲ یعنی هر خریدار حقیقی به‌طور میانگین بیش از دو برابرِ هر فروشنده معامله کرده است. نماد بدون دادهٔ تعداد معامله‌گران نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const p = buyerPower(r);
      return p != null && p > THRESHOLDS.buyerPowerMin;
    },
  },
  {
    key: "near_day_high",
    label: "نزدیک سقف روز",
    definition:
      "فاصلهٔ آخرین قیمت تا بیشترین قیمت امروز کمتر از ۱٪ است. نماد بدون دادهٔ سقف روز نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const d = distanceToDayHigh(r);
      return d != null && d < THRESHOLDS.nearHighMaxDistance;
    },
  },
  {
    key: "suspicious_volume",
    label: "حجم بیش از ۳ برابر میانگین",
    definition:
      "حجم معاملات امروز بیش از ۳ برابر میانگین حجم ۳۰ روز معاملاتی اخیر است. فقط برای نمادهایی که تاریخچهٔ کافی در سامانه دارند محاسبه می‌شود (برچسب پوشش کنار فیلتر).",
    needsHistory: true,
    fn: (r, ctx) => {
      const ratio = volumeRatio(r, ctx);
      return ratio != null && ratio > THRESHOLDS.suspiciousVolumeRatio;
    },
  },
];

/** اجرای یک فیلتر روی فهرست نمادها. */
export function runFilter(
  rows: IrStockRow[],
  filterKey: string,
  ctx: ScreenerContext = {}
): IrStockRow[] {
  const f = SCREENER_FILTERS.find((x) => x.key === filterKey);
  if (!f) return [];
  return rows.filter((r) => f.fn(r, ctx));
}
