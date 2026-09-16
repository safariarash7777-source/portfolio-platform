/**
 * قراردادهای مقایسهٔ سبد — سه چیزِ جدا که فقط اینجا کنار هم می‌آیند.
 *
 *   سبدِ مرجعِ آرش  → `intel_reference_*`   (بدونِ کاربر)
 *   سبدِ هدفِ عضو   → `portfolio_versions`  (با کاربر)
 *   داراییِ واقعی   → `member_holding_*`    (با کاربر)
 *
 * هیچ‌کدام در دیتابیس مخلوط نمی‌شوند. مقایسه فقط یک **محاسبه** است و چیزی
 * نمی‌نویسد.
 */

/** قیمت بدونِ منبع و زمان وجود ندارد — این نوع اجازهٔ ساختنش را نمی‌دهد. */
export interface PricePoint {
  /** تومان، عددِ صحیح. */
  toman: number;
  /** از کجا آمده — «رله»، «کدال»، «ورودیِ دستیِ کاربر»… هرگز خالی. */
  source: string;
  /** زمانِ همان قیمت، نه زمانِ خواندن. */
  asOf: string;
}

export interface HoldingPosition {
  positionKey: string;
  symbol: string | null;
  manualLabel: string | null;
  assetClass: string;
  qty: number;
  unit: string;
  costBasis: number | null;
  asOf: string;
}

export interface HoldingVersion {
  id: string;
  version: number;
  positions: readonly HoldingPosition[];
}

export interface TargetWeight {
  assetClass: string;
  weightPct: number;
}

export interface TargetVersion {
  id: string;
  version: number;
  /** نسخهٔ مرجعی که این هدف از آن مشتق شده. `null` = مستقل. */
  referenceVersionId: string | null;
  weights: readonly TargetWeight[];
}

/** چرا یک قلم از محاسبهٔ قطعی بیرون افتاد. هیچ‌وقت «حدس زده شد». */
export type CoverageGap =
  | { positionKey: string; reason: "no_price"; detail: string }
  | { positionKey: string; reason: "stale_price"; detail: string };

export interface AssetClassRow {
  assetClass: string;
  /** ارزشِ پوشش‌داده‌شده به تومان. `null` = قابلِ محاسبه نیست. */
  value: number | null;
  currentWeightPct: number | null;
  targetWeightPct: number;
  /** واحدِ درصد، نه درصدِ نسبی. `null` وقتی وزنِ جاری نامعلوم است. */
  deltaPercentagePoints: number | null;
  /** تومانِ لازم برای رسیدن به هدف. فقط وقتی پوشش کامل است. */
  valueDelta: number | null;
}

export interface RebalanceResult {
  /** هویتِ محاسبه — همین سه‌تایی خروجی را قطعی می‌کند. */
  identity: {
    holdingVersionId: string;
    targetVersionId: string;
    pricedAt: string;
  };
  rows: readonly AssetClassRow[];
  totalValue: number | null;
  /** آیا همهٔ اقلام قیمتِ معتبر داشتند. */
  fullCoverage: boolean;
  gaps: readonly CoverageGap[];
  /**
   * وقتی پوشش ناقص است هیچ عددِ قطعیِ ریبالانس تولید نمی‌شود. این یک پیام
   * محترمانه نیست؛ `valueDelta` واقعاً `null` می‌ماند.
   */
  definitive: boolean;
  notes: readonly string[];
}
