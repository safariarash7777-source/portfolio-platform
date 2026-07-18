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
  /** گارد (T2): سهم بالایی/پایینی دامنهٔ روز که قیمت باید در آن باشد (۰٫۲ = ۲۰٪) */
  guardRangeShare: 0.2,
  /** آستانهٔ صف (T2): فاصلهٔ درصدی قیمت تا سقف/کف دامنهٔ مجاز */
  queueThresholdPercent: 1,
  /** حداقل اختلاف درصد پایانی و آخرین (واحد درصد) (T2) */
  divergenceMin: 1.5,
  /** حداقل نوسان روزانه ٪ = (سقف−کف)÷پایانی ×۱۰۰ (T2) */
  rangeVolatilityMin: 4,
} as const;

/* ── محاسبات T2-الف — توابع خالص قابل تست ─────────────────────────── */

/** جایگاه آخرین قیمت در دامنهٔ روز (۰=کف تا ۱=سقف) — null اگر دامنه نبود/صفر بود */
export function rangePosition(r: IrStockRow): number | null {
  const hi = num(r.dayHigh);
  const lo = num(r.dayLow);
  const p = num(r.price);
  if (hi == null || lo == null || p == null || hi <= lo) return null;
  return (p - lo) / (hi - lo);
}

/** فاصلهٔ درصدی قیمت تا سقف دامنهٔ مجاز — null بدون داده */
export function distanceToBandHigh(r: IrStockRow): number | null {
  const b = num(r.bandHigh);
  const p = num(r.price);
  if (b == null || b <= 0 || p == null) return null;
  return ((b - p) / b) * 100;
}

/** فاصلهٔ درصدی قیمت تا کف دامنهٔ مجاز */
export function distanceToBandLow(r: IrStockRow): number | null {
  const b = num(r.bandLow);
  const p = num(r.price);
  if (b == null || b <= 0 || p == null) return null;
  return ((p - b) / b) * 100;
}

/** اختلاف درصد پایانی و آخرین (pcp−plp، علامت‌دار) — null بدون داده */
export function closeLastDivergence(r: IrStockRow): number | null {
  const pcp = num(r.closingChangePercent);
  const plp = num(r.changePercent);
  if (pcp == null || plp == null) return null;
  return pcp - plp;
}

/** نوسان روزانه ٪ = (سقف − کف) ÷ قیمت پایانی × ۱۰۰ — null بدون داده */
export function dailyRangeVolatility(r: IrStockRow): number | null {
  const hi = num(r.dayHigh);
  const lo = num(r.dayLow);
  const c = num(r.closingPrice) ?? num(r.price);
  if (hi == null || lo == null || c == null || c <= 0 || hi < lo) return null;
  return ((hi - lo) / c) * 100;
}

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
  // ── پرست‌های تابلوخوانی T2-الف ────────────────────────────────────────────
  {
    key: "bullish_guard",
    label: "گارد صعودی",
    definition:
      "آخرین قیمت در ۲۰٪ بالایی دامنهٔ نوسان امروز (بین کف و سقف روز) است و سرانهٔ خرید حقیقی از سرانهٔ فروش حقیقی بیشتر است. آستانه‌ها ثابتند. نماد بدون دادهٔ دامنه یا سرانه‌ها نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const pos = rangePosition(r);
      const b = perCapitaBuy(r);
      const s = perCapitaSell(r);
      return pos != null && pos >= 1 - THRESHOLDS.guardRangeShare && b != null && s != null && b > s;
    },
  },
  {
    key: "bearish_guard",
    label: "گارد نزولی",
    definition:
      "آخرین قیمت در ۲۰٪ پایینی دامنهٔ نوسان امروز است و سرانهٔ فروش حقیقی از سرانهٔ خرید حقیقی بیشتر است. آستانه‌ها ثابتند. نماد بدون دادهٔ لازم نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const pos = rangePosition(r);
      const b = perCapitaBuy(r);
      const s = perCapitaSell(r);
      return pos != null && pos <= THRESHOLDS.guardRangeShare && b != null && s != null && s > b;
    },
  },
  {
    key: "near_buy_queue",
    label: "نزدیک سقف دامنهٔ مجاز",
    definition:
      "فاصلهٔ آخرین قیمت تا سقف دامنهٔ مجاز امروز کمتر از ۱٪ است ولی هنوز به سقف نرسیده (صف خرید نشده). نماد بدون دادهٔ دامنهٔ مجاز نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const d = distanceToBandHigh(r);
      return d != null && d > 0 && d < THRESHOLDS.queueThresholdPercent;
    },
  },
  {
    key: "near_sell_queue",
    label: "نزدیک کف دامنهٔ مجاز",
    definition:
      "فاصلهٔ آخرین قیمت تا کف دامنهٔ مجاز امروز کمتر از ۱٪ است ولی هنوز به کف نرسیده (صف فروش نشده). نماد بدون دادهٔ دامنهٔ مجاز نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const d = distanceToBandLow(r);
      return d != null && d > 0 && d < THRESHOLDS.queueThresholdPercent;
    },
  },
  {
    key: "divergence_up",
    label: "آخرین بالاتر از پایانی",
    definition:
      "درصد تغییر آخرین قیمت دست‌کم ۱٫۵ واحد بیشتر از درصد تغییر قیمت پایانی است — معاملات انتهای روز بالاتر از میانگین وزنی روز انجام شده است. نماد بدون هر دو درصد نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const d = closeLastDivergence(r);
      return d != null && -d >= THRESHOLDS.divergenceMin;
    },
  },
  {
    key: "divergence_down",
    label: "آخرین پایین‌تر از پایانی",
    definition:
      "درصد تغییر آخرین قیمت دست‌کم ۱٫۵ واحد کمتر از درصد تغییر قیمت پایانی است — معاملات انتهای روز پایین‌تر از میانگین وزنی روز انجام شده است. نماد بدون هر دو درصد نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const d = closeLastDivergence(r);
      return d != null && d >= THRESHOLDS.divergenceMin;
    },
  },
  {
    key: "high_range_volatility",
    label: "بیشترین نوسان روزانه",
    definition:
      "نوسان روزانه = (سقف روز − کف روز) ÷ قیمت پایانی × ۱۰۰. نمادهایی که این عدد امروز دست‌کم ۴٪ است. نماد بدون دادهٔ سقف/کف روز نمایش داده نمی‌شود.",
    needsHistory: false,
    fn: (r) => {
      const v = dailyRangeVolatility(r);
      return v != null && v >= THRESHOLDS.rangeVolatilityMin;
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
