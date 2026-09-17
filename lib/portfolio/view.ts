/**
 * ترکیبِ صفحهٔ «داراییِ من» — همان مسیری که صفحه واقعاً می‌پیماید.
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
 * آزمونِ جداگانهٔ توابع کافی نیست: هر سه ایرادِ بازبینی در **اتصال** بودند،
 * نه در خودِ توابع. خواندنِ هدف قالبِ دیگری داشت، قیمت با کلیدِ دیگری ذخیره
 * می‌شد، و واحد اصلاً به موتور نمی‌رسید. هر تابع جدا درست بود و نتیجهٔ نهایی
 * غلط. پس همین ترکیب باید مستقیم آزمون شود و صفحه هم دقیقاً همین را صدا بزند.
 */
import { compareHoldingsToTarget, InvalidTargetError } from "./rebalance";
import { parseStoredAllocations, describeTargetProblems } from "./targetContract";
import { buildPriceMap, resolvePricesByPosition, type SymbolHistoryRow } from "./prices";
import type { AssetClassRow, CoverageGap, HoldingVersion, TargetVersion } from "./contracts";

export interface HoldingsView {
  rows: readonly AssetClassRow[];
  gaps: readonly CoverageGap[];
  definitive: boolean;
  totalValue: number | null;
  notes: readonly string[];
}

export interface BuildViewInput {
  holdings: HoldingVersion | null;
  /** `portfolio_versions` خام — همان `{asset, pct, note}` که واقعاً ذخیره شده. */
  storedTarget: {
    id: string;
    version: number;
    referenceVersionId: string | null;
    allocations: unknown;
  } | null;
  /** ردیف‌های خامِ `symbol_history` — همان‌طور که از دیتابیس می‌آیند. */
  priceRows: readonly SymbolHistoryRow[];
  maxPriceAgeDays: number;
  maxPriceFutureDays: number;
  now: Date;
}

/** هدفِ نسخه‌دار را از شکلِ ذخیره‌شده می‌سازد، با مشکل‌هایش. */
export function toTargetVersion(
  stored: NonNullable<BuildViewInput["storedTarget"]>
): TargetVersion {
  const parsed = parseStoredAllocations(stored.allocations);
  return {
    id: stored.id,
    version: stored.version,
    referenceVersionId: stored.referenceVersionId,
    weights: parsed.weights,
    problems: describeTargetProblems(parsed),
  };
}

export function buildHoldingsView(input: BuildViewInput): HoldingsView {
  const empty: HoldingsView = {
    rows: [], gaps: [], definitive: false, totalValue: null, notes: [],
  };

  if (!input.holdings) {
    return { ...empty, notes: ["هنوز دارایی‌ای ثبت نکرده‌اید."] };
  }
  if (!input.storedTarget) {
    return { ...empty, notes: ["سبد هدفی برای مقایسه ثبت نشده است."] };
  }

  const target = toTargetVersion(input.storedTarget);

  // قیمت‌ها با نماد می‌آیند و **صریح** به شناسهٔ قلم نگاشت می‌شوند.
  const prices = resolvePricesByPosition(
    input.holdings.positions,
    buildPriceMap(input.priceRows)
  );

  try {
    const result = compareHoldingsToTarget(input.holdings, target, prices, {
      maxPriceAgeDays: input.maxPriceAgeDays,
      maxPriceFutureDays: input.maxPriceFutureDays,
      now: input.now,
    });
    return {
      rows: result.rows,
      gaps: result.gaps,
      definitive: result.definitive,
      totalValue: result.totalValue,
      notes: result.notes,
    };
  } catch (e) {
    // هدفِ نامعتبر صفحه را نمی‌اندازد، ولی **هیچ عددی هم نمی‌سازد**. دلیلش
    // همان چیزی است که موتور گفت، نه یک متنِ عمومی.
    return {
      ...empty,
      notes: [
        e instanceof InvalidTargetError
          ? e.message
          : "مقایسه انجام نشد.",
      ],
    };
  }
}
